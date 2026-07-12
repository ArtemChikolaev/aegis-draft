// Проверка движка забега (hero-draft: 5 игроков + 5 героев) и генерации паков на моке.
// Запуск: node web/scripts/verify_engine.ts (Node v24 нативный TS).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { RunEngine, HERO_TARGET } from "../src/game/engine.ts";
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
const assertThrows = (fn: () => void, msg: string) => {
  let threw = false;
  try { fn(); } catch { threw = true; }
  assert(threw, msg);
};
const round = (n: number) => Math.round(n * 100) / 100;

const base: RunConfig = { draftStyle: "team", format: "last_2y", rerolls: Infinity, scoring: "event", allocation: "auto" };

// Пройти забег до конца: сначала игроки по открытым ролям, затем герои из паков.
function runToEnd(engine: RunEngine): void {
  let guard = 0;
  while (!engine.isComplete && guard++ < 200) {
    if (engine.rosterFilled < ROLE_SEQUENCE.length) {
      const idx = engine.currentPack.candidates.findIndex((_, i) => engine.canPickPlayer(i));
      if (idx === -1) throw new Error("нет кандидата под открытую роль");
      engine.pickPlayer(idx);
    } else {
      const hid = engine.packHeroes.find((h) => engine.canPickHero(h));
      if (hid == null) { if (!engine.reroll()) throw new Error("нет героя и рероллы кончились"); continue; }
      engine.pickHero(hid);
    }
  }
}

// --- poolForFormat (числа зависят от snapshot; mock ≈14/16, real league-19785 = 24) ---
const pool2y = poolForFormat(data.packs, data.events, "last_2y");
assert(pool2y.length >= 5, `pool last_2y >= 5 паков (${pool2y.length})`);
const poolValve = poolForFormat(data.packs, data.events, "valve_legacy");
if (poolValve.length > 0) assert(poolValve.length >= 5, `pool valve_legacy >= 5 паков (${poolValve.length})`);
for (const f of ["last_1y", "last_2y", "last_5y", "valve_legacy"] as const) {
  const pool = poolForFormat(data.packs, data.events, f);
  if (pool.length === 0) continue;
  const teams = new Set(pool.map((p) => p.teamId));
  assert(teams.size >= 5, `формат ${f}: >=5 команд для Mixed (${teams.size})`);
}

// --- детерминизм по сиду ---
const a = new RunEngine(data, base, "seed-123");
const b = new RunEngine(data, base, "seed-123");
assert(a.currentPack.label === b.currentPack.label, "один сид ⇒ один первый пак");

// --- Team Packs: полный забег (5 игроков + 5 героев) ---
const teamRun = new RunEngine(data, base, "run-team");
runToEnd(teamRun);
assert(teamRun.isComplete, "Team: забег завершён");
assert(teamRun.players.length === 5, "Team: 5 игроков");
assert(teamRun.heroes.length === HERO_TARGET, `Team: драфтовано ${HERO_TARGET} героев`);
assert(new Set(teamRun.heroes).size === teamRun.heroes.length, "Team: герои без дублей");
const roles = teamRun.rosterView.map((s) => (s.candidate ? s.role : "—"));
assert(JSON.stringify(roles) === JSON.stringify(["safelane", "mid", "offlane", "support", "support"]), "Team: все роли по слотам");
const ts = teamRun.score()!;
console.log(`  Team OVR ${round(ts.teamOvr)} (base ${round(ts.base)} +syn ${round(ts.heroSynergy)} +chem ${round(ts.chemistry)}), героев ${teamRun.heroes.length}`);
assert(Number.isFinite(ts.teamOvr), "Team: счёт считается");
// Все драфтованные герои привязаны к игрокам.
assert(Object.keys(ts.assignment.byPlayer).length === 5, "Team: все 5 игроков получили героя");

// --- hero-draft: гейтинг ---
const hd = new RunEngine(data, base, "run-hero");
while (hd.rosterFilled < 5) hd.pickPlayer(hd.currentPack.candidates.findIndex((_, i) => hd.canPickPlayer(i)));
assert(hd.canPickPlayer(0) === false, "после 5 игроков players больше не берутся");
assert(hd.packHeroes.length === HERO_TARGET, "каждый пак предлагает ровно 5 доступных героев");
const outsideHero = data.heroes.find((hero) => !hd.packHeroes.includes(hero.id))!.id;
assert(hd.canPickHero(outsideHero) === false, "нельзя взять героя вне текущего пака");
assertThrows(() => hd.pickHero(outsideHero), "pickHero отклоняет героя вне текущего пака");
const firstHero = hd.packHeroes[0];
hd.pickHero(firstHero);
assert(hd.canPickHero(firstHero) === false, "нельзя взять уже взятого героя");
assert(hd.packHeroes.length === HERO_TARGET, "после пика следующий пак снова предлагает 5 героев");
assert(!hd.packHeroes.includes(firstHero), "следующий пак не повторяет уже взятого героя");
assert(hd.heroesLeft === HERO_TARGET - 1, "heroesLeft уменьшился");
assert(hd.isComplete === false, "забег не завершён при 5 игроках и 1 герое");

