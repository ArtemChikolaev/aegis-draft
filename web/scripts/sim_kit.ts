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

function run(level: number, seed: string): { kills: number; hp: number; alive: boolean } {
  const sim = new ArcadeSim(seed, { rank: 0, hero: HERO, act: "short" });
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

const off: number[] = [], on: number[] = [];
let aliveOff = 0, aliveOn = 0;
for (let i = 0; i < RUNS; i++) {
  const seed = `${SEED}-${i}`;
  const a = run(0, seed), b = run(4, seed);
  off.push(a.kills); on.push(b.kills);
  if (a.alive) aliveOff++;
  if (b.alive) aliveOn++;
}
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const k0 = avg(off), k4 = avg(on);
console.log(`вклад слота ${SLOT.toUpperCase()} · ${HERO} · ${RUNS} прогонов по ${TICKS} тиков`);
console.log(`убийств: без умения ${k0.toFixed(1)} · с 4-м уровнем ${k4.toFixed(1)} · разница ${(k4 - k0 >= 0 ? "+" : "")}${(k4 - k0).toFixed(1)} (${k0 > 0 ? (((k4 - k0) / k0) * 100).toFixed(0) : "—"}%)`);
console.log(`дожили до конца пробы: без ${aliveOff}/${RUNS} · с умением ${aliveOn}/${RUNS}`);
