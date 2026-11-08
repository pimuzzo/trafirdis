import type { PlexMetadata, PlexMedia } from "../plex/schema";
import type { Discovery, TrailerCandidate } from "./types";
function mimeFor(media: PlexMedia, container?: string): string | undefined {
  const type = (container || media.container || "").toLowerCase();
  if (type === "mp4" || type === "mov") {
    const video: Record<string, string> = {
      h264: "avc1.42E01E",
      hevc: "hvc1",
      h265: "hvc1",
      av1: "av01.0.04M.08",
    };
    const audio: Record<string, string> = {
      aac: "mp4a.40.2",
      mp3: "mp4a.69",
      ac3: "ac-3",
      eac3: "ec-3",
    };
    const codecs = [
      video[media.videoCodec || ""],
      audio[media.audioCodec || ""],
    ].filter(Boolean);
    return `video/mp4${codecs.length ? `; codecs="${codecs.join(", ")}"` : ""}`;
  }
  if (type === "webm") return "video/webm";
  if (type === "mkv") return "video/x-matroska";
  if (type === "mpegts" || type === "m3u8")
    return "application/vnd.apple.mpegurl";
}
export function discoverTrailers(movie: PlexMetadata | undefined): Discovery {
  if (!movie)
    return {
      metadataFound: false,
      candidates: [],
      reason: "The movie is no longer available in Plex.",
    };
  const extras = movie.Extras?.Metadata || [];
  const source = (
    extra: PlexMetadata,
  ): TrailerCandidate["source"] | undefined => {
    if (extra.subtype === "trailer" || extra.type === "trailer")
      return "Plex trailer";
    // Legacy extraType=1 is isolated here; an explicit subtype always wins.
    if (!extra.subtype && Number(extra.extraType) === 1) return "Plex trailer";
    if (extra.subtype === "sceneOrSample") return "Plex preview";
  };
  const candidates = extras
    .flatMap((extra, index) => {
      const origin = source(extra);
      if (!origin || (extra.key && extra.key === movie.key)) return [];
      return [
        {
          id: String(extra.ratingKey ?? index),
          title: extra.title || "Plex trailer",
          key: extra.key,
          source: origin,
          parts: (extra.Media || []).flatMap((m) =>
            (m.Part || [])
              .filter((p) => Boolean(p.key))
              .map((p) => ({
                key: p.key!,
                mime: mimeFor(m, p.container),
                indirect: Boolean(m.indirect),
              })),
          ),
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(a.source === "Plex preview") -
        Number(b.source === "Plex preview"),
    );
  return {
    metadataFound: candidates.length > 0,
    candidates,
    reason: candidates.length
      ? undefined
      : extras.length
        ? "Plex returned extras, but none is identified as a trailer or preview."
        : "Plex returned no trailer extras. Check Find extras in Plex’s library settings.",
  };
}
