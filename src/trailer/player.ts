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
    let awaitingGesture = false;
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      video.removeEventListener("loadedmetadata", metadata);
      video.removeEventListener("playing", playing);
      video.removeEventListener("play", requested);
      video.removeEventListener("error", error);
      video.removeEventListener("ended", ended);
      video.removeEventListener("waiting", waiting);
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
    const metadata = () => {
      if (!settled) onResolved();
    };
    const playing = () => {
      awaitingGesture = false;
      clearTimeout(timer);
      if (!settled) onPlaying();
    };
    const waiting = () => {
      if (!settled && !awaitingGesture) armTimeout();
    };
    const requested = () => {
      if (settled) return;
      awaitingGesture = false;
      armTimeout();
    };
    const error = () => finish(playbackError(video));
    const ended = () => finish();
    const play = () => {
      if (settled) return;
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
    video.addEventListener("play", requested);
    video.addEventListener("error", error);
    video.addEventListener("ended", ended);
    video.addEventListener("waiting", waiting);
    signal.addEventListener("abort", abort, { once: true });
    video.loop = false;
    video.playsInline = true;
    armTimeout();
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
          const target = new URL(url, window.location.origin);
          if (
            target.origin !== window.location.origin ||
            !target.pathname.startsWith("/plex/")
          )
            throw new PlaybackError(
              "network",
              "Plex returned a stream outside the configured server proxy.",
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
    if (signal.aborted) abort();
  });
}
