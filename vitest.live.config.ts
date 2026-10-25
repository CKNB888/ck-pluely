// Live smoke tests against real providers. NOT part of `npm test` / CI.
// Run: GROQ_KEYS_FILE=/path/keys.txt AUDIO_DIR=/path npx vitest run -c vitest.live.config.ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { include: ["live/**/*.live.ts"], testTimeout: 600_000, environment: "node" },
});
