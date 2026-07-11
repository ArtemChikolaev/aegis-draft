// Проверка движка забега и генерации паков на мок-данных.
// Запуск: node web/scripts/verify_engine.ts (Node v24 нативный TS).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { RunEngine } from "../src/game/engine.ts";
import { ROLE_SEQUENCE, mixedPack, poolForFormat, teamPack, type RunConfig } from "../src/game/packs.ts";
import { Rng } from "../src/game/rng.ts";
import type { GameData, Pack, Role } from "../src/types/data.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "public", "data");
const read = (f: string) => JSON.parse(readFileSync(join(dataDir, f), "utf8"));
const data: GameData = {
  manifest: read("manifest.json"), events: read("events.json"), heroes: read("heroes.json"),
  packs: read("packs.json"), players: read("players.json"), playerHeroStats: read("playerHeroStats.json"),
  teammates: read("teammates.json"), squadSynergy: read("squadSynergy.json"),
  eventHeroStats: read("eventHeroStats.json"), teamSuccess: read("teamSuccess.json"),
};

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
const round = (n: number) => Math.round(n * 100) / 100;

const base: RunConfig = { draftStyle: "team", format: "last_2y", rerolls: 1, scoring: "event", allocation: "auto" };

// --- poolForFormat ---
assert(poolForFormat(data.packs, data.events, "last_2y").length === 14, "pool last_2y = 14 паков");
assert(poolForFormat(data.packs, data.events, "valve_legacy").length === 16, "pool valve_legacy = 16 паков (TI + Valve Major)");
// Каждый формат имеет >=5 команд → Mixed играбелен на любом.
for (const f of ["last_1y", "last_2y", "last_5y", "valve_legacy"] as const) {
  const teams = new Set(poolForFormat(data.packs, data.events, f).map((p) => p.teamId));
  assert(teams.size >= 5, `формат ${f}: >=5 команд для Mixed (${teams.size})`);
}

// --- детерминизм по сиду ---
const a = new RunEngine(data, base, "seed-123");
const b = new RunEngine(data, base, "seed-123");
assert(a.currentPack.label === b.currentPack.label, "один сид ⇒ один первый пак");
const c = new RunEngine(data, base, "seed-XYZ");
// разные сиды обычно дают разный порядок (не гарантия, но на мок-пуле ожидаемо)
console.log(`  seed-123 → ${a.currentPack.label} · seed-XYZ → ${c.currentPack.label}`);

// --- Team Packs: полный забег авто-пиком ---
const teamRun = new RunEngine(data, base, "run-team");
let guard = 0;
while (!teamRun.isComplete && guard++ < 50) {
  const idx = teamRun.currentPack.candidates.findIndex((_, i) => teamRun.canPick(i));
  assert(idx !== -1, "в каждом паке есть кандидат под открытую роль");
  teamRun.pick(idx);
}
assert(teamRun.isComplete, "Team: ростер заполнен (5 слотов)");
assert(teamRun.players.length === 5, "Team: 5 игроков");
const roles = teamRun.rosterView.map((s) => (s.candidate ? s.role : "—"));
assert(JSON.stringify(roles) === JSON.stringify(["safelane", "mid", "offlane", "support", "support"]), "Team: все роли по слотам заполнены");
const ts = teamRun.score()!;
console.log(`  Team OVR ${round(ts.teamOvr)} (base ${round(ts.base)} +syn ${round(ts.heroSynergy)} +chem ${round(ts.chemistry)}), героев в пуле ${teamRun.heroPool.length}`);
assert(Number.isFinite(ts.teamOvr), "Team: счёт считается");

