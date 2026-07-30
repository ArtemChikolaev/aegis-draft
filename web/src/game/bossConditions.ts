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
import { isActFinale, seasonStage } from "./anteRun.ts";
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

/**
 * Баланс-коэффициенты (часть BALANCE_CONFIG_VERSION — правишь числа, бампай версию в balance.ts).
 * Placeholder (как ECONOMY/TACTICS): точная калибровка — balance spec §10.F, инструмент `npm run sim`.
 * Штрафы соизмеримы с шагом поля (ANTE_FIELD_STEP=3): проигнорировать босса ≈ потерять этап,
 * адаптация его снимает.
 *
 * ПОЧЕМУ ПЛАНКИ БОЛЬШЕ НЕ КОНСТАНТЫ (R12.5). Раньше здесь стояли абсолютные пороги под диапазоны
 * «Base ~78–92, Hero Synergy ~0–8», и это был не промах калибровки, а структурный дефект: все
 * величины, которые судят боссы, монотонно ползут по ходу забега, поэтому КОНСТАНТНЫЙ порог
 * пересекается ровно один раз и делит сезон на «штраф всегда» и «штрафа никогда». Решением он не
 * бывает нигде. Замер на финалах актов (`npm run sim -- 100`, медианы по этапам 4/9/14/19/24):
 *
 * | величина     | этап 4 | 9    | 14   | 19   | 24   | старый порог | что получалось     |
 * |--------------|--------|------|------|------|------|--------------|--------------------|
 * | Base         | 80.8   | 86.2 | 91.0 | 94.6 | 96.6 | ≥ 86         | max штраф → мимо   |
 * | Hero Synergy | 8.9    | 18.1 | 19.5 | 19.5 | 19.5 | ≥ 4          | выполнено всегда   |
 * | разброс OVR  | 14     | 12   | 11   | 9    | 7    | ≤ 8          | штраф → мимо       |
 *
 * Отсюда два разных лечения, и разница между ними принципиальна:
 *  - Base и разброс OVR РАСТУТ/УБЫВАЮТ без потолка в пределах забега ⇒ планка становится рампой по
 *    актам, посаженной на измеренный квартиль (`p25` для Base, `p75` для разброса — наказывается
 *    худшая четверть, то есть пренебрежение рычагом, а не неудача). Рампа продолжается в Династии,
 *    поэтому правило не умрёт снова на 40-м этапе.
 *  - Hero Synergy УПИРАЕТСЯ В ПОТОЛОК (~19.5 уже к третьему акту, см. таблицу) ⇒ никакая рампа его
 *    не спасёт: планку по величине все выполняют по определению. Условие переведено на СТРУКТУРУ
 *    состава — «сколько активных героев вне репертуара своего игрока». Замер: таких героев стабильно
 *    ~2 из 5 на ЛЮБОМ финале (при баре 40 pro-игр), потому что это свойство формы состава, а не его
 *    величины. Ровно поэтому `heroBan` — единственный босс, который никогда не ломался: он тоже
 *    считает штуки, а не очки.
 */
