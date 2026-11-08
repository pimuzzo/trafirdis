import { useState } from "react";
import type { Movie } from "../domain/movie";
import type { PlexClient } from "../plex/client";
import { Icon } from "./Icon";
export function artworkUrl(
  movie: Movie,
  client: PlexClient | null,
  kind: "poster" | "art",
) {
  return client
    ? client.artwork(
        movie[kind],
        kind === "art" ? 1600 : 360,
        kind === "art" ? 900 : 540,
      )
    : movie[kind];
}
export function Artwork({
  movie,
  client,
  kind = "poster",
  eager = false,
}: {
  movie: Movie;
  client: PlexClient | null;
  kind?: "poster" | "art";
  eager?: boolean;
}) {
  const url = artworkUrl(movie, client, kind);
  const [failed, setFailed] = useState<string>();
  return url && failed !== url ? (
    <img
      className={`artwork artwork-${kind}`}
      src={url}
      alt={kind === "poster" ? `${movie.title} poster` : ""}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(url)}
      referrerPolicy="no-referrer"
    />
  ) : (
    <div className={`artwork artwork-fallback artwork-${kind}`}>
      <Icon name="film" size={40} />
      <span>{movie.title}</span>
    </div>
  );
}