// --- Mixed Draft: строгий порядок 1→5, игроки из разных команд ---
const mixedRun = new RunEngine(data, { ...base, draftStyle: "mixed", rerolls: 0 }, "run-mixed");
assert(!mixedRun.canPick(1) || mixedRun.currentSlotIndex === 1, "Mixed: до заполнения слота 0 нельзя брать слот 1 (строгий порядок)");
guard = 0;
const mixedTeamIds = new Set<number>();
while (!mixedRun.isComplete && guard++ < 50) {
  const slot = mixedRun.currentSlotIndex;
  assert(new Set(mixedRun.currentPack.candidates.map((c) => c.teamId)).size === 5, `Mixed: пак ${slot} содержит 5 разных команд`);
  assert(mixedRun.canPick(slot), `Mixed: слот ${slot} доступен`);
  const cand = mixedRun.currentPack.candidates[slot];
  if (cand) mixedTeamIds.add(cand.teamId);
  mixedRun.pick(slot);
}
assert(mixedRun.isComplete, "Mixed: ростер заполнен");
assert(mixedTeamIds.size >= 3, `Mixed: итог сохраняет разнообразие команд (${mixedTeamIds.size})`);
const ms = mixedRun.score()!;
console.log(`  Mixed OVR ${round(ms.teamOvr)} (base ${round(ms.base)} +syn ${round(ms.heroSynergy)} +chem ${round(ms.chemistry)})`);

// --- Рерроллы ---
const finite = new RunEngine(data, { ...base, rerolls: 1 }, "run-reroll");
assert(finite.reroll() === true, "реролл #1 доступен (budget 1)");
assert(finite.rerollsLeft === 0, "после реролла остаток 0");
assert(finite.reroll() === false, "реролл #2 запрещён (budget исчерпан)");
const inf = new RunEngine(data, { ...base, rerolls: Infinity }, "run-inf");
let ok = true;
for (let i = 0; i < 20; i++) ok = ok && inf.reroll();
assert(ok && inf.rerollsLeft === Infinity, "Easy: бесконечные рерроллы");

// --- Edge cases реального датасета: subs и неполный Mixed pool ---
const mkPack = (teamId: number, role: Role, accountId = teamId): Pack => ({
  id: `p-${teamId}-${role}-${accountId}`,
  eventId: "event",
  teamId,
  teamName: `Team ${teamId}`,
  players: [{ accountId, nickname: `P${accountId}`, role, ovr: 80, impact: 80, economy: 80, reliability: 80, games: 10 }],
  signatureHeroes: [teamId],
});
const validMixedPool = ROLE_SEQUENCE.map((role, i) => mkPack(i + 1, role));
const strictMixed = mixedPack(validMixedPool, new Rng("strict-five"));
assert(strictMixed.candidates.length === 5, "Mixed edge: ровно 5 кандидатов");
assert(new Set(strictMixed.candidates.map((c) => c.teamId)).size === 5, "Mixed edge: без fallback-повторов команд");
assert(JSON.stringify(strictMixed.candidates.map((c) => c.player.role)) === JSON.stringify(ROLE_SEQUENCE), "Mixed edge: индексы совпадают со слотами");

const fourTeams = validMixedPool.map((pack, i) => i === 4 ? { ...pack, teamId: 4, teamName: "Team 4" } : pack);
let fourTeamsFailed = false;
try { mixedPack(fourTeams, new Rng("four-teams")); } catch { fourTeamsFailed = true; }
assert(fourTeamsFailed, "Mixed edge: fail-fast, если нет 5 уникальных команд");

let missingRoleFailed = false;
try { mixedPack(validMixedPool.filter((pack) => pack.players[0].role !== "mid"), new Rng("missing-mid")); } catch { missingRoleFailed = true; }
assert(missingRoleFailed, "Mixed edge: fail-fast, если отсутствует роль");

const withSubstitutes: Pack = {
  ...validMixedPool[0],
  players: [...validMixedPool.map((pack) => pack.players[0]), { ...validMixedPool[0].players[0], accountId: 99, nickname: "Sub" }],
};
assert(teamPack(withSubstitutes).candidates.length === 6, "Team edge: пак сохраняет 6+ игроков с substitute");

console.log(failures === 0 ? "\n🎉 движок: все проверки пройдены" : `\n💥 провалов: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
