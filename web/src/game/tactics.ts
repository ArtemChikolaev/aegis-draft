// Tactics — пассивные карточки билда Roguelite Run (T6.1, срез 4). Чистый слой ПОВЕРХ score.ts:
// формула `Team OVR = Base + Hero Synergy + Chemistry` не меняется, поэтому ratingModelVersion
// не бампается, golden не двигается и Quick Draft остаётся байт-в-байт (тактик у него нет).
//
// Отличие от покупок рынка (anteEconomy.applied) принципиальное и объясняет, почему это отдельный
// модуль: покупка — разовая дельта, которую достаточно сложить один раз; тактика — УСЛОВИЕ, и её
// вклад обязан пере-вычисляться после каждой замены игрока/героя. Поэтому здесь нет состояния,
// только каталог + чистая функция от текущего ростера.
//
// Набор — шесть карточек PRD §5.10.3: Wide Pool доехал последним (2026-08-30) — его trade-off
// («вклад редкости героев слабее») опирается на редкость среза 3b.
import type { GameData, SquadSynergy } from "../types/data.ts";
import type { Candidate } from "./packs.ts";
import type { RosterSlot } from "./engine.ts";
import { heroStatsForAssignment, pairChemistryBonus, pairGroupIndex, pairKey, playerHeroGames } from "./score.ts";
import type { Summand, SummandModifiers } from "./anteEconomy.ts";
import { chargeFactor } from "./editions.ts";
import { distinctGameplayTags } from "./heroTags.ts";

export type TacticId =
  | "signatureSpecialists"
  | "oldTeammates"
  | "freshProject"
  | "noSuperstars"
  | "lastDance"
  | "widePool";

/** Сколько общих пассивных Tactics/Items можно держать одновременно (PRD §5.10.1). */
export const TACTIC_SLOTS = 5;

export const TACTIC_IDS: readonly TacticId[] = [
  "signatureSpecialists",
  "oldTeammates",
  "freshProject",
  "noSuperstars",
  "lastDance",
  "widePool",
];

/** Сейв мог быть записан набором, которого больше нет: неизвестный id молча отбрасываем,
 *  а не роняем resume (тот же принцип, что у runPersist с несовместимым датасетом). */
export function isTacticId(value: string): value is TacticId {
  return (TACTIC_IDS as readonly string[]).includes(value);
}

/** Баланс-коэффициенты (часть BALANCE_CONFIG_VERSION — правишь числа, бампай версию в balance.ts).
 *  Placeholder, как и ECONOMY: точные коэффициенты — за balance spec (§10.F), инструмент `npm run sim`.
 *  Ориентир тот же: этап поля стоит ANTE_FIELD_STEP=3 очка, поэтому одна тактика даёт заметно
 *  меньше этапа — полный билд должен давать несколько сочетаемых осей, а не обгонять угрозу
 *  одной безусловной суммой. */
export const TACTICS = {
  signatureSpecialists: {
    /** Первые N pro-игр на назначенном герое считаются усиленно (дальше — плато). */
    gamesWindow: 30,
    perPlayer: 0.5,
    /** Звезда играет широко, а не узко: она ломает «специалистов» и стоит штрафа. */
    starOvr: 86,
    starPenalty: 0.5,
  },
  oldTeammates: {
    minGames: 50,
    perPair: 0.4,
    max: 3,
    /** Trade-off: сыгранный состав жалко ломать — замена игрока на рынке дороже. */
    playerCostSurcharge: 2,
  },
  freshProject: {
    /** Виртуальные co-games, которые самая слабая пара набирает за каждый пройденный этап. */
    virtualGamesPerStage: 60,
  },
  noSuperstars: {
    starOvr: 88,
    bonus: 2,
  },
  lastDance: {
    /** Насколько далеко разъезжаются годы событий внутри одной «эпохи». */
    eraSpan: 1,
    minGroup: 3,
    perPlayer: 0.7,
    /** Trade-off: ветераны одной эры сужают рынок — в паках на N карт меньше.
     *
     *  Базовый пак снова равен пяти картам, поэтому возвращаем исходную цену 2: игрок видит три
     *  варианта, а `balancedPackSlots` сохраняет среди них хотя бы один core и один support. */
    marketPackPenalty: 2,
  },
  widePool: {
    /** Порог разных gameplay-архетипов среди НАЗНАЧЕННЫХ героев. Калибровка по замеру: случайная
     *  пятёрка покрывает 8–9 тегов (медиана), 10+ — лишь ~23% случайных наборов, то есть порог
     *  требует намеренного драфта «разные архетипы», а не выдаёт бонус любой пятёрке. */
    minTags: 10,
    perTag: 0.8,
    max: 2.4,
    /** Trade-off: широкий пул размывает узкую заточку — вклад редкости героев слабее.
     *  Ранний билд (все common) не платит ничего, поздний immortal-билд платит дорого:
     *  карта — ранний рычаг, из которого билд честно вырастает (сайдгрейд, не догма). */
    rarityFactor: 0.5,
  },
} as const;

