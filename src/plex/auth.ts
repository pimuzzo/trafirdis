import { PlexClient } from "./client";
import { getClientIdentifier } from "./device";

export class PlexSignInError extends Error {
  constructor(
    public code:
      "network" | "expired" | "response" | "access" | "storage" | "state",
    message: string,
  ) {
    super(message);
    this.name = "PlexSignInError";
  }
}
export interface PlexPin {
  id: string;
  code: string;
  expiresAt: number;
}
export interface PendingSignIn extends PlexPin {
  state: string;
  clientId: string;
}
interface PlexResource {
  clientIdentifier?: string;
  provides?: string;
  accessToken?: string;
}
// Persisted keys and the return-state query name are compatibility contracts.
export const pendingSignInKey = "plexplore.pending-sign-in";
const requestTimeout = 12000;

export class PlexSignInClient {
  constructor(
    readonly clientId = getClientIdentifier(),
    private fetcher: typeof fetch = (...args) => fetch(...args),
    private now = Date.now,
  ) {}
  private async request(
    url: string,
    init: RequestInit,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const timeout = AbortSignal.timeout(requestTimeout);
    try {
      const response = await this.fetcher(url, {
        ...init,
        headers: {
          Accept: "application/json",
          "X-Plex-Product": "Trafirdis",
          "X-Plex-Version": "0.1.0",
          "X-Plex-Client-Identifier": this.clientId,
          ...init.headers,
        },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });
      if ([401, 403, 404, 410].includes(response.status))
        throw new PlexSignInError(
          "expired",
          "This Plex sign-in has expired or is no longer valid. Please sign in again.",
        );
      if (response.status === 429)
        throw new PlexSignInError(
          "response",
          "Plex is receiving too many sign-in requests. Wait a moment, then try again.",
        );
      if (!response.ok)
        throw new PlexSignInError(
          "response",
          "Plex could not complete sign-in. Please try again.",
        );
      try {
        return await response.json();
      } catch {
        throw new PlexSignInError(
          "response",
          "Plex returned an unexpected sign-in response. Please try again.",
        );
      }
    } catch (error) {
      if (signal?.aborted)
        throw new DOMException("Sign-in cancelled", "AbortError");
      if (error instanceof PlexSignInError) throw error;
      throw new PlexSignInError(
        "network",
        timeout.aborted
          ? "Plex sign-in took too long. Please try again."
          : "Cannot reach Plex sign-in. Check your internet connection and try again.",
      );
    }
  }
  async createPin(signal?: AbortSignal): Promise<PlexPin> {
    const raw = await this.request(
      "https://plex.tv/api/v2/pins?strong=true",
      { method: "POST" },
      signal,
    );
    if (!raw || typeof raw !== "object")
      throw new PlexSignInError(
        "response",
        "Plex did not return a valid sign-in code.",
      );
    const pin = raw as {
      id?: unknown;
      code?: unknown;
      expiresAt?: unknown;
      expiresIn?: unknown;
    };
    if (
      !/^\d+$/.test(String(pin.id)) ||
      typeof pin.code !== "string" ||
      !pin.code
    )
      throw new PlexSignInError(
        "response",
        "Plex did not return a valid sign-in code.",
      );
    const localDeadline = this.now() + 10 * 60000;
    const timestamp =
      typeof pin.expiresAt === "string" ? Date.parse(pin.expiresAt) : NaN;
    const seconds = Number(pin.expiresIn);
    const expiresAt = Math.min(
      localDeadline,
      Number.isFinite(timestamp)
        ? timestamp
        : Number.isFinite(seconds) && seconds > 0
          ? this.now() + seconds * 1000
          : localDeadline,
    );
    return { id: String(pin.id), code: pin.code, expiresAt };
  }
  async checkPin(pin: PlexPin, signal?: AbortSignal): Promise<string | null> {
    if (this.now() >= pin.expiresAt)
      throw new PlexSignInError(
        "expired",
        "This Plex sign-in has expired. Please sign in again.",
      );
    const raw = await this.request(
      `https://plex.tv/api/v2/pins/${encodeURIComponent(pin.id)}?${new URLSearchParams({ code: pin.code })}`,
      { method: "GET" },
      signal,
    );
    if (!raw || typeof raw !== "object")
      throw new PlexSignInError(
        "response",
        "Plex returned an unexpected sign-in response.",
      );
    const token = (raw as { authToken?: unknown }).authToken;
    if (token === null || token === undefined || token === "") return null;
    if (typeof token !== "string")
      throw new PlexSignInError(
        "response",
        "Plex returned an unexpected sign-in response.",
      );
    return token;
  }
  async serverToken(
    accountToken: string,
    signal?: AbortSignal,
  ): Promise<string> {
    // Identify only the fixed configured PMS. Never connect to cloud-supplied URLs.
    let identity;
    try {
      identity = await new PlexClient("", this.fetcher, this.clientId).request(
        "/identity",
        signal,
      );
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new PlexSignInError(
        "access",
        "Plex sign-in succeeded, but the configured server could not be reached. Check its address and network connection, then try again.",
      );
    }
    if (!identity.machineIdentifier)
      throw new PlexSignInError(
        "response",
        "The configured Plex server did not provide its identity.",
      );
    const raw = await this.request(
      "https://clients.plex.tv/api/v2/resources?includeHttps=1&includeRelay=1&includeIPv6=1",
      { method: "GET", headers: { "X-Plex-Token": accountToken } },
      signal,
    );
    if (!Array.isArray(raw))
      throw new PlexSignInError(
        "response",
        "Plex did not return a valid server list.",
      );
    const resource = raw.find(
      (entry: PlexResource) =>
        entry &&
        entry.clientIdentifier === identity.machineIdentifier &&
        typeof entry.provides === "string" &&
        entry.provides.split(",").includes("server"),
    ) as PlexResource | undefined;
    if (
      !resource ||
      typeof resource.accessToken !== "string" ||
      !resource.accessToken
    )
      throw new PlexSignInError(
        "access",
        "Your Plex account does not have access to the configured server. Check the account and server sharing settings.",
      );
    // Verify the server-specific token before saving it in the browser session.
    try {
      await new PlexClient(
        resource.accessToken,
        this.fetcher,
        this.clientId,
      ).server(signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new PlexSignInError(
        "access",
        "The configured server could not verify Plex access. Check the server connection and try again.",
      );
    }
    return resource.accessToken;
  }
}
export function signInUrl(
  pin: PlexPin,
  clientId: string,
  returnUrl: string,
): string {
  const callback = new URL(returnUrl);
  if (
    !["http:", "https:"].includes(callback.protocol) ||
    callback.username ||
    callback.password
  )
    throw new PlexSignInError(
      "state",
      "The sign-in return address is invalid.",
    );
  return `https://app.plex.tv/auth#?${new URLSearchParams({ clientID: clientId, code: pin.code, "context[device][product]": "Trafirdis", forwardUrl: callback.href })}`;
}
export function savePendingSignIn(value: PendingSignIn) {
  try {
    sessionStorage.setItem(pendingSignInKey, JSON.stringify(value));
  } catch {
    throw new PlexSignInError(
      "storage",
      "Allow browser session storage to sign in with Plex, or use a token instead.",
    );
  }
}
export function clearSignInReturn() {
  try {
    sessionStorage.removeItem(pendingSignInKey);
  } catch {
    /* Storage may be blocked. */
  }
  const url = new URL(window.location.href);
  url.searchParams.delete("plexplore_auth");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}
export function readSignInReturn(): PendingSignIn | null {
  const state = new URL(window.location.href).searchParams.get(
    "plexplore_auth",
  );
  if (!state) return null;
  try {
    const raw = sessionStorage.getItem(pendingSignInKey);
    const value: Partial<PendingSignIn> = raw ? JSON.parse(raw) : {};
    if (
      value.state !== state ||
      value.clientId !== getClientIdentifier() ||
      typeof value.id !== "string" ||
      !/^\d+$/.test(value.id) ||
      typeof value.code !== "string" ||
      !value.code ||
      typeof value.expiresAt !== "number"
    )
      throw new Error();
    if (value.expiresAt <= Date.now())
      throw new PlexSignInError(
        "expired",
        "This Plex sign-in has expired. Please sign in again.",
      );
    return value as PendingSignIn;
  } catch (error) {
    clearSignInReturn();
    if (error instanceof PlexSignInError) throw error;
    throw new PlexSignInError(
      "state",
      "The Plex sign-in response could not be verified. Please sign in again.",
    );
  }
}
export function signInMessage(error: unknown): string {
  return error instanceof PlexSignInError
    ? error.message
    : "Plex sign-in could not be completed. Please try again.";
}
