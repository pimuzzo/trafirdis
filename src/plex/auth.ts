import { PlexClient } from "./client";
import { getClientIdentifier } from "./device";
import { serverOrigin, type PlexConnection } from "./connection";

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
export interface PlexResource {
  id: string;
  name: string;
  owned: boolean;
  token: string;
  connections: string[];
}
// Scope pending authorization and callback state to Trafirdis.
export const pendingSignInKey = "trafirdis.pending-sign-in";
const requestTimeout = 12000;

function localHttpOrigin(
  connection: Record<string, unknown>,
): string | undefined {
  // Use only a private IPv4 address explicitly advertised as local. Never decode
  // addresses out of plex.direct hostnames or guess a server's port.
  if (
    !(connection.local === true || connection.local === 1) ||
    connection.relay ||
    typeof connection.address !== "string" ||
    !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(connection.address)
  )
    return;
  const octets = connection.address.split(".").map(Number);
  if (
    typeof connection.port !== "number" &&
    (typeof connection.port !== "string" || !/^\d+$/.test(connection.port))
  )
    return;
  const port = Number(connection.port);
  if (
    octets.some((n) => n > 255) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !(
      octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    )
  )
    return;
  return serverOrigin(`http://${octets.join(".")}:${port}`);
}

function waitForCandidate(delay: number, signal: AbortSignal): Promise<void> {
  if (!delay) {
    signal.throwIfAborted();
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Connection cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, delay);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

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
  async resources(
    accountToken: string,
    signal?: AbortSignal,
  ): Promise<PlexResource[]> {
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
    const servers = new Map<string, PlexResource>();
    for (const entry of raw) {
      if (
        !entry ||
        typeof entry !== "object" ||
        typeof entry.provides !== "string" ||
        !entry.provides.split(",").includes("server") ||
        typeof entry.clientIdentifier !== "string" ||
        !entry.clientIdentifier ||
        typeof entry.accessToken !== "string" ||
        !entry.accessToken
      )
        continue;
      const candidates: { origin: string; priority: number }[] = [];
      for (const connection of Array.isArray(entry.connections)
        ? entry.connections
        : []) {
        if (!connection || typeof connection !== "object") continue;
        try {
          const origin = serverOrigin(connection.uri);
          if (
            (entry.httpsRequired === true || entry.httpsRequired === 1) &&
            origin.startsWith("http:")
          )
            continue;
          // Prefer local connections, then remote and relay; HTTPS wins ties.
          const priority =
            (connection.relay ? 4 : connection.local ? 0 : 2) +
            (origin.startsWith("https:") ? 0 : 1);
          candidates.push({ origin, priority });
        } catch {
          /* Ignore malformed, credential-bearing or mixed-content URLs. */
        }
        if (
          window.location.protocol === "http:" &&
          (entry.httpsRequired === false || entry.httpsRequired === 0)
        ) {
          const local = localHttpOrigin(connection);
          if (local) candidates.push({ origin: local, priority: 1 });
        }
      }
      servers.set(entry.clientIdentifier, {
        id: entry.clientIdentifier,
        name:
          typeof entry.name === "string" && entry.name
            ? entry.name
            : "Plex Media Server",
        owned: entry.owned === true || entry.owned === 1,
        token: entry.accessToken,
        connections: [
          ...new Set(
            candidates
              .sort((a, b) => a.priority - b.priority)
              .map((c) => c.origin),
          ),
        ],
      });
    }
    if (!servers.size)
      throw new PlexSignInError(
        "access",
        "No Plex servers are available to this account. Check your server and sharing settings, then sign in again.",
      );
    return [...servers.values()];
  }
  async connectServer(
    resource: PlexResource,
    signal?: AbortSignal,
  ): Promise<PlexConnection> {
    signal?.throwIfAborted();
    const race = new AbortController();
    const pendingSignal = signal
      ? AbortSignal.any([signal, race.signal])
      : race.signal;
    const attempts = resource.connections.map(async (base, index) => {
      await waitForCandidate(index * 250, pendingSignal);
      const scopedSignal = AbortSignal.any([
        pendingSignal,
        AbortSignal.timeout(10000),
      ]);
      // Public /identity can allow CORS only for app.plex.tv. Authenticate
      // directly against an origin advertised by this account's resource API,
      // then verify the returned identity before accepting the connection.
      const server = await new PlexClient(
        resource.token,
        base,
        this.fetcher,
        this.clientId,
      ).request("/", scopedSignal, "no-store");
      if (server.machineIdentifier !== resource.id)
        throw new PlexSignInError(
          "access",
          "The server identity did not match the selected Plex resource.",
        );
      scopedSignal.throwIfAborted();
      return { token: resource.token, base, machineIdentifier: resource.id };
    });
    try {
      return await Promise.any(attempts);
    } catch {
      signal?.throwIfAborted();
      throw new PlexSignInError(
        "access",
        "Cannot connect to this Plex server. Check that it is online, allows secure connections and is reachable from this browser. Allow local network access if your browser asks, then try again or choose another server.",
      );
    } finally {
      race.abort();
    }
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
  url.searchParams.delete("trafirdis_auth");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}
export function readSignInReturn(): PendingSignIn | null {
  const state = new URL(window.location.href).searchParams.get(
    "trafirdis_auth",
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
