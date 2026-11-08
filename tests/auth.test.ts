import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PlexSignInClient,
  PlexSignInError,
  clearSignInReturn,
  pendingSignInKey,
  readSignInReturn,
  savePendingSignIn,
  signInUrl,
} from "../src/plex/auth";
import { getClientIdentifier } from "../src/plex/device";
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const pin = { id: "123", code: "strong-pin", expiresAt: 1000000 };
describe("Plex hosted sign-in", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, "", "/");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    history.replaceState(null, "", "/");
  });
  it("creates a strong PIN with a stable public device identifier and no credentials", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ id: 123, code: "strong-pin", expiresIn: 120 }));
    const client = new PlexSignInClient("test-device", fetcher, () => 1000);
    expect(await client.createPin()).toEqual({
      id: "123",
      code: "strong-pin",
      expiresAt: 121000,
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://plex.tv/api/v2/pins?strong=true");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("omit");
    expect(init?.redirect).toBe("error");
    expect(init?.headers).toHaveProperty(
      "X-Plex-Client-Identifier",
      "test-device",
    );
    expect(init?.headers).not.toHaveProperty("X-Plex-Token");
  });
  it("honors Plex expiry while limiting the local lifetime without assuming a service TTL", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          id: 1,
          code: "x",
          expiresAt: new Date(5000).toISOString(),
          expiresIn: 600,
        }),
      )
      .mockResolvedValueOnce(json({ id: 1, code: "x" }));
    const client = new PlexSignInClient("id", fetcher, () => 1000);
    expect((await client.createPin()).expiresAt).toBe(5000);
    expect((await client.createPin()).expiresAt).toBe(601000);
  });
  it("builds only the Plex authorization URL and encodes an injected code as data", () => {
    const url = new URL(
      signInUrl(
        { ...pin, code: "code&forwardUrl=https://outside.example" },
        "device-id",
        "http://localhost:8080/?plexplore_auth=nonce",
      ),
    );
    expect(url.origin).toBe("https://app.plex.tv");
    const params = new URLSearchParams(url.hash.slice(2));
    expect(params.get("forwardUrl")).toBe(
      "http://localhost:8080/?plexplore_auth=nonce",
    );
    expect(params.get("code")).toBe("code&forwardUrl=https://outside.example");
    expect(params.get("context[device][product]")).toBe("Plexplore");
    expect(() => signInUrl(pin, "id", "javascript:alert(1)")).toThrow(
      PlexSignInError,
    );
  });
  it("distinguishes an unclaimed PIN from an authorized token", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ authToken: null }))
      .mockResolvedValueOnce(json({ authToken: "synthetic-account-token" }));
    const client = new PlexSignInClient("id", fetcher, () => 1000);
    expect(await client.checkPin(pin)).toBeNull();
    expect(await client.checkPin(pin)).toBe("synthetic-account-token");
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://plex.tv/api/v2/pins/123?code=strong-pin",
    );
  });
  it("does not poll an expired local session", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      new PlexSignInClient("id", fetcher, () => 1000001).checkPin(pin),
    ).rejects.toMatchObject({ code: "expired" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("exchanges an account token for the configured server token without following resource URLs", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({ MediaContainer: { machineIdentifier: "server-one" } }),
      )
      .mockResolvedValueOnce(
        json([
          {
            clientIdentifier: "server-two",
            provides: "server",
            accessToken: "wrong-token",
          },
          {
            clientIdentifier: "server-one",
            provides: "server",
            accessToken: "synthetic-server-token",
            connections: [{ uri: "https://outside.example" }],
          },
        ]),
      )
      .mockResolvedValueOnce(
        json({
          MediaContainer: {
            machineIdentifier: "server-one",
            friendlyName: "Plex",
          },
        }),
      );
    expect(
      await new PlexSignInClient("device", fetcher).serverToken(
        "synthetic-account-token",
      ),
    ).toBe("synthetic-server-token");
    const calls = fetcher.mock.calls;
    expect(calls[0][0]).toBe("/plex/identity");
    expect(calls[0][1]?.headers).not.toHaveProperty("X-Plex-Token");
    expect(calls[1][0]).toBe(
      "https://clients.plex.tv/api/v2/resources?includeHttps=1&includeRelay=1&includeIPv6=1",
    );
    expect(calls[1][1]?.headers).toHaveProperty(
      "X-Plex-Token",
      "synthetic-account-token",
    );
    expect(calls[2][0]).toBe("/plex/");
    expect(calls[2][1]?.headers).toHaveProperty(
      "X-Plex-Token",
      "synthetic-server-token",
    );
    expect(
      calls.every(
        ([url]) =>
          !String(url).includes("token") &&
          !String(url).includes("outside.example"),
      ),
    ).toBe(true);
  });
  it("rejects another server or a resource without access", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({ MediaContainer: { machineIdentifier: "server-one" } }),
      )
      .mockResolvedValueOnce(
        json([
          {
            clientIdentifier: "server-two",
            provides: "server",
            accessToken: "wrong-token",
          },
        ]),
      );
    await expect(
      new PlexSignInClient("id", fetcher).serverToken("account"),
    ).rejects.toMatchObject({ code: "access" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("reports offline Plex separately from an expired cloud sign-in", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("private upstream error"));
    await expect(
      new PlexSignInClient("id", fetcher).serverToken("account"),
    ).rejects.toMatchObject({ code: "access" });
  });
  it.each([401, 403, 404, 410])(
    "handles expired/rejected sign-in HTTP %s without leaking response content",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(json({ private: "synthetic-secret" }, status));
      const result = new PlexSignInClient("id", fetcher, () => 1000).checkPin(
        pin,
      );
      await expect(result).rejects.toMatchObject({ code: "expired" });
      await expect(result).rejects.not.toThrow("synthetic-secret");
    },
  );
  it("handles throttling, malformed replies and network errors safely", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 429))
      .mockResolvedValueOnce(json({ id: undefined }))
      .mockRejectedValueOnce(new Error("synthetic-secret"));
    const client = new PlexSignInClient("id", fetcher);
    await expect(client.createPin()).rejects.toMatchObject({
      code: "response",
    });
    await expect(client.createPin()).rejects.toMatchObject({
      code: "response",
    });
    await expect(client.createPin()).rejects.toMatchObject({ code: "network" });
  });
  it("preserves cancellation and does not misreport it as an authentication failure", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    await expect(
      new PlexSignInClient("id", fetcher).createPin(controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("accepts a matching same-session return and clears the one-use state", () => {
    const pending = {
      ...pin,
      expiresAt: Date.now() + 10000,
      state: "random-nonce",
      clientId: getClientIdentifier(),
    };
    savePendingSignIn(pending);
    history.replaceState(null, "", "/?plexplore_auth=random-nonce");
    expect(readSignInReturn()).toEqual(pending);
    clearSignInReturn();
    expect(sessionStorage.getItem(pendingSignInKey)).toBeNull();
    expect(location.search).toBe("");
  });
  it("rejects forged returns without accepting URL-supplied tokens", () => {
    savePendingSignIn({
      ...pin,
      expiresAt: Date.now() + 10000,
      state: "correct",
      clientId: getClientIdentifier(),
    });
    history.replaceState(null, "", "/?plexplore_auth=forged");
    expect(() => readSignInReturn()).toThrow(/could not be verified/);
    expect(sessionStorage.getItem(pendingSignInKey)).toBeNull();
    expect(sessionStorage.getItem("plexplore.token")).toBeNull();
  });
});
