import { describe, expect, it, vi } from "vitest";
import { PlexClient, PlexError } from "../src/plex/client";
import {
  createDiagnosticReport,
  diagnosticStatus,
  inspectTrailerMetadata,
} from "../src/trailer/diagnostics";
import { TrailerService } from "../src/trailer/service";
import type { TrailerReport } from "../src/trailer/types";
const metadata = {
  Extras: { Metadata: [{ subtype: "trailer", key: "/library/metadata/101" }] },
};
function setup() {
  const client = new PlexClient("private-token", "http://127.0.0.1:32401");
  const details = vi.spyOn(client, "details").mockResolvedValue(metadata);
  const service = new TrailerService(client);
  return { client, details, service };
}
describe("metadata diagnostics", () => {
  it("rechecks cached absence without treating metadata as resolved or playable", async () => {
    const { service, details } = setup();
    details.mockResolvedValueOnce({});
    await service.discover("1");
    service.report({
      movieId: "1",
      phase: "playing",
      urlResolved: true,
      playbackSucceeded: true,
    });
    const attempts = vi.spyOn(service, "attempts");
    await inspectTrailerMetadata(
      service,
      ["1"],
      new AbortController().signal,
      () => {},
    );
    expect(details).toHaveBeenCalledTimes(2);
    expect(service.snapshot()).toEqual([
      expect.objectContaining({
        movieId: "1",
        metadataFound: true,
        phase: "metadata",
      }),
    ]);
    expect(service.snapshot()[0].urlResolved).toBeUndefined();
    expect(service.snapshot()[0].playbackSucceeded).toBeUndefined();
    expect(attempts).not.toHaveBeenCalled();
  });
  it("bounds a deduplicated sample to eight sequential metadata requests", async () => {
    const { service, details } = setup();
    let active = 0;
    let maximum = 0;
    details.mockImplementation(async () => {
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active--;
      return metadata;
    });
    await inspectTrailerMetadata(
      service,
      ["1", "1", ...Array.from({ length: 12 }, (_, i) => String(i + 2))],
      new AbortController().signal,
      () => {},
    );
    expect(details).toHaveBeenCalledTimes(8);
    expect(maximum).toBe(1);
    expect(service.snapshot()).toHaveLength(8);
  });
  it("records metadata errors separately from missing extras and continues the sample", async () => {
    const { service, details } = setup();
    details
      .mockRejectedValueOnce(
        new PlexError("response", "Plex request failed.", 404),
      )
      .mockResolvedValueOnce({});
    await inspectTrailerMetadata(
      service,
      ["1", "2", "3"],
      new AbortController().signal,
      () => {},
    );
    const reports = service.snapshot();
    expect(reports[0]).toMatchObject({
      phase: "error",
      failure: "response",
      httpStatus: 404,
    });
    expect(reports[0].metadataFound).toBeUndefined();
    expect(reports[1]).toMatchObject({
      metadataFound: false,
      failure: "no-trailer",
    });
    expect(reports[2]).toMatchObject({ metadataFound: true });
  });
  it("stops on denied access and clears stale evidence for unchecked sample rows", async () => {
    const { service, details } = setup();
    details.mockRejectedValue(
      new PlexError("auth", "Plex rejected access.", 403),
    );
    service.report({ movieId: "2", phase: "playing", playbackSucceeded: true });
    await inspectTrailerMetadata(
      service,
      ["1", "2"],
      new AbortController().signal,
      () => {},
    );
    expect(details).toHaveBeenCalledTimes(1);
    expect(service.snapshot()).toEqual([
      expect.objectContaining({
        movieId: "1",
        failure: "auth",
        httpStatus: 403,
      }),
    ]);
  });
  it("does not publish late metadata or start another request after cancellation", async () => {
    const { service, details } = setup();
    let finish: (value: typeof metadata) => void = () => {};
    details.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController();
    const changed = vi.fn();
    const inspection = inspectTrailerMetadata(
      service,
      ["1", "2"],
      controller.signal,
      changed,
    );
    const rejection = expect(inspection).rejects.toMatchObject({
      name: "AbortError",
    });
    const before = changed.mock.calls.length;
    controller.abort();
    finish(metadata);
    await rejection;
    expect(details).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(before);
    expect(service.snapshot()[0].metadataFound).toBeUndefined();
  });
  it("invalidates only the selected movie and resets success on a new attempt", async () => {
    const { service, details } = setup();
    await service.discover("1");
    await service.discover("2");
    service.invalidate("1");
    await service.discover("2");
    await service.discover("1");
    expect(details).toHaveBeenCalledTimes(3);
    service.report({
      movieId: "1",
      phase: "playing",
      metadataFound: true,
      playbackSucceeded: true,
    });
    service.report({ movieId: "1", phase: "paused" });
    expect(service.snapshot()[0].playbackSucceeded).toBe(true);
    service.report({ movieId: "1", phase: "waiting" });
    expect(service.snapshot()[0].playbackSucceeded).toBeUndefined();
  });
  it("retains a safe numeric HTTP status from actual Plex request failures", async () => {
    const client = new PlexClient(
      "private-token",
      "http://127.0.0.1:32401",
      vi.fn().mockResolvedValue(new Response("private body", { status: 503 })),
    );
    await expect(client.request("/library/metadata/1")).rejects.toMatchObject({
      code: "response",
      status: 503,
    });
  });
});
describe("diagnostic reports", () => {
  it("distinguishes absent trailers, unverified metadata, blocked playback and errors", () => {
    expect(diagnosticStatus()).toBe("Not inspected");
    expect(
      diagnosticStatus({
        movieId: "1",
        phase: "metadata",
        metadataFound: false,
      }),
    ).toBe("No trailer metadata");
    expect(
      diagnosticStatus({
        movieId: "1",
        phase: "metadata",
        metadataFound: true,
      }),
    ).toBe("Metadata found; playback not verified");
    expect(
      diagnosticStatus({ movieId: "1", phase: "error", failure: "response" }),
    ).toBe("Metadata request failed");
    expect(
      diagnosticStatus({
        movieId: "1",
        phase: "paused",
        metadataFound: true,
        failure: "unsupported",
      }),
    ).toBe("Playback failed");
    expect(
      diagnosticStatus({ movieId: "1", phase: "paused", failure: "autoplay" }),
    ).toBe("Autoplay blocked");
    expect(
      diagnosticStatus({
        movieId: "1",
        phase: "paused",
        playbackSucceeded: true,
      }),
    ).toBe("Playback verified");
  });
  it("exports only a bounded allowlist and keeps unknown observations null", () => {
    const report = createDiagnosticReport(
      ["1", "2"],
      [{ movieId: "1", phase: "metadata", metadataFound: true }],
      new Date("2026-11-09T00:00:00Z"),
    );
    expect(report.generatedAt).toBe("2026-11-09T00:00:00.000Z");
    expect(report.checks[0]).toMatchObject({
      metadataFound: true,
      urlResolved: null,
      playbackSucceeded: null,
    });
    expect(report.checks[1]).toMatchObject({
      metadataFound: null,
      phase: null,
    });
    expect(
      createDiagnosticReport(
        Array.from({ length: 20 }, (_, i) => String(i)),
        [],
      ).checks,
    ).toHaveLength(8);
  });
  it("excludes credentials, URLs, titles, response bodies and unexpected fields", () => {
    const secret = "private-token";
    const row = {
      movieId: "1",
      phase: "error",
      metadataFound: true,
      failure: "network",
      httpStatus: 401,
      reason: "http://192.168.1.2:32400/?X-Plex-Token=" + secret,
      title: secret,
      token: secret,
      response: secret,
      method: secret,
      source: secret,
    } as unknown as TrailerReport;
    const forged = {
      ...row,
      movieId: secret,
      phase: secret,
      failure: secret,
      httpStatus: -1,
    } as unknown as TrailerReport;
    const report = createDiagnosticReport(["1", secret], [row, forged]);
    const json = JSON.stringify(report);
    expect(json).not.toContain(secret);
    expect(json).not.toContain("192.168");
    expect(json).not.toContain("http:");
    expect(json).not.toContain("X-Plex-Token");
    expect(report.checks[0]).toMatchObject({
      movieId: "1",
      failure: "network",
      httpStatus: 401,
      method: null,
      source: null,
    });
    expect(report.checks[1]).toMatchObject({
      movieId: null,
      phase: null,
      failure: null,
      httpStatus: null,
    });
  });
});
