import { describe, expect, it, vi } from "vitest";
import { PlexClient } from "../src/plex/client";
import { discoverTrailers } from "../src/trailer/discovery";
import { TrailerService } from "../src/trailer/service";
import type { PlexMetadata } from "../src/plex/schema";
const extra: PlexMetadata = {
  ratingKey: "2",
  key: "/library/metadata/2",
  type: "clip",
  subtype: "trailer",
  Media: [
    {
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      Part: [{ key: "/library/parts/2/file.mp4" }],
    },
  ],
};
const parent: PlexMetadata = {
  ratingKey: "1",
  key: "/library/metadata/1",
  Extras: { Metadata: [extra] },
};
describe("trailer discovery and resolution", () => {
  it("prefers trailers to scene previews and never mistakes other extras for trailers", () => {
    const result = discoverTrailers({
      ...parent,
      Extras: {
        Metadata: [
          { ...extra, subtype: "interview" },
          { ...extra, subtype: "sceneOrSample" },
          extra,
        ],
      },
    });
    expect(result.candidates.map((c) => c.source)).toEqual([
      "Plex trailer",
      "Plex preview",
    ]);
  });
  it("isolates the legacy numeric fallback and respects an explicit subtype", () => {
    expect(
      discoverTrailers({
        ...parent,
        Extras: { Metadata: [{ ...extra, subtype: undefined, extraType: 1 }] },
      }).metadataFound,
    ).toBe(true);
    expect(
      discoverTrailers({
        ...parent,
        Extras: {
          Metadata: [{ ...extra, subtype: "interview", extraType: 1 }],
        },
      }).metadataFound,
    ).toBe(false);
  });
  it("does not use a parent movie as a preview", () => {
    expect(
      discoverTrailers({
        ...parent,
        Extras: { Metadata: [{ ...extra, key: parent.key }] },
      }).metadataFound,
    ).toBe(false);
  });
  it("distinguishes no metadata from metadata without a playable resource", () => {
    expect(discoverTrailers({})).toMatchObject({
      metadataFound: false,
      candidates: [],
    });
    const d = discoverTrailers({
      Extras: { Metadata: [{ subtype: "trailer" }] },
    });
    expect(d.metadataFound).toBe(true);
    expect(
      new TrailerService(new PlexClient("x")).attempts(d, () => ""),
    ).toEqual([]);
  });
  it("tries a native part before Plex HLS and uses the extra key for streaming", () => {
    const service = new TrailerService(new PlexClient("x"));
    const attempts = service.attempts(discoverTrailers(parent), (mime) =>
      mime.startsWith("video/mp4") ? "probably" : "",
    );
    expect(attempts.map((a) => a.kind)).toEqual(["direct", "hls"]);
    expect(
      new URL(attempts[1].path, "http://localhost").searchParams.get("path"),
    ).toBe("/library/metadata/2");
    expect(attempts[1].path).not.toContain("Token");
  });
  it("routes indirect Plex assets through the server and skips unsupported codecs", () => {
    const service = new TrailerService(new PlexClient("x"));
    const d = discoverTrailers({
      Extras: {
        Metadata: [
          {
            ...extra,
            key: "plex://extras/abc",
            Media: [
              {
                container: "mkv",
                videoCodec: "hevc",
                indirect: 1,
                Part: [{ key: "https://outside.example/trailer" }],
              },
            ],
          },
        ],
      },
    });
    const attempts = service.attempts(d, () => "");
    expect(attempts).toHaveLength(1);
    expect(attempts[0].kind).toBe("hls");
    expect(
      new URL(attempts[0].path, "http://local").searchParams.get("path"),
    ).toBe("plex://extras/abc");
  });
  it("does not construct direct URLs for third-party media", () => {
    const d = discoverTrailers({
      Extras: {
        Metadata: [
          {
            ...extra,
            key: "https://outside.example",
            Media: [{ Part: [{ key: "https://outside.example/secret" }] }],
          },
        ],
      },
    });
    expect(
      new TrailerService(new PlexClient("secret")).attempts(
        d,
        () => "probably",
      ),
    ).toEqual([]);
  });
  it("caches only completed discovery, expires it, and bounds cache size", async () => {
    let now = 0;
    const client = new PlexClient("x");
    const details = vi.spyOn(client, "details").mockResolvedValue(parent);
    const service = new TrailerService(client, () => now);
    await service.discover("1");
    await service.discover("1");
    expect(details).toHaveBeenCalledTimes(1);
    now = 300001;
    await service.discover("1");
    expect(details).toHaveBeenCalledTimes(2);
    for (let i = 2; i <= 62; i++) await service.discover(String(i));
    await service.discover("1");
    expect(details).toHaveBeenCalledTimes(64);
  });
  it("does not cache failed discovery or cancelled responses", async () => {
    const client = new PlexClient("x");
    const details = vi
      .spyOn(client, "details")
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(parent);
    const service = new TrailerService(client);
    await expect(service.discover("1")).rejects.toThrow();
    await service.discover("1");
    expect(details).toHaveBeenCalledTimes(2);
    const abort = new AbortController();
    abort.abort();
    await expect(service.discover("2", abort.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    await service.discover("2");
    expect(details).toHaveBeenCalledTimes(4);
  });
});

describe("diagnostic observations", () => {
  it("retains measured playback results when a preview is paused for diagnostics", () => {
    const service = new TrailerService(new PlexClient("x"));
    service.report({
      movieId: "1",
      phase: "playing",
      metadataFound: true,
      urlResolved: true,
      playbackSucceeded: true,
      source: "Plex trailer",
    });
    service.report({ movieId: "1", phase: "paused" });
    expect(service.snapshot()[0]).toMatchObject({
      phase: "paused",
      metadataFound: true,
      urlResolved: true,
      playbackSucceeded: true,
    });
  });
});
