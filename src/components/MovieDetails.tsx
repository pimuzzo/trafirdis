import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  durationLabel,
  type Movie,
  type Server,
  type Rail,
} from "../domain/movie";
import type { PlexClient } from "../plex/client";
import { plexLink } from "../plex/links";
import { Artwork } from "./Artwork";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";
export function MovieFacts({ movie }: { movie: Movie }) {
  return (
    <div className="movie-facts">
      {movie.rating !== undefined && (
        <span className="rating">
          ★ {movie.rating.toFixed(1)}
          <small>/ 10</small>
        </span>
      )}
      {movie.year && <span>{movie.year}</span>}
      <span>{durationLabel(movie.duration)}</span>
      {movie.contentRating && (
        <span className="content-rating">{movie.contentRating}</span>
      )}
    </div>
  );
}
export function OpenInPlex({
  movie,
  server,
  sample,
}: {
  movie: Movie;
  server?: Server;
  sample: boolean;
}) {
  return sample ? (
    <span className="button primary disabled">
      Sample film
      <Icon name="film" size={18} />
    </span>
  ) : (
    <a
      className="button primary"
      href={plexLink(server?.machineIdentifier, movie.key)}
      target="_blank"
      rel="noopener noreferrer"
    >
      Open in Plex
      <Icon name="external" size={17} />
    </a>
  );
}
export function MovieDetails({
  movie,
  client,
  server,
  onClose,
  preview,
  rail,
  index,
  onNavigate,
}: {
  movie: Movie;
  client: PlexClient | null;
  server?: Server;
  onClose: () => void;
  preview?: ReactNode;
  rail: Rail;
  index: number;
  onNavigate?: (index: number) => void;
}) {
  const [copiedId, setCopiedId] = useState("");
  const copied = copiedId === movie.id;
  const content = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    setCopiedId("");
    const dialog = content.current?.closest("dialog");
    if (dialog) {
      dialog.scrollTop = 0;
      // A boundary can disable the button that held focus. Keep arrows usable.
      const focused = document.activeElement;
      if (
        focused === document.body ||
        (focused instanceof HTMLButtonElement && focused.disabled)
      ) {
        dialog
          .querySelector<HTMLButtonElement>(
            ".details-stepper button:not(:disabled)",
          )
          ?.focus({ preventScroll: true });
      }
    }
  }, [movie.id]);
  const navigate = (direction: number) => {
    if (!onNavigate) return;
    const next = index + direction;
    if (next >= 0 && next < rail.movies.length) onNavigate(next);
  };
  return (
    <Dialog
      title={`${movie.title} details`}
      onClose={onClose}
      className="details-dialog"
      onKeyDown={(event) => {
        if (
          !onNavigate ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          (event.target as HTMLElement).closest(
            "video, input, select, textarea, [contenteditable], .preview",
          )
        )
          return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          navigate(event.key === "ArrowRight" ? 1 : -1);
        }
      }}
    >
      <div
        ref={content}
        className="details-content"
        onTouchStart={(event) => {
          touch.current = null;
          if (
            !onNavigate ||
            event.touches.length !== 1 ||
            (event.target as HTMLElement).closest(
              "button, a, input, select, video, .details-visual",
            )
          )
            return;
          touch.current = {
            x: event.touches[0].clientX,
            y: event.touches[0].clientY,
          };
        }}
        onTouchCancel={() => {
          touch.current = null;
        }}
        onTouchEnd={(event) => {
          const start = touch.current;
          touch.current = null;
          const end = event.changedTouches[0];
          if (!start || !end) return;
          const dx = end.clientX - start.x;
          const dy = end.clientY - start.y;
          if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5)
            navigate(dx < 0 ? 1 : -1);
        }}
      >
        {onNavigate && (
          <div className="details-navigation">
            <div className="details-context">
              <span className="eyebrow accent">{rail.title}</span>
              <span className="details-position" role="status">
                <span className="sr-only">{movie.title}, </span>
                {index + 1} of {rail.movies.length}
              </span>
            </div>
            <nav
              className="details-stepper"
              aria-label="Movies in this category"
            >
              <button
                className="icon-button"
                aria-label="Previous movie"
                disabled={index === 0}
                onClick={() => navigate(-1)}
              >
                <Icon name="arrow" style={{ transform: "rotate(180deg)" }} />
              </button>
              <button
                className="icon-button"
                aria-label="Next movie"
                disabled={index === rail.movies.length - 1}
                onClick={() => navigate(1)}
              >
                <Icon name="arrow" />
              </button>
            </nav>
          </div>
        )}
        <div className="details-visual">
          <Artwork movie={movie} client={client} kind="art" eager />
          {preview}
          <div className="details-visual-shade" />
        </div>
        <div className="details-body">
          <div className="details-poster">
            <Artwork movie={movie} client={client} />
          </div>
          <div className="details-copy">
            <span className="eyebrow accent">
              {movie.watched ? "WATCHED" : "UNWATCHED"} · IN YOUR LIBRARY
            </span>
            <h2>{movie.title}</h2>
            <MovieFacts movie={movie} />
            <p className="details-summary">
              {movie.summary || "No synopsis is available for this movie."}
            </p>
            <div className="genre-tags">
              {movie.genres.map((g) => (
                <span key={g}>{g}</span>
              ))}
            </div>
            <div className="actions">
              <OpenInPlex movie={movie} server={server} sample={!client} />
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(movie.title);
                    setCopiedId(movie.id);
                  } catch {
                    setCopiedId("");
                  }
                }}
              >
                <Icon name={copied ? "check" : "copy"} size={16} />
                {copied ? "Title copied" : "Copy title"}
              </button>
            </div>
            <p className="subtle">
              {!client
                ? "This fictional film is part of the sample library."
                : "If Plex opens without this film, search for the title above. Previewing never updates your watch history."}
            </p>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