/** Слагаемое, которое усиливает карточка — для группировки в UI и подсказки при выборе. */
export const TACTIC_SUMMAND: Record<TacticId, Summand> = {
  signatureSpecialists: "heroSynergy",
  oldTeammates: "chemistry",
  freshProject: "chemistry",
  noSuperstars: "chemistry",
  lastDance: "base",
  widePool: "heroSynergy",
};

export interface TacticPlayer {
  accountId: number;
  ovr: number;
  /** Год события, из которого взят игрок (эпоха ростера); null, если событие без года. */
  eventYear: number | null;
  /** Pro-игры на НАЗНАЧЕННОМ герое; 0, если герой не назначен. */
  assignedHeroGames: number;
}

export interface TacticPair {
  a: number;
  b: number;
  games: number;
}

/** Всё, от чего зависят условия карточек. Чистые данные — ни движка, ни стора, ни UI. */
export interface TacticContext {
  players: TacticPlayer[];
  /** ВСЕ пары пятёрки, включая несыгранные (games=0) — Fresh Project ищет именно слабейшую. */
  pairs: TacticPair[];
  /** Сколько этапов забега уже пройдено (Fresh Project копит virtual co-games). */
  stagesCleared: number;
  /** НАЗНАЧЕННЫЕ герои пятёрки — Wide Pool считает по ним разные gameplay-архетипы. */
  assignedHeroes: number[];
}

/** Одна причина изменения счёта. PRD §5.10.3 требует показывать источник каждого изменения,
 *  поэтому бонус и штраф одной карточки — две отдельные строки, а не свёрнутая сумма. */
export interface TacticSource {
  tacticId: TacticId;
  summand: Summand;
  delta: number;
  /** Ключ i18n объяснения «почему сработало». */
  reasonKey: string;
  reasonParams?: Record<string, number>;
}

export interface TacticEvaluation {
  modifiers: SummandModifiers;
  sources: TacticSource[];
}

/** Эффекты тактик, действующие не на счёт, а на рынок (trade-off'ы Old Teammates / Last Dance). */
export interface TacticMarketEffects {
  /** Надбавка к цене каждой замены игрока. */
  playerCostSurcharge: number;
  /** Насколько меньше карт в каждом паке рынка. */
  packSizePenalty: number;
}

function zero(): SummandModifiers {
  return { base: 0, heroSynergy: 0, chemistry: 0 };
}

/** Совместные pro-игры для КАЖДОЙ пары пятёрки, включая нули. score.chemistryPairEdges для этого
 *  не подходит: он отбрасывает пары со слабым вкладом, а Fresh Project целится именно в них. */
function allPairs(accountIds: number[], squad: SquadSynergy): TacticPair[] {
  const games = pairGroupIndex(squad);
  const pairs: TacticPair[] = [];
  for (let i = 0; i < accountIds.length; i += 1) {
    for (let j = i + 1; j < accountIds.length; j += 1) {
      const a = accountIds[i];
      const b = accountIds[j];
      pairs.push({ a, b, games: games.get(pairKey(a, b))?.games ?? 0 });
    }
  }
  return pairs;
}

/** Год по событию: контекст пересобирается на каждый оффер рынка, а events за время забега не
 *  меняются — карту держим по ссылке на массив, как pairGroupIndex в score.ts. */
const yearByEventCache = new WeakMap<GameData["events"], Map<string, number | null>>();
function yearByEventIndex(events: GameData["events"]): Map<string, number | null> {
  const cached = yearByEventCache.get(events);
  if (cached) return cached;
  const index = new Map(events.map((event) => [event.id, event.year ?? null]));
  yearByEventCache.set(events, index);
  return index;
}

/** Собрать контекст из реального состояния забега. Живёт здесь, а не в сторе: стор не должен
 *  знать, какие именно поля нужны условиям карточек. */
export function buildTacticContext(
  roster: RosterSlot[],
  assignment: Record<number, number>,
  data: GameData,
  stagesCleared: number,
): TacticContext {
  const phs = heroStatsForAssignment(data);
  const yearByEvent = yearByEventIndex(data.events);
  const active = roster.flatMap((slot): Candidate[] => (slot.candidate ? [slot.candidate] : []));
  const players = active.map((candidate) => {
    const { accountId } = candidate.player;
    const heroId = assignment[accountId];
    return {
      accountId,
      ovr: candidate.player.ovr,
      eventYear: yearByEvent.get(candidate.eventId) ?? null,
      assignedHeroGames: heroId != null ? playerHeroGames(phs, accountId, heroId) : 0,
    };
  });
  return {
    players,
    pairs: allPairs(players.map((player) => player.accountId), data.squadSynergy),
    stagesCleared,
    assignedHeroes: active.flatMap((candidate) => {
      const heroId = assignment[candidate.player.accountId];
      return heroId != null ? [heroId] : [];
    }),
  };
}

