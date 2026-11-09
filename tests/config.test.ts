import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("rebrand configuration compatibility", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DEV", false);
    delete window.__TRAFIRDIS_CONFIG__;
    delete window.__PLEXPLORE_CONFIG__;
  });
  afterEach(() => {
    delete window.__TRAFIRDIS_CONFIG__;
    delete window.__PLEXPLORE_CONFIG__;
    vi.unstubAllEnvs();
  });
  it("prefers the new runtime settings, including an explicit false", async () => {
    window.__PLEXPLORE_CONFIG__ = {
      serverUrl: "http://legacy.invalid:32400",
      diagnostics: true,
    };
    window.__TRAFIRDIS_CONFIG__ = {
      serverUrl: "http://current.invalid:32400",
      diagnostics: false,
    };
    const config = await import("../src/config");
    expect(config.serverLabel).toBe("http://current.invalid:32400");
    expect(config.diagnosticsEnabled).toBe(false);
  });
  it("accepts the public runtime contract used by existing installations", async () => {
    window.__PLEXPLORE_CONFIG__ = {
      serverUrl: "http://legacy.invalid:32400",
      diagnostics: true,
    };
    const config = await import("../src/config");
    expect(config.serverLabel).toBe("http://legacy.invalid:32400");
    expect(config.diagnosticsEnabled).toBe(true);
  });
  it("retains build-time configuration when no runtime override exists", async () => {
    const config = await import("../src/config");
    expect(config.serverLabel).toBe(__PLEX_SERVER_LABEL__);
    expect(config.diagnosticsEnabled).toBe(__TRAFIRDIS_DIAGNOSTICS__);
  });
});
