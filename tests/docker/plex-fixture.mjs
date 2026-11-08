import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const video = readFileSync("/fixtures/preview.webm");
const movie = {
  ratingKey: "1",
  key: "/library/metadata/1",
  type: "movie",
  title: "Docker First Light",
  summary: "A synthetic Plex movie for container testing.",
  year: 2025,
  duration: 6600000,
  Genre: [{ tag: "Drama" }],
  thumb: "/library/metadata/1/thumb/1",
  art: "/library/metadata/1/art/1",
};
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://plex-fixture:32400");
  const token =
    req.headers["x-plex-token"] || url.searchParams.get("X-Plex-Token");
  const json = (data) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
  };
  if (token === "invalid") {
    res.writeHead(401);
    res.end();
    return;
  }
  const redirects = {
    "/redirect-local": "/echo?from=local",
    "/redirect-absolute": "http://plex-fixture:32400/echo?from=absolute",
    "/redirect-relative": "echo?from=relative",
    "/redirect-external": "https://outside.example/asset",
    "/redirect-protocol-relative": "//outside.example/asset",
    "/redirect-backslash": "/\\outside.example/asset",
  };
  if (redirects[url.pathname]) {
    res.writeHead(302, { Location: redirects[url.pathname] });
    res.end();
    return;
  }
  if (url.pathname === "/echo") {
    json({
      path: url.pathname,
      query: url.search,
      token,
      range: req.headers.range,
    });
    return;
  }
  if (url.pathname.startsWith("/photo/")) {
    res.setHeader("Content-Type", "image/svg+xml");
    res.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><path fill="#293c52" d="M0 0h320v180H0z"/></svg>',
    );
    return;
  }
  if (url.pathname.startsWith("/library/parts/")) {
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
    const start = range ? Number(range[1]) : 0,
      end =
        range && range[2]
          ? Math.min(Number(range[2]), video.length - 1)
          : video.length - 1;
    res.writeHead(range ? 206 : 200, {
      "Content-Type": "video/webm",
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      ...(range
        ? { "Content-Range": `bytes ${start}-${end}/${video.length}` }
        : {}),
    });
    res.end(video.subarray(start, end + 1));
    return;
  }
  if (url.pathname.endsWith("/start.m3u8")) {
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.end(readFileSync("/fixtures/preview.m3u8"));
    return;
  }
  if (url.pathname.endsWith("/segment-0.ts")) {
    res.setHeader("Content-Type", "video/mp2t");
    res.end(readFileSync("/fixtures/segment-0.ts"));
    return;
  }
  if (url.pathname.endsWith("/stop")) {
    res.end();
    return;
  }
  if (url.pathname === "/slow") {
    res.setHeader("Content-Type", "text/plain");
    res.write("first");
    const timer = setTimeout(() => res.end("last"), 1500);
    req.on("close", () => clearTimeout(timer));
    return;
  }
  if (url.pathname === "/") {
    json({
      MediaContainer: {
        friendlyName: "Docker fixture",
        machineIdentifier: "docker-fixture",
      },
    });
    return;
  }
  if (url.pathname === "/library/sections") {
    json({
      MediaContainer: {
        Directory: [{ key: "1", title: "Movies", type: "movie" }],
      },
    });
    return;
  }
  if (url.pathname === "/library/sections/1/all") {
    json({ MediaContainer: { totalSize: 1, Metadata: [movie] } });
    return;
  }
  if (url.pathname === "/library/metadata/1") {
    json({
      MediaContainer: {
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
                  Media:
                    token === "docker-browser-hls-token"
                      ? []
                      : [
                          {
                            container: "webm",
                            Part: [{ key: "/library/parts/101/trailer.webm" }],
                          },
                        ],
                },
              ],
            },
          },
        ],
      },
    });
    return;
  }
  res.writeHead(404);
  res.end();
});
server.listen(32400, "0.0.0.0");
