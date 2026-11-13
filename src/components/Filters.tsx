import {
  emptyFilters,
  genresOf,
  type Filters as FilterValues,
  type Movie,
} from "../domain/movie";
import { Select } from "./Select";
export function Filters({
  movies,
  value,
  onChange,
}: {
  movies: Movie[];
  value: FilterValues;
  onChange: (filters: FilterValues) => void;
}) {
  const field = (key: keyof FilterValues, next: string) =>
    onChange({ ...value, [key]: next });
  return (
    <div className="filter-panel">
      <label>
        Genre
        <Select
          aria-label="Genre"
          value={value.genre}
          onChange={(e) => field("genre", e.target.value)}
        >
          <option value="">All genres</option>
          {genresOf(movies).map((g) => (
            <option key={g}>{g}</option>
          ))}
        </Select>
      </label>
      <label>
        Release year
        <Select
          aria-label="Release year"
          value={value.year}
          onChange={(e) => field("year", e.target.value)}
        >
          <option value="">All years</option>
          {[...new Set(movies.map((m) => m.year).filter(Boolean))]
            .sort((a, b) => b! - a!)
            .map((y) => (
              <option key={y}>{y}</option>
            ))}
        </Select>
      </label>
      <label>
        Watch status
        <Select
          aria-label="Watch status"
          value={value.watched}
          onChange={(e) => field("watched", e.target.value)}
        >
          <option value="">Any status</option>
          <option value="unwatched">Unwatched</option>
          <option value="watched">Watched</option>
        </Select>
      </label>
      <label>
        Runtime
        <Select
          aria-label="Runtime"
          value={value.duration}
          onChange={(e) => field("duration", e.target.value)}
        >
          <option value="">Any runtime</option>
          <option value="short">Under 90 minutes</option>
          <option value="medium">90–120 minutes</option>
          <option value="long">Over 120 minutes</option>
        </Select>
      </label>
      <label>
        Rating
        <Select
          aria-label="Rating"
          value={value.rating}
          onChange={(e) => field("rating", e.target.value)}
        >
          <option value="">Any rating</option>
          <option value="6">6+ / 10</option>
          <option value="7">7+ / 10</option>
          <option value="8">8+ / 10</option>
          <option value="9">9+ / 10</option>
        </Select>
      </label>
      <button className="text-button" onClick={() => onChange(emptyFilters)}>
        Clear filters
      </button>
    </div>
  );
}
