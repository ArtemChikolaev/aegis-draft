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
    // Раннер CI в 3–4 раза медленнее M-серии: тесты сима по 3–4 с локально (шаман, строй стрелков, композиции)
    // выходили за дефолтные 5 с и красили CI без единого падения локально (2026-09-12). Тяжёлые тесты держат свой лимит выше.
    testTimeout: 30_000,
  },
});