/** Signature Specialists: узкие специалисты усиливают Hero Synergy, звёзды его ломают. */
function signatureSpecialists(ctx: TacticContext): TacticSource[] {
  const cfg = TACTICS.signatureSpecialists;
  const sources: TacticSource[] = [];
  const specialised = ctx.players.reduce(
    (sum, player) => sum + Math.min(player.assignedHeroGames, cfg.gamesWindow) / cfg.gamesWindow,
    0,
  );
  const bonus = specialised * cfg.perPlayer;
  if (bonus > 0) {
    sources.push({
      tacticId: "signatureSpecialists",
      summand: "heroSynergy",
      delta: bonus,
      reasonKey: "tactic.reason.signatureSpecialists",
      reasonParams: { n: cfg.gamesWindow },
    });
  }
  const stars = ctx.players.filter((player) => player.ovr > cfg.starOvr).length;
  if (stars > 0) {
    sources.push({
      tacticId: "signatureSpecialists",
      summand: "heroSynergy",
      delta: -stars * cfg.starPenalty,
      reasonKey: "tactic.reason.signatureSpecialistsPenalty",
      reasonParams: { n: stars, ovr: cfg.starOvr },
    });
  }
  return sources;
}

/** Old Teammates: давно сыгранные пары ценнее (trade-off — в TacticMarketEffects). */
function oldTeammates(ctx: TacticContext): TacticSource[] {
  const cfg = TACTICS.oldTeammates;
  const pairs = ctx.pairs.filter((pair) => pair.games >= cfg.minGames).length;
  if (pairs === 0) return [];
  return [{
    tacticId: "oldTeammates",
    summand: "chemistry",
    delta: Math.min(cfg.max, pairs * cfg.perPair),
    reasonKey: "tactic.reason.oldTeammates",
    reasonParams: { n: pairs, games: cfg.minGames },
  }];
}

/** Fresh Project: самая слабая пара «срабатывается» по ходу забега виртуальными co-games.
 *  Прирост считаем той же кривой pairChemistryBonus, что и настоящая Chemistry, — иначе
 *  карточка жила бы по своей арифметике и ломала бы cap. */
function freshProject(ctx: TacticContext): TacticSource[] {
  const cfg = TACTICS.freshProject;
  if (ctx.stagesCleared <= 0 || ctx.pairs.length === 0) return [];
  const weakest = ctx.pairs.reduce((min, pair) => (pair.games < min.games ? pair : min));
  const virtual = ctx.stagesCleared * cfg.virtualGamesPerStage;
  const delta = pairChemistryBonus(weakest.games + virtual) - pairChemistryBonus(weakest.games);
  if (delta <= 0) return [];
  return [{
    tacticId: "freshProject",
    summand: "chemistry",
    delta,
    reasonKey: "tactic.reason.freshProject",
    reasonParams: { games: virtual },
  }];
}

/** No Superstars: ровный состав держится вместе; появление звезды выключает эффект целиком. */
function noSuperstars(ctx: TacticContext): TacticSource[] {
  const cfg = TACTICS.noSuperstars;
  if (ctx.players.length === 0) return [];
  if (ctx.players.some((player) => player.ovr >= cfg.starOvr)) return [];
  return [{
    tacticId: "noSuperstars",
    summand: "chemistry",
    delta: cfg.bonus,
    reasonKey: "tactic.reason.noSuperstars",
    reasonParams: { ovr: cfg.starOvr },
  }];
}

/** Last Dance: игроки одной эпохи усиливают друг друга (trade-off — уже рынок).
 *  Эпоха = год события, из которого взят игрок; окно eraSpan склеивает соседние годы. */
function lastDance(ctx: TacticContext): TacticSource[] {
  const cfg = TACTICS.lastDance;
  const years = ctx.players
    .map((player) => player.eventYear)
    .filter((year): year is number => year != null);
  if (years.length === 0) return [];
  const biggest = years.reduce((best, year) => {
    const size = years.filter((other) => Math.abs(other - year) <= cfg.eraSpan).length;
    return size > best.size ? { year, size } : best;
  }, { year: years[0], size: 0 });
  if (biggest.size < cfg.minGroup) return [];
  return [{
    tacticId: "lastDance",
    summand: "base",
    delta: (biggest.size - cfg.minGroup + 1) * cfg.perPlayer,
    reasonKey: "tactic.reason.lastDance",
    reasonParams: { n: biggest.size, year: biggest.year },
  }];
}

