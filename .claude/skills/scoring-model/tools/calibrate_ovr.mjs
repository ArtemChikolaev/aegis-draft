#!/usr/bin/env node
// Калибровка шкалы OVR под референс (скилл scoring-model).
//
// ЗАЧЕМ. normalizeByRole переводит перцентиль-ранг в очки OVR аффинно:
//   score = CalibrationMid + (rank - 50) * CalibrationSpread
// Ранг сам по себе шкалы не задаёт (его медиана = 50 по построению), а поле ботов турнира
// живёт на шкале 322-0 (медиана ~84). Пока эти шкалы расходились, максимум Team Base был
// 76.6 против медианы поля 84 — победа была невозможна арифметически (v1.4.0–v1.6.0 крутили
// бонусы ≤11 очков и разрыв в 23 закрыть не могли).
//
// ЧТО ДЕЛАЕТ. Сравнивает распределение OVR наших паков с референсными и печатает константы,
// на которые надо обновить rating.Default(). Считает Spread как отношение sd, Mid — как
// целевое среднее. Прогонять ПОСЛЕ КАЖДОГО рефреша данных: состав пула меняет sd, а значит
// и Spread (после фильтра квалов он уехал 0.678 → 0.606).
//
// ЗАПУСК:
//   node calibrate_ovr.mjs [путь/к/packs.json] [--ref URL_или_путь]
// По умолчанию — web/public/data/packs.json и https://322-0.app/data/packs.json.

import { readFileSync } from "node:fs";

const REF_URL = "https://322-0.app/data/packs.json";
const BOT_FIELD_MEDIAN = 84; // sampleBotStrength в web/src/game/tournament.ts

const args = process.argv.slice(2);
const refIdx = args.indexOf("--ref");
const refSource = refIdx >= 0 ? args[refIdx + 1] : REF_URL;
const oursPath = args.find((a, i) => !a.startsWith("--") && i !== refIdx + 1) ?? "web/public/data/packs.json";

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => Math.sqrt(mean(a.map((x) => (x - mean(a)) ** 2)));
const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.floor(p * (a.length - 1))];

async function loadPacks(source) {
  if (/^https?:/.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`${source}: HTTP ${res.status}`);
    return res.json();
  }
  return JSON.parse(readFileSync(source, "utf8"));
}

const ovrsOf = (packs) => packs.flatMap((p) => p.players.map((pl) => pl.ovr));
const basesOf = (packs) => packs.map((p) => mean(p.players.map((pl) => pl.ovr)));

function row(label, a) {
  const f = (x) => String(Math.round(x * 10) / 10).padStart(5);
  return `${label.padEnd(22)} min=${f(Math.min(...a))} p50=${f(pct(a, 0.5))} p90=${f(pct(a, 0.9))} max=${f(Math.max(...a))} mean=${f(mean(a))} sd=${f(sd(a))}`;
}

// Среднее место команды с данной силой в поле из 18 (аналитически, по sampleBotStrength).
function avgPlace(strength, samples = 20000) {
  const bot = () => {
    const r = Math.random();
    if (r < 0.06) return 93 + ((Math.random() * 4) | 0);
    if (r < 0.2) return 89 + ((Math.random() * 4) | 0);
    if (r < 0.48) return 84 + ((Math.random() * 5) | 0);
    if (r < 0.76) return 80 + ((Math.random() * 4) | 0);
    return 76 + ((Math.random() * 4) | 0);
  };
  let total = 0;
  for (let s = 0; s < samples / 17; s++) {
    let above = 0;
    for (let i = 0; i < 17; i++) if (bot() > strength) above++;
    total += above + 1;
  }
  return total / (samples / 17);
}

const [ours, ref] = await Promise.all([loadPacks(oursPath), loadPacks(refSource)]);
const ourOvr = ovrsOf(ours);
const refOvr = ovrsOf(ref);

console.log(`наши паки: ${ours.length} (${oursPath})`);
console.log(`референс:  ${ref.length} (${refSource})\n`);
console.log(row("НАШ player OVR", ourOvr));
console.log(row("РЕФЕРЕНС player OVR", refOvr));
console.log(row("НАШ team base", basesOf(ours)));
console.log(row("РЕФЕРЕНС team base", basesOf(ref)));

// Наблюдаемый OVR уже прошёл текущую калибровку. Восстанавливаем ранг, чтобы константы
// не зависели от того, с какими значениями собран текущий датасет.
const spread = sd(refOvr) / sd(ourOvr);
const mid = mean(refOvr);
console.log(`
=> КОНСТАНТЫ для rating.Default() (умножаются на ТЕКУЩИЕ, если датасет уже калиброван):
   CalibrationMid:    ${Math.round(mid * 10) / 10}
   CalibrationSpread: ${Math.round(spread * 1000) / 1000}  (= sd_реф ${Math.round(sd(refOvr) * 10) / 10} / sd_наш ${Math.round(sd(ourOvr) * 10) / 10})`);

console.log(`
Куда попадает драфт (Base + ~8 за synergy/chemistry) в поле ботов (медиана ${BOT_FIELD_MEDIAN}):`);
const bases = basesOf(ours);
for (const [label, p] of [["средний пак", 0.5], ["хороший (p90)", 0.9], ["отличный (p99)", 0.99], ["лучший", 1]]) {
  const base = pct(bases, p);
  console.log(`  ${label.padEnd(16)} base=${(Math.round(base * 10) / 10).toString().padStart(5)} -> OVR ${(Math.round((base + 8) * 10) / 10).toString().padStart(5)} -> место ${avgPlace(base + 8).toFixed(1)}`);
}
console.log(`
Здоровый расклад: средний пак ~середина, хороший ~топ-3, лучший ~1. Если ВСЁ упирается
в 18 — шкалы разъехались, и никакой тюнинг synergy/chemistry этого не починит.`);
