import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMovieLibrary } from "../src/hooks/useMovieLibrary";
import { useFeaturedMovie } from "../src/hooks/useFeaturedMovie";
import { useCatalogFilters } from "../src/hooks/useCatalogFilters";
import { emptyFilters } from "../src/domain/movie";
import type { Movie } from "../src/domain/movie";
const movie = (overrides: Partial<Movie> = {}): Movie => ({
  id: "1",
  key: "/library/metadata/1",
  title: "First film",
  summary: "A fictional film.",
  duration: 6000000,
  genres: ["Drama"],
  watched: false,
  viewOffset: 0,
  addedAt: 1,
  ...overrides,
});

const libraries = [
  { id: "1", title: "Movies" },
  { id: "2", title: "Archive" },
];
const movies = [movie(), movie({ id: "2" }), movie({ id: "3" })];
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("movie library preference", () => {
  it("restores an explicit choice after remount without persisting credentials", () => {
    const first = renderHook(() => useMovieLibrary("server-a", libraries));
    expect(first.result.current.libraryId).toBe("1");
    act(() => first.result.current.selectLibrary("2"));
    first.unmount();
    const restored = renderHook(() => useMovieLibrary("server-a", libraries));
    expect(restored.result.current.libraryId).toBe("2");
    expect(localStorage.getItem("trafirdis.library.server-a")).toBe("2");
    expect(localStorage.length).toBe(1);
  });
  it("waits for server identity and accessible sections, then validates the saved choice", () => {
    localStorage.setItem("trafirdis.library.server-a", "2");
    const { result, rerender } = renderHook(
      ({ server, sections }) => useMovieLibrary(server, sections),
      {
        initialProps: {
          server: undefined as string | undefined,
          sections: undefined as typeof libraries | undefined,
        },
      },
    );
    expect(result.current.libraryId).toBeUndefined();
    rerender({ server: "server-a", sections: undefined });
    expect(result.current.libraryId).toBeUndefined();
    rerender({ server: "server-a", sections: libraries });
    expect(result.current.libraryId).toBe("2");
    rerender({ server: "server-a", sections: libraries.slice(0, 1) });
    expect(result.current.libraryId).toBe("1");
    rerender({ server: "server-a", sections: [] });
    expect(result.current.libraryId).toBeUndefined();
  });
  it("isolates choices by server and rejects inaccessible selections", () => {
    const { result, rerender } = renderHook(
      ({ server }) => useMovieLibrary(server, libraries),
      { initialProps: { server: "server-a" } },
    );
    act(() => result.current.selectLibrary("2"));
    act(() => result.current.selectLibrary("not-accessible"));
    expect(result.current.libraryId).toBe("2");
    rerender({ server: "server-b" });
    expect(result.current.libraryId).toBe("1");
    rerender({ server: "server-a" });
    expect(result.current.libraryId).toBe("2");
  });
  it("keeps library switching usable when browser storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    const { result } = renderHook(() => useMovieLibrary("server-a", libraries));
    act(() => result.current.selectLibrary("2"));
    expect(result.current.libraryId).toBe("2");
  });
});

describe("catalog view preference", () => {
  it("restores Unwatched after remount without restoring search or other filters", () => {
    const first = renderHook(() => useCatalogFilters());
    act(() =>
      first.result.current[1]({
        ...emptyFilters,
        watched: "unwatched",
        search: "A fictional query",
        genre: "Drama",
      }),
    );
    expect(localStorage.getItem("trafirdis.catalog-view")).toBe("unwatched");
    expect(localStorage.length).toBe(1);
    first.unmount();
    const restored = renderHook(() => useCatalogFilters());
    expect(restored.result.current[0]).toEqual({
      ...emptyFilters,
      watched: "unwatched",
    });
    act(() => restored.result.current[1](emptyFilters));
    restored.unmount();
    const discover = renderHook(() => useCatalogFilters());
    expect(discover.result.current[0]).toEqual(emptyFilters);
    expect(localStorage.getItem("trafirdis.catalog-view")).toBe("discover");
  });
  it.each(["discover", "watched", "unknown", ""])(
    "defaults to Discover for saved value %s",
    (value) => {
      localStorage.setItem("trafirdis.catalog-view", value);
      const { result } = renderHook(() => useCatalogFilters());
      expect(result.current[0]).toEqual(emptyFilters);
    },
  );
  it("keeps view switching usable when browser storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    const { result } = renderHook(() => useCatalogFilters());
    act(() => result.current[1]({ ...emptyFilters, watched: "unwatched" }));
    expect(result.current[0].watched).toBe("unwatched");
    act(() => result.current[1](emptyFilters));
    expect(result.current[0].watched).toBe("");
  });
});

