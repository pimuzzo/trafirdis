import { useState, type ReactNode } from "react";
import { durationLabel, type Movie, type Server } from "../domain/movie";
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
}: {
  movie: Movie;
  client: PlexClient | null;
  server?: Server;
  onClose: () => void;
  preview?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog
      title={`${movie.title} details`}
      onClose={onClose}
      className="details-dialog"
    >
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
                  setCopied(true);
                } catch {
                  setCopied(false);
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
    </Dialog>
  );
}
