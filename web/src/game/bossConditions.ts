// Boss conditions — особые заранее видимые правила этапа (T5.3, срез 5). Как и Tactics, чистый
// слой ПОВЕРХ score.ts: формула Team OVR не меняется (ratingModelVersion не бампается, golden не
// двигается, Quick Draft чист). Босс не поднимает числовой порог места (PRD §5.9.2 запрещает
// «просто больший target») — он даёт УСЛОВНЫЙ штраф к силе состава на этот этап, если ростер не
// подходит под условие. Штраф пересчитывается от текущего ростера (условие, а не разовая дельта),
// поэтому модуль без состояния, как game/tactics.ts.
//
// «По одному условию на рычаг» (BACKLOG): пять условий бьют по разным слагаемым/свойствам —
// Base, Hero Synergy, Chemistry, форма ростера, hero pool. Каждое меняет оптимальную сборку и
// адаптируется через Market/резерв/Tactics; скрытого контра нет — правило и `до→после` видны в
// Буткемпе заранее (DoD).
import { Rng } from "./rng.ts";
import { isActFinale } from "./anteRun.ts";
import type { Summand } from "./anteEconomy.ts";

export type BossId =
  | "baseFloor"
  | "heroSynergyDemand"
  | "chemistryBlackout"
  | "unbalancedRoster"
  | "heroBan";

export const BOSS_IDS: readonly BossId[] = [
  "baseFloor",
  "heroSynergyDemand",
  "chemistryBlackout",
  "unbalancedRoster",
  "heroBan",
];

/** Боссы стоят на финалах актов и только там (R6.2, PRD §5.9.3): один Boss Tournament на пять
 *  этапов, последний в сезоне — Showdown. Раньше здесь было `BOSS_FIRST_STAGE = 2` — босс на
 *  КАЖДОМ этапе начиная с третьего, то есть три боссовых этапа из пяти. Это противоречило и PRD
 *  («условие показывается заранее» как исключительное событие), и самой идее подготовки: готовиться
 *  к тому, что происходит всегда, незачем. Cadence живёт в `anteRun.isActFinale` (там же длина
 *  акта), поэтому переход на `5 актов × 5 этапов` (R6.1) её не тронет, а в бесконечной Династии
 *  она продолжится сама. */

/** Сколько героев баннит heroBan. Для контекста рынка/резерва — их видно, есть чем заменить. */
const HERO_BAN_COUNT = 12;

export function isBossId(value: string): value is BossId {
  return (BOSS_IDS as readonly string[]).includes(value);
}

/** Баланс-коэффициенты (часть BALANCE_CONFIG_VERSION — правишь числа, бампай версию в balance.ts).
 *  Placeholder (как ECONOMY/TACTICS): точная калибровка — balance spec §10.F, инструмент `npm run sim`.
 *  Штрафы соизмеримы с шагом поля (ANTE_FIELD_STEP=3): проигнорировать босса ≈ потерять этап,
 *  адаптация его снимает. Пороги — под текущие диапазоны слагаемых (Base ~78–92, Hero Synergy
 *  ~0–8, Chemistry ~0–13). */
export const BOSSES = {
  baseFloor: { threshold: 86, perPoint: 1.2, max: 6, summand: "base" as Summand },
  heroSynergyDemand: { threshold: 4, perPoint: 1.6, max: 6, summand: "heroSynergy" as Summand },
  chemistryBlackout: { factor: 1, max: 8, summand: "chemistry" as Summand },
  unbalancedRoster: { maxSpread: 8, perPoint: 0.8, max: 6, summand: "base" as Summand },
  heroBan: { perHero: 1.5, max: 6, summand: "heroSynergy" as Summand },
} as const;

/** Босс этапа `absoluteStageIndex` (0-based). null — обычный этап без правила. Детерминизм по
 *  seed+stage; в бесконечной Династии (срез 6) индекс не ограничен и типы циклятся. */
export function bossForStage(seed: string, absoluteStageIndex: number): BossId | null {
  if (!isActFinale(absoluteStageIndex)) return null;
  return new Rng(`${seed}:boss:stage-${absoluteStageIndex}`).pick(BOSS_IDS);
}

/** Забаненные героем этап heroId (детерминированы по seed+stage). Пусто, если этап не heroBan. */
export function bannedHeroesForStage(
  seed: string,
  absoluteStageIndex: number,
  heroPool: readonly number[],
): number[] {
  if (bossForStage(seed, absoluteStageIndex) !== "heroBan") return [];
  const shuffled = new Rng(`${seed}:boss:stage-${absoluteStageIndex}:ban`).shuffle([...heroPool]);
  return shuffled.slice(0, Math.min(HERO_BAN_COUNT, shuffled.length)).sort((a, b) => a - b);
}

