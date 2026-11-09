export type TrailerSource = "Plex trailer" | "Plex preview";
export interface TrailerCandidate {
  id: string;
  title: string;
  key?: string;
  source: TrailerSource;
  parts: { key: string; mime?: string; indirect: boolean }[];
}
export interface Discovery {
  metadataFound: boolean;
  candidates: TrailerCandidate[];
  reason?: string;
}
export type PreviewPhase =
  | "idle"
  | "waiting"
  | "discovering"
  | "metadata"
  | "resolving"
  | "resolved"
  | "playing"
  | "ended"
  | "unavailable"
  | "error"
  | "blocked"
  | "paused";
export interface TrailerReport {
  movieId: string;
  phase: PreviewPhase;
  metadataFound?: boolean;
  source?: TrailerSource;
  urlResolved?: boolean;
  playbackSucceeded?: boolean;
  reason?: string;
  method?: string;
  failure?: TrailerFailure;
  httpStatus?: number;
}
export type TrailerFailure =
  | "no-trailer"
  | "no-playback-resource"
  | "auth"
  | "network"
  | "timeout"
  | "response"
  | "unsafe"
  | "autoplay"
  | "unsupported"
  | "unknown";
export interface PlaybackAttempt {
  path: string;
  kind: "direct" | "hls";
  source: TrailerSource;
  mime?: string;
  session?: string;
  forceMse?: boolean;
}
