import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const goldenDir = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/golden");

export function loadGolden<T>(name: string): T {
  const path = join(goldenDir, `${name}.json`);
  if (!existsSync(path)) {
    throw new Error(`Missing golden fixture: ${path} (run npm run test:golden:update)`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function writeGolden(name: string, value: unknown): void {
  mkdirSync(goldenDir, { recursive: true });
  writeFileSync(join(goldenDir, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
