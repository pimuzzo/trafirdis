import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// The wildcard Pages rule is also the source for Vite's response/meta policies.
const securityHeaders = Object.fromEntries(
  readFileSync(new URL("./public/_headers", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line.startsWith("  "))
    .map((line) => {
      const split = line.indexOf(":");
      return [line.slice(0, split).trim(), line.slice(split + 1).trim()];
    }),
);

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const diagnostics = env.TRAFIRDIS_DIAGNOSTICS || "false";
  if (!["true", "false"].includes(diagnostics))
    throw new Error("TRAFIRDIS_DIAGNOSTICS must be true or false.");
  const development = command === "serve";
  const csp = securityHeaders["Content-Security-Policy"];
  const activeCsp = development
    ? csp
        .replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
        .replace(
          "connect-src 'self' https: http:;",
          "connect-src 'self' https: http: ws://127.0.0.1:* ws://localhost:*;",
        )
    : csp;
  return {
    plugins: [
      {
        name: "trafirdis-security-policy",
        transformIndexHtml: {
          order: "pre",
          handler: (html) =>
            html.replace(
              "%TRAFIRDIS_CSP%",
              activeCsp.replace(" frame-ancestors 'none';", ""),
            ),
        },
      },
      react(),
    ],
    define: { __TRAFIRDIS_DIAGNOSTICS__: diagnostics === "true" },
    server: {
      host: "127.0.0.1",
      headers: { ...securityHeaders, "Content-Security-Policy": activeCsp },
    },
    preview: { host: "127.0.0.1", headers: securityHeaders },
    test: {
      environment: "jsdom",
      include: ["tests/**/*.test.{ts,tsx}"],
      restoreMocks: true,
    },
  };
});
