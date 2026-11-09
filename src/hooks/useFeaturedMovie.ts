import { useEffect, useState } from "react";
import type { Movie } from "../domain/movie";

export function useFeaturedMovie(movies: Movie[], scope: string) {
  const [choice, setChoice] = useState<{ scope: string; id: string } | null>(
    null,
  );
  useEffect(() => {
    setChoice((current) => {
      if (
        current?.scope === scope &&
        movies.some((movie) => movie.id === current.id)
      )
        return current;
      if (!scope || !movies.length) return null;
      return {
        scope,
        id: movies[Math.floor(Math.random() * movies.length)].id,
      };
    });
  }, [movies, scope]);
  const movie =
    choice?.scope === scope
      ? movies.find((movie) => movie.id === choice.id)
      : undefined;
  const selectFeatured = (id: string) => {
    // Advanced diagnostics can explicitly test a film; browsing never calls this.
    if (movies.some((movie) => movie.id === id)) setChoice({ scope, id });
  };
  return { movie, selectFeatured };
}
