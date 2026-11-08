import { useEffect, useRef, useState, type RefObject } from "react";
import { errorMessage } from "../plex/client";
import { playAttempt, PlaybackError, releaseVideo } from "../trailer/player";
import type { TrailerService } from "../trailer/service";
import type { TrailerReport } from "../trailer/types";
export function usePreview(
  videoRef: RefObject<HTMLVideoElement | null>,
  service: TrailerService | null,
  movieId: string,
  enabled: boolean,
  retry: number,
  delay = 1500,
) {
  const [report, setReport] = useState<TrailerReport>({
    movieId,
    phase: "idle",
  });
  const generation = useRef(0);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const current = ++generation.current;
    const controller = new AbortController();
    let latest: TrailerReport = {
      movieId,
      phase: enabled && service ? "waiting" : "paused",
    };
    const publish = (patch: Partial<TrailerReport>) => {
      if (current !== generation.current || controller.signal.aborted) return;
      latest = { ...latest, ...patch };
      setReport(latest);
      service?.report(latest);
    };
    video.muted = true;
    releaseVideo(video);
    publish({});
    if (!enabled || !service)
      return () => {
        generation.current++;
        controller.abort();
        releaseVideo(video);
      };
    const start = async () => {
      try {
        publish({ phase: "discovering" });
        const discovery = await service.discover(movieId, controller.signal);
        if (controller.signal.aborted) return;
        publish({
          phase: "metadata",
          metadataFound: discovery.metadataFound,
          reason: discovery.reason,
        });
        if (!discovery.candidates.length) {
          publish({ phase: "unavailable" });
          return;
        }
        const attempts = service.attempts(discovery, (mime) =>
          video.canPlayType(mime),
        );
        if (!attempts.length) {
          publish({
            phase: "unavailable",
            reason:
              "Plex returned trailer metadata without a supported server playback resource.",
          });
          return;
        }
        let lastFailure = "No playable trailer stream was found.";
        for (const attempt of attempts) {
          controller.signal.throwIfAborted();
          publish({
            phase: "resolving",
            source: attempt.source,
            method:
              attempt.kind === "direct" ? "Native direct play" : "Plex HLS",
            urlResolved: false,
            playbackSucceeded: false,
            reason: undefined,
          });
          try {
            await playAttempt(
              video,
              attempt,
              service.client,
              controller.signal,
              () => publish({ phase: "resolved", urlResolved: true }),
              () =>
                publish({
                  phase: "playing",
                  urlResolved: true,
                  playbackSucceeded: true,
                }),
              () =>
                publish({
                  phase: "blocked",
                  reason:
                    "Your browser blocked autoplay. Use Play preview to start it.",
                }),
            );
            publish({ phase: "ended" });
            return;
          } catch (error) {
            if (controller.signal.aborted) return;
            if (error instanceof PlaybackError) {
              lastFailure = error.message;
              if (error.code === "autoplay") {
                publish({ phase: "blocked", reason: lastFailure });
                return;
              }
            } else lastFailure = "The trailer stream could not be played.";
          }
        }
        publish({ phase: "error", reason: lastFailure });
      } catch (error) {
        if (!controller.signal.aborted)
          publish({ phase: "error", reason: errorMessage(error) });
      }
    };
    const timer = setTimeout(() => void start(), retry > 0 ? 0 : delay);
    return () => {
      generation.current++;
      clearTimeout(timer);
      controller.abort();
      releaseVideo(video);
    };
  }, [movieId, service, enabled, retry, delay, videoRef]);
  // Never render a previous movie's successful playback while React runs cleanup.
  return report.movieId === movieId
    ? report
    : ({ movieId, phase: "waiting" } as TrailerReport);
}