describe("featured movie", () => {
  it("keeps the featured film stable through metadata updates", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { result, rerender } = renderHook(
      ({ items }) => useFeaturedMovie(items, "library-a"),
      { initialProps: { items: movies } },
    );
    expect(result.current.movie?.id).toBe("3");
    random.mockReturnValue(0);
    rerender({
      items: [movie({ id: "3", title: "Updated title" }), movies[0]],
    });
    expect(result.current.movie?.id).toBe("3");
    expect(result.current.movie?.title).toBe("Updated title");
  });
  it("chooses again for a different library or a removed featured film", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { result, rerender } = renderHook(
      ({ items, scope }) => useFeaturedMovie(items, scope),
      { initialProps: { items: movies, scope: "library-a" } },
    );
    expect(result.current.movie?.id).toBe("3");
    random.mockReturnValue(0);
    rerender({ items: movies, scope: "library-b" });
    expect(result.current.movie?.id).toBe("1");
    rerender({ items: movies.slice(1), scope: "library-b" });
    expect(result.current.movie?.id).toBe("2");
    rerender({ items: [], scope: "library-b" });
    expect(result.current.movie).toBeUndefined();
  });
  it("allows an intentional diagnostics test without accepting an unknown movie", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { result } = renderHook(() => useFeaturedMovie(movies, "library-a"));
    act(() => result.current.selectFeatured("2"));
    expect(result.current.movie?.id).toBe("2");
    act(() => result.current.selectFeatured("unknown"));
    expect(result.current.movie?.id).toBe("2");
  });
  it("rerolls within unwatched films without repeating", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const items = [
      movie(),
      movie({ id: "2", watched: true }),
      movie({ id: "3" }),
    ];
    const { result } = renderHook(() => useFeaturedMovie(items, "library-a"));
    expect(result.current.movie?.id).toBe("3");
    expect(result.current.canRandomize).toBe(true);
    act(() => result.current.randomizeFeatured());
    expect(result.current.movie?.id).toBe("1");
    act(() => result.current.randomizeFeatured());
    expect(result.current.movie?.id).toBe("3");
  });
  it("uses watched films when no unwatched titles remain", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const items = movies.map((item) => ({ ...item, watched: true }));
    const { result } = renderHook(() => useFeaturedMovie(items, "library-a"));
    expect(result.current.movie?.id).toBe("1");
    expect(result.current.canRandomize).toBe(true);
    act(() => result.current.randomizeFeatured());
    expect(result.current.movie?.id).toBe("2");
    expect(result.current.movie?.watched).toBe(true);
  });
  it("handles single-candidate and empty libraries", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { result, rerender } = renderHook(
      ({ items }) => useFeaturedMovie(items, "library-a"),
      { initialProps: { items: [movie(), movie({ id: "2", watched: true })] } },
    );
    expect(result.current.movie?.id).toBe("1");
    expect(result.current.canRandomize).toBe(false);
    act(() => result.current.randomizeFeatured());
    expect(result.current.movie?.id).toBe("1");
    rerender({ items: [] });
    act(() => result.current.randomizeFeatured());
    expect(result.current.movie).toBeUndefined();
    expect(result.current.canRandomize).toBe(false);
  });
  it("revalidates the featured choice when Plex watch status changes", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { result, rerender } = renderHook(
      ({ items }) => useFeaturedMovie(items, "library-a"),
      {
        initialProps: {
          items: movies.map((item) => ({ ...item, watched: true })),
        },
      },
    );
    expect(result.current.movie?.id).toBe("1");
    rerender({
      items: [movie({ watched: true }), movie({ id: "2" })],
    });
    expect(result.current.movie?.id).toBe("2");
    rerender({
      items: [movie(), movie({ id: "2", watched: true })],
    });
    expect(result.current.movie?.id).toBe("1");
  });
});
