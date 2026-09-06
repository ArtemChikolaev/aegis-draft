// Проба вклада умения (T13.25): «меняется ли что-нибудь, если прокачать этот слот».
//
// Зачем: бот в `sim_arcade.ts` оценивает предложения так, что улучшения школы (50–53) всегда бьют
// способности W (30) и E (20) — эти слоты почти весь забег стоят на нуле, и правка умения в них не
// двигает НИ ОДНОГО числа замера. Полноценный второй бот тут не поможет: наивная политика движения
// умирает на 4-м уровне (проверено), а хорошая — это и есть тот бот. Поэтому меряем не победы, а
// вклад: один и тот же сид, один и тот же ввод (стоим на месте, автокаст включён), разница только в
// уровне проверяемого слота. Сравниваем убийства и нанесённый урон за фиксированное время.
//
// Запуск из web/: `npx tsx scripts/sim_kit.ts --hero io --slot w [--runs 12] [--ticks 5400]`
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { IDLE_INPUT, type AbilityKey } from "../src/game/arcade/types.ts";

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const HERO = arg("hero", "juggernaut");
const SLOT = arg("slot", "w") as AbilityKey;
const RUNS = Number(arg("runs", "12"));
const TICKS = Number(arg("ticks", "5400")); // 90 секунд игрового времени
const SEED = arg("seed", "kit");
// Ранг поднимает HP и число врагов. На нулевом ранге сильный герой выкашивает ВЕСЬ спавн, и добавка
// урона не даёт лишних убийств — слот выглядит мёртвым, не будучи им. На высоком ранге насыщения нет.
const RANK = Number(arg("rank", "0"));

function run(level: number, seed: string): { kills: number; hp: number; alive: boolean } {
  const sim = new ArcadeSim(seed, { rank: RANK, hero: HERO, act: "short" });
  // Уровни ставим ДО первого шага: сим читает их каждый тик, ничего пересчитывать не нужно.
  sim.player.abilities[SLOT] = level;
  sim.player.hp = sim.player.stats.maxHp;
  for (let t = 0; t < TICKS && !sim.over; t++) {
    // Экраны выбора закрываем «первым попавшимся», иначе тик стоит и проба вырождается.
    const inp = sim.pending ? { ...IDLE_INPUT, choose: 0 } : sim.shopOpen || sim.neutralOpen || sim.lootOpen ? { ...IDLE_INPUT, act: 1 } : IDLE_INPUT;
    sim.step(inp);
  }
  return { kills: sim.events.kills, hp: Math.max(0, Math.round(sim.player.hp)), alive: !sim.over };
}

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Одна база сидов: доля прироста убийств от прокачки слота. */
function measure(base: string): { pct: number; k0: number; k4: number; aliveOff: number; aliveOn: number } {
  const off: number[] = [], on: number[] = [];
  let aliveOff = 0, aliveOn = 0;
  for (let i = 0; i < RUNS; i++) {
    const seed = `${base}-${i}`;
    const a = run(0, seed), b = run(4, seed);
    off.push(a.kills); on.push(b.kills);
    if (a.alive) aliveOff++;
    if (b.alive) aliveOn++;
  }
  const k0 = avg(off), k4 = avg(on);
  return { pct: k0 > 0 ? ((k4 - k0) / k0) * 100 : 0, k0, k4, aliveOff, aliveOn };
}

// Порог доверия измерен 2026-09-06: один и тот же слот на трёх базах давал −13% / +7% / +2%, то есть
// всё в пределах ±20% — шум. Поэтому по умолчанию гоняем ТРИ базы и печатаем вердикт, а не одно число.
const NOISE = 20;
const bases = Number(arg("bases", "3"));
const res = Array.from({ length: bases }, (_, i) => measure(i === 0 ? SEED : `${SEED}${i}`));
console.log(`вклад слота ${SLOT.toUpperCase()} · ${HERO} · ранг ${RANK} · ${RUNS} прогонов по ${TICKS} тиков · баз сидов ${bases}`);
for (const [i, r] of res.entries()) {
  console.log(`  база ${i + 1}: убийств ${r.k0.toFixed(1)} → ${r.k4.toFixed(1)} · ${(r.pct >= 0 ? "+" : "")}${r.pct.toFixed(0)}% · дожили ${r.aliveOff}/${RUNS} → ${r.aliveOn}/${RUNS}`);
}
const pcts = res.map((r) => r.pct);
const lo = Math.min(...pcts), hi = Math.max(...pcts), mid = avg(pcts);
const verdict = lo > NOISE ? "УВЕРЕННЫЙ ПЛЮС" : hi < -NOISE ? "УВЕРЕННЫЙ МИНУС" : "В ПРЕДЕЛАХ ШУМА (±20%) — не основание для правки";
console.log(`итог: ${(mid >= 0 ? "+" : "")}${mid.toFixed(0)}% (разброс ${lo.toFixed(0)}…${hi.toFixed(0)}%) — ${verdict}`);
