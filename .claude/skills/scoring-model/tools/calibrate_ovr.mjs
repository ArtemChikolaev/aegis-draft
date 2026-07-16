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

// Наблюдаемый OVR = Mid_cur + z·Spread_cur (z-смешивание, см. rating.probit). Восстанавливаем
// статистику z и решаем под целевое распределение — иначе «константа» = цель, а не поправка.
// CUR_* ОБЯЗАНЫ совпадать с rating.Default(): один раз они протухли (остались 73.8/0.426 из
// аффинной эпохи, когда в конфиге уже стояло 74.1/12.3) — инструмент насчитал Spread=0.458
// вместо 13.1, то есть полную чушь. Расходятся — правь здесь.
const CUR_MID = Number(process.env.CAL_MID ?? 73.8);
const CUR_SPREAD = Number(process.env.CAL_SPREAD ?? 13.1);
const zMean = (mean(ourOvr) - CUR_MID) / CUR_SPREAD;
const zSd = sd(ourOvr) / CUR_SPREAD;
const spread = sd(refOvr) / zSd;
const mid = mean(refOvr) - zMean * spread;
console.log(`
=> КОНСТАНТЫ для rating.Default() (текущие: Mid=${CUR_MID} Spread=${CUR_SPREAD};
   переопределить — CAL_MID/CAL_SPREAD в env):
   CalibrationMid:    ${Math.round(mid * 10) / 10}
   CalibrationSpread: ${Math.round(spread * 10) / 10}
   (z: mean=${Math.round(zMean * 1000) / 1000} sd=${Math.round(zSd * 1000) / 1000} -> цель mean=${Math.round(mean(refOvr) * 10) / 10} sd=${Math.round(sd(refOvr) * 10) / 10})`);

// Разброс ВНУТРИ команды — чем тюнится TeamComponentWeight. У 322-0 OVR игрока на 92%
// определяется командой: их пятёрка укладывается в 2.0, при том что компоненты гуляют на
// 4–6. Если наш разброс OVR заметно выше — вес командного члена мал, и на выигравшем
// турнир составе снова выйдет 96 у одного и 71 у другого.
const withinSpread = (packs, field) =>
  mean(packs.map((p) => sd(p.players.map((pl) => pl[field]))));
console.log(`
Разброс ВНУТРИ команды (цель — как у 322-0; тюнится TeamComponentWeight):`);
console.log(`  ${"поле".padEnd(13)} ${"наш".padStart(5)} ${"322-0".padStart(6)}`);
for (const field of ["ovr", "impact", "economy", "reliability"]) {
  const a = withinSpread(ours, field);
  const b = withinSpread(ref, field);
  const flag = field === "ovr" && a > b * 1.4 ? "  ⚠️ командный член слаб" : "";
  console.log(`  ${field.padEnd(13)} ${a.toFixed(1).padStart(5)} ${b.toFixed(1).padStart(6)}${flag}`);
}
// Доля «командного» в дисперсии OVR игрока: 1 − внутрикомандная / общая.
const teamShare = (packs) => {
  const all = packs.flatMap((p) => p.players.map((pl) => pl.ovr));
  const within = mean(packs.map((p) => sd(p.players.map((pl) => pl.ovr)) ** 2));
  return 100 * (1 - within / sd(all) ** 2);
};
console.log(`  доля команды в OVR: наш ${teamShare(ours).toFixed(0)}%  vs 322-0 ${teamShare(ref).toFixed(0)}%`);

console.log(`
Куда попадает драфт (Base + ~8 за synergy/chemistry) в поле ботов (медиана ${BOT_FIELD_MEDIAN}):`);
const bases = basesOf(ours);
for (const [label, p] of [["средний пак", 0.5], ["хороший (p90)", 0.9], ["отличный (p99)", 0.99], ["лучший пак", 1]]) {
  const base = pct(bases, p);
  console.log(`  ${label.padEnd(16)} base=${(Math.round(base * 10) / 10).toString().padStart(5)} -> OVR ${(Math.round((base + 8) * 10) / 10).toString().padStart(5)} -> место ${avgPlace(base + 8).toFixed(1)}`);
}

// ПОТОЛОК ЧЕРРИ-ПИКА — та цифра, которую видит игрок. Строки выше берут пятёрку ОДНОГО пака;
// игра же собирает по игроку из разных, поэтому реальный максимум заметно выше «лучшего пака».
// (На этом я один раз уже ошибся, назвав потолком лучший пак.) 322-0 здесь даёт ~105; игроки
// собирают 102. Если наш потолок сильно ниже — верх шкалы не дотягивает.
function cherryPick(packs) {
  const byRole = {};
  for (const p of packs) for (const pl of p.players) (byRole[pl.role] ??= []).push(pl.ovr);
  for (const r of Object.keys(byRole)) byRole[r].sort((a, b) => b - a);
  const five = [byRole.safelane?.[0], byRole.mid?.[0], byRole.offlane?.[0], byRole.support?.[0], byRole.support?.[1]];
  return five.some((x) => x == null) ? null : { five, base: mean(five) };
}
const ourTop = cherryPick(ours);
const refTop = cherryPick(ref);
console.log(`
Потолок черри-пика (лучший по каждой роли во всём пуле — так и собирает игрок):`);
for (const [label, t] of [["НАШ", ourTop], ["322-0", refTop]]) {
  if (!t) continue;
  console.log(`  ${label.padEnd(6)} ${t.five.join("/")} -> base ${(Math.round(t.base * 10) / 10).toString().padStart(5)} -> Team OVR ~${Math.round((t.base + 9) * 10) / 10}`);
}
console.log(`
Здоровый расклад: средний пак ~середина, хороший ~топ-3, лучший ~1, потолок черри-пика
близко к 322-0. Если ВСЁ упирается в 18 — шкалы разъехались, и никакой тюнинг
synergy/chemistry этого не починит.`);
