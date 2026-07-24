// Tactics — пассивные карточки билда Roguelite Run (T6.1, срез 4). Чистый слой ПОВЕРХ score.ts:
// формула `Team OVR = Base + Hero Synergy + Chemistry` не меняется, поэтому ratingModelVersion
// не бампается, golden не двигается и Quick Draft остаётся байт-в-байт (тактик у него нет).
//
// Отличие от покупок рынка (anteEconomy.applied) принципиальное и объясняет, почему это отдельный
// модуль: покупка — разовая дельта, которую достаточно сложить один раз; тактика — УСЛОВИЕ, и её
// вклад обязан пере-вычисляться после каждой замены игрока/героя. Поэтому здесь нет состояния,
// только каталог + чистая функция от текущего ростера.
//
// Набор среза 4 — пять карточек PRD §5.10.3. Wide Pool отложен: его trade-off («вклад редкости
// героев слабее») опирается на редкость из среза 3b, которой ещё нет.
import type { GameData, SquadSynergy } from "../types/data.ts";
import type { Candidate } from "./packs.ts";
import type { RosterSlot } from "./engine.ts";
import { heroStatsForAssignment, pairChemistryBonus, playerHeroGames } from "./score.ts";
import type { Summand, SummandModifiers } from "./anteEconomy.ts";

export type TacticId =
  | "signatureSpecialists"
  | "oldTeammates"
  | "freshProject"
  | "noSuperstars"
  | "lastDance";

/** Сколько пассивных тактик можно держать одновременно (PRD §5.10.1). */
export const TACTIC_SLOTS = 3;

export const TACTIC_IDS: readonly TacticId[] = [
  "signatureSpecialists",
  "oldTeammates",
  "freshProject",
  "noSuperstars",
  "lastDance",
];

/** Сейв мог быть записан набором, которого больше нет: неизвестный id молча отбрасываем,
 *  а не роняем resume (тот же принцип, что у runPersist с несовместимым датасетом). */
export function isTacticId(value: string): value is TacticId {
  return (TACTIC_IDS as readonly string[]).includes(value);
}

/** Placeholder-баланс, как и ECONOMY: точные коэффициенты — за balance spec (§10.F) после T6.3.
 *  Ориентир тот же: этап поля стоит ANTE_FIELD_STEP=3 очка, поэтому одна тактика даёт заметно
 *  меньше этапа — билд из трёх должен примерно покрывать один шаг угрозы, а не обгонять её. */
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
    /** Trade-off: ветераны одной эры сужают рынок — в паках на N карт меньше. */
    marketPackPenalty: 2,
  },
} as const;

/** Слагаемое, которое усиливает карточка — для группировки в UI и подсказки при выборе. */
export const TACTIC_SUMMAND: Record<TacticId, Summand> = {
  signatureSpecialists: "heroSynergy",
  oldTeammates: "chemistry",
  freshProject: "chemistry",
  noSuperstars: "chemistry",
  lastDance: "base",
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

/** Ключ пары независимо от порядка id. */
function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Совместные pro-игры для КАЖДОЙ пары пятёрки, включая нули. score.chemistryPairEdges для этого
 *  не подходит: он отбрасывает пары со слабым вкладом, а Fresh Project целится именно в них. */
function allPairs(accountIds: number[], squad: SquadSynergy): TacticPair[] {
  const games = new Map<string, number>();
  for (const group of squad) {
    if (group.ids.length !== 2) continue;
    games.set(pairKey(group.ids[0], group.ids[1]), group.games);
  }
  const pairs: TacticPair[] = [];
  for (let i = 0; i < accountIds.length; i += 1) {
    for (let j = i + 1; j < accountIds.length; j += 1) {
      const a = accountIds[i];
      const b = accountIds[j];
      pairs.push({ a, b, games: games.get(pairKey(a, b)) ?? 0 });
    }
  }
  return pairs;
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
  const yearByEvent = new Map(data.events.map((event) => [event.id, event.year ?? null]));
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

const EVALUATORS: Record<TacticId, (ctx: TacticContext) => TacticSource[]> = {
  signatureSpecialists,
  oldTeammates,
  freshProject,
  noSuperstars,
  lastDance,
};

/** Вклад экипированных тактик в слагаемые Team OVR. Чистая: те же вход ⇒ тот же выход.
 *  Порядок источников следует TACTIC_IDS, а не порядку экипировки, — иначе одинаковый билд
 *  давал бы разный список в UI в зависимости от того, что игрок взял раньше. */
export function evaluateTactics(equipped: readonly string[], ctx: TacticContext): TacticEvaluation {
  const active = TACTIC_IDS.filter((id) => equipped.includes(id));
  const sources = active.flatMap((id) => EVALUATORS[id](ctx));
  const modifiers = sources.reduce((acc, source) => {
    acc[source.summand] += source.delta;
    return acc;
  }, zero());
  return { modifiers, sources };
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
