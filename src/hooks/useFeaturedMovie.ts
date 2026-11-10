import { useEffect, useMemo, useState } from "react";
import type { Movie } from "../domain/movie";

function pickMovie(pool: Movie[], excludeId?: string) {
  const alternatives = pool.filter((movie) => movie.id !== excludeId);
  const choices = alternatives.length ? alternatives : pool;
  return choices.length
    ? choices[Math.floor(Math.random() * choices.length)]
    : undefined;
}

export function useFeaturedMovie(movies: Movie[], scope: string) {
  const [choice, setChoice] = useState<{ scope: string; id: string } | null>(
    null,
  );
  const pool = useMemo(() => {
    const unwatched = movies.filter((movie) => !movie.watched);
    return unwatched.length ? unwatched : movies;
  }, [movies]);
  useEffect(() => {
    setChoice((current) => {
      if (
        current?.scope === scope &&
        pool.some((movie) => movie.id === current.id)
      )
        return current;
      const next = pickMovie(pool);
      return scope && next ? { scope, id: next.id } : null;
    });
  }, [pool, scope]);
  const movie =
    choice?.scope === scope
      ? movies.find((movie) => movie.id === choice.id)
      : undefined;
  const selectFeatured = (id: string) => {
    // Advanced diagnostics can explicitly test a film; browsing never calls this.
    if (movies.some((movie) => movie.id === id)) setChoice({ scope, id });
  };
  const randomizeFeatured = () => {
    setChoice((current) => {
      const next = pickMovie(
        pool,
        current?.scope === scope ? current.id : undefined,
      );
      return scope && next ? { scope, id: next.id } : null;
    });
  };
  const canRandomize = pool.some((candidate) => candidate.id !== movie?.id);
  return { movie, selectFeatured, randomizeFeatured, canRandomize };
}
