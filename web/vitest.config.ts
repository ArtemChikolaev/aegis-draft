import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/** Unit/regression tests for web/src/game (Node). CI: gen:mock перед прогоном; golden — только mock-baseline. */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    restoreMocks: true,
  },
});
