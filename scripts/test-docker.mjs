import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const suffix = `${process.pid}-${Date.now()}`;
const network = `plexplore-test-${suffix}`;
const app = `plexplore-app-${suffix}`;
const fixture = `plexplore-fixture-${suffix}`;
const image = process.env.PLEXPLORE_TEST_IMAGE || "plexplore:local";
const names = [];
let browser;
function docker(args, allowFailure = false) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    timeout: 60000,
  });
  if (!allowFailure && result.status !== 0)
    throw new Error(
      `Docker ${args[0]} failed: ${result.stderr || result.error || result.stdout}`,
    );
  return result;
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function ready(url) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("Container health check did not become ready.");
}
try {
  docker(["image", "inspect", image]);
  docker(["network", "create", network]);
  names.push(fixture);
  docker([
    "run",
    "-d",
    "--name",
    fixture,
    "--network",
    network,
    "--network-alias",
    "plex-fixture",
    "--mount",
    `type=bind,src=${resolve("tests/fixtures")},dst=/fixtures,readonly`,
    "node:22-alpine",
    "node",
    "--input-type=module",
    "-e",
    readFileSync("tests/docker/plex-fixture.mjs", "utf8"),
  ]);
  names.push(app);
  docker([
    "run",
    "-d",
    "--name",
    app,
    "--network",
    network,
    "--publish",
    "127.0.0.1::8080",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=32m,mode=1777",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--env",
    "PLEX_SERVER_URL=http://plex-fixture:32400",
    image,
  ]);
  const address = docker(["port", app, "8080/tcp"]).stdout.trim();
  const base = `http://${address}`;
  await ready(`${base}/healthz`);
  assert.equal(docker(["exec", app, "id", "-u"]).stdout.trim(), "101");
  assert.equal(
    docker(["exec", app, "sh", "-c", "command -v node || true"]).stdout.trim(),
    "",
  );
  assert.match(await (await fetch(base)).text(), /<title>Plexplore/);
  const config = await fetch(`${base}/runtime-config.js`);
  assert.match(config.headers.get("cache-control"), /no-store/);
  assert.match(await config.text(), /http:\/\/plex-fixture:32400/);
  assert.equal((await fetch(`${base}/sample/poster-0.svg`)).status, 200);
  assert.equal((await fetch(`${base}/.env.local`)).status, 404);
  assert.equal((await fetch(`${base}/assets/missing.js`)).status, 404);
  assert.match(
    await (await fetch(`${base}/some/client/route`)).text(),
    /<title>Plexplore/,
  );
  const token = "synthetic-token-with+slash/equals=";
  let response = await fetch(`${base}/plex/echo`, {
    headers: { "X-Plex-Token": token, Range: "bytes=0-15" },
  });
  assert.deepEqual(await response.json(), {
    path: "/echo",
    query: "",
    token,
    range: "bytes=0-15",
  });
  response = await fetch(
    `${base}/plex/echo?${new URLSearchParams({ "X-Plex-Token": token })}`,
  );
  assert.equal((await response.json()).token, token);
  assert.equal(
    (await fetch(`${base}/plex/echo`, { method: "POST" })).status,
    405,
  );
  assert.equal(
    (
      await fetch(`${base}/plex/library/sections`, {
        headers: { "X-Plex-Token": "invalid" },
      })
    ).status,
    401,
  );
  for (const kind of ["local", "absolute", "relative"]) {
    const redirect = await fetch(`${base}/plex/redirect-${kind}`, {
      redirect: "manual",
    });
    assert.equal(redirect.status, 302);
    const target = new URL(
      redirect.headers.get("location"),
      `${base}/plex/redirect-${kind}`,
    );
    assert.equal(target.origin, base);
    assert.equal(target.pathname, "/plex/echo");
    assert.equal((await fetch(target)).status, 200);
  }
  for (const kind of ["local", "absolute", "relative", "bare", "chain"]) {
    const redirect = await fetch(
      `${base}/plex/redirect-${kind}?${new URLSearchParams({ "X-Plex-Token": token })}`,
    );
    assert.equal(redirect.status, 200, kind);
    const echoed = await redirect.json();
    assert.equal(echoed.token, token, kind);
    assert.equal(
      new URLSearchParams(echoed.query).getAll("X-Plex-Token").length,
      1,
      kind,
    );
  }
  for (const kind of ["external", "protocol-relative", "backslash"]) {
    const redirect = await fetch(
      `${base}/plex/redirect-${kind}?${new URLSearchParams({ "X-Plex-Token": token })}`,
      {
        redirect: "manual",
      },
    );
    assert.equal(redirect.status, 502);
    assert.equal(redirect.headers.get("location"), null);
  }
  response = await fetch(`${base}/plex/library/parts/101/trailer.webm`, {
    headers: { Range: "bytes=0-15", "X-Plex-Token": token },
  });
  assert.equal(response.status, 206);
  assert.equal((await response.arrayBuffer()).byteLength, 16);
  assert.match(response.headers.get("content-range"), /^bytes 0-15\//);
  const stream = await fetch(`${base}/plex/slow`);
  const reader = stream.body.getReader();
  const first = await reader.read();
  assert.equal(new TextDecoder().decode(first.value), "first");
  await reader.cancel();
  console.log(
    "Docker proxy: health, runtime configuration, authentication, redirects, ranges, streaming and non-root/read-only runtime passed.",
  );

  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  // Exercise the same API availability as an HTTP LAN deployment.
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "randomUUID", { value: undefined });
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page.getByText("http://plex-fixture:32400", { exact: true }).waitFor();
  await page.getByText("Use a Plex token instead", { exact: true }).click();
  await page
    .getByLabel("Plex authentication token")
    .fill("docker-browser-fixture-token");
  await page
    .getByRole("button", { name: "Connect my library", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Docker First Light", exact: true })
    .waitFor();
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-preview-phase]")
        ?.getAttribute("data-preview-phase") === "playing",
    {},
    { timeout: 15000 },
  );
  assert.equal(await page.locator("video").count(), 1);
  assert.match(
    await page.locator("video").evaluate((video) => video.src),
    /\/library\/parts\/101\/redirect\.webm/,
  );
  await page.waitForFunction(() => {
    const image = document.querySelector(".hero-background img");
    return image?.complete && image.naturalWidth > 0;
  });
  assert.equal(
    await page.locator("video").evaluate((video) => video.muted),
    true,
  );
  await page.getByRole("button", { name: "Connection settings" }).click();
  assert.equal(
    await page.getByRole("button", { name: "Trailer diagnostics" }).count(),
    0,
  );
  assert.equal(
    await page.locator("video").evaluate((video) => video.hasAttribute("src")),
    false,
  );
  assert.deepEqual(errors, []);
  await page
    .getByRole("button", { name: "Disconnect and clear session" })
    .click();
  await page.getByText("Use a Plex token instead", { exact: true }).click();
  await page
    .getByLabel("Plex authentication token")
    .fill("docker-browser-hls-token");
  await page
    .getByRole("button", { name: "Connect my library", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-preview-phase]")
        ?.getAttribute("data-preview-phase") === "playing",
    {},
    { timeout: 15000 },
  );
  assert.equal(await page.locator("video").count(), 1);
  assert.equal(
    await page.locator("video").evaluate((video) => video.muted),
    true,
  );
  assert.deepEqual(errors, []);
  // Exercise hosted authorization through the actual production SPA callback.
  await page.getByRole("button", { name: "Connection settings" }).click();
  await page
    .getByRole("button", { name: "Disconnect and clear session" })
    .click();
  const cloudHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
  const loginRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin === base)
      loginRequests.push({
        url: request.url(),
        token: request.headers()["x-plex-token"],
      });
  });
  await page.route(
    (url) => url.hostname === "plex.tv" || url.hostname === "clients.plex.tv",
    async (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: cloudHeaders });
        return;
      }
      const value =
        url.pathname === "/api/v2/pins"
          ? { id: 123, code: "docker-strong-pin", expiresIn: 600 }
          : url.pathname === "/api/v2/pins/123"
            ? { authToken: "docker-account-token" }
            : [
                {
                  clientIdentifier: "docker-fixture",
                  provides: "server",
                  accessToken: "docker-server-token",
                },
              ];
      await route.fulfill({ headers: cloudHeaders, json: value });
    },
  );
  await page.route("https://app.plex.tv/auth**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><script>location.replace(new URLSearchParams(location.hash.slice(2)).get("forwardUrl"))</script>',
    }),
  );
  await page
    .getByRole("button", { name: "Sign in with Plex", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Docker First Light", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("plexplore.token")),
    "docker-server-token",
  );
  assert.equal(
    await page.evaluate(() =>
      sessionStorage.getItem("plexplore.pending-sign-in"),
    ),
    null,
  );
  assert.equal(new URL(page.url()).searchParams.has("plexplore_auth"), false);
  assert.ok(
    loginRequests.every(
      (request) =>
        request.token !== "docker-account-token" &&
        !request.url.includes("docker-account-token"),
    ),
  );
  assert.deepEqual(errors, []);
  await browser.close();
  browser = undefined;
  console.log(
    "Docker browser: real catalog proxy, runtime server label, actual native and HLS trailer decoding, preview cleanup, hosted sign-in and production-only UI passed.",
  );

  for (const target of [
    "https://user:synthetic-secret@example.com",
    "http://example.com/path",
    "http://example.com?token=synthetic-secret",
    "http://example.com\nserver {}",
  ]) {
    const invalid = docker(
      [
        "run",
        "--rm",
        "--read-only",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,size=32m,mode=1777",
        "--env",
        `PLEX_SERVER_URL=${target}`,
        image,
      ],
      true,
    );
    assert.equal(invalid.status, 1);
    assert.doesNotMatch(invalid.stdout + invalid.stderr, /synthetic-secret/);
  }
  // The static site remains available when Plex later goes offline.
  docker(["stop", fixture]);
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.equal((await fetch(base)).status, 200);
  assert.ok(
    [502, 504].includes((await fetch(`${base}/plex/library/sections`)).status),
  );
  const logs = docker(["logs", app]);
  assert.doesNotMatch(
    logs.stdout + logs.stderr,
    /synthetic-token|docker-browser-fixture-token|docker-account-token|docker-server-token|X-Plex-Token/,
  );
  console.log(
    "Docker validation: invalid origins fail safely; offline Plex does not take down the SPA; request tokens stay out of container logs.",
  );
} catch (error) {
  const logs = docker(["logs", app], true);
  if (logs.stdout || logs.stderr) console.error(logs.stdout + logs.stderr);
  throw error;
} finally {
  await browser?.close();
  for (const name of names.reverse()) docker(["rm", "-f", name], true);
  docker(["network", "rm", network], true);
}
