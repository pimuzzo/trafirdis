import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
let server: Server;
const received: { url?: string; token?: string; range?: string }[] = [];
const mediaToken = "fixture-proxy-token+slash/equals=&percent%";
const video = readFileSync("tests/fixtures/preview.webm");
test.beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url!, "http://127.0.0.1:32401");
    received.push({
      url: req.url,
      token: req.headers["x-plex-token"] as string | undefined,
      range: req.headers.range,
    });
    const redirects: Record<string, string> = {
      "/media/root": "/media/protected?from=root",
      "/media/relative": "protected?from=relative",
      "/media/absolute": "http://127.0.0.1:32401/media/protected?from=absolute",
      "/media/chain": "/media/relative",
      "/media/no-query": "/media/protected",
      "/media/image": "/media/protected-image",
      "/media/video": "/media/protected-video",
      "/media/remote-chain": "/redirect",
      "/media/protocol-relative": "//outside.example/asset",
      "/media/backslash": "/\\outside.example/asset",
    };
    if (redirects[url.pathname]) {
      res.writeHead(302, { Location: redirects[url.pathname] });
      res.end();
      return;
    }
    if (url.pathname.startsWith("/media/protected")) {
      if (req.headers["x-plex-token"] !== mediaToken) {
        res.writeHead(401);
        res.end();
        return;
      }
      if (url.pathname === "/media/protected-image") {
        res.setHeader("Content-Type", "image/svg+xml");
        res.end(
          '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>',
        );
      } else if (url.pathname === "/media/protected-video") {
        res.setHeader("Content-Type", "video/webm");
        res.end(video);
      } else {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ token: req.headers["x-plex-token"] }));
      }
      return;
    }
    if (req.url === "/redirect") {
      res.writeHead(302, { Location: "https://outside.example/asset" });
      res.end();
      return;
    }
    if (req.url === "/local-redirect") {
      res.writeHead(302, { Location: "/library/parts/1/file" });
      res.end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({ MediaContainer: { friendlyName: "Proxy fixture" } }),
    );
  });
  await new Promise<void>((resolve) =>
    server.listen(32401, "127.0.0.1", resolve),
  );
});
test("native media keeps authentication across trusted redirects and redirect chains", async ({
  request,
}) => {
  for (const kind of ["root", "relative", "absolute", "chain", "no-query"]) {
    await test.step(kind, async () => {
      const response = await request.get(
        "/plex/media/" +
          kind +
          "?" +
          new URLSearchParams({ "X-Plex-Token": mediaToken }),
        { headers: { Range: "bytes=0-15" } },
      );
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ token: mediaToken });
      expect(received.at(-1)?.range).toBe("bytes=0-15");
      // Each hop removes query credentials before contacting Plex.
      expect(received.at(-1)?.url).not.toContain("X-Plex-Token");
    });
  }
});
test("image and native video elements follow authenticated redirects without browser auth headers", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async (token) => {
    const query = new URLSearchParams({ "X-Plex-Token": token });
    const image = new Image();
    const loaded = new Promise<boolean>((resolve) => {
      image.onload = () => resolve(image.naturalWidth === 8);
      image.onerror = () => resolve(false);
    });
    image.src = "/plex/media/image?" + query;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    document.body.append(video);
    const playing = new Promise<boolean>((resolve) => {
      video.onplaying = () => resolve(true);
      video.onerror = () => resolve(false);
    });
    video.src = "/plex/media/video?" + query;
    await video.play();
    const result = { image: await loaded, video: await playing };
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
    return result;
  }, mediaToken);
  expect(result).toEqual({ image: true, video: true });
});
test("authenticated redirects never send the browser to an external target", async ({
  request,
}) => {
  for (const path of [
    "/redirect",
    "/media/remote-chain",
    "/media/protocol-relative",
    "/media/backslash",
  ]) {
    const response = await request.get(
      "/plex" +
        path +
        "?" +
        new URLSearchParams({ "X-Plex-Token": mediaToken }),
    );
    expect(response.status()).toBe(502);
    expect(response.headers().location).toBeUndefined();
  }
});
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});
test("native media query tokens are moved to headers before proxying", async ({
  request,
}) => {
  const response = await request.get(
    "/plex/library/parts/1/file?X-Plex-Token=fixture-proxy-token",
  );
  expect(response.ok()).toBe(true);
  expect(received.at(-1)).toEqual({
    url: "/library/parts/1/file",
    token: "fixture-proxy-token",
  });
});
test("external redirects are blocked and local redirects stay at the proxy", async ({
  request,
}) => {
  const external = await request.get("/plex/redirect", { maxRedirects: 0 });
  expect(external.status()).toBe(502);
  expect(external.headers().location).toBeUndefined();
  const local = await request.get("/plex/local-redirect", { maxRedirects: 0 });
  expect(local.headers().location).toBe("/plex/library/parts/1/file");
  const headerOnly = await request.get("/plex/local-redirect", {
    headers: { "X-Plex-Token": mediaToken },
    maxRedirects: 0,
  });
  expect(headerOnly.headers().location).toBe("/plex/library/parts/1/file");
});
