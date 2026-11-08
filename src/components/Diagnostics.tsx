import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../plex/client";
import type { Movie } from "../domain/movie";
import type { TrailerService } from "../trailer/service";
import type { TrailerReport } from "../trailer/types";
import { Dialog } from "./Dialog";
export default function Diagnostics({
  movies,
  service,
  onClose,
  onTest,
}: {
  movies: Movie[];
  service: TrailerService | null;
  onClose: () => void;
  onTest: (movie: Movie) => void;
}) {
  const [reports, setReports] = useState<TrailerReport[]>(
    () => service?.snapshot() || [],
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const sample = movies.slice(0, 8);
  const inspect = async () => {
    if (!service) return;
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setBusy(true);
    setMessage("");
    try {
      for (const movie of sample) {
        const discovery = await service.discover(movie.id, next.signal);
        if (next.signal.aborted) return;
        const previous = service.snapshot().find((r) => r.movieId === movie.id);
        service.report({
          ...previous,
          movieId: movie.id,
          phase: previous?.phase || "metadata",
          metadataFound: discovery.metadataFound,
          source: discovery.candidates[0]?.source,
          reason: discovery.reason || previous?.reason,
        });
        setReports(service.snapshot());
      }
    } catch (error) {
      if (!next.signal.aborted) setMessage(errorMessage(error));
    } finally {
      if (!next.signal.aborted) setBusy(false);
    }
  };
  return (
    <Dialog
      title="Trailer diagnostics"
      onClose={onClose}
      className="diagnostics-dialog"
    >
      <div className="diagnostics-body">
        <span className="eyebrow accent">DEVELOPMENT ONLY</span>
        <h2>Trailer diagnostics</h2>
        <p>
          Metadata, stream resolution, and actual playback are measured
          separately. Inspecting metadata does not start video streams.
        </p>
        <button
          className="button secondary"
          onClick={() => void inspect()}
          disabled={!service || busy}
        >
          {busy ? "Inspecting…" : "Inspect sample metadata"}
        </button>
        {!service && (
          <p className="subtle">
            Connect a real Plex library to run diagnostics.
          </p>
        )}
        {message && <p role="alert">{message}</p>}
        <div className="diagnostics-table">
          <table>
            <thead>
              <tr>
                <th>Film / Plex ID</th>
                <th>Metadata</th>
                <th>Source</th>
                <th>URL resolved</th>
                <th>Playback</th>
                <th>Failure / status</th>
                <th>Test</th>
              </tr>
            </thead>
            <tbody>
              {sample.map((movie) => {
                const r = reports.find((row) => row.movieId === movie.id);
                return (
                  <tr key={movie.id}>
                    <th>
                      {movie.title}
                      <small>{movie.id}</small>
                    </th>
                    <td>
                      {r?.metadataFound === undefined
                        ? "Not inspected"
                        : r.metadataFound
                          ? "Found"
                          : "Missing"}
                    </td>
                    <td>{r?.source || "—"}</td>
                    <td>
                      {r?.urlResolved === undefined
                        ? "Not tested"
                        : r.urlResolved
                          ? "Yes"
                          : "No"}
                    </td>
                    <td>
                      {r?.playbackSucceeded === undefined
                        ? "Not tested"
                        : r.playbackSucceeded
                          ? "Succeeded"
                          : "Not yet"}
                    </td>
                    <td>{r?.reason || r?.phase || "Not inspected"}</td>
                    <td>
                      <button
                        className="text-button"
                        disabled={!service}
                        onClick={() => onTest(movie)}
                      >
                        Test preview
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="subtle">
          Test preview closes this panel and selects the film in the hero.
          Reopen diagnostics to see the observed result. No credentials or
          playable URLs are displayed.
        </p>
      </div>
    </Dialog>
  );
}
