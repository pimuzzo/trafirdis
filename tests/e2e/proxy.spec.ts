import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
let server: Server;
const received: { url?: string; token?: string }[] = [];
test.beforeAll(async () => {
  server = createServer((req, res) => {
    received.push({
      url: req.url,
      token: req.headers["x-plex-token"] as string | undefined,
    });
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
});
