// Враги среза 0 — нейтралы леса Radiant + лейн-крипы + элита + Рошан (PRD §5.15).
// Числа — базовые на минуте 0; сим умножает HP/урон по минутам (ARCADE.spawn.*PerMin).
import type { EnemyKind, EnemyKindId } from "../types.ts";

/** Аффиксы элиты (ARCADE.affix): битовая маска в `Enemy.affix`. Быстрый — скорость; Вампир — лечится своим ударом;
 *  Взрывной — после смерти телеграф и взрыв; Морозный — удар замедляет героя; Раскол — после смерти двое слабее. */
export type AffixId = "haste" | "vampiric" | "volatile" | "frost" | "splitter";
export const AFFIX: Readonly<Record<AffixId, number>> = { haste: 1, vampiric: 2, volatile: 4, frost: 8, splitter: 16 };
export const AFFIX_IDS: readonly AffixId[] = ["haste", "vampiric", "volatile", "frost", "splitter"];
/** Дальнобойной элите — без Вампира и Морозного: оба срабатывают на контактном ударе, а стрелок бьёт снарядом (аудит 2026-09-27). */
export const AFFIX_IDS_RANGED: readonly AffixId[] = ["haste", "volatile", "splitter"];

const KINDS: Record<EnemyKindId, EnemyKind> = {
  kobold: { id: "kobold", hp: 14, speed: 86, dmg: 6, r: 10, xp: 1, gold: 1, fromMin: 0, weight: 10, tone: "grunt" },
  kobold_foreman: { id: "kobold_foreman", hp: 32, speed: 72, dmg: 9, r: 12, xp: 2, gold: 1, fromMin: 0.75, weight: 6, tone: "grunt" },
  hill_troll: { id: "hill_troll", hp: 44, speed: 112, dmg: 10, r: 11, xp: 3, gold: 2, fromMin: 1.5, weight: 6, tone: "swift" },
  satyr: { id: "satyr", hp: 74, speed: 70, dmg: 14, r: 13, xp: 4, gold: 2, fromMin: 2.25, weight: 5, tone: "grunt", cast: "purge" },
  ogre: { id: "ogre", hp: 170, speed: 58, dmg: 22, r: 17, xp: 7, gold: 3, fromMin: 3, weight: 4, tone: "brute", cast: "frost_armor" },
  centaur: { id: "centaur", hp: 240, speed: 86, dmg: 26, r: 16, xp: 9, gold: 4, fromMin: 4.5, weight: 3, tone: "brute", cast: "stomp" },
  wildwing: { id: "wildwing", hp: 210, speed: 104, dmg: 18, r: 14, xp: 8, gold: 4, fromMin: 5.5, weight: 3, tone: "swift" },
  // Лес Dire (акт 2+): стрелок-тролль и медведь — новые формы давления: снаряды и крепкий брут.
  dark_troll: {
    id: "dark_troll", hp: 64, speed: 74, dmg: 12, r: 12, xp: 4, gold: 2, fromMin: 1.5, weight: 5, tone: "creep", acts: ["dire", "river"],
    ranged: { range: 230, every: 2.2, speed: 210 },
  },
  hellbear: { id: "hellbear", hp: 330, speed: 72, dmg: 30, r: 19, xp: 11, gold: 5, fromMin: 4, weight: 3, tone: "brute", acts: ["dire", "river"], cast: "clap" },
  lane_creep: { id: "lane_creep", hp: 56, speed: 84, dmg: 10, r: 12, xp: 3, gold: 2, fromMin: 99, weight: 0, tone: "creep" },
  siege_creep: {
    id: "siege_creep", hp: 230, speed: 54, dmg: 30, r: 18, xp: 10, gold: 6, fromMin: 99, weight: 0, tone: "creep",
    ranged: { range: 260, every: 2.6, speed: 190 },
  },
  golem: { id: "golem", hp: 950, speed: 50, dmg: 40, r: 24, xp: 40, gold: 15, elite: true, fromMin: 99, weight: 0, tone: "elite" },
  roshan: { id: "roshan", hp: 4200, speed: 68, dmg: 26, r: 40, xp: 120, gold: 60, boss: true, fromMin: 99, weight: 0, tone: "boss" },
  // Как в Dota: стоит на месте и отражает урон — бой с ним добровольный.
  tormentor: { id: "tormentor", hp: 3600, speed: 0, dmg: 30, r: 26, xp: 90, gold: 45, elite: true, reflect: 0.25, unstoppable: true, fromMin: 99, weight: 0, tone: "elite" },
  // Тотем порчи заражённого лагеря (T13.40): не ходит и не бьёт, сносится ударами; в пул спавна не входит.
  corruption_totem: { id: "corruption_totem", hp: 210, speed: 0, dmg: 0, r: 16, xp: 14, gold: 10, unstoppable: true, totem: true, fromMin: 99, weight: 0, tone: "elite" },
  // Сатир-Осквернитель (T13.41): чемпион лагеря — щит от тотемов, «порыв» по телеграфу, полосы порчи. Поведение — sim.moveDefiler.
  satyr_defiler: { id: "satyr_defiler", hp: 1500, speed: 78, dmg: 22, r: 20, xp: 80, gold: 40, elite: true, fromMin: 99, weight: 0, tone: "elite" },
  // Кентавр-Страж рощи (T13.45): чемпион с телеграфированным рывком; врезается в камень — оглушён. Поведение — sim.moveCentaur.
  centaur_warden: { id: "centaur_warden", hp: 1300, speed: 74, dmg: 24, r: 22, xp: 80, gold: 40, elite: true, fromMin: 99, weight: 0, tone: "elite" },
  // Тролль-Некромант (T13.46): чемпион-призыватель — держит дистанцию, стреляет, поднимает скелетов у костяных идолов. Поведение — sim.moveNecromancer.
  troll_necromancer: { id: "troll_necromancer", hp: 1200, speed: 84, dmg: 18, r: 18, xp: 80, gold: 40, elite: true, fromMin: 99, weight: 0, tone: "elite" },
  bone_idol: { id: "bone_idol", hp: 170, speed: 0, dmg: 0, r: 14, xp: 12, gold: 8, unstoppable: true, totem: true, fromMin: 99, weight: 0, tone: "elite" },
  skeleton_warrior: { id: "skeleton_warrior", hp: 36, speed: 98, dmg: 9, r: 11, xp: 1, gold: 0, fromMin: 99, weight: 0, tone: "creep" },
  // Гром-голем (T13.53): чемпион с зонами и цепью молний; спит в логове. Поведение — sim.moveThunder.
  thunder_golem: { id: "thunder_golem", hp: 1400, speed: 66, dmg: 26, r: 24, xp: 85, gold: 42, elite: true, fromMin: 99, weight: 0, tone: "elite" },
  // Страж переправы (T13.54, только River): щит по фазам и волны через русло. Поведение — sim.moveWarden.
  river_warden: { id: "river_warden", hp: 1300, speed: 90, dmg: 22, r: 22, xp: 85, gold: 42, elite: true, fromMin: 99, weight: 0, tone: "elite", acts: ["river"] },
  // Охотник Dire (T13.55, только Dire): скрытый засадник с меткой-предупреждением. Поведение — sim.moveStalker.
  dire_stalker: { id: "dire_stalker", hp: 1100, speed: 96, dmg: 24, r: 18, xp: 85, gold: 42, elite: true, fromMin: 99, weight: 0, tone: "elite", acts: ["dire"] },
  ancient: {
    id: "ancient", hp: 9000, speed: 0, dmg: 55, r: 58, xp: 300, gold: 200, structure: true, unstoppable: true, fromMin: 99, weight: 0, tone: "boss",
    ranged: { range: 560, every: 1.0, speed: 280 },
  },
  /** Знаменосец патруля (T13.78, «Осада леса»): ходит по тропам между местами с охраной; убит — местная волна слабеет. */
  standard_bearer: { id: "standard_bearer", hp: 260, speed: 84, dmg: 16, r: 14, xp: 24, gold: 12, fromMin: 99, weight: 0, elite: true, tone: "elite" },
  /** Шаман поддержки (T13.79): держится на дистанции, раз в несколько секунд накрывает группу щитом; убит — щит спадает. */
  shaman: { id: "shaman", hp: 150, speed: 66, dmg: 8, r: 14, xp: 16, gold: 8, fromMin: 99, weight: 0, elite: true, tone: "elite" },
  /** Лучник строя (T13.81): держит дистанцию в линии, бьёт залпом по объявленной полосе; хрупкий вблизи. */
  archer: { id: "archer", hp: 90, speed: 72, dmg: 26, r: 12, xp: 8, gold: 4, fromMin: 99, weight: 0, tone: "swift" },
  /** Спороносец (T13.82): медленный и живучий, на ходу и после смерти оставляет лужи спор — убить издалека или выманить с прохода. */
  sporebearer: { id: "sporebearer", hp: 220, speed: 46, dmg: 12, r: 15, xp: 14, gold: 6, fromMin: 99, weight: 0, tone: "brute" },
  // Древние лагеря (M25, ARCADE.ancients): в обычный пул не входят — приходят стаей по расписанию актов Dire и реки.
  black_dragon: { id: "black_dragon", hp: 520, speed: 62, dmg: 30, r: 22, xp: 22, gold: 12, fromMin: 99, weight: 0, tone: "brute", acts: ["dire", "river"], cast: "fireball" },
  granite_golem: { id: "granite_golem", hp: 700, speed: 50, dmg: 34, r: 22, xp: 20, gold: 10, fromMin: 99, weight: 0, tone: "brute", acts: ["dire", "river"], armorAura: 240 },
  ice_shaman: { id: "ice_shaman", hp: 380, speed: 64, dmg: 20, r: 15, xp: 16, gold: 8, fromMin: 99, weight: 0, tone: "creep", acts: ["dire", "river"], cast: "frost_armor" },
  // Вражеские герои (M26, ARCADE.rivals): приходят по расписанию акта, в пул не входят. Числа — на минуте 0, сим растит их
  // по минутам, как лес. Pudge и Axe — вплотную, Lina — с дистанции (держит `rivals.keepMin..keepMax`) и стреляет.
  // HP ×0.75 от первой прикидки (900/1050/700): за `stay` средний билд не успевал добить соперника и терял награду.
  hero_pudge: { id: "hero_pudge", hp: 680, speed: 84, dmg: 26, r: 18, xp: 60, gold: 45, elite: true, rival: true, fromMin: 99, weight: 0, tone: "elite", cast: "meat_hook" },
  hero_axe: { id: "hero_axe", hp: 790, speed: 88, dmg: 24, r: 18, xp: 60, gold: 45, elite: true, rival: true, fromMin: 99, weight: 0, tone: "elite", cast: "berserkers_call" },
  hero_lina: {
    id: "hero_lina", hp: 520, speed: 92, dmg: 20, r: 16, xp: 60, gold: 45, elite: true, rival: true, fromMin: 99, weight: 0, tone: "elite", cast: "laguna_blade",
    ranged: { range: 320, every: 1.5, speed: 280 },
  },
};

