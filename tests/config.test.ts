import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Trafirdis runtime configuration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DEV", false);
    delete window.__TRAFIRDIS_CONFIG__;
  });
  afterEach(() => {
    delete window.__TRAFIRDIS_CONFIG__;
    vi.unstubAllEnvs();
  });
  it("uses runtime settings, including an explicit false", async () => {
    window.__TRAFIRDIS_CONFIG__ = {
      serverUrl: "http://current.invalid:32400",
      diagnostics: false,
    };
    const config = await import("../src/config");
    expect(config.serverLabel).toBe("http://current.invalid:32400");
    expect(config.diagnosticsEnabled).toBe(false);
  });
  it("enables diagnostics through the public runtime configuration", async () => {
    window.__TRAFIRDIS_CONFIG__ = {
      serverUrl: "http://runtime.invalid:32400",
      diagnostics: true,
    };
    const config = await import("../src/config");
    expect(config.serverLabel).toBe("http://runtime.invalid:32400");
    expect(config.diagnosticsEnabled).toBe(true);
  });
  it("retains build-time configuration when no runtime override exists", async () => {
    const config = await import("../src/config");
    expect(config.serverLabel).toBe(__PLEX_SERVER_LABEL__);
    expect(config.diagnosticsEnabled).toBe(__TRAFIRDIS_DIAGNOSTICS__);
  });
});