export const BOSSES = {
  /**
   * Планка Base = `ceiling − gap · decay^пройденных актов`, то есть ВОГНУТАЯ рампа: она быстро
   * растёт в начале забега и замедляется к концу.
   *
   * Почему не линейная. Base упирается в потолок качества игрока (99), поэтому линейная рампа его
   * перелетает: замер линейного варианта `79 + 4.5·акт` дал долю выполненных условий
   * `76/79/79/76/2%` — то есть на финале сезона правило превращалось в гарантированный штраф, ровно
   * такая же поломка, как исходная константа, только с другого конца. Вогнутая форма повторяет
   * форму самого Base.
   *
   * Числа посажены на замер (1238 финалов, `npm run sim -- 120`): планки выходят `80/87/91/94/96`
   * по актам, доля выполненных условий `64/45/52/62/64%` — правило живое на КАЖДОМ финале, а не
   * фазовый переключатель.
   */
  baseFloor: {
    ceiling: 99,
    gap: 19,
    decay: 0.65,
    perPoint: 1.2,
    max: 6,
    summand: "base" as Summand,
  },
  /**
   * Структурное условие: герой, на котором назначенный игрок сыграл меньше `minGames` pro-игр,
   * считается «вне репертуара». Первые `tolerated` таких героев штрафа не дают — штрафуются те, что
   * сверх допуска, как штуки (по образцу `heroBan`). Величина Hero Synergy в условие не входит
   * вовсе, поэтому её потолок правилу не мешает.
   *
   * Замер (те же 1238 финалов): при баре 40 игр «вне репертуара» оказывается 0/1/2/3/4/5 героев с
   * частотой `6/19/31/26/12/3%`, и это распределение почти НЕ меняется по актам — потому что это
   * свойство формы состава, а не его величины. Допуск 2 даёт долю выполненных условий
   * `46/59/67/63/61%` по актам. Допуск 0 (любой чужой герой штрафует) давал 6% — правило было бы
   * безусловным штрафом.
   */
  heroSynergyDemand: {
    minGames: 40,
    tolerated: 2,
    perHero: 1.5,
    max: 6,
    summand: "heroSynergy" as Summand,
  },
  /** Chemistry в этот этап не работает. Условие по СВОЕЙ природе безусловное (замер: выполнено в 2%
   *  случаев) — это не планка, а снятие рычага, и адаптация к нему долгосрочная: не вкладываться в
   *  Chemistry, зная о боссе заранее. Но `max` обязан быть сопоставим с остальными боссами, иначе
   *  забег решает не игрок, а то, какое правило выпало: при `max: 8` средний штраф был 5.93 против
   *  0.25–3.3 у прочих. */
  chemistryBlackout: { factor: 1, max: 6, summand: "chemistry" as Summand },
  /** Допустимый разброс OVR СУЖАЕТСЯ по актам: ровный состав к концу забега — норма, а не
   *  достижение (замер: разброс сам падает 14 → 7). `floorSpread` не даёт рампе уйти в ноль в
   *  Династии. Числа посажены на замер: доля выполненных условий `59/55/55/57/64%` — заметно
   *  ровнее, чем у любого фиксированного допуска. */
  unbalancedRoster: {
    startSpread: 14,
    perActTightening: 1.5,
    floorSpread: 5,
    perPoint: 0.8,
    max: 6,
    summand: "base" as Summand,
  },
  heroBan: { perHero: 1.5, max: 6, summand: "heroSynergy" as Summand },
} as const;

/** Сколько актов ПРОЙДЕНО к этапу (0 в первом акте). Рампы боссов считаются отсюда, а не от
 *  абсолютного этапа: акт — это и есть единица прогресса забега, и в Династии счёт продолжается. */
function actsPassed(absoluteStageIndex: number): number {
  return Math.max(0, seasonStage(Math.max(0, absoluteStageIndex)).act - 1);
}

/** Планка Base для этапа. Экспортируется, потому что её читают трое — оценка, подпись в Буткемпе и
 *  тест; второй копии этой арифметики быть не должно. */
export function baseDemandFor(absoluteStageIndex: number): number {
  const cfg = BOSSES.baseFloor;
  return cfg.ceiling - cfg.gap * cfg.decay ** actsPassed(absoluteStageIndex);
}

/** Допустимый разброс OVR для этапа (сужается по актам, не ниже `floorSpread`). */
export function spreadLimitFor(absoluteStageIndex: number): number {
  const cfg = BOSSES.unbalancedRoster;
  return Math.max(
    cfg.floorSpread,
    cfg.startSpread - cfg.perActTightening * actsPassed(absoluteStageIndex),
  );
}

/** Ключ Rng правила: нулевой реролл сохраняет ИСХОДНЫЙ ключ, поэтому смена правила (T5.9) не
 *  сдвигает ни один уже посчитанный забег, сид или golden. */
function bossKey(seed: string, absoluteStageIndex: number, rerolls: number): string {
  const base = `${seed}:boss:stage-${absoluteStageIndex}`;
  return rerolls > 0 ? `${base}:reroll-${rerolls}` : base;
}

/** Босс этапа `absoluteStageIndex` (0-based). null — обычный этап без правила. Детерминизм по
 *  seed+stage; в бесконечной Династии (срез 6) индекс не ограничен и типы циклятся.
 *
 *  `rerolls` — сколько раз правило перекуплено в Буткемпе (T5.9). Каждый реролл выбирает из
 *  правил БЕЗ текущего: платить за «то же самое» игрок не должен, а при пяти правилах случайный
 *  повтор выпадал бы каждый пятый раз. Поэтому цепочка считается по шагам, а не одним роллом. */
