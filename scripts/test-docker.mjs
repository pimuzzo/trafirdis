import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const suffix = `${process.pid}-${Date.now()}`;
const network = `trafirdis-test-${suffix}`;
const app = `trafirdis-app-${suffix}`;
const fixture = `trafirdis-fixture-${suffix}`;
const image = process.env.TRAFIRDIS_TEST_IMAGE || "trafirdis:local";
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
function startApp(name, diagnostics = "false") {
  names.push(name);
  docker([
    "run",
    "-d",
    "--name",
    name,
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
    `TRAFIRDIS_DIAGNOSTICS=${diagnostics}`,
    image,
  ]);
  const address = docker(["port", name, "8080/tcp"]).stdout.trim();
  return `http://${address}`;
}
function composeSettings(settings) {
  const env = { ...process.env };
  for (const name of [
    "TRAFIRDIS_PORT",
    "TRAFIRDIS_BIND_IP",
    "TRAFIRDIS_DIAGNOSTICS",
  ])
    delete env[name];
  Object.assign(env, settings);
  const result = spawnSync(
    "docker",
    [
      "compose",
      "--file",
      "compose.yaml",
      "--env-file",
      "/dev/null",
      "config",
      "--format",
      "json",
    ],
    { env, encoding: "utf8", timeout: 60000 },
  );
  assert.equal(result.status, 0, "Compose configuration must parse.");
  const service = JSON.parse(result.stdout).services.trafirdis;
  assert.ok(service, "The Trafirdis service must exist.");
  assert.equal(service.image, "trafirdis:local");
  return {
    port: String(service.ports[0].published),
    host: service.ports[0].host_ip,
    diagnostics: service.environment.TRAFIRDIS_DIAGNOSTICS,
  };
}
try {
  assert.deepEqual(composeSettings({}), {
    port: "8080",
    host: "127.0.0.1",
    diagnostics: "false",
  });
  assert.deepEqual(
    composeSettings({
      TRAFIRDIS_PORT: "8090",
      TRAFIRDIS_BIND_IP: "127.0.0.3",
      TRAFIRDIS_DIAGNOSTICS: "true",
    }),
    { port: "8090", host: "127.0.0.3", diagnostics: "true" },
  );
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
    "--publish",
    "127.0.0.1::32400",
    "--mount",
    `type=bind,src=${resolve("tests/fixtures")},dst=/fixtures,readonly`,
    "node:22-alpine",
    "node",
    "--input-type=module",
    "-e",
    readFileSync("tests/docker/plex-fixture.mjs", "utf8"),
  ]);
  const plexOrigin = `http://${docker(["port", fixture, "32400/tcp"]).stdout.trim()}`;
  await ready(`${plexOrigin}/identity`);
  const base = startApp(app);
  await ready(`${base}/healthz`);
  assert.equal(docker(["exec", app, "id", "-u"]).stdout.trim(), "101");
  assert.equal(
    docker(["exec", app, "sh", "-c", "command -v node || true"]).stdout.trim(),
    "",
  );
  assert.match(await (await fetch(base)).text(), /<title>Trafirdis/);
  assert.match(
    await (await fetch(`${base}/favicon.svg`)).text(),
    /<title>Trafirdis/,
  );
  assert.match(
    await (await fetch(`${base}/privacy.html`)).text(),
    /Privacy notice · Trafirdis/,
  );
  assert.match(
    await (await fetch(`${base}/NOTICE`)).text(),
    /Copyright © 2026 Trafirdis contributors/,
  );
  const config = await fetch(`${base}/runtime-config.js`);
  assert.match(config.headers.get("cache-control"), /no-store/);
  assert.equal(
    await config.text(),
    'window.__TRAFIRDIS_CONFIG__ = {"diagnostics":false};\n',
  );
  assert.equal((await fetch(`${base}/sample/poster-0.svg`)).status, 200);
  assert.equal((await fetch(`${base}/.env.local`)).status, 404);
  assert.equal((await fetch(`${base}/assets/missing.js`)).status, 404);
  assert.match(
    await (await fetch(`${base}/some/client/route`)).text(),
    /<title>Trafirdis/,
  );
  assert.equal((await fetch(`${base}/plex/identity`)).status, 404);
  console.log(
    "Docker static hosting: health, runtime diagnostics, assets and non-root/read-only runtime passed; no media proxy is available.",
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
  const diagnosticChunks = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/\/assets\/Diagnostics-/.test(request.url()))
      diagnosticChunks.push(request.url());
  });
  await page.goto(base);
  await page.getByText("Use a Plex token instead", { exact: true }).click();
  await page.getByLabel("Plex server address").fill(plexOrigin);
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
  const hlsRequests = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (/\/(decision|start\.m3u8)$|\.ts$/.test(url.pathname))
      hlsRequests.push(url.pathname);
  });
  await page.getByLabel("Plex server address").fill(plexOrigin);
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
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    return (
      video?.buffered.length &&
      video.buffered.start(0) <= 0.05 &&
      video.buffered.end(0) >= 0.25
    );
  });
  const bufferedSource = await page
    .locator("video")
    .evaluate((video) => video.src);
  const mediaCount = hlsRequests.length;
  const checkBrowserVisibility = async () => {
    const before = await page.locator("video").evaluate((video) => ({
      time: video.currentTime,
      source: video.src,
      muted: video.muted,
    }));
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForFunction(
      (time) => document.querySelector("video")?.currentTime > time + 0.2,
      before.time,
    );
    assert.deepEqual(
      await page.locator("video").evaluate((video) => ({
        source: video.src,
        muted: video.muted,
        paused: video.paused,
      })),
      { source: before.source, muted: before.muted, paused: false },
    );
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: false,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
  };
  await checkBrowserVisibility();
  // New streams require a decision; retained open streams keep their buffer.

  for (let i = 0; i < 2; i++) {
    await page
      .locator(".hero")
      .getByRole("button", { name: "More info" })
      .click();
    await page.waitForFunction(
      () =>
        document
          .querySelector(".details-dialog [data-preview-phase]")
          ?.getAttribute("data-preview-phase") === "playing",
    );
    assert.equal(await page.locator("video").count(), 1);
    if (i === 0) await checkBrowserVisibility();
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () =>
        document
          .querySelector(".hero [data-preview-phase]")
          ?.getAttribute("data-preview-phase") === "playing",
    );
  }
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.style.height = "1500px";
    document.body.append(spacer);
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForFunction(
    () =>
      document
        .querySelector(".hero [data-preview-phase]")
        ?.getAttribute("data-preview-phase") === "paused",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(
    () =>
      document
        .querySelector(".hero [data-preview-phase]")
        ?.getAttribute("data-preview-phase") === "playing",
  );
  assert.deepEqual(errors, []);
  assert.equal(
    await page.locator("video").evaluate((video) => video.src),
    bufferedSource,
  );
  assert.equal(
    hlsRequests.filter((path) => path.endsWith("/decision")).length,
    1,
  );
  assert.equal(
    hlsRequests.filter((path) => path.endsWith("start.m3u8")).length,
    1,
  );
  assert.equal(
    hlsRequests.length,
    mediaCount,
    "Warm returns must not rebuild media on the selected server.",
  );
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
    if (new URL(request.url()).origin === plexOrigin)
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
                  connections: [{ uri: plexOrigin, local: true }],
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
    await page.evaluate(() => sessionStorage.getItem("trafirdis.token")),
    "docker-server-token",
  );
  assert.equal(
    await page.evaluate(() =>
      sessionStorage.getItem("trafirdis.pending-sign-in"),
    ),
    null,
  );
  assert.equal(new URL(page.url()).searchParams.has("trafirdis_auth"), false);
  assert.ok(
    loginRequests.every(
      (request) =>
        request.token !== "docker-account-token" &&
        !request.url.includes("docker-account-token"),
    ),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(diagnosticChunks, []);
  // The same image enables advanced diagnostics only through runtime configuration.
  const diagnosticApp = `${app}-diagnostics`;
  const diagnosticBase = startApp(diagnosticApp, "true");
  await ready(`${diagnosticBase}/healthz`);
  assert.match(
    await (await fetch(`${diagnosticBase}/runtime-config.js`)).text(),
    /"diagnostics":true/,
  );
  const diagnosticPage = await browser.newPage();
  await diagnosticPage.addInitScript(() => {
    Object.defineProperty(crypto, "randomUUID", { value: undefined });
  });
  const diagnosticErrors = [];
  const mediaRequests = [];
  diagnosticPage.on("pageerror", (error) =>
    diagnosticErrors.push(error.message),
  );
  diagnosticPage.on("request", (request) => {
    if (
      /\/(library\/parts\/|video\/:\/transcode\/universal\/start)/.test(
        new URL(request.url()).pathname,
      )
    )
      mediaRequests.push(request.url());
  });
  await diagnosticPage.goto(diagnosticBase);
  await diagnosticPage
    .getByText("Use a Plex token instead", { exact: true })
    .click();
  await diagnosticPage.getByLabel("Plex server address").fill(plexOrigin);
  await diagnosticPage
    .getByLabel("Plex authentication token")
    .fill("docker-diagnostics-token");
  await diagnosticPage
    .getByRole("button", { name: "Connect my library", exact: true })
    .click();
  await diagnosticPage.waitForFunction(
    () =>
      document
        .querySelector("[data-preview-phase]")
        ?.getAttribute("data-preview-phase") === "playing",
  );
  const openDiagnostics = async () => {
    await diagnosticPage
      .getByRole("button", { name: "Connection settings" })
      .click();
    await diagnosticPage
      .getByRole("button", { name: "Trailer diagnostics" })
      .click();
  };
  const downloadReport = async () => {
    const downloaded = diagnosticPage.waitForEvent("download");
    await diagnosticPage
      .getByRole("button", { name: "Download report" })
      .click();
    return JSON.parse(readFileSync(await (await downloaded).path(), "utf8"));
  };
  await openDiagnostics();
  await diagnosticPage
    .getByText("Playback verified", { exact: true })
    .waitFor();
  const mediaBefore = mediaRequests.length;
  await diagnosticPage
    .getByRole("button", { name: "Inspect sample metadata" })
    .click();
  await diagnosticPage
    .getByText("Metadata found; playback not verified", { exact: true })
    .waitFor();
  assert.equal(mediaRequests.length, mediaBefore);
  const metadataReport = await downloadReport();
  assert.equal(metadataReport.schemaVersion, 1);
  assert.equal(metadataReport.checks.length, 1);
  assert.deepEqual(
    {
      metadata: metadataReport.checks[0].metadataFound,
      url: metadataReport.checks[0].urlResolved,
      playback: metadataReport.checks[0].playbackSucceeded,
    },
    { metadata: true, url: null, playback: null },
  );
  assert.doesNotMatch(
    JSON.stringify(metadataReport),
    /docker-diagnostics-token|X-Plex-Token|plex-fixture|Docker First Light|https?:/,
  );
  await diagnosticPage.getByRole("button", { name: "Test preview" }).click();
  await diagnosticPage.waitForFunction(
    () =>
      document
        .querySelector("[data-preview-phase]")
        ?.getAttribute("data-preview-phase") === "playing",
  );
  await openDiagnostics();
  const playbackReport = await downloadReport();
  assert.equal(playbackReport.checks[0].playbackSucceeded, true);
  assert.equal(playbackReport.checks[0].urlResolved, true);
  assert.deepEqual(diagnosticErrors, []);
  console.log(
    "Docker diagnostics: disabled module stays unloaded; runtime opt-in, metadata-only inspection, fresh playback evidence and credential-free report downloads passed.",
  );
  await browser.close();
  browser = undefined;
  console.log(
    "Docker browser: direct cross-origin catalog, native and HLS decoding, preview cleanup, hosted sign-in and production-only UI passed.",
  );

  const badDiagnostics = docker(
    [
      "run",
      "--rm",
      "--read-only",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=32m,mode=1777",
      "--env",
      "TRAFIRDIS_DIAGNOSTICS=true;synthetic-secret",
      image,
    ],
    true,
  );
  assert.equal(badDiagnostics.status, 1);
  assert.match(
    badDiagnostics.stderr,
    /TRAFIRDIS_DIAGNOSTICS must be true or false/,
  );
  assert.doesNotMatch(
    badDiagnostics.stdout + badDiagnostics.stderr,
    /synthetic-secret/,
  );
  // The static site remains available when Plex later goes offline.
  docker(["stop", fixture]);
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.equal((await fetch(base)).status, 200);
  assert.equal((await fetch(`${base}/plex/library/sections`)).status, 404);
  for (const name of [app, diagnosticApp]) {
    const logs = docker(["logs", name]);
    assert.doesNotMatch(
      logs.stdout + logs.stderr,
      /synthetic-token|docker-browser-fixture-token|docker-account-token|docker-server-token|docker-diagnostics-token|X-Plex-Token/,
    );
  }
  console.log(
    "Docker validation: diagnostics config fails safely; offline Plex does not take down the SPA; Plex credentials do not reach application hosting or container logs.",
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
