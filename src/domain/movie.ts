export interface Movie {
  id: string;
  key: string;
  title: string;
  summary: string;
  year?: number;
  duration: number;
  rating?: number;
  contentRating?: string;
  genres: string[];
  poster?: string;
  art?: string;
  watched: boolean;
  viewOffset: number;
  addedAt: number;
}
export interface Library {
  id: string;
  title: string;
}
export interface Server {
  name: string;
  machineIdentifier?: string;
  version?: string;
}
export interface Rail {
  title: string;
  movies: Movie[];
}
export interface Filters {
  search: string;
  genre: string;
  year: string;
  watched: string;
  duration: string;
  rating: string;
}
export const emptyFilters: Filters = {
  search: "",
  genre: "",
  year: "",
  watched: "",
  duration: "",
  rating: "",
};
export function filterMovies(movies: Movie[], f: Filters): Movie[] {
  const q = f.search.trim().toLocaleLowerCase("en");
  return movies.filter(
    (m) =>
      (!q ||
        `${m.title} ${m.summary} ${m.genres.join(" ")}`
          .toLocaleLowerCase("en")
          .includes(q)) &&
      (!f.genre || m.genres.includes(f.genre)) &&
      (!f.year || String(m.year) === f.year) &&
      (!f.watched || (f.watched === "watched" ? m.watched : !m.watched)) &&
      (!f.duration ||
        (m.duration > 0 &&
          (f.duration === "short"
            ? m.duration < 90 * 60000
            : f.duration === "medium"
              ? m.duration >= 90 * 60000 && m.duration <= 120 * 60000
              : m.duration > 120 * 60000))) &&
      (!f.rating || (m.rating !== undefined && m.rating >= Number(f.rating))),
  );
}
export function genresOf(movies: Movie[]): string[] {
  return [...new Set(movies.flatMap((m) => m.genres))].sort((a, b) =>
    a.localeCompare(b, "en"),
  );
}
export function groupMovies(movies: Movie[], order: string[] = []): Rail[] {
  const rails: Rail[] = [
    {
      title: "Continue Watching",
      movies: movies.filter(
        (m) => m.viewOffset > 0 && m.duration > m.viewOffset,
      ),
    },
    {
      title: "Recently Added",
      movies: [...movies].sort((a, b) => b.addedAt - a.addedAt),
    },
    { title: "Unwatched Movies", movies: movies.filter((m) => !m.watched) },
    ...genresOf(movies).map((title) => ({
      title,
      movies: movies.filter((m) => m.genres.includes(title)),
    })),
  ].filter((r) => r.movies.length > 0);
  const priority = [
    ...new Set([
      ...order,
      "Continue Watching",
      "Recently Added",
      "Unwatched Movies",
    ]),
  ];
  return rails.sort((a, b) => {
    const index = (title: string) =>
      priority.includes(title) ? priority.indexOf(title) : priority.length;
    return index(a.title) - index(b.title);
  });
}
export function durationLabel(duration: number) {
  if (!duration) return "Runtime unavailable";
  const minutes = Math.round(duration / 60000);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : `${minutes}m`;
}
