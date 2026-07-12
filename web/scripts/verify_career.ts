import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TournamentEngine, type PlacementKey } from "../src/game/tournament.ts";
import {
  appendCareerEntry,
  careerRunId,
  placementBucket,
  summarizeCareer,
  tournamentCareerResults,
  useCareer,
  type CareerEntry,
} from "../src/state/careerStore.ts";
import type { GameData, Role } from "../src/types/data.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "public", "data");
const read = (file: string) => JSON.parse(readFileSync(join(dataDir, file), "utf8"));
const data: GameData = {
  manifest: read("manifest.json"), events: read("events.json"), heroes: read("heroes.json"), packs: read("packs.json"),
  players: read("players.json"), playerHeroStats: read("playerHeroStats.json"), teammates: read("teammates.json"),
  squadSynergy: read("squadSynergy.json"), eventHeroStats: read("eventHeroStats.json"), teamSuccess: read("teamSuccess.json"),
};

let failures = 0;
const assert = (condition: boolean, message: string) => {
  console.log(`${condition ? "✅" : "❌"} ${message}`);
  if (!condition) failures += 1;
};

const expectedBuckets: Record<PlacementKey, string> = {
  "1": "1", "2": "2", "3": "3", "4": "4", "5-6": "5-6", "7-8": "7-8",
  "9-12": "rest", "13-16": "rest", "17": "rest", "18": "rest",
};
for (const [placement, expected] of Object.entries(expectedBuckets) as [PlacementKey, string][]) {
  assert(placementBucket(placement) === expected, `${placement} → career bucket ${expected}`);
}

const tournament = new TournamentEngine(data, "last_2y", "career-contract", 61.5, "Career Five");
while (tournament.advance()) { /* terminal deterministic snapshot */ }
const results = tournamentCareerResults(tournament.snapshot);
const replay = new TournamentEngine(data, "last_2y", "career-contract", 61.5, "Career Five");
while (replay.advance()) { /* same seed */ }
assert(JSON.stringify(results) === JSON.stringify(tournamentCareerResults(replay.snapshot)), "один seed даёт одинаковую career-статистику карт");
assert(results.gamesWon + results.gamesLost >= 16, "карты группы и плей-офф попали в career result");
assert(results.groupClean === (tournament.snapshot.groups.flatMap((group) => group.standings).find((row) => row.team.isUser)?.losses === 0), "groupClean считается по проигранным картам группы");
assert(results.undefeated === (results.gamesLost === 0), "undefeated означает ноль проигранных карт всего забега");

const roles: Role[] = ["safelane", "mid", "offlane", "support", "support"];
const entry: CareerEntry = {
  v: 1,
  finishedAt: "2026-07-12T12:00:00.000Z",
  seed: "career-contract",
  datasetSchemaVersion: data.manifest.schemaVersion,
  ratingModelVersion: data.manifest.ratingModelVersion,
  configLabel: { format: "last_2y", difficulty: "normal", scoring: "event", draftStyle: "team" },
  placement: tournament.snapshot.userPlacement,
  score: { base: 60, heroSynergy: 2, chemistry: 1, teamOvr: 63 },
  roster: roles.map((role, index) => ({ role, nickname: `Player ${index + 1}`, accountId: index + 1, heroId: index + 1 })),
  results,
};
const sameRunLater = { ...entry, finishedAt: "2026-07-13T12:00:00.000Z" };
assert(careerRunId(entry) === careerRunId(sameRunLater), "runId не зависит от finishedAt/render времени");
const once = appendCareerEntry([], entry);
const twice = appendCareerEntry(once, sameRunLater);
assert(once.length === 1 && twice.length === 1 && twice === once, "pure append дедуплицирует повторный runId");

const before = useCareer.getState().entries.length;
const firstRecord = useCareer.getState().record(entry);
const secondRecord = useCareer.getState().record(sameRunLater);
assert(firstRecord && !secondRecord && useCareer.getState().entries.length === before + 1, "careerStore.record добавляет завершённый забег ровно один раз");

const other = { ...entry, seed: "career-contract-2", placement: "1" as const, results: { gamesWon: 20, gamesLost: 0, groupClean: true, undefeated: true } };
const summary = summarizeCareer([entry, other]);
assert(summary.runs === 2 && summary.gamesWon === entry.results.gamesWon + 20 && summary.gamesLost === entry.results.gamesLost, "summary суммирует runs/games из записей");
assert(summary.placements[placementBucket(entry.placement)] >= 1 && summary.placements["1"] >= 1, "summary вычисляет placement buckets");
assert(summary.undefeated === Number(entry.results.undefeated) + 1 && summary.flawlessGroups === Number(entry.results.groupClean) + 1, "summary вычисляет undefeated/flawless из записей");

if (failures) process.exit(1);
console.log(`\nCareer: all checks passed (seed maps ${results.gamesWon}–${results.gamesLost}).`);
