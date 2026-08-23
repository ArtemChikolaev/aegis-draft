// Подготовка к событию (Real Tournament, RT-E срез 1): одна фаза между драфтом и посевом.
// Фиксированный бюджет «недель сборов», каждая тратится на один из двух рычагов — оба бьют
// ровно в те слагаемые, по которым челленджер проигрывает реальному полю (замер BACKLOG T5.6):
//   • сыгровка пары      → виртуальные co-games пары → Chemistry (та же кривая pairChemistryBonus);
//   • тренировка героя   → виртуальные игры игрок×герой → Hero Synergy (та же кривая pairScore).
// Никакого золота, рынка и множителей Tournament Power: бонусы идут в те же слагаемые Team OVR,
// которыми считается и поле, поэтому «честное поле» остаётся честным. Детерминированно: сид
// по-прежнему решает только симуляцию. Числа — см. PREP; калибровка в BACKLOG T5.6 (срез 4).
import { pairKey } from "./score.ts";

export const PREP = {
  /** Недель сборов на одну подготовку. */
  budget: 5,
  /** Виртуальных co-games паре за неделю сыгровки: 175/230 ≈ +0.76 Chemistry (до потолка пары 4). */
  scrimGames: 175,
  /** Виртуальных игр игрок×герой за неделю тренировки: 18/25 ≈ +1.1 Hero Synergy на герое с нуля
   *  (до потолка 1.5 на героя). Заметно дороже сыгровки за очко там, где герой холодный, и
   *  бесполезна, когда игрок уже на потолке — в этом и выбор: сперва закрыть холодных, остаток —
   *  в сыгровку (она почти всегда ровно +0.76, пока пара/сумма не упёрлась в потолок). */
  practiceGames: 18,
} as const;

export type PrepAction =
  | { kind: "scrim"; a: number; b: number }
  | { kind: "practice"; accountId: number; heroId: number };

export interface PrepPlan {
  /** Потраченные недели по порядку: одна запись = одно очко. Повторы допустимы (стак на пару/героя). */
  actions: PrepAction[];
}

export const EMPTY_PREP: PrepPlan = { actions: [] };

/** Наложение подготовки на входы scoreTeam: добавочные игры по парам и по игрок×герой. */
export interface ScoreOverlay {
  /** pairKey(a, b) → добавочные co-games. */
  pairGames: Map<string, number>;
  /** `${accountId}:${heroId}` → добавочные игры на герое. */
  heroGames: Map<string, number>;
}

export function heroGamesKey(accountId: number, heroId: number): string {
  return `${accountId}:${heroId}`;
}

export function prepOverlay(plan: PrepPlan): ScoreOverlay {
  const pairGames = new Map<string, number>();
  const heroGames = new Map<string, number>();
  for (const action of plan.actions) {
    if (action.kind === "scrim") {
      const key = pairKey(action.a, action.b);
      pairGames.set(key, (pairGames.get(key) ?? 0) + PREP.scrimGames);
    } else {
      const key = heroGamesKey(action.accountId, action.heroId);
      heroGames.set(key, (heroGames.get(key) ?? 0) + PREP.practiceGames);
    }
  }
  return { pairGames, heroGames };
}

export function prepPointsLeft(plan: PrepPlan): number {
  return Math.max(0, PREP.budget - plan.actions.length);
}

export function samePrepAction(x: PrepAction, y: PrepAction): boolean {
  if (x.kind === "scrim" && y.kind === "scrim") return pairKey(x.a, x.b) === pairKey(y.a, y.b);
  if (x.kind === "practice" && y.kind === "practice") return x.accountId === y.accountId && x.heroId === y.heroId;
  return false;
}
