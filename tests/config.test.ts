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
      diagnostics: false,
    };
    const config = await import("../src/config");
    expect(config.diagnosticsEnabled).toBe(false);
  });
  it("enables diagnostics through the public runtime configuration", async () => {
    window.__TRAFIRDIS_CONFIG__ = {
      diagnostics: true,
    };
    const config = await import("../src/config");
    expect(config.diagnosticsEnabled).toBe(true);
  });
  it("retains build-time configuration when no runtime override exists", async () => {
    const config = await import("../src/config");
    expect(config.diagnosticsEnabled).toBe(__TRAFIRDIS_DIAGNOSTICS__);
  });
});
