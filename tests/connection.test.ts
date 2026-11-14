import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearConnection,
  readConnection,
  saveConnection,
  serverOrigin,
  preferredServer,
} from "../src/plex/connection";
import { PlexClient } from "../src/plex/client";

describe("selected Plex connection", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());
  it("restores the selected origin and token together, keeping only the server ID across sessions", () => {
    const connection = {
      token: "synthetic-token",
      base: "https://selected.example:32400",
      machineIdentifier: "server-one",
    };
    saveConnection(connection);
    expect(readConnection()).toEqual(connection);
    expect(preferredServer()).toBe("server-one");
    expect(JSON.stringify(localStorage)).not.toContain("synthetic-token");
    clearConnection();
    expect(readConnection()).toBeNull();
    expect(sessionStorage.getItem("trafirdis.server")).toBeNull();
    expect(preferredServer()).toBe("server-one");
  });
  it("requires a saved direct origin and rejects old or malformed destinations", () => {
    sessionStorage.setItem("trafirdis.token", "old-session");
    expect(readConnection()).toBeNull();
    sessionStorage.setItem(
      "trafirdis.server",
      JSON.stringify({ base: "/plex" }),
    );
    expect(readConnection()).toBeNull();
    sessionStorage.setItem(
      "trafirdis.server",
      JSON.stringify({ base: "https://user:secret@wrong.example" }),
    );
    expect(readConnection()).toBeNull();
  });
  it("rejects mixed content on HTTPS and accepts HTTPS origins without rewriting the host", () => {
    expect(() => serverOrigin("https://*")).toThrow();
    expect(() => serverOrigin("https://server;other-directive")).toThrow();
    vi.stubGlobal("window", { location: { protocol: "https:" } });
    expect(() => serverOrigin("http://local.example:32400")).toThrow();
    expect(serverOrigin("https://local.example:32400/")).toBe(
      "https://local.example:32400",
    );
    expect(() => serverOrigin("https://local.example:32400/path")).toThrow();
    expect(() =>
      serverOrigin("https://local.example/?X-Plex-Token=x"),
    ).toThrow();
  });
  it("keeps artwork, media and HLS credentials within the selected origin", () => {
    const client = new PlexClient(
      "synthetic-token",
      "https://selected.example:32400",
      undefined,
      "device",
    );
    expect(client.resource("/library/parts/1/preview.webm")).toBe(
      "https://selected.example:32400/library/parts/1/preview.webm?X-Plex-Token=synthetic-token",
    );
    expect(
      client.trustsResource("https://selected.example:32400/video/segment.ts"),
    ).toBe(true);
    expect(
      client.trustsResource("https://outside.example/video/segment.ts"),
    ).toBe(false);
    expect(
      client.trustsResource("https://selected.example:32401/video/segment.ts"),
    ).toBe(false);
    expect(
      client.trustsResource("https://user@selected.example:32400/segment.ts"),
    ).toBe(false);
    expect(
      new PlexClient("x", "http://127.0.0.1:32401").trustsResource(
        "/segment.ts",
      ),
    ).toBe(false);
    expect(
      new PlexClient("x", "http://127.0.0.1:32401").trustsResource(
        "http://127.0.0.1:32401/segment.ts",
      ),
    ).toBe(true);
  });
});
