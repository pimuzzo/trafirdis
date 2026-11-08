import type { Movie, Server } from "../domain/movie";
import type { PlexClient } from "../plex/client";
import type { TrailerService } from "../trailer/service";
import { Artwork } from "./Artwork";
import { Preview } from "./Preview";
import { MovieFacts, OpenInPlex } from "./MovieDetails";
import { Icon } from "./Icon";
export function Hero({
  movie,
  client,
  trailers,
  connectedServer,
  total,
  previewVisible,
  previewEnabled,
  onDetails,
}: {
  movie: Movie;
  client: PlexClient | null;
  trailers: TrailerService | null;
  connectedServer?: Server;
  total: number;
  previewVisible: boolean;
  previewEnabled: boolean;
  onDetails: (movie: Movie) => void;
}) {
  const sample = !client;
  return (
    <section className="hero" aria-label={`Featured movie: ${movie.title}`}>
      <div className="hero-background" key={movie.id}>
        <Artwork movie={movie} client={client} kind="art" eager />
      </div>
      <div className="hero-shade" />
      {previewVisible && (
        <Preview
          key={movie.id}
          service={trailers}
          movieId={movie.id}
          enabled={previewEnabled}
        />
      )}
      <div className="hero-content">
        <span className="eyebrow hero-kicker">
          <span />A LITTLE DISCOVERY. A GREAT MOVIE NIGHT.
        </span>
        <div className="hero-title-row">
          <span className="vertical-rule" />
          <h1>{movie.title}</h1>
        </div>
        <MovieFacts movie={movie} />
        <p className="hero-summary">
          {movie.summary || "The next great story is already in your library."}
        </p>
        <div className="actions">
          <OpenInPlex movie={movie} server={connectedServer} sample={sample} />
          <button className="button secondary" onClick={() => onDetails(movie)}>
            <Icon name="info" size={18} />
            More info
          </button>
        </div>
        <div className="hero-footnote">
          <span className="mini-mark">p›</span>
          <span>
            IN YOUR LIBRARY<span className="footnote-dot">·</span>
            {movie.genres.slice(0, 2).join(" / ") || "Movie"}
          </span>
        </div>
      </div>
      <div className="hero-caption">
        <span>YOUR COLLECTION, A NEW PERSPECTIVE</span>
        <span className="hero-index">
          01 <span>/ {String(total).padStart(2, "0")}</span>
        </span>
      </div>
    </section>
  );
}
