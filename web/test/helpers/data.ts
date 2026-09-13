import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GameData } from "../../src/types/data.ts";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
/** Каталог датасета: `AEGIS_DATA_DIR` (относительно web/ или абсолютный), иначе закоммиченный
 *  реальный public/data. Мок: `npm run gen:mock` пишет в web/.mock-data, дальше
 *  `AEGIS_DATA_DIR=.mock-data npx vitest run` (или `npm run test:mock`); golden идут только на моке. */
const dataDir = resolve(webRoot, process.env.AEGIS_DATA_DIR ?? "public/data");

function readJson<T>(file: string, fallback?: T): T {
  const path = join(dataDir, file);
  if (!existsSync(path)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing test data: ${path} (мок: npm run gen:mock в web/ и AEGIS_DATA_DIR=.mock-data)`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** Снимок датасета из `AEGIS_DATA_DIR` (по умолчанию public/data). CI web-job: мок в public/data. */
export function loadGameData(): GameData {
  return {
    manifest: readJson("manifest.json"),
    events: readJson("events.json"),
    heroes: readJson("heroes.json"),
    packs: readJson("packs.json"),
    players: readJson("players.json"),
    playerHeroStats: readJson("playerHeroStats.json"),
    careerPlayerHeroStats: readJson("careerPlayerHeroStats.json", {}),
    teammates: readJson("teammates.json"),
    squadSynergy: readJson("squadSynergy.json"),
    eventHeroStats: readJson("eventHeroStats.json"),
    teamSuccess: readJson("teamSuccess.json"),
  };
}
