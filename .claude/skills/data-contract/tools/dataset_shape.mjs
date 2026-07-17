#!/usr/bin/env node
// Форма собранного датасета: размеры файлов, покрытие форматов, состав squadSynergy.
// Гоняется в CI перед коммитом данных (data-refresh) — сырьё OpenDota живёт в кэше джоба,
// локально датасет не пересобрать, поэтому проверять форму можно только здесь.
//
// Отвечает на вопросы, которые нельзя решать на глаз:
//  · сколько весит squadSynergy после перехода на группы 2–5 (нужен ли порог отсечения);
//  · вернулись ли старые TI в valve_legacy и сколько там команд на событие (квалы внутри
//    leagueId дают 47/событие вместо 16–20 — так ловится их протечка);
//  · не раздулся ли какой-то файл до неприличия.
//
// ЗАПУСК: node dataset_shape.mjs [каталог данных]   (по умолчанию web/public/data)

import { readFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "web/public/data";
const load = (name) => JSON.parse(readFileSync(join(dir, name), "utf8"));
const mb = (bytes) => (bytes / 1e6).toFixed(1);

console.log("=== размеры файлов ===");
let total = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const size = statSync(join(dir, file)).size;
  total += size;
  const flag = size > 15e6 ? "  ⚠️ >15 МБ" : "";
  console.log(`  ${file.padEnd(28)} ${mb(size).padStart(6)} МБ${flag}`);
}
console.log(`  ${"ИТОГО".padEnd(28)} ${mb(total).padStart(6)} МБ`);

console.log("\n=== squadSynergy: состав по размеру группы ===");
const squad = load("squadSynergy.json");
const bySize = {};
for (const g of squad) bySize[g.ids.length] = (bySize[g.ids.length] ?? 0) + 1;
console.log(`  записей: ${squad.length}`);
for (const size of Object.keys(bySize).sort()) {
  console.log(`    группы по ${size}: ${String(bySize[size]).padStart(7)}`);
}
const games = squad.map((g) => g.games).sort((a, b) => a - b);
const q = (p) => games[Math.floor(p * (games.length - 1))];
console.log(`  совместных игр: min=${games[0]} p50=${q(0.5)} p90=${q(0.9)} max=${games[games.length - 1]}`);
// Порог отсечения имеет смысл только если мелочь реально доминирует по объёму.
const tiny = squad.filter((g) => g.games < 5).length;
console.log(`  групп с <5 игр: ${tiny} (${((100 * tiny) / squad.length).toFixed(0)}%) — вклад в Chemistry <0.02, невидим`);

// Пул героев пака. Клиент показывает 5 случайных из этого списка (engine.withFullHeroOffer),
// поэтому список ОБЯЗАН быть шире показа — иначе пятёрка всегда одна и та же. Ловит регрессию,
// из-за которой Anti-Mage выпадал в 0.9% паков против ~2% у 322-0.
console.log("\n=== signatureHeroes: пул героев пака (клиент показывает 5 случайных) ===");
const packsForHeroes = load("packs.json");
const heroesRef = load("heroes.json");
const heroName = Object.fromEntries(heroesRef.map((h) => [h.id, h.name]));
const poolSizes = {};
for (const p of packsForHeroes) {
  const n = new Set(p.signatureHeroes).size;
  poolSizes[n] = (poolSizes[n] ?? 0) + 1;
}
console.log(`  размер пула на пак: ${JSON.stringify(poolSizes)}`);
// Отдельные паки с пулом <10 — норма: ростер, отыгравший за турнир всего 5 разных героев,
// десяти дать не может. Тревожно, только если таких много — значит пайплайн режет пул.
const narrow = packsForHeroes.filter((p) => new Set(p.signatureHeroes).size < 10).length;
const narrowShare = narrow / packsForHeroes.length;
console.log(`  паков с пулом <10: ${narrow} (${(100 * narrowShare).toFixed(1)}%) — норма, если ростер отыграл мало разных героев`);
if (narrowShare > 0.15) {
  console.log("  ⚠️ таких паков много — похоже, пул режется в пайплайне (signaturePoolSize)");
}
const heroFreq = {};
for (const p of packsForHeroes) for (const h of new Set(p.signatureHeroes)) heroFreq[h] = (heroFreq[h] ?? 0) + 1;
const freqs = Object.entries(heroFreq).map(([h, c]) => ({ h: Number(h), share: c / packsForHeroes.length }));
freqs.sort((a, b) => b.share - a.share);
const rare = freqs.filter((f) => f.share < 0.01);
console.log(`  героев в пуле: ${freqs.length} из ${heroesRef.length}`);
console.log(`  самый частый: ${heroName[freqs[0].h]} ${(100 * freqs[0].share).toFixed(1)}%  ·  медиана ${(100 * freqs[Math.floor(freqs.length / 2)].share).toFixed(1)}%`);
console.log(`  героев с шансом <1% на пак: ${rare.length}${rare.length > 5 ? "  ⚠️ у 322-0 таких 2" : ""}`);
if (rare.length) console.log(`    редчайшие: ${rare.slice(-5).map((f) => `${heroName[f.h]} ${(100 * f.share).toFixed(1)}%`).join(", ")}`);

console.log("\n=== события по форматам ===");
const events = load("events.json");
const packs = load("packs.json");
const packsByEvent = {};
for (const p of packs) packsByEvent[p.eventId] = (packsByEvent[p.eventId] ?? 0) + 1;
const formats = {};
for (const e of events) for (const f of e.formats ?? []) (formats[f] ??= []).push(e);
for (const f of Object.keys(formats).sort()) {
  const years = formats[f].map((e) => e.year).filter(Boolean);
  console.log(`  ${f.padEnd(13)} событий=${String(formats[f].length).padStart(3)}  годы ${Math.min(...years)}–${Math.max(...years)}`);
}

// valve_legacy — главный подозреваемый на протечку квалов: у них квалы сидят под тем же
// leagueId, и реальный TI даёт 16–20 команд, а TI с квалами — 40–70.
console.log("\n=== valve_legacy: команд на событие (реальный TI = 16–20) ===");
const legacy = (formats["valve_legacy"] ?? []).slice().sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
for (const e of legacy) {
  const n = packsByEvent[e.id] ?? 0;
  const flag = n > 24 ? "  ⚠️ похоже на квалы внутри leagueId" : "";
  console.log(`  ${String(e.year ?? "?").padEnd(5)} ${String(n).padStart(3)} команд  ${e.name}${flag}`);
}
