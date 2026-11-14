import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, extname } from "node:path";

let app: Server,
  plex: Server,
  directory: string,
  appOrigin: string,
  plexOrigin: string;
let hls = false,
  redirectMedia = false,
  externalPlaylist = false;
const appCredentials: string[] = [];
const plexRequests: { path: string; token: string | null; method: string }[] =
  [];
const movie = {
  ratingKey: "1",
  key: "/library/metadata/1",
  type: "movie",
  title: "Static First Light",
  summary: "Synthetic HTTPS fixture.",
  thumb: "/library/metadata/1/thumb/1",
  art: "/library/metadata/1/art/1",
};
const decisions = new Map<string, string>();
const signature = (url: URL) => {
  const params = new URLSearchParams(url.search);
  params.delete("X-Plex-Token");
  params.sort();
  return params.toString();
};
async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture address");
  return `https://127.0.0.1:${address.port}`;
}

test.beforeAll(async () => {
  // Exercise the distributable build without Vite, an app backend or a Plex proxy.
  execFileSync("npm", ["run", "build"], {
    stdio: "pipe",
  });
  directory = mkdtempSync(resolve(tmpdir(), "trafirdis-static-"));
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      resolve(directory, "key.pem"),
      "-out",
      resolve(directory, "cert.pem"),
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
    ],
    { stdio: "pipe" },
  );
  const tls = {
    key: readFileSync(resolve(directory, "key.pem")),
    cert: readFileSync(resolve(directory, "cert.pem")),
  };
  const securityHeaders = Object.fromEntries(
    readFileSync("dist/_headers", "utf8")
      .split("\n")
      .filter((line) => line.startsWith("  "))
      .map((line) => {
        const split = line.indexOf(":");
        return [line.slice(0, split).trim(), line.slice(split + 1).trim()];
      }),
  );
  app = createServer(tls, (req, res) => {
    const url = new URL(req.url!, "https://fixture.invalid");
    if (url.pathname === "/framing-fixture") {
      res.setHeader("Content-Type", "text/html");
      res.end('<!doctype html><iframe src="/"></iframe>');
      return;
    }
    for (const [name, value] of Object.entries(securityHeaders))
      res.setHeader(name, value);
    if (req.headers["x-plex-token"] || url.searchParams.has("X-Plex-Token"))
      appCredentials.push(url.pathname);
    const path = resolve(
      "dist",
      url.pathname === "/" ? "index.html" : `.${url.pathname}`,
    );
    if (!path.startsWith(`${resolve("dist")}/`)) {
      res.writeHead(404).end();
      return;
    }
    try {
      res.setHeader(
        "Content-Type",
        (
          {
            ".html": "text/html",
            ".js": "application/javascript",
            ".css": "text/css",
            ".svg": "image/svg+xml",
          } as Record<string, string>
        )[extname(path)] || "application/octet-stream",
      );
      res.end(readFileSync(path));
    } catch {
      res.writeHead(404).end();
    }
  });
  appOrigin = await listen(app);
  plex = createServer(tls, (req, res) => {
    const url = new URL(req.url!, "https://fixture.invalid");
    const path = url.pathname;
    const token =
      String(
        req.headers["x-plex-token"] ||
          url.searchParams.get("X-Plex-Token") ||
          "",
      ) || null;
    res.setHeader("Access-Control-Allow-Origin", appOrigin);
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    plexRequests.push({ path, token, method: req.method! });
    const json = (MediaContainer: unknown) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ MediaContainer }));
    };
    if (path === "/identity") {
      // Match PMS public identity responses: JSON is available, but only Plex's
      // own web origin may read it. Account-authorized requests must use /.
      res.setHeader("Access-Control-Allow-Origin", "https://app.plex.tv");
      json({ machineIdentifier: "static-server" });
      return;
    }
    if (token !== "synthetic-static-token") {
      res.writeHead(401).end();
      return;
    }
    if (path === "/") {
      json({
        friendlyName: "HTTPS fixture",
        machineIdentifier: "static-server",
      });
      return;
    }
    if (path === "/library/sections") {
      json({ Directory: [{ key: "1", title: "Movies", type: "movie" }] });
      return;
    }
    if (path === "/library/sections/1/all") {
      json({ totalSize: 1, Metadata: [movie] });
      return;
    }
    if (path === "/library/metadata/1") {
      json({
        Metadata: [
          {
            ...movie,
            Extras: {
              Metadata: [
                {
                  ratingKey: "101",
                  key: "/library/metadata/101",
                  type: "clip",
                  subtype: "trailer",
                  Media: hls
                    ? []
                    : [
                        {
                          container: "webm",
                          Part: [{ key: "/library/parts/1/preview.webm" }],
                        },
                      ],
                },
              ],
            },
          },
        ],
      });
      return;
    }
    if (path.startsWith("/photo/")) {
      res.setHeader("Content-Type", "image/svg+xml");
      res.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><path fill="#293c52" d="M0 0h320v180H0z"/></svg>',
      );
      return;
    }
    if (path.endsWith("/decision")) {
      decisions.set(url.searchParams.get("session")!, signature(url));
      json({ generalDecisionCode: 1001, transcodeDecisionCode: 1001 });
      return;
    }
    if (path.endsWith("/stop")) {
      decisions.delete(url.searchParams.get("session")!);
      res.end();
      return;
    }
    if (path.endsWith("start.m3u8")) {
      if (decisions.get(url.searchParams.get("session")!) !== signature(url)) {
        res.writeHead(400).end();
        return;
      }
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.end(
        externalPlaylist
          ? "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nhttps://outside.example/segment.ts\n#EXT-X-ENDLIST\n"
          : readFileSync("tests/fixtures/preview.m3u8", "utf8").replace(
              "segment-0.ts",
              "segment-0.ts?X-Plex-Token=synthetic-static-token",
            ),
      );
      return;
    }
    if (path.endsWith("segment-0.ts")) {
      res.setHeader("Content-Type", "video/mp2t");
      res.end(readFileSync("tests/fixtures/segment-0.ts"));
      return;
    }
    if (path.endsWith("preview.webm")) {
      if (redirectMedia) {
        res
          .writeHead(302, {
            Location:
              "https://outside.example/video?X-Plex-Token=synthetic-static-token",
          })
          .end();
        return;
      }
      res.setHeader("Content-Type", "video/webm");
      res.end(readFileSync("tests/fixtures/preview.webm"));
      return;
    }
    res.writeHead(404).end();
  });
  plexOrigin = await listen(plex);
});
test.afterAll(async () => {
  await Promise.all(
    [app, plex].filter(Boolean).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
  if (directory) rmSync(directory, { recursive: true, force: true });
});
test.beforeEach(() => {
  hls = false;
  redirectMedia = false;
  externalPlaylist = false;
  appCredentials.length = 0;
  plexRequests.length = 0;
  decisions.clear();
});
test.use({ ignoreHTTPSErrors: true });

async function signIn(page: Page, insecureOnly = false) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
  await page.route(
    (url) => url.hostname === "plex.tv" || url.hostname === "clients.plex.tv",
    (route) => {
      const request = route.request();
      if (request.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers });
      const path = new URL(request.url()).pathname;
      return route.fulfill({
        headers,
        json:
          path === "/api/v2/pins"
            ? { id: 123, code: "synthetic-static-pin", expiresIn: 600 }
            : path === "/api/v2/pins/123"
              ? { authToken: "synthetic-account-token" }
              : [
                  {
                    name: "Static cinema",
                    owned: true,
                    clientIdentifier: "static-server",
                    provides: "server",
                    accessToken: "synthetic-static-token",
                    connections: [
                      {
                        uri: insecureOnly
                          ? plexOrigin.replace("https:", "http:")
                          : plexOrigin,
                        local: true,
                      },
                    ],
                  },
                ],
      });
    },
  );
  await page.route("https://app.plex.tv/auth**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><script>location.replace(new URLSearchParams(location.hash.slice(2)).get("forwardUrl"))</script>',
    }),
  );
  await page.goto(appOrigin);
  await page
    .getByRole("button", { name: "Sign in with Plex", exact: true })
    .click();
}
for (const kind of ["native", "native HLS", "MSE HLS"] as const) {
  test(`static HTTPS hosting discovers a server and decodes cross-origin ${kind} previews`, async ({
    page,
  }) => {
    hls = kind !== "native";
    if (kind === "MSE HLS")
      await page.addInitScript(() => {
        const original = HTMLMediaElement.prototype.canPlayType;
        HTMLMediaElement.prototype.canPlayType = function (type) {
          return type.includes("mpegurl") ? "" : original.call(this, type);
        };
      });
    await signIn(page);
    await expect(
      page.getByRole("heading", { name: "Static First Light", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".hero [data-preview-phase]")).toHaveAttribute(
      "data-preview-phase",
      "playing",
      { timeout: 15000 },
    );
    await expect
      .poll(() =>
        page
          .locator(".hero-background img.artwork")
          .first()
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);
    expect(plexRequests.some((r) => r.path === "/identity")).toBe(false);
    expect(
      plexRequests
        .filter((r) => r.path !== "/identity")
        .every((r) => r.token === "synthetic-static-token"),
    ).toBe(true);
    expect(
      plexRequests.some((r) =>
        r.path.endsWith(kind === "native" ? "preview.webm" : "segment-0.ts"),
      ),
    ).toBe(true);
    expect(appCredentials).toEqual([]);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Static First Light", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        localStorage.getItem("trafirdis.preferred-server"),
      ),
    ).toBe("static-server");
  });
}
test("an HTTPS site rejects HTTP-only server connections without sending credentials", async ({
  page,
}) => {
  await signIn(page, true);
  await expect(page.getByRole("alert")).toContainText(
    "Cannot connect to this Plex server",
  );
  expect(plexRequests).toEqual([]);
  expect(appCredentials).toEqual([]);
  await page.getByRole("button", { name: "Cancel sign-in" }).click();
  await expect(
    page.getByRole("button", { name: "Sign in with Plex", exact: true }),
  ).toBeEnabled();
});
for (const kind of ["native redirect", "playlist"] as const) {
  test(`direct ${kind} cannot send credentials to an unrelated media origin`, async ({
    page,
  }) => {
    redirectMedia = kind === "native redirect";
    hls = externalPlaylist = kind === "playlist";
    const external: string[] = [];
    await page.route("https://outside.example/**", (route) => {
      external.push(route.request().url());
      return route.abort();
    });
    await signIn(page);
    await expect(
      page.getByRole("heading", { name: "Static First Light", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".hero [data-preview-phase]")).toHaveAttribute(
      "data-preview-phase",
      kind === "native redirect" ? "playing" : "error",
      { timeout: 15000 },
    );
    expect(
      plexRequests.some((r) =>
        r.path.endsWith(
          kind === "native redirect" ? "preview.webm" : "start.m3u8",
        ),
      ),
    ).toBe(true);
    await expect(
      page.locator("meta[data-trafirdis-connection]"),
    ).toHaveAttribute("content", new RegExp(plexOrigin.replaceAll(".", "\\.")));
    expect(external).toEqual([]);
    expect(appCredentials).toEqual([]);
  });
}

test("static hosting supports manual access with a server address and recovers from a rejected token", async ({
  page,
}) => {
  await page.goto(appOrigin);
  await page.getByText("Use a Plex token instead", { exact: true }).click();
  await page.getByLabel("Plex server address").fill(plexOrigin);
  await page
    .getByLabel("Plex authentication token")
    .fill("synthetic-rejected-token");
  await page
    .getByRole("button", { name: "Connect my library", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Plex rejected the token",
  );
  expect(
    await page.evaluate(() => sessionStorage.getItem("trafirdis.token")),
  ).toBeNull();
  await page
    .getByLabel("Plex authentication token")
    .fill("synthetic-static-token");
  await page
    .getByRole("button", { name: "Connect my library", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Static First Light", exact: true }),
  ).toBeVisible();
  expect(appCredentials).toEqual([]);
});

test("hosted sign-in succeeds when PMS public identity is unreadable because of CORS", async ({
  page,
}) => {
  await page.goto(appOrigin);
  const publicIdentityReadable = await page.evaluate(async (origin) => {
    try {
      await fetch(`${origin}/identity`, {
        headers: { Accept: "application/json" },
        credentials: "omit",
        redirect: "error",
      });
      return true;
    } catch {
      return false;
    }
  }, plexOrigin);
  expect(publicIdentityReadable).toBe(false);
  plexRequests.length = 0;
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "Static First Light", exact: true }),
  ).toBeVisible();
  expect(plexRequests.some((request) => request.path === "/identity")).toBe(
    false,
  );
  expect(
    plexRequests
      .filter((request) => request.path === "/")
      .every((request) => request.token === "synthetic-static-token"),
  ).toBe(true);
});

