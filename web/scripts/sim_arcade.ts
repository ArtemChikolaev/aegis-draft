// Headless-симулятор Arcade (BACKLOG T13.6): бот-политика поверх чистого сима — кайт от центра
// масс врагов + сбор ближайшего XP-шарда + жадный выбор карточек одной школы. Печатает кривые
// выживаемости по сидам: доля доживших до Рошана, убивших его, победивших; p25/p50/p75 времени.
// Запуск: `npm run sim:arcade -- --runs 200 --seed base --school radiance`.
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, ARCADE_CONFIG_VERSION, TICK_HZ } from "../src/game/arcade/config.ts";
import { UPGRADE_BY_ID } from "../src/game/arcade/content/schools.ts";
import { SHOP_ACT } from "../src/game/arcade/types.ts";
import type { ArcadeInput, Offer, SchoolId } from "../src/game/arcade/types.ts";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1] ?? "");
const RUNS = Number(args.get("runs") ?? 100);
const BASE = args.get("seed") ?? "sim";
const SCHOOL = (args.get("school") ?? "any") as SchoolId | "any";
const RANK = Number(args.get("rank") ?? 0);
const HERO = args.get("hero") ?? "juggernaut";
const ACT = (args.get("act") ?? "full") as "short" | "full";
const MAX_TICKS = TICK_HZ * 60 * 26;

/** Приоритет карточек: своя школа → R → Q → W → E → таланты (первый). */
function pickOffer(offers: Offer[], school: SchoolId | "any"): number {
  const score = (o: Offer): number => {
    if (o.kind === "upgrade") {
      const def = UPGRADE_BY_ID[o.id];
      const rarity = { standard: 0, refined: 1, exotic: 2, arcana: 3 }[o.rarity];
      return (school === "any" || def.school === school ? 50 : 10) + rarity;
    }
    if (o.kind === "ability") return o.key === "r" ? 60 : o.key === "q" ? 40 : o.key === "w" ? 30 : 20;
    return 25;
  };
  let best = 0;
  for (let i = 1; i < offers.length; i++) if (score(offers[i]) > score(offers[best])) best = i;
  return best;
}

/** Политика бота: собирать шарды, держать врагов на дистанции удара, бежать только от давки или при
 *  низком HP, не прижиматься к стенам. Juggernaut — мили: «убегать всегда» = не качаться. */
