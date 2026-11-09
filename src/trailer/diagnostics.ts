import { errorMessage, PlexError } from "../plex/client";
import type { TrailerService } from "./service";
import type { PreviewPhase, TrailerFailure, TrailerReport } from "./types";

export const diagnosticSampleLimit = 8;
const phases: PreviewPhase[] = [
  "idle",
  "waiting",
  "discovering",
  "metadata",
  "resolving",
  "resolved",
  "playing",
  "ended",
  "unavailable",
  "error",
  "blocked",
  "paused",
];
const failures: TrailerFailure[] = [
  "no-trailer",
  "no-playback-resource",
  "auth",
  "network",
  "timeout",
  "response",
  "unsafe",
  "autoplay",
  "unsupported",
  "unknown",
];

export async function inspectTrailerMetadata(
  service: TrailerService,
  movieIds: string[],
  signal: AbortSignal,
  onChange: () => void,
): Promise<void> {
  signal.throwIfAborted();
  const ids = [...new Set(movieIds)].slice(0, diagnosticSampleLimit);
  // An explicit recheck replaces cached metadata and previous playback evidence.
  for (const id of ids) service.invalidate(id);
  onChange();
  for (const movieId of ids) {
    signal.throwIfAborted();
    service.report({ movieId, phase: "discovering" });
    onChange();
    try {
      const discovery = await service.discover(movieId, signal);
      signal.throwIfAborted();
      service.report({
        movieId,
        phase: "metadata",
        metadataFound: discovery.metadataFound,
        source: discovery.candidates[0]?.source,
        reason: discovery.reason,
        failure: discovery.metadataFound ? undefined : "no-trailer",
      });
    } catch (error) {
      signal.throwIfAborted();
      service.report({
        movieId,
        phase: "error",
        reason: errorMessage(error),
        failure: error instanceof PlexError ? error.code : "unknown",
        httpStatus: error instanceof PlexError ? error.status : undefined,
      });
      onChange();
      if (error instanceof PlexError && error.code === "auth") break;
      continue;
    }
    onChange();
  }
}

export function diagnosticStatus(report?: TrailerReport): string {
  if (report?.phase === "discovering") return "Checking metadata";
  if (report?.failure === "auth") return "Plex access rejected";
  if (report?.failure === "no-playback-resource")
    return "No supported playback resource";
  if (report?.failure === "autoplay") return "Autoplay blocked";
  if (report?.failure && report.failure !== "no-trailer")
    return report.metadataFound === true
      ? "Playback failed"
      : "Metadata request failed";
  if (report?.playbackSucceeded) return "Playback verified";
  if (report?.metadataFound === false) return "No trailer metadata";
  if (report?.urlResolved) return "URL resolved; playback not verified";
  if (report?.metadataFound) return "Metadata found; playback not verified";
  return "Not inspected";
}

// Export a small allowlist, never raw Plex responses, titles, URLs or error text.
export function createDiagnosticReport(
  movieIds: string[],
  reports: TrailerReport[],
  now = new Date(),
) {
  return {
    schemaVersion: 1,
    application: "Trafirdis",
    generatedAt: now.toISOString(),
    scope: "Selected sample; not a full-library scan",
    checks: [...new Set(movieIds)].slice(0, diagnosticSampleLimit).map((id) => {
      const report = reports.find((entry) => entry.movieId === id);
      const booleanOrNull = (value?: boolean) =>
        typeof value === "boolean" ? value : null;
      return {
        movieId: /^\d+$/.test(id) ? id : null,
        phase: report && phases.includes(report.phase) ? report.phase : null,
        metadataFound: booleanOrNull(report?.metadataFound),
        urlResolved: booleanOrNull(report?.urlResolved),
        playbackSucceeded: booleanOrNull(report?.playbackSucceeded),
        source: ["Plex trailer", "Plex preview"].includes(report?.source || "")
          ? report!.source
          : null,
        method: ["Native direct play", "Plex HLS"].includes(
          report?.method || "",
        )
          ? report!.method
          : null,
        failure:
          report?.failure && failures.includes(report.failure)
            ? report.failure
            : null,
        httpStatus:
          report?.httpStatus &&
          Number.isInteger(report.httpStatus) &&
          report.httpStatus >= 100 &&
          report.httpStatus <= 599
            ? report.httpStatus
            : null,
      };
    }),
  };
}
