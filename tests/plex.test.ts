import { describe, expect, it, vi } from "vitest";
import { mapMovie, PlexClient, PlexError } from "../src/plex/client";
import { plexLink } from "../src/plex/links";
const json = (MediaContainer: unknown) =>
  new Response(JSON.stringify({ MediaContainer }), {
    headers: { "Content-Type": "application/json" },
  });
describe("Plex integration boundary", () => {
  it("loads only movie libraries and keeps the token in a request header", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        Directory: [
          { key: "1", title: "Movies", type: "movie" },
          { key: "2", title: "TV", type: "show" },
        ],
      }),
    );
    const c = new PlexClient("private-test-token", fetcher);
    expect(await c.libraries()).toEqual([{ id: "1", title: "Movies" }]);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("/plex/library/sections");
    expect(JSON.stringify(url)).not.toContain("private-test-token");
    expect(init?.headers).toHaveProperty("X-Plex-Token", "private-test-token");
    expect(init?.redirect).toBe("error");
  });
  it("pages until the actual total, even when Plex returns fewer than requested", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          offset: 0,
          totalSize: 3,
          Metadata: [{ ratingKey: "1", type: "movie", title: "One" }],
        }),
      )
      .mockResolvedValueOnce(
        json({
          offset: 1,
          totalSize: 3,
          Metadata: [
            { ratingKey: "2", type: "movie", title: "Two" },
            { ratingKey: "3", type: "movie", title: "Three" },
          ],
        }),
      );
    expect(await new PlexClient("x", fetcher).movies("4")).toHaveLength(3);
    expect(fetcher.mock.calls[1][0]).toContain("X-Plex-Container-Start=1");
  });
  it("detects servers that ignore pagination instead of fetching forever", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      json({
        totalSize: 1000,
        Metadata: [{ ratingKey: "1", type: "movie" }],
      }),
    );
    await expect(
      new PlexClient("x", fetcher).movies("1"),
    ).rejects.toMatchObject({ code: "response" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([401, 403])(
    "reports HTTP %s without response bodies or credentials",
    async (status) => {
      const c = new PlexClient(
        "private-test-token",
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response("private-test-token", { status })),
      );
      await expect(c.server()).rejects.toMatchObject({ code: "auth" });
      try {
        await c.server();
      } catch (e) {
        expect(String(e)).not.toContain("private-test-token");
      }
    },
  );
  it("reports connection and malformed response errors safely", async () => {
    await expect(
      new PlexClient(
        "secret",
        vi.fn<typeof fetch>().mockRejectedValue(new TypeError("secret")),
      ).server(),
    ).rejects.toMatchObject({ code: "network" });
    await expect(
      new PlexClient(
        "secret",
        vi.fn<typeof fetch>().mockResolvedValue(new Response("{}")),
      ).server(),
    ).rejects.toMatchObject({ code: "response" });
  });
  it("preserves cancellation rather than displaying it as a server failure", async () => {
    const controller = new AbortController();
    controller.abort();
    const c = new PlexClient(
      "x",
      vi
        .fn<typeof fetch>()
        .mockRejectedValue(new DOMException("Aborted", "AbortError")),
    );
    await expect(c.server(controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
  it("normalizes missing metadata and watched state without inventing a rating", () => {
    expect(
      mapMovie({
        ratingKey: 1,
        viewCount: 2,
        Genre: [{ tag: "Drama" }, { tag: "Drama" }, {}],
      }),
    ).toMatchObject({
      id: "1",
      title: "Untitled movie",
      watched: true,
      genres: ["Drama"],
      duration: 0,
      rating: undefined,
    });
  });
  it.each([
    "https://outside.example/x",
    "//outside.example/x",
    "/\\outside.example/x",
  ])("rejects external paths: %s", (path) => {
    const c = new PlexClient("secret");
    expect(() => c.resource(path)).toThrow(PlexError);
    expect(c.artwork(path, 200, 300)).toBeUndefined();
  });
  it("uses resized artwork with a relative source and token only at the trusted proxy", () => {
    const url = new PlexClient("private-test-token").artwork(
      "/library/metadata/1/thumb/5",
      360,
      540,
    )!;
    expect(url).toContain("/plex/photo/:/transcode?");
    const parsed = new URL(url, "http://localhost");
    expect(parsed.searchParams.get("url")).toBe("/library/metadata/1/thumb/5");
    expect(parsed.searchParams.get("width")).toBe("360");
  });
  it("constructs the source-verified Plex Web detail link without credentials", () => {
    const url = plexLink("machine-id", "/library/metadata/123");
    expect(url).toBe(
      "https://app.plex.tv/desktop/#!/server/machine-id/details?key=%2Flibrary%2Fmetadata%2F123",
    );
    expect(plexLink(undefined, "/library/metadata/123")).toBe(
      "https://app.plex.tv/desktop/",
    );
  });
});
