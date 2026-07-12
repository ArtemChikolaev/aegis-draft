import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TournamentEngine } from "../src/game/tournament.ts";
import type { GameData } from "../src/types/data.ts";

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

const create = () => new TournamentEngine(data, "last_2y", "tournament-contract", 61.5, "Test Five");
const first = create();
const second = create();
assert(JSON.stringify(first.snapshot) === JSON.stringify(second.snapshot), "один сид ⇒ идентичная полная симуляция");
assert(first.snapshot.field.length === 18, "поле содержит ровно 18 команд");
assert(new Set(first.snapshot.field.map((team) => team.id)).size === 18, "в поле нет повторяющихся паков");
assert(first.snapshot.field.filter((team) => team.isUser).length === 1, "в поле ровно одна команда игрока");
assert(first.snapshot.groups.length === 2 && first.snapshot.groups.every((group) => group.standings.length === 9), "две группы по 9 команд");
for (const group of first.snapshot.groups) {
  assert(group.standings.every((row) => row.wins + row.losses === 16), `группа ${group.id}: каждая команда играет 16 карт`);
  assert(group.standings.filter((row) => row.route === "upper").length === 4, `группа ${group.id}: 4 команды в upper bracket`);
  assert(group.standings.filter((row) => row.route === "lower").length === 4, `группа ${group.id}: 4 команды в lower bracket`);
  assert(group.standings.filter((row) => row.route === "out").length === 1, `группа ${group.id}: 1 команда вылетает`);
}
assert(first.snapshot.playoffRounds.length === 9, "полная double-elimination сетка содержит 9 раундов до Grand Final");
assert(first.snapshot.grandFinal.bestOf === 5, "Grand Final играется BO5");
assert(first.snapshot.standings.length === 18, "финальная таблица содержит 18 команд");
assert(new Set(first.snapshot.standings.map((row) => row.team.id)).size === 18, "каждая команда получает одно итоговое место");
assert(first.snapshot.champion.id === first.snapshot.grandFinal.winnerId, "победитель Grand Final становится чемпионом");
assert(first.snapshot.standings.some((row) => row.team.isUser && row.placement === first.snapshot.userPlacement), "место игрока согласовано с таблицей");

const stages = [first.snapshot.stage];
while (first.advance()) stages.push(first.snapshot.stage);
assert(JSON.stringify(stages) === JSON.stringify(["field", "groups", "playoffs"]), "этапы открываются строго field → groups → playoffs (playoffs — терминальный)");
assert(first.advance() === false && first.snapshot.stage === "playoffs", "завершённый турнир нельзя продвинуть дальше");

if (failures) process.exit(1);
console.log("\nTournament engine: all checks passed.");
