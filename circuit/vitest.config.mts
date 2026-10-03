import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // web3.js's CommonJS build can't load on Node 20.15 (its websocket dependency needs ESM); tests use the ESM build.
      "@solana/web3.js": fileURLToPath(new URL("./node_modules/@solana/web3.js/lib/index.esm.js", import.meta.url)),
    },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
