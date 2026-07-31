// Презентационная модель карточек Буткемпа (R13.3). Чистый слой между `Offer` и разметкой.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ МОДУЛЬ. Раньше разбор дельт собирался JSX-ом прямо внутри `CampScreen`
// (`deltaRows`), замкнутым на `mods` и `t`. Следствие было не архитектурным, а игровым: раз уж
// разбор «уже под рукой», каждый новый параметр проще было вывести прямо на карточку — и карточка
// выросла в мини-отчёт на шесть строк. Плейтест это и вернул: «столько надписей, из-за этого
// карточки так жёстко растягиваются».
//
// Поэтому здесь — ДАННЫЕ, а не разметка. Карточка берёт из них одно число («брать или нет»),
// инспектор — весь список («почему»). Инвариант PRD §5.10.4 не нарушается: разбор доступен до
// покупки, просто не печатается весь сразу.
import type { SummandValues } from "../../game/anteEconomy.ts";

export type SummandKey = "base" | "heroSynergy" | "chemistry";

/** Порядок разбора совпадает с формулой `Team OVR = Base + Hero Synergy + Chemistry`. */
export const SUMMAND_KEYS: readonly SummandKey[] = ["base", "heroSynergy", "chemistry"];

/** Незначимая дельта. Ниже порога строка не несёт информации и на экран не попадает —
 *  `TEAM OVR 0` в плейтесте был чистым шумом. */
export const DELTA_EPSILON = 0.01;

export interface SummandDelta {
  summand: SummandKey;
  /** Значение с учётом действующих модификаторов забега — ровно то, что видит игрок. */
  from: number;
  to: number;
  delta: number;
}

/**
 * Изменения слагаемых по офферу, уже с модификаторами забега.
 *
 * `extra` — сдвиги поверх score-превью движка (например смена редкости героя): движок считает
 * чистый `score.ts`, а вклад редкости живёт слоем над ним.
 */
export function summandDeltas(
  before: SummandValues,
  after: SummandValues,
  mods: SummandValues,
  extra: Partial<SummandValues> = {},
): SummandDelta[] {
  return SUMMAND_KEYS.flatMap((summand) => {
    const from = before[summand] + mods[summand];
    const to = after[summand] + mods[summand] + (extra[summand] ?? 0);
    const delta = to - from;
    return Math.abs(delta) < DELTA_EPSILON ? [] : [{ summand, from, to, delta }];
  });
}

/**
 * Главная цифра карточки — суммарный сдвиг силы состава.
 *
 * Считается ИЗ ТЕХ ЖЕ дельт, что покажет инспектор, а не отдельной арифметикой: иначе число на
 * карточке и разбор под ней могли бы разойтись — ровно тот класс расхождения, который уже чинили
 * у превью рынка и у описаний предметов.
 */
export function totalDelta(deltas: readonly SummandDelta[]): number {
  return deltas.reduce((sum, row) => sum + row.delta, 0);
}

/** Показывать ли дельту вообще. */
export function isSignificant(delta: number): boolean {
  return Math.abs(delta) >= DELTA_EPSILON;
}
