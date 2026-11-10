import { useEffect, useRef, useState, type RefObject } from "react";
import { errorMessage, PlexError } from "../plex/client";
import { PlaybackError, releaseVideo } from "../trailer/player";
import { PreviewPlayback, type PlaybackEvents } from "../trailer/retained";
import type { TrailerService } from "../trailer/service";
import type {
  PlaybackAttempt,
  TrailerFailure,
  TrailerReport,
} from "../trailer/types";
export function usePreview(
  videoRef: RefObject<HTMLVideoElement | null>,
  service: TrailerService | null,
  movieId: string,
  enabled: boolean,
  retry: number,
  onMuteChange?: (muted: boolean) => void,
  delay = 1500,
  mutePreference?: RefObject<boolean>,
  mediaHost?: RefObject<HTMLDivElement | null>,
  allowRetention = true,
) {
  const [report, setReport] = useState<TrailerReport>({
    movieId,
    phase: "idle",
  });
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    let active: PreviewPlayback | undefined;
    let video = videoRef.current;
    if (mediaHost?.current && (!video || service?.retained.owns(video)))
      video = document.createElement("video");
    if (!video) return;
    let boundVideo: HTMLVideoElement | undefined;
    const volume = () => {
      if (!boundVideo) return;
      if (mutePreference) mutePreference.current = boundVideo.muted;
      onMuteChange?.(boundVideo.muted);
    };
    const attach = (element: HTMLVideoElement) => {
      boundVideo?.removeEventListener("volumechange", volume);
      video = element;
      videoRef.current = element;
      element.className = "preview-video";
      element.setAttribute("aria-label", "Movie trailer preview");
      element.playsInline = true;
      element.preload = "none";
      element.muted = mutePreference?.current ?? true;
      boundVideo = element;
      element.addEventListener("volumechange", volume);
      onMuteChange?.(element.muted);
      if (mediaHost?.current && element.parentElement !== mediaHost.current)
        mediaHost.current.replaceChildren(element);
    };
    attach(video);
    releaseVideo(video);
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
    publish({});
    if (!allowRetention) service?.retained.clear();
    const cleanup = () => {
      generation.current++;
      controller.abort();
      boundVideo?.removeEventListener("volumechange", volume);
      if (active) {
        active.events = undefined;
        if (!allowRetention || !service?.retained.retain(movieId, active))
          active.dispose();
      } else if (video && !service?.retained.owns(video)) releaseVideo(video);
    };
    if (!enabled || !service) return cleanup;
    const events: PlaybackEvents = {
      resolved: () =>
        publish({
          phase: latest.phase === "blocked" ? "blocked" : "resolved",
          urlResolved: true,
        }),
      playing: () =>
        publish({
          phase: "playing",
          urlResolved: true,
          playbackSucceeded: true,
          failure: undefined,
          reason: undefined,
        }),
      blocked: () =>
        publish({
          phase: "blocked",
          failure: "autoplay",
          reason:
            "Your browser blocked autoplay. Use Play preview to start it.",
        }),
    };
    const resolving = (attempt: PlaybackAttempt) =>
      publish({
        phase: "resolving",
        source: attempt.source,
        method: attempt.kind === "direct" ? "Native direct play" : "Plex HLS",
        urlResolved: false,
        playbackSucceeded: false,
        reason: undefined,
        failure: undefined,
        httpStatus: undefined,
      });
    const start = async () => {
      try {
        const retained = allowRetention
          ? service.retained.take(movieId)
          : undefined;
        if (retained) {
          active = retained;
          attach(retained.video);
          retained.events = events;
          publish({ metadataFound: true });
          resolving(retained.attempt);
          try {
            if (!retained.control?.restart())
              throw new PlaybackError(
                "network",
                "The retained preview is no longer available.",
              );
            await retained.wait(controller.signal);
            publish({ phase: "ended" });
            return;
          } catch (error) {
            if (controller.signal.aborted) return;
            retained.dispose();
            // A retained session may have expired on PMS. Rebuild through the
            // normal decision/start path; never replay a closed session URL.
            active = undefined;
            releaseVideo(video!);
          }
        }
        publish({
          phase: "discovering",
          metadataFound: undefined,
          urlResolved: false,
          playbackSucceeded: false,
        });
        const discovery = await service.discover(movieId, controller.signal);
        if (controller.signal.aborted) return;
        publish({
          phase: "metadata",
          metadataFound: discovery.metadataFound,
          reason: discovery.reason,
        });
        if (!discovery.candidates.length) {
          publish({ phase: "unavailable", failure: "no-trailer" });
          return;
        }
        const attempts = service.attempts(discovery, (mime) =>
          video!.canPlayType(mime),
        );
        if (!attempts.length) {
          publish({
            phase: "unavailable",
            failure: "no-playback-resource",
            reason:
              "Plex returned trailer metadata without a supported server playback resource.",
          });
          return;
        }
        let lastFailure = "No playable trailer stream was found.";
        let failure: TrailerFailure = "unknown";
        let httpStatus: number | undefined;
        for (const attempt of attempts) {
          controller.signal.throwIfAborted();
          resolving(attempt);
          active = new PreviewPlayback(
            video!,
            attempt,
            service.client,
            events,
            service.retained.epoch,
          );
          try {
            await active.wait(controller.signal);
            publish({ phase: "ended" });
            return;
          } catch (error) {
            if (controller.signal.aborted) return;
            httpStatus = undefined;
            if (error instanceof PlaybackError) {
              lastFailure = error.message;
              failure = error.code;
              if (error.code === "autoplay") {
                publish({ phase: "blocked", reason: lastFailure, failure });
                return;
              }
            } else if (error instanceof PlexError) {
              if (error.code === "auth") throw error;
              lastFailure = error.message;
              failure = error.code;
              httpStatus = error.status;
            } else {
              lastFailure = "The trailer stream could not be played.";
              failure = "unknown";
            }
          }
        }
        publish({ phase: "error", reason: lastFailure, failure, httpStatus });
      } catch (error) {
        if (!controller.signal.aborted)
          publish({
            phase: "error",
            reason: errorMessage(error),
            failure: error instanceof PlexError ? error.code : "unknown",
            httpStatus: error instanceof PlexError ? error.status : undefined,
          });
      }
    };
    const timer = setTimeout(
      () => void start(),
      retry > 0 || (allowRetention && service.retained.has(movieId))
        ? 0
        : delay,
    );
    return () => {
      clearTimeout(timer);
      cleanup();
    };
  }, [
    movieId,
    service,
    enabled,
    retry,
    delay,
    videoRef,
    onMuteChange,
    mutePreference,
    mediaHost,
    allowRetention,
  ]);
  return report.movieId === movieId
    ? report
    : ({ movieId, phase: "waiting" } as TrailerReport);
}