function botInput(sim: ArcadeSim): ArcadeInput {
  if (sim.pending) return { mx: 0, my: 0, cast: 0, choose: pickOffer(sim.pending, SCHOOL), act: 0 };
  if (sim.shopOpen) {
    // Жадно: самый дорогой доступный предмет, потом закрыть.
    let best = -1, bestPrice = -1;
    sim.shopOffers.forEach((o, i) => { if (o.price <= sim.player.gold && o.price > bestPrice && sim.player.items.length < 6) { best = i; bestPrice = o.price; } });
    return { mx: 0, my: 0, cast: 0, choose: -1, act: best >= 0 ? best + 1 : SHOP_ACT.close };
  }
  const p = sim.player;
  const hpPct = p.hp / p.stats.maxHp;
  let cx = 0, cy = 0, danger = 0, near = 0;
  let nx = 0, ny = 0, nd = Infinity;
  for (const e of sim.enemies) {
    if (!e.alive) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < nd && !e.kind.reflect && !e.kind.structure) { nd = d; nx = dx / (d || 1); ny = dy / (d || 1); }
    if (d < 220) {
      const w = e.kind.boss ? 6 : e.kind.elite ? 3 : e.kind.tone === "brute" ? 2 : 1;
      cx += dx / (d || 1) * w; cy += dy / (d || 1) * w; danger += w * (d < 110 ? 1 : 0.35); near++;
    }
  }
  let fx = 0, fy = 0;
  let sx = 0, sy = 0, sd = Infinity;
  for (const s of sim.shards) {
    if (!s.alive) continue;
    const dx = s.x - p.x, dy = s.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < sd) { sd = d; sx = dx / (d || 1); sy = dy / (d || 1); }
  }
  // Рошан: уклоняемся от ТОЧКИ удара во время телеграфа (как человек), между ударами — бьём.
  // Древний: как босс — идём в дальность удара и бьём (снаряды строения не уклоняемы для бота).
  const rosh = sim.roshan?.alive ? sim.roshan : sim.ancient?.alive ? sim.ancient : null;
  if (rosh && rosh.slamT > 0) {
    const dx = p.x - rosh.slamX, dy = p.y - rosh.slamY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < ARCADE.boss.slamRadius + 30) {
      const ux = d > 1 ? dx / d : 1, uy = d > 1 ? dy / d : 0;
      return { mx: Math.round(ux * 16), my: Math.round(uy * 16), cast: 0, choose: -1, act: 0 };
    }
  }
  if (rosh) retreating = retreating ? hpPct < 0.55 : hpPct < 0.3; else retreating = false;
  const flee = rosh ? retreating : danger > (sim.hero.ranged ? 6 : 9) || hpPct < 0.35;
  if (rosh && !flee) {
    // Босс жив: шарды и толпа вторичны — идём в дальность удара и стоим.
    const dx = rosh.x - p.x, dy = rosh.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const keep = sim.hero.ranged ? p.stats.range * 0.8 : 60;
    if (d > rosh.kind.r + keep) { fx += dx / d * 2; fy += dy / d * 2; }
    const l = Math.sqrt(fx * fx + fy * fy);
    if (l < 0.05) return { mx: 0, my: 0, cast: 0, choose: -1, act: 0 };
    return { mx: Math.round(fx / l * 16), my: Math.round(fy / l * 16), cast: 0, choose: -1, act: 0 };
  }
  // Торговец и bounty-руна: идём, если не бежим.
  if (!flee) {
    for (const spot of [sim.shopkeeper, sim.bounty]) {
      if (!spot.alive) continue;
      const dx = spot.x - p.x, dy = spot.y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d < 700) { fx += dx / d * 1.5; fy += dy / d * 1.5; }
    }
  }
  if (flee && near > 0) {
    const l = Math.sqrt(cx * cx + cy * cy) || 1;
    fx -= cx / l * 2; fy -= cy / l * 2;
    if (sd < 200) { fx += sx * 0.5; fy += sy * 0.5; }
  } else if (sim.hero.ranged) {
    // Дальний бой: держим дистанцию ~70% дальности — подходим, если далеко, отходим, если близко.
    const keep = p.stats.range * 0.7;
    if (sd < 600) { fx += sx * 0.8; fy += sy * 0.8; }
    if (nd > keep + 40 && nd < 600) { fx += nx * 0.6; fy += ny * 0.6; }
    else if (nd < keep - 30 && near > 0) { const l = Math.sqrt(cx * cx + cy * cy) || 1; fx -= cx / l * 1.2; fy -= cy / l * 1.2; }
  } else {
    if (sd < 600) { fx += sx * 1.0; fy += sy * 1.0; }
    if (nd > 60 && nd < 500) { fx += nx * 0.7; fy += ny * 0.7; }
  }
  // Стены: за 240 px до края — тяга к центру.
  const margin = 240;
  if (p.x < margin) fx += (margin - p.x) / margin * 2; if (p.x > ARCADE.world.w - margin) fx -= (p.x - (ARCADE.world.w - margin)) / margin * 2;
  if (p.y < margin) fy += (margin - p.y) / margin * 2; if (p.y > ARCADE.world.h - margin) fy -= (p.y - (ARCADE.world.h - margin)) / margin * 2;
  const l = Math.sqrt(fx * fx + fy * fy);
  if (l < 0.05) return { mx: 0, my: 0, cast: 0, choose: -1, act: 0 };
  return { mx: Math.round(fx / l * 16), my: Math.round(fy / l * 16), cast: 0, choose: -1, act: 0 };
}

interface RunResult { seconds: number; level: number; kills: number; roshan: boolean; reachedRoshan: boolean; outcome: string; schools: string[]; roshanHp: number }
const VERBOSE = args.has("verbose");
/** Гистерезис отхода от босса: ушёл при <30% HP, вернулся при >55%. */
let retreating = false;

