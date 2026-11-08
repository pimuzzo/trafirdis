import type { Movie } from "../domain/movie";
import type { PlexClient } from "../plex/client";
import type { TrailerService } from "../trailer/service";
import { Artwork } from "./Artwork";
import { Icon } from "./Icon";
import { MovieFacts } from "./MovieDetails";
import { Preview } from "./Preview";

export function PreviewDock({
  movie,
  client,
  service,
  enabled,
  onClose,
  onDetails,
}: {
  movie: Movie;
  client: PlexClient | null;
  service: TrailerService | null;
  enabled: boolean;
  onClose: () => void;
  onDetails: (movie: Movie) => void;
}) {
  return (
    <aside className="preview-dock" aria-label="Selected movie preview">
      <div className="dock-visual">
        <Artwork movie={movie} client={client} kind="art" eager />
        <Preview
          key={movie.id}
          service={service}
          movieId={movie.id}
          enabled={enabled}
          compact
        />
      </div>
      <button
        className="icon-button dock-close"
        aria-label="Dismiss selected movie preview"
        onClick={onClose}
      >
        <Icon name="close" size={16} />
      </button>
      <div className="dock-copy">
        <div>
          <span className="eyebrow accent">YOUR NEXT GREAT WATCH?</span>
          <h3>{movie.title}</h3>
          <MovieFacts movie={movie} />
        </div>
        <button
          className="icon-button"
          aria-label={`More information about ${movie.title}`}
          onClick={() => onDetails(movie)}
        >
          <Icon name="info" />
        </button>
      </div>
    </aside>
  );
}
