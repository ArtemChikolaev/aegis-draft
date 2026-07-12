// Проверка ядра логики на мок-данных (запуск: node web/scripts/verify_game.ts — Node v24 нативный TS).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scoreTeam, baseRating, chemistryBonus, type ChemistryPlayer } from "../src/game/score.ts";
import { bestAssignment } from "../src/game/assign.ts";
import type { Pack, PlayerHeroStats, SquadSynergy, PackPlayer, Teammates } from "../src/types/data.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "public", "data");
const read = (f: string) => JSON.parse(readFileSync(join(dataDir, f), "utf8"));

const packs: Pack[] = read("packs.json");
const phs: PlayerHeroStats = read("playerHeroStats.json");
const squad: SquadSynergy = read("squadSynergy.json");
const teammates: Teammates = read("teammates.json");

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  console.log(`${cond ? "✅" : "❌"} ${msg}`);
  if (!cond) failures++;
};
const round = (n: number) => Math.round(n * 100) / 100;

function chemFromPack(pack: Pack): ChemistryPlayer[] {
  return pack.players.map((p) => ({
    accountId: p.accountId,
    teamId: pack.teamId,
    eventId: pack.eventId,
  }));
}

function sigFromPack(pack: Pack): Record<number, number[]> {
  return Object.fromEntries(pack.players.map((p) => [p.accountId, pack.signatureHeroes]));
}

// --- Team Packs: берём ростер Team Spirit целиком ---
const spirit = packs.find((p) => p.teamName === "Team Spirit");
assert(!!spirit, "Team Spirit есть в packs.json");
if (!spirit) process.exit(1);

const spiritChem = chemFromPack(spirit);
const spiritSig = sigFromPack(spirit);
const s = scoreTeam(spirit.players, spirit.signatureHeroes, phs, squad, teammates, spiritChem, spiritSig);
console.log(`\n[Team Packs] ${spirit.teamName}`);
console.log(`  Base ${round(s.base)}  +Synergy ${round(s.heroSynergy)}  +Chemistry ${round(s.chemistry)}  = OVR ${round(s.teamOvr)}`);
console.log(`  Назначение героев:`, s.assignment.byPlayer);

const expectedBase = baseRating(spirit.players);
assert(Math.abs(s.base - expectedBase) < 1e-9, "Base = средний OVR пятёрки");
assert(Object.keys(s.assignment.byPlayer).length === 5, "каждому из 5 игроков назначен герой");
assert(new Set(Object.values(s.assignment.byPlayer)).size === 5, "герои не повторяются (валидный matching)");
assert(Number.isFinite(s.teamOvr), "Team OVR — конечное число");
assert(s.chemistry >= 0, "Chemistry не отрицательная");
assert(scoreTeam(spirit.players.slice(0, 1), [], phs, squad, teammates, spiritChem.slice(0, 1), spiritSig).heroSynergy === 0, "Hero Synergy = 0, пока герой не выбран");

const oneHeroProgress = spirit.players.map((_, index) =>
  scoreTeam(spirit.players.slice(0, index + 1), spirit.signatureHeroes.slice(0, 1), phs, squad, teammates, spiritChem.slice(0, index + 1), spiritSig).heroSynergy,
);
assert(
  oneHeroProgress.every((value, index) => index === 0 || value >= oneHeroProgress[index - 1] - 1e-9),
  "добавление игрока не разбавляет уже выбранную player×hero пару",
);

const chemistryProgress = spirit.players.map((_, index) =>
  chemistryBonus(spiritChem.slice(0, index + 1), squad, teammates),
);
assert(
  chemistryProgress.every((value, index) => index === 0 || value >= chemistryProgress[index - 1] - 1e-9),
  "Chemistry сыгранного ростера не падает при добавлении тиммейтов",
);
assert(Math.abs(chemistryProgress[4] - s.chemistry) < 1e-9, "финальная Chemistry совпадает с полной пятёркой");

const greedyTotal = greedyAssign(spirit.players, spirit.signatureHeroes, phs);
assert(s.assignment.total >= greedyTotal - 1e-9, `matching (${round(s.assignment.total)}) не хуже жадности (${round(greedyTotal)})`);