test("production policy blocks inline and external scripts without preventing application startup", async ({
  page,
}) => {
  let external = 0;
  await page.route("https://outside.example/**", (route) => {
    external++;
    return route.fulfill({
      body: "window.injectedScript = true",
      contentType: "application/javascript",
    });
  });
  const response = await page.goto(appOrigin);
  expect(response!.headers()["x-frame-options"]).toBe("DENY");
  expect(response!.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response!.headers()["content-security-policy"]).toContain(
    "script-src 'self';",
  );
  expect(response!.headers()["content-security-policy"]).not.toContain(
    "'unsafe-eval'",
  );
  await expect(
    page.getByRole("button", { name: "Sign in with Plex", exact: true }),
  ).toBeVisible();
  const injected = await page.evaluate(async () => {
    const inline = document.createElement("script");
    inline.textContent = "window.injectedScript = true";
    document.body.append(inline);
    const remote = document.createElement("script");
    const failed = new Promise((resolve) => {
      remote.onerror = () => resolve(true);
      remote.onload = () => resolve(false);
    });
    remote.src = "https://outside.example/security-probe.js";
    document.body.append(remote);
    return {
      blocked: await failed,
      executed: Boolean(
        (window as unknown as { injectedScript?: boolean }).injectedScript,
      ),
    };
  });
  expect(injected).toEqual({ blocked: true, executed: false });
  expect(external).toBe(0);
});

test("production headers prevent framing the app even from the same origin", async ({
  page,
}) => {
  const blocked: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("frame-ancestors"))
      blocked.push(message.text());
  });
  await page.goto(`${appOrigin}/framing-fixture`);
  await expect.poll(() => blocked.length).toBeGreaterThan(0);
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("button", { name: "Sign in with Plex", exact: true }),
  ).toHaveCount(0);
});
