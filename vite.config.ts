import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const diagnostics = env.TRAFIRDIS_DIAGNOSTICS || "false";
  if (!["true", "false"].includes(diagnostics))
    throw new Error("TRAFIRDIS_DIAGNOSTICS must be true or false.");
  return {
    plugins: [react()],
    define: { __TRAFIRDIS_DIAGNOSTICS__: diagnostics === "true" },
    server: { host: "127.0.0.1" },
    preview: { host: "127.0.0.1" },
    test: {
      environment: "jsdom",
      include: ["tests/**/*.test.{ts,tsx}"],
      restoreMocks: true,
    },
  };
});
