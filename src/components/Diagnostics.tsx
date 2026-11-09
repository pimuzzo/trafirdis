import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Movie } from "../domain/movie";
import type { TrailerService } from "../trailer/service";
import type { TrailerReport } from "../trailer/types";
import {
  createDiagnosticReport,
  diagnosticSampleLimit,
  diagnosticStatus,
  inspectTrailerMetadata,
} from "../trailer/diagnostics";
import { Dialog } from "./Dialog";
export default function Diagnostics({
  movies,
  selectedId,
  service,
  onClose,
  onTest,
}: {
  movies: Movie[];
  selectedId?: string;
  service: TrailerService | null;
  onClose: () => void;
  onTest: (movie: Movie) => void;
}) {
  const [reports, setReports] = useState<TrailerReport[]>(
    () => service?.snapshot() || [],
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const controller = useRef<AbortController | null>(null);
  const stopInspection = useCallback(() => {
    controller.current?.abort();
    for (const report of service?.snapshot() || [])
      if (report.phase === "discovering")
        service?.report({ movieId: report.movieId, phase: "paused" });
  }, [service]);
  useEffect(() => stopInspection, [stopInspection]);
  const sample = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("en");
    if (query)
      return movies
        .filter((movie) => movie.title.toLocaleLowerCase("en").includes(query))
        .slice(0, diagnosticSampleLimit);
    const selected = movies.find((movie) => movie.id === selectedId);
    return (
      selected
        ? [selected, ...movies.filter((movie) => movie.id !== selectedId)]
        : movies
    ).slice(0, diagnosticSampleLimit);
  }, [movies, search, selectedId]);
  const sampleReports = sample.map((movie) =>
    reports.find((report) => report.movieId === movie.id),
  );
  const cancel = () => {
    stopInspection();
    setReports(service?.snapshot() || []);
    setBusy(false);
    setMessage(
      "Inspection cancelled. Completed observations are still available.",
    );
  };
  const inspect = async () => {
    if (!service) return;
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setBusy(true);
    setMessage("");
    try {
      await inspectTrailerMetadata(
        service,
        sample.map((movie) => movie.id),
        next.signal,
        () => setReports(service.snapshot()),
      );
      if (!next.signal.aborted)
        setMessage("Inspection finished. Review the observed results below.");
    } catch {
      if (!next.signal.aborted)
        setMessage(
          "Inspection could not finish. Close diagnostics and try again.",
        );
    } finally {
      if (!next.signal.aborted) setBusy(false);
    }
  };
  const download = () => {
    try {
      const report = createDiagnosticReport(
        sample.map((movie) => movie.id),
        reports,
      );
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(report, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "plexplore-trailer-report.json";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        "Report downloaded. It contains movie IDs and observations; titles, credentials, addresses and stream URLs are excluded.",
      );
    } catch {
      setMessage(
        "The report could not be downloaded. Check your browser's download settings and try again.",
      );
    }
  };
  return (
    <Dialog
      title="Trailer diagnostics"
      onClose={onClose}
      className="diagnostics-dialog"
    >
      <div className="diagnostics-body">
        <span className="eyebrow accent">ADVANCED DIAGNOSTICS</span>
        <h2>Trailer diagnostics</h2>
        <p>
          Inspect up to eight films from the loaded library, starting with your
          selected film. This is a sample, not a full-library scan. Metadata
          checks never start video streams.
        </p>
        <label className="diagnostics-search">
          Find a movie to inspect
          <input
            value={search}
            disabled={busy}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search loaded movie titles"
          />
        </label>
        <div className="diagnostics-actions">
          <button
            className="button secondary"
            onClick={() => void inspect()}
            disabled={!service || busy || !sample.length}
          >
            {busy ? "Inspecting…" : "Inspect sample metadata"}
          </button>
          {busy && (
            <button className="button secondary" onClick={cancel}>
              Cancel inspection
            </button>
          )}
          <button
            className="button secondary"
            onClick={download}
            disabled={!service || busy || !sample.length}
          >
            Download report
          </button>
        </div>
        <p className="subtle">
          Inspecting reads fresh Plex metadata and clears earlier preview
          results for this sample. It does not refresh or modify metadata on
          your server.
        </p>
        <p className="diagnostics-summary" role="status">
          Sample: {sample.length} films · Metadata found:{" "}
          {
            sampleReports.filter((report) => report?.metadataFound === true)
              .length
          }
          {" · "}No trailer metadata:{" "}
          {
            sampleReports.filter((report) => report?.metadataFound === false)
              .length
          }
          {" · "}Playback verified:{" "}
          {
            sampleReports.filter((report) => report?.playbackSucceeded === true)
              .length
          }
        </p>
        {!service && (
          <p className="subtle">
            Connect a real Plex library to run diagnostics.
          </p>
        )}
        {!sample.length && <p>No loaded movies match this search.</p>}
        {message && <p role="status">{message}</p>}
        <div className="diagnostics-table">
          <table>
            <thead>
              <tr>
                <th>Film / Plex ID</th>
                <th>Metadata</th>
                <th>Source</th>
                <th>URL resolved</th>
                <th>Playback</th>
                <th>Status / reason</th>
                <th>Test</th>
              </tr>
            </thead>
            <tbody>
              {sample.map((movie) => {
                const report = reports.find((row) => row.movieId === movie.id);
                return (
                  <tr key={movie.id}>
                    <th scope="row">
                      {movie.title}
                      <small>{movie.id}</small>
                    </th>
                    <td>
                      {report?.metadataFound === undefined
                        ? report?.failure
                          ? "Request failed"
                          : "Not inspected"
                        : report.metadataFound
                          ? "Found"
                          : "Missing"}
                    </td>
                    <td>{report?.source || "—"}</td>
                    <td>
                      {report?.urlResolved === undefined
                        ? "Not tested"
                        : report.urlResolved
                          ? "Yes"
                          : "No"}
                    </td>
                    <td>
                      {report?.playbackSucceeded
                        ? "Succeeded"
                        : report?.failure === "autoplay"
                          ? "Blocked"
                          : report?.failure &&
                              report.metadataFound &&
                              report.failure !== "no-playback-resource"
                            ? "Failed"
                            : "Not tested"}
                    </td>
                    <td>
                      <span>{diagnosticStatus(report)}</span>
                      {report?.reason && (
                        <small className="diagnostics-reason">
                          {report.reason}
                        </small>
                      )}
                    </td>
                    <td>
                      <button
                        className="text-button"
                        disabled={!service || busy}
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
          Test preview closes this panel, clears catalog filters and selects the
          film in the hero. Reopen diagnostics to see the observed result. Only
          actual playback verifies a trailer. Reports are created locally and
          are never uploaded automatically.
        </p>
      </div>
    </Dialog>
  );
}
