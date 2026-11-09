import { previewSessionId } from "./session";
import { PlexClient } from "../plex/client";
import { discoverTrailers } from "./discovery";
import type { Discovery, PlaybackAttempt, TrailerReport } from "./types";
export class TrailerService {
  private cache = new Map<string, { expires: number; data: Discovery }>();
  private reports = new Map<string, TrailerReport>();
  constructor(
    readonly client: PlexClient,
    private now: () => number = Date.now,
  ) {}
  async discover(id: string, signal?: AbortSignal): Promise<Discovery> {
    const cached = this.cache.get(id);
    if (cached && cached.expires > this.now()) {
      this.cache.delete(id);
      this.cache.set(id, cached);
      return cached.data;
    }
    const data = discoverTrailers(await this.client.details(id, signal));
    if (signal?.aborted)
      throw new DOMException("Request cancelled", "AbortError");
    this.cache.delete(id);
    this.cache.set(id, { expires: this.now() + 300000, data });
    if (this.cache.size > 60)
      this.cache.delete(this.cache.keys().next().value!);
    return data;
  }
  clear() {
    this.cache.clear();
    this.reports.clear();
  }
  invalidate(id: string) {
    this.cache.delete(id);
    this.reports.delete(id);
  }
  report(value: TrailerReport) {
    // Pausing preserves observations; starting a new check never inherits success.
    const previous = ["waiting", "discovering"].includes(value.phase)
      ? undefined
      : this.reports.get(value.movieId);
    this.reports.delete(value.movieId);
    this.reports.set(value.movieId, { ...previous, ...value });
    if (this.reports.size > 60)
      this.reports.delete(this.reports.keys().next().value!);
  }
  snapshot() {
    return [...this.reports.values()];
  }
  attempts(
    discovery: Discovery,
    canPlay: (mime: string) => string,
  ): PlaybackAttempt[] {
    const attempts: PlaybackAttempt[] = [];
    for (const candidate of discovery.candidates.slice(0, 6)) {
      for (const part of candidate.parts) {
        if (part.indirect || !part.key.startsWith("/library/parts/")) continue;
        try {
          this.client.safePath(part.key);
        } catch {
          continue;
        }
        if (!part.mime || canPlay(part.mime))
          attempts.push({
            path: part.key,
            kind: "direct",
            source: candidate.source,
            mime: part.mime,
          });
      }
      // The metadata key belongs to the extra, never the parent movie.
      const key = candidate.key;
      if (
        key &&
        (key.startsWith("/library/metadata/") || key.startsWith("plex://"))
      ) {
        const session = previewSessionId();
        const params = new URLSearchParams({
          path: key,
          mediaIndex: "0",
          partIndex: "0",
          protocol: "hls",
          directPlay: "0",
          directStream: "1",
          videoResolution: "1280x720",
          maxVideoBitrate: "3000",
          audioBoost: "100",
          offset: "0",
          session,
          "X-Plex-Session-Identifier": session,
          "X-Plex-Client-Identifier": this.client.clientIdentifier,
          "X-Plex-Product": "Trafirdis",
          "X-Plex-Platform": "Chrome",
        });
        attempts.push({
          path: `/video/:/transcode/universal/start.m3u8?${params}`,
          kind: "hls",
          source: candidate.source,
          session,
        });
        if (canPlay("application/vnd.apple.mpegurl")) {
          const fallback = previewSessionId();
          params.set("session", fallback);
          params.set("X-Plex-Session-Identifier", fallback);
          attempts.push({
            path: `/video/:/transcode/universal/start.m3u8?${params}`,
            kind: "hls",
            source: candidate.source,
            session: fallback,
            forceMse: true,
          });
        }
      }
    }
    return attempts;
  }
}
