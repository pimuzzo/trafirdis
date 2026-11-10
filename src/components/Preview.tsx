import { useEffect, useRef, useState } from "react";
import { usePreview } from "../hooks/usePreview";
import type { TrailerService } from "../trailer/service";
import { Icon } from "./Icon";
export function Preview({
  service,
  movieId,
  enabled = true,
  compact = false,
  preserveMute = false,
}: {
  service: TrailerService | null;
  movieId: string;
  enabled?: boolean;
  compact?: boolean;
  preserveMute?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const mutePreference = useRef(true);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  const [retry, setRetry] = useState(0);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries[0]?.isIntersecting ?? false),
      { threshold: 0.15 },
    );
    if (host.current) observer.observe(host.current);
    const change = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", change);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", change);
    };
  }, []);
  useEffect(() => {
    setMuted(preserveMute ? mutePreference.current : true);
    setPaused(false);
    setRetry(0);
  }, [movieId, preserveMute]);
  const report = usePreview(
    video,
    service,
    movieId,
    enabled && visible && pageVisible && !paused,
    retry,
    setMuted,
    undefined,
    preserveMute ? mutePreference : undefined,
  );
  const playing = report.phase === "playing";
  const busy = [
    "waiting",
    "discovering",
    "metadata",
    "resolving",
    "resolved",
  ].includes(report.phase);
  const label = !service
    ? "Previews are available with your Plex library"
    : report.phase === "playing"
      ? "Preview playing"
      : report.phase === "ended"
        ? "Preview ended"
        : report.phase === "blocked"
          ? "Autoplay paused"
          : report.phase === "error"
            ? "Preview could not play"
            : report.phase === "unavailable"
              ? "No Plex preview available"
              : paused
                ? "Preview paused"
                : busy
                  ? "Finding your preview"
                  : "Preview ready";
  return (
    <div
      ref={host}
      className={`preview ${compact ? "compact-preview" : ""}`}
      data-preview-phase={report.phase}
    >
      <video
        ref={video}
        className={playing ? "preview-video is-playing" : "preview-video"}
        muted={muted}
        onVolumeChange={(event) => {
          mutePreference.current = event.currentTarget.muted;
          setMuted(event.currentTarget.muted);
        }}
        playsInline
        preload="none"
        aria-label="Movie trailer preview"
      />
      <div className="preview-controls">
        <span
          className={`preview-state ${playing ? "is-live" : ""}`}
          title={report.reason}
        >
          <span className="status-dot" />
          {label}
        </span>
        {service && (
          <>
            <button
              className="icon-button"
              aria-label={playing ? "Pause preview" : "Play preview"}
              onClick={() => {
                if (report.phase === "blocked") {
                  void video.current?.play().catch(() => {});
                  return;
                }
                if (playing) {
                  setPaused(true);
                } else {
                  setPaused(false);
                  setRetry((r) => r + 1);
                }
              }}
            >
              <Icon name={playing ? "pause" : "play"} size={15} />
            </button>
            <button
              className="icon-button"
              disabled={!playing}
              aria-label={muted ? "Unmute preview" : "Mute preview"}
              onClick={() => {
                if (video.current) {
                  video.current.muted = !video.current.muted;
                  mutePreference.current = video.current.muted;
                  setMuted(video.current.muted);
                }
              }}
            >
              <Icon name={muted ? "muted" : "sound"} size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
