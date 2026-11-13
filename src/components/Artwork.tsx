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
  return (
    <ArtworkImage
      key={`${movie.id}:${kind}:${url}`}
      movie={movie}
      kind={kind}
      eager={eager}
      url={url}
    />
  );
}
function ArtworkImage({
  movie,
  kind,
  eager,
  url,
}: {
  movie: Movie;
  kind: "poster" | "art";
  eager: boolean;
  url: string | undefined;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">(
    "loading",
  );
  return url && status !== "failed" ? (
    <img
      className={`artwork artwork-${kind}${status === "loading" ? " is-loading" : ""}`}
      src={url}
      alt={kind === "poster" ? `${movie.title} poster` : ""}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      aria-busy={status === "loading"}
      onLoad={() => setStatus("loaded")}
      onError={() => setStatus("failed")}
      referrerPolicy="no-referrer"
    />
  ) : (
    <div className={`artwork artwork-fallback artwork-${kind}`}>
      <Icon name="film" size={40} />
      <span>{movie.title}</span>
    </div>
  );
}
