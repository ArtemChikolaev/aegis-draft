// Проверка движка забега и генерации паков на мок-данных.
// Запуск: node web/scripts/verify_engine.ts (Node v24 нативный TS).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { RunEngine } from "../src/game/engine.ts";
import { poolForFormat, type RunConfig } from "../src/game/packs.ts";
import type { GameData } from "../src/types/data.ts";

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
assert(poolForFormat(data.packs, data.events, "last_2y").length === 4, "pool last_2y = 4 пака");
assert(poolForFormat(data.packs, data.events, "valve_legacy").length === 2, "pool valve_legacy = 2 пака (только TI2024)");

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
  assert(mixedRun.canPick(slot), `Mixed: слот ${slot} доступен`);
  const cand = mixedRun.currentPack.candidates[slot];
  if (cand) mixedTeamIds.add(cand.teamId);
  mixedRun.pick(slot);
}
assert(mixedRun.isComplete, "Mixed: ростер заполнен");
assert(mixedTeamIds.size >= 3, `Mixed: игроки из разных команд (${mixedTeamIds.size})`);
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

console.log(failures === 0 ? "\n🎉 движок: все проверки пройдены" : `\n💥 провалов: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
