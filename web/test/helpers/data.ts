import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GameData } from "../../src/types/data.ts";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../../public/data");

function readJson<T>(file: string, fallback?: T): T {
  const path = join(dataDir, file);
  if (!existsSync(path)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing test data: ${path} (run npm run gen:mock in web/)`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** Snapshot from public/data. CI: после gen:mock; локально golden — тоже gen:mock. */
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