export interface BossContext {
  /** Текущие эффективные слагаемые (после покупок/тактик) — босс судит финальную силу. */
  base: number;
  heroSynergy: number;
  chemistry: number;
  /** OVR игроков активного состава (для формы ростера). */
  playerOvrs: number[];
  /** Активные драфтованные герои (для heroBan). */
  activeHeroes: number[];
  /** Забаненные на этом этапе герои (пусто вне heroBan). */
  bannedHeroes: number[];
}

export interface BossEvaluation {
  bossId: BossId;
  /** Ростер удовлетворяет условию — штрафа нет. */
  met: boolean;
  /** Штраф к силе на этот этап (>= 0), вычитается из Team OVR при сборке поля. */
  penalty: number;
  /** Слагаемое/свойство, вокруг которого построено правило (для UI-подписи). */
  summand: Summand;
  reasonKey: string;
  reasonParams?: Record<string, number>;
}

function clampPenalty(raw: number, max: number): number {
  return Math.min(max, Math.max(0, raw));
}

const EVALUATORS: Record<BossId, (ctx: BossContext) => Omit<BossEvaluation, "bossId">> = {
  // Мета звёзд: нужен высокий средний Base, иначе штраф. Адаптация — усилить игроков на рынке.
  baseFloor: (ctx) => {
    const cfg = BOSSES.baseFloor;
    const shortfall = Math.max(0, cfg.threshold - ctx.base);
    return {
      met: shortfall <= 0,
      penalty: clampPenalty(shortfall * cfg.perPoint, cfg.max),
      summand: cfg.summand,
      reasonKey: "boss.reason.baseFloor",
      reasonParams: { threshold: cfg.threshold },
    };
  },
  // Мета исполнения на героях: нужен Hero Synergy выше порога. Адаптация — re-pick/heroPractice.
  heroSynergyDemand: (ctx) => {
    const cfg = BOSSES.heroSynergyDemand;
    const shortfall = Math.max(0, cfg.threshold - ctx.heroSynergy);
    return {
      met: shortfall <= 0,
      penalty: clampPenalty(shortfall * cfg.perPoint, cfg.max),
      summand: cfg.summand,
      reasonKey: "boss.reason.heroSynergyDemand",
      reasonParams: { threshold: cfg.threshold },
    };
  },
  // Запрет координации: Chemistry в этот этап не работает и штрафует ровно на свою величину.
  // Адаптация — не платить за Chemistry здесь, лить в Base/Hero Synergy.
  chemistryBlackout: (ctx) => {
    const cfg = BOSSES.chemistryBlackout;
    const penalty = clampPenalty(ctx.chemistry * cfg.factor, cfg.max);
    return {
      met: penalty <= 0,
      penalty,
      summand: cfg.summand,
      reasonKey: "boss.reason.chemistryBlackout",
    };
  },
  // Штраф несбалансированному ростеру: слишком большой разброс OVR (звезда + слабые). Адаптация —
  // выровнять состав (перекликается с тактикой No Superstars).
  unbalancedRoster: (ctx) => {
    const cfg = BOSSES.unbalancedRoster;
    if (ctx.playerOvrs.length === 0) {
      return { met: true, penalty: 0, summand: cfg.summand, reasonKey: "boss.reason.unbalancedRoster", reasonParams: { spread: 0, max: cfg.maxSpread } };
    }
    const spread = Math.max(...ctx.playerOvrs) - Math.min(...ctx.playerOvrs);
    const over = Math.max(0, spread - cfg.maxSpread);
    return {
      met: over <= 0,
      penalty: clampPenalty(over * cfg.perPoint, cfg.max),
      summand: cfg.summand,
      reasonKey: "boss.reason.unbalancedRoster",
      reasonParams: { spread, max: cfg.maxSpread },
    };
  },
  // Урезанный hero pool: набор героев вне меты этап. Активный герой из бана штрафует Hero Synergy.
  // Адаптация — re-pick забаненных на рынке или из резерва.
  heroBan: (ctx) => {
    const cfg = BOSSES.heroBan;
    const banned = new Set(ctx.bannedHeroes);
    const hit = ctx.activeHeroes.filter((heroId) => banned.has(heroId)).length;
    return {
      met: hit === 0,
      penalty: clampPenalty(hit * cfg.perHero, cfg.max),
      summand: cfg.summand,
      reasonKey: "boss.reason.heroBan",
      reasonParams: { n: hit },
    };
  },
};

/** Оценить босса против текущего ростера. Чистая: те же вход ⇒ тот же выход. */
export function evaluateBoss(bossId: BossId, ctx: BossContext): BossEvaluation {
  return { bossId, ...EVALUATORS[bossId](ctx) };
}
