// Проверка ядра логики на мок-данных (запуск: node web/scripts/verify_game.ts — Node v24 нативный TS).
// Не unit-фреймворк: простые ассерты, чтобы убедиться, что счёт считается и инварианты держатся.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scoreTeam, baseRating } from "../src/game/score.ts";
import { bestAssignment } from "../src/game/assign.ts";
import type { Pack, PlayerHeroStats, SquadSynergy, PackPlayer } from "../src/types/data.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "public", "data");
const read = (f: string) => JSON.parse(readFileSync(join(dataDir, f), "utf8"));

const packs: Pack[] = read("packs.json");
const phs: PlayerHeroStats = read("playerHeroStats.json");
const squad: SquadSynergy = read("squadSynergy.json");

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  console.log(`${cond ? "✅" : "❌"} ${msg}`);
  if (!cond) failures++;
};
const round = (n: number) => Math.round(n * 100) / 100;

// --- Team Packs: берём ростер Team Spirit целиком ---
const spirit = packs.find((p) => p.teamId === 8291895)!;
const s = scoreTeam(spirit.players, spirit.signatureHeroes, phs, squad);
console.log(`\n[Team Packs] ${spirit.teamName}`);
console.log(`  Base ${round(s.base)}  +Synergy ${round(s.heroSynergy)}  +Chemistry ${round(s.chemistry)}  = OVR ${round(s.teamOvr)}`);
console.log(`  Назначение героев:`, s.assignment.byPlayer);

const expectedBase = baseRating(spirit.players);
assert(Math.abs(s.base - expectedBase) < 1e-9, "Base = средний OVR пятёрки");
assert(Object.keys(s.assignment.byPlayer).length === 5, "каждому из 5 игроков назначен герой");
assert(new Set(Object.values(s.assignment.byPlayer)).size === 5, "герои не повторяются (валидный matching)");
assert(Number.isFinite(s.teamOvr), "Team OVR — конечное число");

// matching >= жадности (проверка, что мы не хуже жадного назначения)
const greedyTotal = greedyAssign(spirit.players, spirit.signatureHeroes, phs);
assert(s.assignment.total >= greedyTotal - 1e-9, `matching (${round(s.assignment.total)}) не хуже жадности (${round(greedyTotal)})`);

// --- Mixed Draft: 5 игроков из РАЗНЫХ команд, по одному на роль ---
// PackPlayer не содержит teamId (он на паке) — тащим происхождение отдельно.
type Sourced = { player: PackPlayer; teamId: number };
const byRole = (role: string): Sourced[] => {
  const fromTeams = new Map<number, Sourced>();
  for (const pk of packs) for (const pl of pk.players) if (pl.role === role && !fromTeams.has(pk.teamId)) fromTeams.set(pk.teamId, { player: pl, teamId: pk.teamId });
  return [...fromTeams.values()];
};
const mixedSrc: Sourced[] = [
  byRole("safelane")[0], byRole("mid")[1], byRole("offlane")[0], byRole("support")[1], byRole("support")[3],
].filter(Boolean);
const mixed: PackPlayer[] = mixedSrc.map((x) => x.player);
const heroPool = [...new Set(packs.flatMap((p) => p.signatureHeroes))].slice(0, 6);
const m = scoreTeam(mixed, heroPool, phs, squad);
console.log(`\n[Mixed Draft] ${mixed.map((p) => p.nickname).join(", ")}`);
console.log(`  Base ${round(m.base)}  +Synergy ${round(m.heroSynergy)}  +Chemistry ${round(m.chemistry)}  = OVR ${round(m.teamOvr)}`);
assert(mixed.length === 5, "Mixed: собрано 5 игроков по ролям");
assert(new Set(mixedSrc.map((x) => x.teamId)).size >= 3, "Mixed: игроки из разных команд");
assert(m.chemistry <= s.chemistry, "Mixed Chemistry ниже, чем у сыгранного ростера (ожидаемый трейд-офф)");

console.log(failures === 0 ? "\n🎉 все проверки пройдены" : `\n💥 провалов: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Жадное назначение — для сравнения с оптимальным matching.
function greedyAssign(players: PackPlayer[], pool: number[], phs: PlayerHeroStats): number {
  const used = new Set<number>();
  let total = 0;
  for (const pl of players) {
    let bestH = -1, bestV = -Infinity;
    for (const h of pool) {
      if (used.has(h)) continue;
      const st = phs[String(pl.accountId)]?.[String(h)];
      const v = st ? (st.winrate * st.games + 10 * 0.5) / (st.games + 10) : 0.5;
      if (v > bestV) { bestV = v; bestH = h; }
    }
    if (bestH >= 0) { used.add(bestH); total += bestV; }
  }
  return total;
}
