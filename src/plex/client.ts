import { getClientIdentifier } from "./device";
import type { Library, Movie, Server } from "../domain/movie";
import type { PlexContainer, PlexMetadata } from "./schema";
import { serverOrigin } from "./connection";

export class PlexError extends Error {
  constructor(
    public code: "auth" | "network" | "timeout" | "response" | "unsafe",
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "PlexError";
  }
}
export function errorMessage(error: unknown): string {
  return error instanceof PlexError
    ? error.message
    : "Something went wrong. Please try again.";
}
export function mapMovie(m: PlexMetadata): Movie {
  return {
    id: String(m.ratingKey ?? m.key),
    key: m.key || `/library/metadata/${m.ratingKey}`,
    title: m.title || "Untitled movie",
    summary: m.summary || "",
    year: m.year,
    duration: m.duration || 0,
    rating: m.audienceRating ?? m.rating,
    contentRating: m.contentRating,
    genres: [
      ...new Set(
        (m.Genre || [])
          .map((g) => g.tag)
          .filter((g): g is string => Boolean(g)),
      ),
    ],
    poster: m.thumb,
    art: m.art,
    watched: Number(m.viewCount) > 0,
    viewOffset: m.viewOffset || 0,
    addedAt: m.addedAt || 0,
  };
}
export class PlexClient {
  readonly base: string;
  constructor(
    private token: string,
    base: string,
    private fetcher: typeof fetch = (...args) => fetch(...args),
    readonly clientIdentifier = getClientIdentifier(),
  ) {
    this.base = serverOrigin(base);
  }
  trustsResource(value: string): boolean {
    try {
      const url = new URL(value, window.location.origin);
      const base = new URL(`${this.base}/`, window.location.origin);
      return (
        url.origin === base.origin &&
        url.pathname.startsWith(base.pathname) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }
  private headers(): Record<string, string> {
    return {
      Accept: "application/json",
      ...(this.token ? { "X-Plex-Token": this.token } : {}),
      "X-Plex-Product": "Trafirdis",
      "X-Plex-Client-Identifier": this.clientIdentifier,
    };
  }
  safePath(path: string): string {
    if (
      !path.startsWith("/") ||
      path.startsWith("//") ||
      path.includes("\\") ||
      /[\r\n]/.test(path)
    )
      throw new PlexError(
        "unsafe",
        "Plex returned an unsupported resource address.",
      );
    const url = new URL(path, "https://trafirdis.invalid");
    if (url.origin !== "https://trafirdis.invalid")
      throw new PlexError(
        "unsafe",
        "Plex returned an external resource address.",
      );
    return `${url.pathname}${url.search}`;
  }
  resource(path: string): string {
    const url = new URL(this.safePath(path), "https://trafirdis.invalid");
    url.searchParams.set("X-Plex-Token", this.token);
    return `${this.base}${url.pathname}${url.search}`;
  }
  authHeader(): string {
    return this.token;
  }
  async preparePreview(path: string, signal: AbortSignal): Promise<void> {
    const url = new URL(this.safePath(path), "https://trafirdis.invalid");
    if (url.pathname !== "/video/:/transcode/universal/start.m3u8")
      throw new PlexError("unsafe", "Unsupported preview streaming route.");
    // Use exactly the start request's media, settings and playback identity.
    url.pathname = "/video/:/transcode/universal/decision";
    const decision = await this.request(
      `${url.pathname}${url.search}`,
      signal,
      "no-store",
    );
    signal.throwIfAborted();
    // The documented conversion-OK response is 1001. Never treat HTTP 200,
    // direct-play-only approval or an unknown response as permission for HLS.
    if (
      ![1000, 1001].includes(decision.generalDecisionCode ?? 0) ||
      decision.transcodeDecisionCode !== 1001
    )
      throw new PlexError(
        "response",
        "Plex did not approve this trailer's streaming conversion.",
      );
  }
  async stopPreviewSession(session: string): Promise<void> {
    // Legacy PMS cleanup route; this never reports watch progress or scrobbles.
    try {
      await this.fetcher(
        `${this.base}/video/:/transcode/universal/stop?${new URLSearchParams({ session })}`,
        {
          headers: this.headers(),
          signal: AbortSignal.timeout(3000),
          keepalive: true,
          redirect: "error",
          credentials: "omit",
        },
      );
    } catch {
      /* Plex also expires abandoned sessions. */
    }
  }
  async request(
    path: string,
    signal?: AbortSignal,
    cache?: RequestCache,
  ): Promise<PlexContainer> {
    const timeout = AbortSignal.timeout(12000);
    try {
      const response = await this.fetcher(
        `${this.base}${this.safePath(path)}`,
        {
          headers: this.headers(),
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
          redirect: "error",
          credentials: "omit",
          cache,
        },
      );
      if (response.status === 401 || response.status === 403)
        throw new PlexError(
          "auth",
          "Plex rejected the token. Check that it is current and has access to this server.",
          response.status,
        );
      if (!response.ok)
        throw new PlexError(
          "response",
          `Plex could not complete this request (HTTP ${response.status}).`,
          response.status,
        );
      const body: unknown = await response.json();
      if (
        !body ||
        typeof body !== "object" ||
        !("MediaContainer" in body) ||
        !body.MediaContainer ||
        typeof body.MediaContainer !== "object"
      )
        throw new PlexError(
          "response",
          "Plex returned an unexpected response. A JSON-capable Plex Media Server is required.",
        );
      const container = body.MediaContainer as PlexContainer;
      const total = response.headers.get("X-Plex-Container-Total-Size");
      if (
        container.totalSize === undefined &&
        total !== null &&
        Number.isFinite(Number(total))
      )
        container.totalSize = Number(total);
      return container;
    } catch (error) {
      if (signal?.aborted)
        throw new DOMException("Request cancelled", "AbortError");
      if (error instanceof PlexError) throw error;
      if (timeout.aborted)
        throw new PlexError(
          "timeout",
          "Plex took too long to respond. Check your server and try again.",
        );
      throw new PlexError(
        "network",
        "Cannot reach Plex. Check the server connection, HTTPS and browser network permissions.",
      );
    }
  }
  async server(signal?: AbortSignal): Promise<Server> {
    const c = await this.request("/", signal);
    return {
      name: c.friendlyName || "Plex Media Server",
      machineIdentifier: c.machineIdentifier,
      version: c.version,
    };
  }
  async libraries(signal?: AbortSignal): Promise<Library[]> {
    const c = await this.request("/library/sections", signal);
    return (c.Directory || [])
      .filter((d) => d.type === "movie")
      .map((d) => ({ id: d.key, title: d.title }));
  }
  async movies(library: string, signal?: AbortSignal): Promise<Movie[]> {
    const result = new Map<string, Movie>();
    let start = 0;
    for (;;) {
      const c = await this.request(
        `/library/sections/${encodeURIComponent(library)}/all?type=1&X-Plex-Container-Start=${start}&X-Plex-Container-Size=200`,
        signal,
      );
      const page = c.Metadata || [];
      const before = result.size;
      page
        .filter((m) => m.type === "movie")
        .forEach((m) => {
          const movie = mapMovie(m);
          result.set(movie.id, movie);
        });
      start += page.length;
      if (
        page.length === 0 ||
        (c.totalSize !== undefined ? start >= c.totalSize : page.length < 200)
      )
        break;
      if (result.size === before)
        throw new PlexError(
          "response",
          "Plex repeated a library page. Refresh the library to try again.",
        );
    }
    return [...result.values()];
  }
  async details(
    id: string,
    signal?: AbortSignal,
  ): Promise<PlexMetadata | undefined> {
    return (
      await this.request(
        `/library/metadata/${encodeURIComponent(id)}?includeExtras=1`,
        signal,
      )
    ).Metadata?.[0];
  }
  artwork(
    path: string | undefined,
    width: number,
    height: number,
  ): string | undefined {
    if (!path) return;
    try {
      return this.resource(
        `/photo/:/transcode?${new URLSearchParams({ url: this.safePath(path), width: String(width), height: String(height), minSize: "1", upscale: "0" })}`,
      );
    } catch {
      return;
    }
  }
}