/** Wide Pool: пятёрка, закрывающая много РАЗНЫХ gameplay-архетипов, усиливает Hero Synergy
 *  (trade-off — ослабленный вклад редкости, см. tacticRarityFactor). Порог требует намеренного
 *  «широкого» драфта: случайная пятёрка покрывает 8–9 тегов, бонус начинается с minTags. */
function widePool(ctx: TacticContext): TacticSource[] {
  const cfg = TACTICS.widePool;
  if (ctx.assignedHeroes.length === 0) return [];
  const distinct = distinctGameplayTags(ctx.assignedHeroes);
  if (distinct < cfg.minTags) return [];
  return [{
    tacticId: "widePool",
    summand: "heroSynergy",
    delta: Math.min(cfg.max, (distinct - cfg.minTags + 1) * cfg.perTag),
    reasonKey: "tactic.reason.widePool",
    reasonParams: { n: distinct },
  }];
}

const EVALUATORS: Record<TacticId, (ctx: TacticContext) => TacticSource[]> = {
  signatureSpecialists,
  oldTeammates,
  freshProject,
  noSuperstars,
  lastDance,
  widePool,
};

/** Вклад экипированных тактик в слагаемые Team OVR. Чистая: те же вход ⇒ тот же выход.
 *  Порядок источников следует TACTIC_IDS, а не порядку экипировки, — иначе одинаковый билд
 *  давал бы разный список в UI в зависимости от того, что игрок взял раньше. */
export function evaluateTactics(
  equipped: readonly string[],
  ctx: TacticContext,
  /** Заряды Charged-карт (R13.5): id → заряды. Третий параметр, а не поле контекста: контекст
   *  строится из ростера (`buildTacticContext`) и о состоянии экономики знать не должен. */
  cardCharges: Record<string, number> = {},
): TacticEvaluation {
  const active = TACTIC_IDS.filter((id) => equipped.includes(id));
  const sources = active.flatMap((id) => EVALUATORS[id](ctx).map((source) => ({
    ...source,
    // Заряд усиливает вклад карты; числа на карточке и в разборе идут из этих же sources,
    // поэтому UI масштабируется автоматически.
    delta: source.delta * chargeFactor(cardCharges[id] ?? 0),
  })));
  const modifiers = sources.reduce((acc, source) => {
    acc[source.summand] += source.delta;
    return acc;
  }, zero());
  return { modifiers, sources };
}

/** Числа для подписи карточки тактики — берутся из ТОГО ЖЕ `TACTICS`, что и сам эффект.
 *
 *  Зачем. Описания тактик были статическими строками с плейсхолдером `{n}`, которому никто не
 *  передавал значение: на карточке буквально печаталось «Первые {n} pro-игр». Предметы этот класс
 *  ошибки уже решили (описание собирается из данных эффекта), а тактики остались в стороне.
 *  Здесь тот же принцип: текст и число приходят из одного места, поэтому калибровка не может их
 *  рассинхронизировать. */
export function tacticLabelParams(id: TacticId): Record<string, number> {
  switch (id) {
    case "signatureSpecialists":
      return { n: TACTICS.signatureSpecialists.gamesWindow, star: TACTICS.signatureSpecialists.starOvr };
    case "oldTeammates":
      return { n: TACTICS.oldTeammates.minGames, gold: TACTICS.oldTeammates.playerCostSurcharge };
    case "freshProject":
      return { n: TACTICS.freshProject.virtualGamesPerStage };
    case "noSuperstars":
      return { n: TACTICS.noSuperstars.starOvr, bonus: TACTICS.noSuperstars.bonus };
    case "lastDance":
      return { n: TACTICS.lastDance.minGroup, cards: TACTICS.lastDance.marketPackPenalty };
    case "widePool":
      return { n: TACTICS.widePool.minTags, pct: Math.round((1 - TACTICS.widePool.rarityFactor) * 100) };
  }
}

/** Trade-off'ы тактик, действующие на рынок (не на счёт). */
export function tacticMarketEffects(equipped: readonly string[]): TacticMarketEffects {
  return {
    playerCostSurcharge: equipped.includes("oldTeammates")
      ? TACTICS.oldTeammates.playerCostSurcharge
      : 0,
    packSizePenalty: equipped.includes("lastDance") ? TACTICS.lastDance.marketPackPenalty : 0,
  };
}

/** Trade-off Wide Pool: множитель вклада редкости героев, пока карта экипирована. Безусловный,
 *  как сужение рынка у Last Dance: цена платится за сам выбор карты, а не за сработавшее условие.
 *  Единственная точка чтения фактора — все места сборки силы и превью обязаны звать её. */
export function tacticRarityFactor(equipped: readonly string[]): number {
  return equipped.includes("widePool") ? TACTICS.widePool.rarityFactor : 1;
}