const largePool = Array.from({ length: 40 }, (_, i) => i + 1);
const largeStats: PlayerHeroStats = {};
spirit.players.forEach((player, i) => {
  largeStats[String(player.accountId)] = { [String(36 + i)]: { games: 100, winrate: 0.9 } };
});
const largeAssignment = bestAssignment(spirit.players, largePool, largeStats);
assert(Object.keys(largeAssignment.byPlayer).length === 5, "matching: 5 назначений при пуле 40 героев");

const ghostId = 206642367;
const p33Id = 86698277;
const drowId = 6;
const enigmaId = 19;
const experienceStats: PlayerHeroStats = {
  [String(ghostId)]: { [String(drowId)]: { games: 1, winrate: 0 } },
  [String(p33Id)]: {},
};
const experiencePlayers: PackPlayer[] = [
  { accountId: ghostId, nickname: "Ghost", role: "safelane", ovr: 57, impact: 50, economy: 50, reliability: 50 },
  { accountId: p33Id, nickname: "33", role: "offlane", ovr: 65, impact: 50, economy: 50, reliability: 50 },
];
const experienceAssign = bestAssignment(experiencePlayers, [drowId, enigmaId], experienceStats);
assert(experienceAssign.byPlayer[ghostId] === drowId, "matching: герой с опытом → игрок с играми на герое");

// --- Mixed Draft ---
type Sourced = { player: PackPlayer; teamId: number; eventId: string };
const byRole = (role: string): Sourced[] => {
  const fromTeams = new Map<number, Sourced>();
  for (const pk of packs) {
    for (const pl of pk.players) {
      if (pl.role === role && !fromTeams.has(pk.teamId)) {
        fromTeams.set(pk.teamId, { player: pl, teamId: pk.teamId, eventId: pk.eventId });
      }
    }
  }
  return [...fromTeams.values()];
};
const mixedSrc: Sourced[] = [
  byRole("safelane")[0], byRole("mid")[1], byRole("offlane")[0], byRole("support")[1], byRole("support")[3],
].filter(Boolean);
const mixed: PackPlayer[] = mixedSrc.map((x) => x.player);
const mixedChem: ChemistryPlayer[] = mixedSrc.map((x) => ({
  accountId: x.player.accountId,
  teamId: x.teamId,
  eventId: x.eventId,
}));
const heroPool = [...new Set(packs.flatMap((p) => p.signatureHeroes))].slice(0, 6);
const m = scoreTeam(mixed, heroPool, phs, squad, teammates, mixedChem, {});
console.log(`\n[Mixed Draft] ${mixed.map((p) => p.nickname).join(", ")}`);
console.log(`  Base ${round(m.base)}  +Synergy ${round(m.heroSynergy)}  +Chemistry ${round(m.chemistry)}  = OVR ${round(m.teamOvr)}`);
assert(mixed.length === 5, "Mixed: собрано 5 игроков по ролям");
assert(new Set(mixedSrc.map((x) => x.teamId)).size >= 3, "Mixed: игроки из разных команд");
assert(m.chemistry >= 0, "Mixed Chemistry не отрицательная");
assert(m.chemistry <= s.chemistry, "Mixed Chemistry ниже, чем у сыгранного ростера (ожидаемый трейд-офф)");

console.log(failures === 0 ? "\n🎉 все проверки пройдены" : `\n💥 провалов: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

function greedyAssign(players: PackPlayer[], pool: number[], stats: PlayerHeroStats): number {
  const used = new Set<number>();
  let total = 0;
  for (const pl of players) {
    let bestH = -1, bestV = -Infinity;
    for (const h of pool) {
      if (used.has(h)) continue;
      const st = stats[String(pl.accountId)]?.[String(h)];
      const v = st ? (st.winrate * st.games + 10 * 0.5) / (st.games + 10) : 0.5;
      if (v > bestV) { bestV = v; bestH = h; }
    }
    if (bestH >= 0) { used.add(bestH); total += bestV; }
  }
  return total;
}