/** Одна форма объекта на все виды: те же значения, но все поля на месте и в одном порядке. Литералы выше разной формы
 *  (у кобольда нет `elite`, у голема есть), и чтения `e.kind.totem/boss/ranged/…` в цикле по врагам шли мимо inline-кэша
 *  движка; с единой формой они мономорфны. Значения не меняются — отсутствующее поле остаётся `undefined`.
 *  Новое поле `EnemyKind` добавляй и сюда: иначе у всех видов оно молча `undefined` (T20.3 — `cast` терялся). */
function uniform(k: EnemyKind): EnemyKind {
  return { id: k.id, hp: k.hp, speed: k.speed, dmg: k.dmg, r: k.r, xp: k.xp, gold: k.gold, elite: k.elite, boss: k.boss, structure: k.structure, reflect: k.reflect, unstoppable: k.unstoppable, totem: k.totem, ranged: k.ranged, fromMin: k.fromMin, weight: k.weight, acts: k.acts, tone: k.tone, cast: k.cast, armorAura: k.armorAura, rival: k.rival };
}

export const ENEMY_KINDS = Object.fromEntries(Object.entries(KINDS).map(([id, k]) => [id, uniform(k)])) as Record<EnemyKindId, EnemyKind>;

/** Пул обычного спавна на минуте `min` (виды, доступные к этому времени). */
/** Пороги появления по минутам (по возрастанию): пул меняется только при их пересечении. */
let POOL_STEPS: number[] | null = null;
const POOL_CACHE = new Map<string, readonly EnemyKind[]>();

/** Пул спавна к минуте `min` в акте `act`. Массив общий и кэшированный (сим зовёт его каждый тик) — не мутировать. */
export function spawnPool(min: number, act = "short"): readonly EnemyKind[] {
  // Пороги считаем при первом вызове, а не при импорте: бот меняет `ENEMY_KINDS` флагом `--enemy` до первого сима.
  const steps = POOL_STEPS ?? (POOL_STEPS = [...new Set(Object.values(ENEMY_KINDS).filter((k) => k.weight > 0).map((k) => k.fromMin))].sort((a, b) => a - b));
  let stage = 0;
  while (stage < steps.length && steps[stage] <= min) stage++;
  const key = `${act}:${stage}`;
  const hit = POOL_CACHE.get(key);
  if (hit) return hit;
  const pool: EnemyKind[] = [];
  for (const kind of Object.values(ENEMY_KINDS)) if (kind.weight > 0 && kind.fromMin <= min && (!kind.acts || kind.acts.includes(act))) pool.push(kind);
  POOL_CACHE.set(key, pool);
  return pool;
}