export function bossForStage(seed: string, absoluteStageIndex: number, rerolls = 0): BossId | null {
  if (!isActFinale(absoluteStageIndex)) return null;
  let boss = new Rng(bossKey(seed, absoluteStageIndex, 0)).pick(BOSS_IDS);
  for (let n = 1; n <= Math.max(0, Math.floor(rerolls)); n += 1) {
    const others = BOSS_IDS.filter((id) => id !== boss);
    boss = new Rng(bossKey(seed, absoluteStageIndex, n)).pick(others);
  }
  return boss;
}

/** Забаненные героем этап heroId (детерминированы по seed+stage). Пусто, если этап не heroBan. */
export function bannedHeroesForStage(
  seed: string,
  absoluteStageIndex: number,
  heroPool: readonly number[],
  rerolls = 0,
): number[] {
  if (bossForStage(seed, absoluteStageIndex, rerolls) !== "heroBan") return [];
  const shuffled = new Rng(`${bossKey(seed, absoluteStageIndex, rerolls)}:ban`).shuffle([...heroPool]);
  return shuffled.slice(0, Math.min(HERO_BAN_COUNT, shuffled.length)).sort((a, b) => a - b);
}

export interface BossContext {
  /** Абсолютный индекс этапа (0-based). Нужен рампам планок: они растут по актам, поэтому условие
   *  без номера этапа посчитать нельзя — именно отсутствие этого входа и удерживало пороги
   *  константами (R12.5). В Династии индекс не ограничен, рампа продолжается. */
  absoluteStageIndex: number;
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
  /** Pro-игры каждого активного игрока на НАЗНАЧЕННОМ ему герое — вход структурного
   *  `heroSynergyDemand`. Тот же смысл, что у `TacticPlayer.assignedHeroGames`: «это его герой или
   *  случайный?». Ноль для игрока без назначенного героя. */
  assignedHeroGames: number[];
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
  // Мета звёзд: нужен высокий средний Base, иначе штраф. Планка растёт по актам (R12.5), потому что
  // растёт и сам Base. Адаптация — усилить игроков на рынке / Extra training.
  baseFloor: (ctx) => {
    const cfg = BOSSES.baseFloor;
    const threshold = baseDemandFor(ctx.absoluteStageIndex);
    const shortfall = Math.max(0, threshold - ctx.base);
    return {
      met: shortfall <= 0,
      penalty: clampPenalty(shortfall * cfg.perPoint, cfg.max),
      summand: cfg.summand,
      reasonKey: "boss.reason.baseFloor",
      reasonParams: { threshold: Math.round(threshold * 10) / 10 },
    };
  },
  // Мета исполнения на героях: каждый активный герой вне репертуара своего игрока штрафует.
  // Условие СТРУКТУРНОЕ (штуки, не очки) — величина Hero Synergy упирается в потолок уже к третьему
  // акту, поэтому планка по величине выполнялась всеми и всегда (R12.5).
  // Адаптация — hero re-pick под своего игрока, резерв или Hero practice.
  heroSynergyDemand: (ctx) => {
    const cfg = BOSSES.heroSynergyDemand;
    const offRepertoire = ctx.assignedHeroGames.filter((games) => games < cfg.minGames).length;
    // Штрафуются только герои СВЕРХ допуска: пара «чужих» героев в пятёрке — норма любого состава
    // (замер), и наказывать за неё значило бы штрафовать всех и всегда.
    const over = Math.max(0, offRepertoire - cfg.tolerated);
    return {
      met: over === 0,
      penalty: clampPenalty(over * cfg.perHero, cfg.max),
      summand: cfg.summand,
      reasonKey: "boss.reason.heroSynergyDemand",
      reasonParams: { n: offRepertoire, max: cfg.tolerated, games: cfg.minGames },
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
    // Допуск сужается по актам (R12.5): разброс сам падает по ходу забега (14 → 7 по замеру),
    // поэтому фиксированный допуск сначала штрафовал почти всех, а к финалу сезона — никого.
    const maxSpread = spreadLimitFor(ctx.absoluteStageIndex);
    if (ctx.playerOvrs.length === 0) {
      return { met: true, penalty: 0, summand: cfg.summand, reasonKey: "boss.reason.unbalancedRoster", reasonParams: { spread: 0, max: maxSpread } };
    }
    const spread = Math.max(...ctx.playerOvrs) - Math.min(...ctx.playerOvrs);
    const over = Math.max(0, spread - maxSpread);
    return {
      met: over <= 0,
      penalty: clampPenalty(over * cfg.perPoint, cfg.max),
      summand: cfg.summand,
      reasonKey: "boss.reason.unbalancedRoster",
      reasonParams: { spread, max: maxSpread },
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
