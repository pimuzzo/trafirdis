import { afterEach, describe, expect, it, vi } from "vitest";
import { previewSessionId } from "../src/trailer/session";
describe("preview sessions on local and LAN origins", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("generates distinct UUIDs using the native secure-context API", () => {
    expect(previewSessionId()).not.toBe(previewSessionId());
  });
  it("keeps valid unique sessions when randomUUID is unavailable on HTTP LAN origins", () => {
    const getRandomValues = crypto.getRandomValues.bind(crypto);
    vi.stubGlobal("crypto", { getRandomValues });
    const first = previewSessionId();
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(first).not.toBe(previewSessionId());
  });
});
