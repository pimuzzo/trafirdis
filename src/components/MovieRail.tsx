import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Movie, Rail } from "../domain/movie";
import type { PlexClient } from "../plex/client";
import { Artwork } from "./Artwork";
import { Icon } from "./Icon";
function navigate(e: KeyboardEvent<HTMLButtonElement>) {
  const rail = e.currentTarget.closest<HTMLElement>("[data-rail]")!;
  const cards = Array.from(
    rail.querySelectorAll<HTMLButtonElement>("[data-movie]"),
  );
  const index = cards.indexOf(e.currentTarget);
  let next: HTMLButtonElement | undefined;
  if (e.key === "ArrowRight") next = cards[index + 1];
  if (e.key === "ArrowLeft") next = cards[index - 1];
  if (e.key === "Home") next = cards[0];
  if (e.key === "End") next = cards.at(-1);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    const rails = Array.from(
      document.querySelectorAll<HTMLElement>("[data-rail]"),
    );
    const target =
      rails[rails.indexOf(rail) + (e.key === "ArrowDown" ? 1 : -1)];
    const buttons = target?.querySelectorAll<HTMLButtonElement>("[data-movie]");
    if (buttons?.length) next = buttons[Math.min(index, buttons.length - 1)];
  }
  if (next) {
    e.preventDefault();
    next.focus({ preventScroll: true });
    next.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
}
export function MovieCard({
  movie,
  client,
  selected,
  onSelect,
  onDetails,
}: {
  movie: Movie;
  client: PlexClient | null;
  selected: boolean;
  onSelect: (movie: Movie) => void;
  onDetails: (movie: Movie) => void;
}) {
  return (
    <button
      className={`movie-card ${selected ? "selected" : ""}`}
      data-movie={movie.id}
      aria-label={`${movie.title}${movie.year ? `, ${movie.year}` : ""}. Show details`}
      onFocus={() => onSelect(movie)}
      onClick={() => {
        onSelect(movie);
        onDetails(movie);
      }}
      onKeyDown={navigate}
    >
      <div className="poster-wrap">
        <Artwork movie={movie} client={client} />
        {movie.watched && (
          <span className="watched-badge" aria-label="Watched">
            <Icon name="check" size={14} />
          </span>
        )}
        <span className="poster-play">
          <Icon name="info" size={22} />
        </span>
        {movie.viewOffset > 0 && movie.duration > movie.viewOffset && (
          <span className="watch-progress">
            <span
              style={{
                width: `${Math.min(100, (movie.viewOffset / movie.duration) * 100)}%`,
              }}
            />
          </span>
        )}
      </div>
      <span className="movie-title">{movie.title}</span>
      <span className="movie-meta">
        {movie.year || "Year unavailable"}
        <span>·</span>
        {movie.genres[0] || "Movie"}
      </span>
    </button>
  );
}
export function MovieRail({
  rail,
  client,
  selected,
  onSelect,
  onDetails,
}: {
  rail: Rail;
  client: PlexClient | null;
  selected?: string;
  onSelect: (movie: Movie) => void;
  onDetails: (movie: Movie) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState(30);
  useEffect(() => {
    const element = track.current!;
    const wheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.ctrlKey)
        return;
      const delta = event.deltaY;
      const canMove =
        delta > 0
          ? element.scrollLeft + element.clientWidth < element.scrollWidth - 1
          : element.scrollLeft > 0;
      if (canMove) {
        event.preventDefault();
        element.scrollLeft += delta;
      }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  const scroll = (direction: number) =>
    track.current?.scrollBy({
      left: direction * track.current.clientWidth * 0.8,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  return (
    <section className="movie-rail" data-rail aria-label={rail.title}>
      <div className="rail-heading">
        <h2>
          {rail.title}
          <span>{rail.movies.length}</span>
        </h2>
        <div className="rail-controls">
          <button
            className="icon-button"
            aria-label={`Scroll ${rail.title} left`}
            onClick={() => scroll(-1)}
          >
            <Icon
              name="arrow"
              style={{ transform: "rotate(180deg)" }}
              size={18}
            />
          </button>
          <button
            className="icon-button"
            aria-label={`Scroll ${rail.title} right`}
            onClick={() => scroll(1)}
          >
            <Icon name="arrow" size={18} />
          </button>
        </div>
      </div>
      <div className="rail-track" ref={track}>
        {rail.movies.slice(0, limit).map((m) => (
          <MovieCard
            key={m.id}
            movie={m}
            client={client}
            selected={selected === m.id}
            onSelect={onSelect}
            onDetails={onDetails}
          />
        ))}
        {rail.movies.length > limit && (
          <button className="load-more" onClick={() => setLimit(limit + 30)}>
            Show more
            <Icon name="arrow" />
          </button>
        )}
      </div>
    </section>
  );
}