const results: RunResult[] = [];
const t0 = performance.now();
for (let i = 0; i < RUNS; i++) {
  const sim = new ArcadeSim(`${BASE}-${i}`, { rank: RANK, hero: HERO, act: ACT });
  const trace = args.get("trace") !== undefined && Number(args.get("trace")) === i;
  let lastHp = 0;
  while (!sim.over && sim.tick < MAX_TICKS) {
    sim.step(botInput(sim));
    if (trace && sim.roshan?.alive && sim.tick % TICK_HZ === 0) {
      const r = sim.roshan, p = sim.player;
      const d = Math.sqrt((r.x - p.x) ** 2 + (r.y - p.y) ** 2);
      console.log(`${(sim.tick / TICK_HZ).toFixed(0)}s d=${d.toFixed(0)} slamT=${r.slamT} slamCd=${r.slamCd} roshHp=${r.hp.toFixed(0)} Δ=${(lastHp - r.hp).toFixed(0)} php=${p.hp.toFixed(0)} atkCd=${p.attackCd} spin=${sim.tick < p.spinUntil} omni=${p.omniLeft} stun=${sim.tick < p.stunUntil}`);
      lastHp = r.hp;
    }
  }
  const o = sim.over ?? { outcome: "timeout", tick: sim.tick, level: sim.player.level, kills: sim.player.kills, gold: sim.player.gold, roshanKilled: sim.roshanKilled, schools: sim.player.schools };
  const roshanHp = sim.roshan ? Math.max(0, sim.roshan.hp / sim.roshan.maxHp) : 1;
  results.push({ seconds: o.tick / TICK_HZ, level: o.level, kills: o.kills, roshan: o.roshanKilled, reachedRoshan: o.tick >= ARCADE.acts[ACT].roshanAt[0], outcome: o.outcome, schools: [...o.schools], roshanHp });
  if (VERBOSE) console.log(`#${i} ${o.outcome} ${(o.tick / TICK_HZ).toFixed(0)}s lvl ${o.level} kills ${o.kills} gold ${o.gold} items ${sim.player.items.map((it) => it.id).join("+")} rosh ${sim.roshan ? `${(roshanHp * 100).toFixed(0)}%` : "—"} hp ${sim.player.hp.toFixed(0)} schools ${[...o.schools].join("+")} ups ${Object.entries(sim.player.upgrades).map(([k, v]) => `${k}:${v.rank}`).join(",")}`);
}
const elapsed = (performance.now() - t0) / 1000;
const q = (arr: number[], k: number) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(k * s.length))]; };
const secs = results.map((r) => r.seconds);
const pct = (f: (r: RunResult) => boolean) => `${(results.filter(f).length / results.length * 100).toFixed(1)}%`;
console.log(`arcade ${ARCADE_CONFIG_VERSION} · runs=${RUNS} · act=${ACT} · hero=${HERO} · school=${SCHOOL} · rank=${RANK} · ${elapsed.toFixed(1)}s`);
console.log(`reached Roshan ${pct((r) => r.reachedRoshan)} · Roshan killed ${pct((r) => r.roshan)} · victory ${pct((r) => r.outcome === "victory")}`);
console.log(`death time p25/p50/p75: ${q(secs, 0.25).toFixed(0)}s / ${q(secs, 0.5).toFixed(0)}s / ${q(secs, 0.75).toFixed(0)}s · level p50 ${q(results.map((r) => r.level), 0.5)} · kills p50 ${q(results.map((r) => r.kills), 0.5)}`);
const byMinute = new Map<number, number>();
for (const r of results) if (r.outcome === "dead") byMinute.set(Math.floor(r.seconds / 60), (byMinute.get(Math.floor(r.seconds / 60)) ?? 0) + 1);
console.log("deaths by minute:", [...byMinute.entries()].sort((a, b) => a[0] - b[0]).map(([m, n]) => `${m}:${n}`).join(" "));
