import { diagnosticsEnabled, serverLabel } from "../config";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PlexClient, errorMessage } from "../plex/client";
import {
  emptyFilters,
  filterMovies,
  groupMovies,
  type Movie,
  type Server,
} from "../domain/movie";
import { sampleMovies } from "../sample";
import { Brand, Icon } from "./Icon";
import { MovieRail, MovieCard } from "./MovieRail";
import { MovieDetails } from "./MovieDetails";
import { Filters } from "./Filters";
import { Dialog } from "./Dialog";
import { Hero } from "./Hero";
import { PreviewDock } from "./PreviewDock";
import { TrailerService } from "../trailer/service";
import { Preview } from "./Preview";
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
  const heroHost = useRef<HTMLDivElement>(null);
  const [heroVisible, setHeroVisible] = useState(true);
  const [dockDismissed, setDockDismissed] = useState(false);
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
  const [library, setLibrary] = useState("");
  const [filters, setFilters] = useState(emptyFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [details, setDetails] = useState<Movie | null>(null);
  const [settings, setSettings] = useState(false);
  const [view, setView] = useState<"discover" | "library">("discover");
  const [gridLimit, setGridLimit] = useState(40);
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
  const libraryId = library || libraries.data?.[0]?.id;
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
  const active = visible.find((m) => m.id === selected) || visible[0];
  const hasMovie = Boolean(active);
  useEffect(() => {
    const element = heroHost.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => setHeroVisible((entries[0]?.intersectionRatio || 0) >= 0.15),
      { threshold: 0.15 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMovie]);
  const dockMovie =
    active && selected && !heroVisible && !dockDismissed && !details
      ? active
      : null;
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
    (libraries.isPending || (Boolean(libraryId) && catalog.isPending));
  const activeFilters = Object.entries(filters).filter(([, v]) =>
    Boolean(v),
  ).length;
  const select = (movie: Movie) => {
    setSelected(movie.id);
    setDockDismissed(false);
  };
  const showDetails = (movie: Movie) => {
    setSelected(movie.id);
    setDetails(movie);
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
          aria-label="Plexplore home"
          onClick={(e) => {
            e.preventDefault();
            setView("discover");
            setFilters(emptyFilters);
            window.scrollTo({ top: 0, behavior: "instant" });
          }}
        >
          <Brand />
        </a>
        <nav aria-label="Main navigation">
          <button
            className={
              view === "discover" && !filters.watched
                ? "nav-link active"
                : "nav-link"
            }
            onClick={() => {
              setView("discover");
              setFilters(emptyFilters);
            }}
          >
            Discover
          </button>
          <button
            className={view === "library" ? "nav-link active" : "nav-link"}
            onClick={() => {
              setView("library");
              document.getElementById("catalog")?.scrollIntoView();
            }}
          >
            My library
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
            <Icon name="search" size={18} />
            <input
              type="search"
              placeholder="Find a film..."
              aria-label="Search movies"
              value={filters.search}
              onChange={(e) => {
                setFilters({ ...filters, search: e.target.value });
              }}
            />
            <kbd>/</kbd>
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
      {active && (
        <div ref={heroHost}>
          <Hero
            movie={active}
            client={client}
            trailers={trailers}
            connectedServer={connectedServer}
            total={visible.length}
            previewVisible={!details && !dockMovie}
            previewEnabled={!settings && !diagnostics}
            onDetails={showDetails}
          />
        </div>
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
                : view === "library"
                  ? "Your film collection"
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
                  setLibrary(e.target.value);
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
        {view === "library" || activeFilters > 0 ? (
          <>
            <div className="movie-grid" data-rail aria-label="Movie results">
              {visible.slice(0, gridLimit).map((m) => (
                <MovieCard
                  key={m.id}
                  movie={m}
                  client={client}
                  selected={active?.id === m.id}
                  onSelect={select}
                  onDetails={showDetails}
                />
              ))}
            </div>
            {visible.length > gridLimit && (
              <button
                className="button secondary grid-more"
                onClick={() => setGridLimit(gridLimit + 40)}
              >
                Show more films
              </button>
            )}
          </>
        ) : (
          rails.map((rail) => (
            <MovieRail
              key={`${libraryId}-${rail.title}`}
              rail={rail}
              client={client}
              selected={active?.id}
              onSelect={select}
              onDetails={showDetails}
            />
          ))
        )}
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
      {dockMovie && (
        <PreviewDock
          movie={dockMovie}
          client={client}
          service={trailers}
          enabled={!settings && !diagnostics}
          onClose={() => setDockDismissed(true)}
          onDetails={showDetails}
        />
      )}
      {details && (
        <MovieDetails
          movie={details}
          client={client}
          server={connectedServer}
          onClose={() => setDetails(null)}
          preview={
            <Preview
              key={details.id}
              service={trailers}
              movieId={details.id}
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
            selectedId={active?.id}
            service={trailers}
            onClose={() => setDiagnostics(false)}
            onTest={(movie) => {
              setFilters(emptyFilters);
              setView("discover");
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
              history are never changed.
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
