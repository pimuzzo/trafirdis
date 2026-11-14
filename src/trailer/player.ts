import type { PlexClient } from "../plex/client";
import type { PlaybackAttempt } from "./types";
export class PlaybackError extends Error {
  constructor(
    public code: "autoplay" | "timeout" | "unsupported" | "network",
    message: string,
  ) {
    super(message);
  }
}
export interface PlaybackControl {
  suspend(): void;
  restart(): boolean;
}
export function releaseVideo(video: HTMLVideoElement) {
  video.pause();
  video.removeAttribute("src");
  video.load();
}
export function playbackError(video: HTMLVideoElement): PlaybackError {
  if (video.error?.code === 4)
    return new PlaybackError(
      "unsupported",
      "The browser cannot play this trailer format.",
    );
  if (video.error?.code === 3)
    return new PlaybackError(
      "unsupported",
      "The browser could not decode this trailer.",
    );
  return new PlaybackError(
    "network",
    "The trailer stream was interrupted or could not be loaded.",
  );
}
export async function playAttempt(
  video: HTMLVideoElement,
  attempt: PlaybackAttempt,
  client: PlexClient,
  signal: AbortSignal,
  onResolved: () => void,
  onPlaying: () => void,
  onBlocked: () => void = () => {},
  onControl?: (control: PlaybackControl) => void,
): Promise<void> {
  signal.throwIfAborted();
  let hls: import("hls.js").default | undefined;
  let Hls: typeof import("hls.js").default | undefined;
  if (
    attempt.kind === "hls" &&
    (attempt.forceMse || !video.canPlayType("application/vnd.apple.mpegurl"))
  ) {
    Hls = (await import("hls.js/light")).default;
    signal.throwIfAborted();
    if (!Hls.isSupported())
      throw new PlaybackError(
        "unsupported",
        "This browser supports neither native HLS nor Media Source Extensions.",
      );
  }
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let suspended = false;
    const startup = new AbortController();
    let awaitingGesture = false;
    let awaitingFrame = false;
    let mediaPlaying = false;
    let frameCallback: number | undefined;
    let frameGeneration = 0;
    let timer: ReturnType<typeof setTimeout>;
    const cancelFrame = () => {
      frameGeneration++;
      awaitingFrame = false;
      if (frameCallback !== undefined) {
        video.cancelVideoFrameCallback(frameCallback);
        frameCallback = undefined;
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      cancelFrame();
      startup.abort();
      signal.removeEventListener("abort", abort);
      video.removeEventListener("loadedmetadata", metadata);
      video.removeEventListener("playing", playing);
      video.removeEventListener("loadeddata", fallbackFrame);
      video.removeEventListener("timeupdate", fallbackFrame);
      video.removeEventListener("play", requested);
      video.removeEventListener("error", error);
      video.removeEventListener("ended", ended);
      video.removeEventListener("waiting", waiting);
      document.removeEventListener("visibilitychange", presentationVisibility);
      hls?.destroy();
      releaseVideo(video);
      if (attempt.session) void client.stopPreviewSession(attempt.session);
    };
    const finish = (err?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err);
      else resolve();
    };
    const abort = () =>
      finish(new DOMException("Preview cancelled", "AbortError"));
    const armTimeout = () => {
      clearTimeout(timer);
      // Hidden tabs can keep playing while rendering/frame callbacks are suspended.
      if (awaitingFrame && mediaPlaying && document.hidden) return;
      timer = setTimeout(
        () =>
          finish(
            new PlaybackError(
              "timeout",
              "The trailer did not start or resume within 12 seconds.",
            ),
          ),
        12000,
      );
    };
    const presentationVisibility = () => {
      if (
        !settled &&
        !suspended &&
        !awaitingGesture &&
        awaitingFrame &&
        mediaPlaying
      )
        armTimeout();
    };
    const metadata = () => {
      if (!settled) onResolved();
    };
    const presented = () => {
      if (settled || suspended || !awaitingFrame || !mediaPlaying) return;
      awaitingFrame = false;
      clearTimeout(timer);
      onPlaying();
    };
    const fallbackFrame = () => {
      if (
        typeof video.requestVideoFrameCallback !== "function" &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      )
        presented();
    };
    const playing = () => {
      if (suspended) {
        video.pause();
        return;
      }
      awaitingGesture = false;
      if (settled) return;
      cancelFrame();
      mediaPlaying = true;
      awaitingFrame = true;
      armTimeout();
      if (typeof video.requestVideoFrameCallback === "function") {
        const current = frameGeneration;
        frameCallback = video.requestVideoFrameCallback(() => {
          if (current !== frameGeneration) return;
          frameCallback = undefined;
          presented();
        });
      } else fallbackFrame();
    };
    const waiting = () => {
      mediaPlaying = false;
      if (!settled && !awaitingGesture && !suspended) armTimeout();
    };
    const requested = () => {
      if (settled || suspended) return;
      awaitingGesture = false;
      mediaPlaying = false;
      armTimeout();
    };
    const error = () => finish(playbackError(video));
    const ended = () => finish();
    const play = () => {
      if (settled || suspended) return;
      void video.play().catch((err: unknown) => {
        if (settled) return;
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          awaitingGesture = true;
          clearTimeout(timer);
          onBlocked();
        } else
          finish(
            new PlaybackError(
              "unsupported",
              "The browser could not start this trailer.",
            ),
          );
      });
    };
    video.addEventListener("loadedmetadata", metadata);
    video.addEventListener("playing", playing);
    video.addEventListener("loadeddata", fallbackFrame);
    video.addEventListener("timeupdate", fallbackFrame);
    video.addEventListener("play", requested);
    video.addEventListener("error", error);
    video.addEventListener("ended", ended);
    video.addEventListener("waiting", waiting);
    document.addEventListener("visibilitychange", presentationVisibility);
    signal.addEventListener("abort", abort, { once: true });
    video.loop = false;
    video.playsInline = true;
    armTimeout();
    const start = async () => {
      if (attempt.kind === "hls")
        await client.preparePreview(attempt.path, startup.signal);
      if (settled || signal.aborted) return;
      if (Hls) {
        hls = new Hls({
          debug: false,
          enableWorker: true,
          maxBufferLength: 15,
          maxMaxBufferLength: 30,
          manifestLoadingMaxRetry: 0,
          fragLoadingMaxRetry: 0,
          xhrSetup: (xhr, url) => {
            // Never send tokens to remote URLs embedded in a provider playlist.
            if (!client.trustsResource(url))
              throw new PlaybackError(
                "network",
                "Plex returned a stream outside the selected server.",
              );
            xhr.setRequestHeader("X-Plex-Token", client.authHeader());
          },
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          metadata();
          play();
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal)
            finish(
              new PlaybackError(
                data.type === "mediaError" ? "unsupported" : "network",
                data.type === "mediaError"
                  ? "The browser could not decode Plex’s HLS stream."
                  : "Plex’s HLS stream could not be loaded.",
              ),
            );
        });
        hls.loadSource(client.resource(attempt.path));
        hls.attachMedia(video);
      } else {
        video.src = client.resource(attempt.path);
        video.load();
        play();
      }
      onControl?.({
        suspend: () => {
          suspended = true;
          mediaPlaying = false;
          cancelFrame();
          clearTimeout(timer);
          video.pause();
          video.muted = true;
          video.preload = "none";
          hls?.stopLoad();
        },
        restart: () => {
          if (settled || signal.aborted) return false;
          cancelFrame();
          suspended = false;
          mediaPlaying = false;
          video.currentTime = 0;
          hls?.startLoad(0);
          armTimeout();
          play();
          return true;
        },
      });
    };
    void start().catch((error: unknown) => finish(error));
    if (signal.aborted) abort();
  });
}
