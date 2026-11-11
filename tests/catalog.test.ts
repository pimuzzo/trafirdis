import { describe, expect, it } from "vitest";
import {
  filterMovies,
  groupMovies,
  emptyFilters,
  type Movie,
} from "../src/domain/movie";
export const movie = (overrides: Partial<Movie> = {}): Movie => ({
  id: "1",
  key: "/library/metadata/1",
  title: "Arrival",
  summary: "A story of language.",
  year: 2016,
  duration: 116 * 60000,
  rating: 8,
  genres: ["Science Fiction", "Drama"],
  watched: false,
  viewOffset: 0,
  addedAt: 1,
  ...overrides,
});
describe("catalog", () => {
  it("groups using actual genre tags, including multiple genres and missing tags", () => {
    const rails = groupMovies([movie(), movie({ id: "2", genres: [] })]);
    expect(rails.find((r) => r.title === "Drama")?.movies).toHaveLength(1);
    expect(
      rails.find((r) => r.title === "Recently Added")?.movies,
    ).toHaveLength(2);
    expect(rails.some((r) => r.title === "Comedy")).toBe(false);
  });
  it("combines search, year, genre, duration, rating and watch status", () => {
    const m = movie();
    const filters = {
      ...emptyFilters,
      search: "LANGUAGE",
      year: "2016",
      genre: "Drama",
      duration: "medium",
      rating: "8",
      watched: "unwatched",
    };
    expect(filterMovies([m], filters)).toEqual([m]);
    expect(filterMovies([m], { ...filters, watched: "watched" })).toEqual([]);
  });
  it("sorts recent additions without mutating Plex metadata and honors section order", () => {
    const movies = [movie(), movie({ id: "2", addedAt: 20 })];
    const rails = groupMovies(movies, ["Drama"]);
    expect(rails[0].title).toBe("Drama");
    expect(rails.find((r) => r.title === "Recently Added")?.movies[0].id).toBe(
      "2",
    );
    expect(movies[0].id).toBe("1");
  });
  it("only includes in-progress movies in Continue Watching", () => {
    expect(groupMovies([movie({ viewOffset: 100 })])[0].title).toBe(
      "Continue Watching",
    );
    expect(
      groupMovies([movie({ viewOffset: 99999999 })]).some(
        (r) => r.title === "Continue Watching",
      ),
    ).toBe(false);
  });
  it("limits Recently Added to the latest 25 matching films without limiting other categories", () => {
    const movies = Array.from({ length: 60 }, (_, index) =>
      movie({ id: String(index), addedAt: index, watched: index % 2 === 0 }),
    );
    for (const filters of [
      emptyFilters,
      { ...emptyFilters, watched: "unwatched" },
    ]) {
      const matching = filterMovies(movies, filters);
      const rails = groupMovies(matching);
      const recent = rails.find((rail) => rail.title === "Recently Added")!;
      expect(recent.movies).toHaveLength(25);
      expect(recent.movies.map((movie) => movie.id)).toEqual(
        matching
          .slice(-25)
          .reverse()
          .map((movie) => movie.id),
      );
      expect(rails.find((rail) => rail.title === "Drama")?.movies).toHaveLength(
        matching.length,
      );
    }
    expect(movies.map((movie) => movie.addedAt)).toEqual(
      Array.from({ length: 60 }, (_, index) => index),
    );
  });
  it("can hide the unwatched section without removing genres", () => {
    const m = movie();
    expect(groupMovies([m]).some((r) => r.title === "Unwatched Movies")).toBe(
      true,
    );
    const rails = groupMovies([m], [], false);
    expect(rails.some((r) => r.title === "Unwatched Movies")).toBe(false);
    expect(rails.find((r) => r.title === "Drama")?.movies).toEqual([m]);
    const recent = rails.find((r) => r.title === "Recently Added");
    expect(recent?.movies).toEqual([m]);
  });
});