// --- ручная привязка (manual) меняет назначение ---
const man = new RunEngine(data, { ...base, allocation: "manual" }, "run-manual");
runToEnd(man);
const someAccount = man.players[0].accountId;
const someHero = man.heroes[0];
man.assign(someAccount, someHero);
assert(man.score()!.assignment.byPlayer[someAccount] === someHero, "manual: назначенный герой закреплён за игроком");
const outsiderAccount = Math.max(...man.players.map((player) => player.accountId)) + 1;
assertThrows(() => man.assign(outsiderAccount, someHero), "manual: нельзя назначить героя игроку вне ростера");
assert(man.manualAssignment[outsiderAccount] === undefined, "manual: отклонённое назначение не меняет состояние");

const autoRun = new RunEngine(data, { ...base, allocation: "auto" }, "run-auto-swap");
runToEnd(autoRun);
const swapA = autoRun.players[0].accountId;
const swapB = autoRun.players[1].accountId;
assertThrows(() => autoRun.swapHeroes(swapA, swapB), "auto: свап героев запрещён");

const manSwap = new RunEngine(data, { ...base, allocation: "manual" }, "run-manual-swap");
runToEnd(manSwap);
const swapAccountA = manSwap.players[0].accountId;
const swapAccountB = manSwap.players[1].accountId;
const heroBeforeA = manSwap.score()!.assignment.byPlayer[swapAccountA];
const heroBeforeB = manSwap.score()!.assignment.byPlayer[swapAccountB];
manSwap.swapHeroes(swapAccountA, swapAccountB);
assert(manSwap.score()!.assignment.byPlayer[swapAccountA] === heroBeforeB, "manual: свап поменял героя у первого игрока");
assert(manSwap.score()!.assignment.byPlayer[swapAccountB] === heroBeforeA, "manual: свап поменял героя у второго игрока");

// --- Mixed Draft: строгий порядок 1→5 (игроки), затем герои ---
const mixedRun = new RunEngine(data, { ...base, draftStyle: "mixed" }, "run-mixed");
assert(!mixedRun.canPickPlayer(1) || mixedRun.currentSlotIndex === 1, "Mixed: до слота 0 нельзя брать слот 1 (строгий порядок)");
const mixedTeamIds = new Set<number>();
while (mixedRun.rosterFilled < 5) {
  const slot = mixedRun.currentSlotIndex;
  assert(new Set(mixedRun.currentPack.candidates.map((c) => c.teamId)).size === 5, `Mixed: пак содержит 5 разных команд`);
  const cand = mixedRun.currentPack.candidates[slot];
  if (cand) mixedTeamIds.add(cand.teamId);
  mixedRun.pickPlayer(slot);
}
runToEnd(mixedRun);
assert(mixedRun.isComplete && mixedRun.heroes.length === HERO_TARGET, "Mixed: завершён с 5 героями");
assert(mixedTeamIds.size >= 3, `Mixed: разнообразие команд (${mixedTeamIds.size})`);

// --- Рерроллы ---
const finite = new RunEngine(data, { ...base, rerolls: 1 }, "run-reroll");
assert(finite.reroll() === true, "реролл #1 доступен (budget 1)");
assert(finite.rerollsLeft === 0, "после реролла остаток 0");
assert(finite.reroll() === false, "реролл #2 запрещён (budget исчерпан)");
const inf = new RunEngine(data, { ...base, rerolls: Infinity }, "run-inf");
let ok = true;
for (let i = 0; i < 20; i++) ok = ok && inf.reroll();
assert(ok && inf.rerollsLeft === Infinity, "Easy: бесконечные рерроллы");

// --- Edge cases паков (mixedPack/teamPack) ---
const mkPack = (teamId: number, role: Role, accountId = teamId): Pack => ({
  id: `p-${teamId}-${role}-${accountId}`, eventId: "event", teamId, teamName: `Team ${teamId}`,
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
