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
        "http://localhost:8080/?trafirdis_auth=nonce",
      ),
    );
    expect(url.origin).toBe("https://app.plex.tv");
    const params = new URLSearchParams(url.hash.slice(2));
    expect(params.get("forwardUrl")).toBe(
      "http://localhost:8080/?trafirdis_auth=nonce",
    );
    expect(params.get("code")).toBe("code&forwardUrl=https://outside.example");
    expect(params.get("context[device][product]")).toBe("Trafirdis");
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
  it("lists owned and shared servers, filters clients and validates connection origins", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json([
        {
          provides: "player",
          clientIdentifier: "player",
          accessToken: "unused",
        },
        null,
        { provides: "server", clientIdentifier: "missing-token" },
        {
          name: "Shared",
          owned: false,
          provides: "server",
          clientIdentifier: "shared",
          accessToken: "server-token",
          connections: [
            { uri: "https://remote.example:32400", local: false },
            { uri: "https://local.example:32400", local: true },
            { uri: "https://user:secret@outside.example" },
            { uri: "https://outside.example/path" },
            { uri: "javascript:alert(1)" },
            null,
          ],
        },
        {
          name: "Owned",
          owned: true,
          provides: "server",
          clientIdentifier: "owned",
          accessToken: "own-token",
        },
      ]),
    );
    const servers = await new PlexSignInClient("device", fetcher).resources(
      "account-token",
    );
    expect(servers).toMatchObject([
      {
        id: "shared",
        owned: false,
        token: "server-token",
        connections: [
          "https://local.example:32400",
          "https://remote.example:32400",
        ],
      },
      { id: "owned", owned: true },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://clients.plex.tv/api/v2/resources?includeHttps=1&includeRelay=1&includeIPv6=1",
    );
    expect(fetcher.mock.calls[0][1]?.headers).toHaveProperty(
      "X-Plex-Token",
      "account-token",
    );
  });
  it("adds a private LAN address with its advertised port when Plex permits HTTP", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json([
        {
          provides: "server",
          clientIdentifier: "lan",
          accessToken: "synthetic-token",
          httpsRequired: false,
          connections: [
            {
              uri: "https://unresolved.plex.direct:32555",
              local: true,
              address: "192.168.50.2",
              port: 32555,
            },
          ],
        },
      ]),
    );
    const [server] = await new PlexSignInClient("device", fetcher).resources(
      "account",
    );
    expect(server.connections).toEqual([
      "https://unresolved.plex.direct:32555",
      "http://192.168.50.2:32555",
    ]);
  });
  it.each([true, undefined])(
    "does not invent HTTP fallbacks without explicit Plex permission (%s)",
    async (httpsRequired) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        json([
          {
            provides: "server",
            clientIdentifier: "lan",
            accessToken: "synthetic-token",
            httpsRequired,
            connections: [
              {
                uri: "https://secure.plex.direct:32400",
                local: true,
                address: "192.168.50.2",
                port: 32400,
              },
            ],
          },
        ]),
      );
      expect(
        (await new PlexSignInClient("device", fetcher).resources("account"))[0]
          .connections,
      ).toEqual(["https://secure.plex.direct:32400"]);
    },
  );
  it("never adds HTTP LAN fallbacks to an HTTPS application", async () => {
    vi.stubGlobal("window", { location: { protocol: "https:" } });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json([
        {
          provides: "server",
          clientIdentifier: "lan",
          accessToken: "synthetic-token",
          httpsRequired: false,
          connections: [
            {
              uri: "https://secure.plex.direct:32400",
              local: true,
              address: "192.168.50.2",
              port: 32400,
            },
          ],
        },
      ]),
    );
    expect(
      (await new PlexSignInClient("device", fetcher).resources("account"))[0]
        .connections,
    ).toEqual(["https://secure.plex.direct:32400"]);
  });
  it("does not build LAN fallbacks from public, loopback, malformed or remote addresses", async () => {
    const connections = [
      { address: "127.0.0.1", port: 32400, local: true },
      { address: "203.0.113.1", port: 32400, local: true },
      { address: "192.168.50.2/path", port: 32400, local: true },
      { address: "192.168.50.2", port: 0, local: true },
      { address: "192.168.50.2", port: true, local: true },
      { address: "192.168.50.2", port: 32400, local: false },
      { address: "192.168.50.2", port: 32400, local: true, relay: true },
    ];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json([
        {
          provides: "server",
          clientIdentifier: "lan",
          accessToken: "synthetic-token",
          httpsRequired: false,
          connections,
        },
      ]),
    );
    expect(
      (await new PlexSignInClient("device", fetcher).resources("account"))[0]
        .connections,
    ).toEqual([]);
  });
  it("connects through a reachable alternative without waiting for a stalled endpoint and cancels the other probes", async () => {
    let firstSignal: AbortSignal | undefined;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url, init) => {
        if (String(url).includes("stalled")) {
          firstSignal = init?.signal as AbortSignal;
          return new Promise((_resolve, reject) =>
            firstSignal!.addEventListener(
              "abort",
              () => reject(new DOMException("cancelled", "AbortError")),
              { once: true },
            ),
          );
        }
        return json({ MediaContainer: { machineIdentifier: "lan" } });
      });
    const connection = await new PlexSignInClient(
      "device",
      fetcher,
    ).connectServer({
      id: "lan",
      name: "LAN",
      owned: true,
      token: "synthetic-token",
      connections: [
        "https://stalled.example",
        "http://192.168.50.2:32555",
        "https://unused.example",
      ],
    });
    expect(connection.base).toBe("http://192.168.50.2:32555");
    expect(firstSignal?.aborted).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("authenticates only advertised resource origins and rejects a mismatched identity", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({ MediaContainer: { machineIdentifier: "wrong-server" } }),
      )
      .mockResolvedValueOnce(
        json({
          MediaContainer: {
            machineIdentifier: "selected",
            friendlyName: "Selected",
          },
        }),
      );
    const result = await new PlexSignInClient("device", fetcher).connectServer({
      id: "selected",
      name: "Selected",
      owned: false,
      token: "server-token",
      connections: ["https://wrong.example", "https://selected.example"],
    });
    expect(result).toEqual({
      token: "server-token",
      base: "https://selected.example",
      machineIdentifier: "selected",
    });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://wrong.example/",
      "https://selected.example/",
    ]);
    expect(
      fetcher.mock.calls.every(
        ([, init]) =>
          (init?.headers as Record<string, string>)["X-Plex-Token"] ===
            "server-token" &&
          init?.redirect === "error" &&
          init?.cache === "no-store",
      ),
    ).toBe(true);
  });
  it("tries only advertised connections after an unreachable address", async () => {
    const resource = {
      id: "selected",
      name: "Selected",
      owned: true,
      token: "server-token",
      connections: ["https://offline.example", "https://selected.example"],
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(
        json({ MediaContainer: { machineIdentifier: "selected" } }),
      )
      .mockResolvedValueOnce(
        json({ MediaContainer: { machineIdentifier: "selected" } }),
      );
    expect(
      await new PlexSignInClient("device", fetcher).connectServer(resource),
    ).toMatchObject({ base: "https://selected.example" });
    expect(fetcher.mock.calls[1][0]).toBe("https://selected.example/");
    fetcher.mockReset().mockRejectedValue(new Error("offline"));
    await expect(
      new PlexSignInClient("device", fetcher).connectServer(resource),
    ).rejects.toMatchObject({ code: "access" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not accept rejected access, a changed identity, or an empty server list", async () => {
    const resource = {
      id: "selected",
      name: "Selected",
      owned: true,
      token: "server-token",
      connections: ["https://selected.example"],
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({ MediaContainer: { machineIdentifier: "changed" } }),
      );
    await expect(
      new PlexSignInClient("device", fetcher).connectServer(resource),
    ).rejects.toMatchObject({ code: "access" });
    fetcher.mockResolvedValueOnce(json([]));
    await expect(
      new PlexSignInClient("device", fetcher).resources("account"),
    ).rejects.toMatchObject({ code: "access" });
  });
  it("cancels server selection without trying fallback connections", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      controller.abort();
      throw new Error("aborted");
    });
    await expect(
      new PlexSignInClient("device", fetcher).connectServer(
        {
          id: "selected",
          name: "Selected",
          owned: true,
          token: "token",
          connections: ["https://one.example", "https://two.example"],
        },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(1);
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
    history.replaceState(null, "", "/?trafirdis_auth=random-nonce");
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
    history.replaceState(null, "", "/?trafirdis_auth=forged");
    expect(() => readSignInReturn()).toThrow(/could not be verified/);
    expect(sessionStorage.getItem(pendingSignInKey)).toBeNull();
    expect(sessionStorage.getItem("trafirdis.token")).toBeNull();
  });
});
