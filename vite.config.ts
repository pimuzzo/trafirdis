import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";

const nativeMediaTokens = new WeakMap<IncomingMessage, string>();

// Native media elements require URL authentication. Convert it to a header before
// Vite's proxy sees the URL, so proxy errors cannot print a token-bearing URL.
function privateMediaAuth(): Plugin {
  const sanitize = (
    req: IncomingMessage,
    _res: ServerResponse,
    next: () => void,
  ) => {
    if (req.url?.startsWith("/plex/")) {
      const url = new URL(req.url, "http://localhost");
      const token = url.searchParams.get("X-Plex-Token");
      if (token) {
        req.headers["x-plex-token"] = token;
        nativeMediaTokens.set(req, token);
      }
      url.searchParams.delete("X-Plex-Token");
      req.url = `${url.pathname}${url.search}`;
    }
    next();
  };
  return {
    name: "private-media-auth",
    configureServer: (server) => {
      server.middlewares.use(sanitize);
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(sanitize);
    },
  };
}
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.PLEX_SERVER_URL || "http://192.168.178.46:32400";
  const server = new URL(target);
  if (
    !["http:", "https:"].includes(server.protocol) ||
    server.username ||
    server.password ||
    server.search ||
    server.hash ||
    server.pathname !== "/"
  ) {
    throw new Error(
      "PLEX_SERVER_URL must be an HTTP(S) origin without credentials, path, or query.",
    );
  }
  const proxy: Record<string, ProxyOptions> = {
    "/plex": {
      target: server.origin,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/plex/, ""),
      configure: (instance) => {
        // Keep redirects inside the configured Plex origin; do not forward tokens
        // to a third-party CDN. Plex's own streaming route resolves provider media.
        instance.on("proxyRes", (response, req) => {
          const location = response.headers.location;
          if (!location) return;
          try {
            const next = new URL(
              location,
              new URL(req.url || "/", server.origin),
            );
            if (
              next.origin === server.origin &&
              !next.username &&
              !next.password &&
              !/[\\\\\r\n]/.test(location)
            ) {
              // A native element cannot replay the server-side auth header.
              // Restore its URL token only after validating the redirect origin;
              // the next request strips it again before entering the proxy.
              const token = nativeMediaTokens.get(req);
              if (token) next.searchParams.set("X-Plex-Token", token);
              response.headers.location = `/plex${next.pathname}${next.search}`;
            } else {
              response.statusCode = 502;
              delete response.headers.location;
            }
          } catch {
            response.statusCode = 502;
            delete response.headers.location;
          }
        });
      },
    },
  };
  return {
    plugins: [privateMediaAuth(), react()],
    define: { __PLEX_SERVER_LABEL__: JSON.stringify(server.origin) },
    server: { host: "127.0.0.1", proxy },
    preview: { host: "127.0.0.1", proxy },
    test: {
      environment: "jsdom",
      include: ["tests/**/*.test.{ts,tsx}"],
      restoreMocks: true,
    },
  };
});
