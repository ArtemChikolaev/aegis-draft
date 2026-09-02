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
import {
  evaluateRunPower,
  type RunBuildContext,
  type RunPowerEvaluation,
  type RunPowerState,
} from "../../game/runStrength.ts";

export type SummandKey = "base" | "heroSynergy" | "chemistry";

/** Порядок разбора совпадает с формулой `Team OVR = Base + Hero Synergy + Chemistry`. */
const SUMMAND_KEYS: readonly SummandKey[] = ["base", "heroSynergy", "chemistry"];

/** Незначимая дельта. Ниже порога строка не несёт информации и на экран не попадает —
 *  `TEAM OVR 0` в плейтесте был чистым шумом. */
const DELTA_EPSILON = 0.01;

export interface SummandDelta {
  summand: SummandKey;
  /** Значение с учётом действующих модификаторов забега — ровно то, что видит игрок. */
  from: number;
  to: number;
  delta: number;
}

/** Всё состояние, которое может изменить реальную силу забега после перестройки состава. */
export type CampPowerState = RunPowerState;

/** Постоянная для пары `до → после` часть билда. */
export type CampBuildContext = RunBuildContext;

export type CampPowerEvaluation = RunPowerEvaluation;

export interface CampPowerPreview {
  before: CampPowerEvaluation;
  after: CampPowerEvaluation;
  deltas: SummandDelta[];
  /** Главная цифра карточки: изменение именно Run Power, а не сырого Team OVR. */
  delta: number;
}

/**
 * Полная сила одного возможного состояния Буткемпа.
 *
 * Важно пересчитывать Tactics и Items от героев/назначения этого состояния. Их условия нельзя
 * переносить из `before`: именно так карточка могла обещать +2 OVR, а после покупки выключить
 * тактику и фактически дать −2 Run Power.
 */
export const evaluateCampPower = evaluateRunPower;

/** Одна модель превью для рынка, улучшения редкости и обоих видов резерва. */
export function campPowerPreview(
  beforeState: CampPowerState,
  afterState: CampPowerState,
  build: CampBuildContext,
): CampPowerPreview {
  const before = evaluateRunPower(beforeState, build);
  const after = evaluateRunPower(afterState, build);
  const zero = { base: 0, heroSynergy: 0, chemistry: 0 };
  return {
    before,
    after,
    deltas: summandDeltas(before.values, after.values, zero),
    delta: after.power.total - before.power.total,
  };
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

