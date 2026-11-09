import { diagnosticsEnabled, serverLabel } from "../config";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PlexClient, errorMessage } from "../plex/client";
import {
  emptyFilters,
  filterMovies,
  groupMovies,
  type Movie,
  type Server,
  type Rail,
} from "../domain/movie";
import { sampleMovies } from "../sample";
import { Brand, Icon } from "./Icon";
import { MovieRail } from "./MovieRail";
import { MovieDetails } from "./MovieDetails";
import { Filters } from "./Filters";
import { Dialog } from "./Dialog";
import { Hero } from "./Hero";
import { TrailerService } from "../trailer/service";
import { Preview } from "./Preview";
import { useMovieLibrary } from "../hooks/useMovieLibrary";
import { useFeaturedMovie } from "../hooks/useFeaturedMovie";
const Diagnostics = diagnosticsEnabled
  ? lazy(() => import("./Diagnostics"))
  : null;
export default function Catalog({
  client,
  onDisconnect,
}: {
  client: PlexClient | null;
  onDisconnect: () => void;
}) {
  const sample = !client;
  const trailers = useMemo(
    () => (client ? new TrailerService(client) : null),
    [client],
  );
  const [diagnostics, setDiagnostics] = useState(false);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !["INPUT", "SELECT", "TEXTAREA"].includes(
          (e.target as HTMLElement).tagName,
        )
      ) {
        e.preventDefault();
        document
          .querySelector<HTMLInputElement>('[aria-label="Search movies"]')
          ?.focus();
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);
  const [filters, setFilters] = useState(emptyFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [details, setDetails] = useState<{ rail: Rail; index: number } | null>(
    null,
  );
  const [settings, setSettings] = useState(false);
  const server = useQuery({
    queryKey: ["server"],
    queryFn: ({ signal }) => client!.server(signal),
    enabled: !sample,
  });
  const libraries = useQuery({
    queryKey: ["libraries"],
    queryFn: ({ signal }) => client!.libraries(signal),
    enabled: !sample,
  });
  const serverKey = server.data
    ? server.data.machineIdentifier || serverLabel
    : undefined;
  const { libraryId, selectLibrary } = useMovieLibrary(
    serverKey,
    libraries.data,
  );
  const catalog = useQuery({
    queryKey: ["movies", libraryId],
    queryFn: ({ signal }) => client!.movies(libraryId!, signal),
    enabled: !sample && Boolean(libraryId),
  });
  const movies = sample ? sampleMovies : catalog.data || [];
  const visible = useMemo(
    () => filterMovies(movies, filters),
    [movies, filters],
  );
  const active = visible.find((m) => m.id === selected);
  const { movie: featured, selectFeatured } = useFeaturedMovie(
    movies,
    sample ? "sample" : `${serverKey || ""}:${libraryId || ""}`,
  );
  const rails = useMemo(
    () =>
      groupMovies(
        visible,
        (
          import.meta.env.VITE_SECTION_ORDER ||
          "Recently Added,Continue Watching,Unwatched Movies"
        )
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean),
      ),
    [visible],
  );
  const connectedServer: Server | undefined = sample
    ? { name: "Sample library" }
    : server.data;
  const error = server.error || libraries.error || catalog.error;
  const loading =
    !sample &&
    (server.isPending ||
      libraries.isPending ||
      (Boolean(libraryId) && catalog.isPending));
  const activeFilters = Object.entries(filters).filter(([, v]) =>
    Boolean(v),
  ).length;
  const select = (movie: Movie) => {
    setSelected(movie.id);
  };
  const showDetails = (movie: Movie, rail: Rail) => {
    const index = rail.movies.findIndex((item) => item.id === movie.id);
    if (index < 0) return;
    setSelected(movie.id);
    setDetails({ rail, index });
  };
  const refresh = () => {
    trailers?.clear();
    void server.refetch();
    void libraries.refetch();
    if (libraryId) void catalog.refetch();
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#catalog">
        Skip to movies
      </a>
      <header className="app-header">
        <a
          href="#"
          className="brand-link"
          aria-label="Trafirdis home"
          onClick={(e) => {
            e.preventDefault();
            setFilters(emptyFilters);
            window.scrollTo({ top: 0, behavior: "instant" });
          }}
        >
          <Brand />
        </a>
        <nav aria-label="Main navigation">
          <button
            className={!filters.watched ? "nav-link active" : "nav-link"}
            onClick={() => {
              setFilters(emptyFilters);
            }}
          >
            Discover
          </button>
          <button
            className={
              filters.watched === "unwatched" ? "nav-link active" : "nav-link"
            }
            onClick={() => {
              setFilters({ ...filters, watched: "unwatched" });
              document.getElementById("catalog")?.scrollIntoView();
            }}
          >
            Unwatched
          </button>
        </nav>
        <div className="header-actions">
          <label className="search">
            <span className="search-field">
              <Icon name="search" size={18} />
              <input
                type="search"
                placeholder="Find a film..."
                aria-label="Search movies"
                aria-keyshortcuts="/"
                value={filters.search}
                onChange={(e) => {
                  setFilters({ ...filters, search: e.target.value });
                }}
              />
            </span>
            <kbd aria-hidden="true">/</kbd>
          </label>
          <button
            className="icon-button"
            aria-label="Connection settings"
            onClick={() => setSettings(true)}
          >
            <Icon name="settings" />
          </button>
          <span className="profile" aria-label="Personal library">
            P
          </span>
        </div>
      </header>
      {sample && (
        <div className="sample-banner">
          <span>YOU’RE EXPLORING THE SAMPLE LIBRARY</span>
          <button onClick={onDisconnect}>
            Connect your Plex library
            <Icon name="arrow" size={14} />
          </button>
        </div>
      )}
      {featured && (
        <Hero
          movie={featured}
          client={client}
          trailers={trailers}
          connectedServer={connectedServer}
          total={movies.length}
          previewVisible={!details}
          previewEnabled={!settings && !diagnostics}
          onDetails={(movie) =>
            showDetails(movie, { title: "Movie library", movies })
          }
        />
      )}
      <main id="catalog" className="catalog" tabIndex={-1}>
        <div className="catalog-toolbar">
          <div>
            <span className="eyebrow subtle">
              THE GOOD STUFF IS ALREADY HERE
            </span>
            <h2>
              {filters.search
                ? "Your search results"
                : "Find your next great watch"}
              <span className="catalog-count">{visible.length} films</span>
            </h2>
          </div>
          <div className="catalog-tools">
            {!sample && libraries.data && libraries.data.length > 1 && (
              <select
                aria-label="Movie library"
                value={libraryId}
                onChange={(e) => {
                  selectLibrary(e.target.value);
                  setSelected("");
                  setFilters(emptyFilters);
                }}
              >
                {libraries.data.map((l) => (
                  <option value={l.id} key={l.id}>
                    {l.title}
                  </option>
                ))}
              </select>
            )}
            <button
              className={`button filter-button ${filterOpen ? "is-active" : ""}`}
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen(!filterOpen)}
            >
              <Icon name="filter" size={17} />
              Filters
              {activeFilters > 0 && (
                <span className="filter-count">{activeFilters}</span>
              )}
            </button>
            {!sample && (
              <button
                className="icon-button"
                aria-label="Refresh library"
                disabled={catalog.isFetching}
                onClick={refresh}
              >
                <Icon name="refresh" size={18} />
              </button>
            )}
          </div>
        </div>
        {filterOpen && (
          <Filters movies={movies} value={filters} onChange={setFilters} />
        )}
        {error && (
          <div role="alert" className="notice error">
            <Icon name="info" />
            <div>
              <strong>We couldn’t connect to your library.</strong>
              <p>{errorMessage(error)}</p>
              <div className="actions">
                <button className="button secondary" onClick={refresh}>
                  Try again
                </button>
                <button className="text-button" onClick={onDisconnect}>
                  Update connection
                </button>
              </div>
            </div>
          </div>
        )}
        {loading && !error && (
          <div aria-label="Loading movie library" className="skeleton-rail">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton" />
            ))}
          </div>
        )}
        {!sample && !loading && !error && libraries.data?.length === 0 && (
          <div className="empty-state">
            <Icon name="film" size={36} />
            <h3>No movie libraries found</h3>
            <p>
              This Plex account has no accessible movie libraries. Check library
              sharing and try again.
            </p>
            <button className="button secondary" onClick={refresh}>
              Check again
            </button>
          </div>
        )}
        {!loading &&
          !error &&
          visible.length === 0 &&
          Boolean(sample || libraryId) && (
            <div className="empty-state">
              <Icon name="search" size={34} />
              <h3>
                {movies.length
                  ? "No films match this combination"
                  : "Your movie library is empty"}
              </h3>
              <p>
                {movies.length
                  ? "Try another title or give your filters a little more room."
                  : "Add movies in Plex, then refresh your library here."}
              </p>
              {movies.length > 0 && (
                <button
                  className="button secondary"
                  onClick={() => setFilters(emptyFilters)}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        {rails.map((rail) => (
          <MovieRail
            key={`${libraryId}-${rail.title}`}
            rail={rail}
            client={client}
            selected={active?.id}
            onSelect={select}
            onDetails={(movie) => showDetails(movie, rail)}
          />
        ))}
      </main>
      <footer className="app-footer">
        <Brand />
        <p>A good film is closer than you think.</p>
        <span>
          <span className="status-dot" />
          {sample
            ? "Sample library"
            : connectedServer?.name || "Plex Media Server"}
          <span className="footer-separator">/</span>Made for your movie nights
        </span>
      </footer>
      {details && (
        <MovieDetails
          movie={details.rail.movies[details.index]}
          rail={details.rail}
          index={details.index}
          onNavigate={(index) => {
            if (index >= 0 && index < details.rail.movies.length) {
              setSelected(details.rail.movies[index].id);
              setDetails({ ...details, index });
            }
          }}
          client={client}
          server={connectedServer}
          onClose={() => setDetails(null)}
          preview={
            <Preview
              key={details.rail.movies[details.index].id}
              service={trailers}
              movieId={details.rail.movies[details.index].id}
              enabled={!settings && !diagnostics}
              compact
            />
          }
        />
      )}
      {Diagnostics && diagnostics && (
        <Suspense
          fallback={<span className="sr-only">Loading diagnostics</span>}
        >
          <Diagnostics
            movies={movies}
            selectedId={active?.id || featured?.id}
            service={trailers}
            onClose={() => setDiagnostics(false)}
            onTest={(movie) => {
              setFilters(emptyFilters);
              selectFeatured(movie.id);
              setSelected(movie.id);
              setDetails(null);
              setDiagnostics(false);
              window.scrollTo({ top: 0, behavior: "instant" });
            }}
          />
        </Suspense>
      )}
      {settings && (
        <Dialog title="Connection settings" onClose={() => setSettings(false)}>
          <div className="settings-body">
            <span className="eyebrow accent">YOUR SPACE</span>
            <h2>Connection settings</h2>
            <p>
              {sample
                ? "You are browsing fictional films in the sample library."
                : `Connected through ${serverLabel}`}
            </p>
            <p className="subtle">
              The Plex server address is configured by the deployment. Tokens
              are kept only for this browser session. Your library and watch
              history are never changed.{" "}
              <a href="/privacy.html" target="_blank" rel="noopener noreferrer">
                Privacy notice
              </a>
            </p>
            {Diagnostics && (
              <button
                className="button secondary"
                onClick={() => {
                  setSettings(false);
                  setDiagnostics(true);
                }}
              >
                Trailer diagnostics
              </button>
            )}
            <button className="button primary" onClick={onDisconnect}>
              {sample
                ? "Connect my Plex library"
                : "Disconnect and clear session"}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
