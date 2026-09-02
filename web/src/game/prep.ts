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
  /** Разборов соперника (срез 2): неделя на демки ОДНОГО состава поля — его сигнатурные герои
   *  прочитаны, Hero Synergy состава режется на scoutSynergyCut (у топов это −3…−3.7). Не больше
   *  двух: иначе подготовка превращалась бы в вычёркивание поля, а не в выбор «усилиться против
   *  всех (+0.76) или ослабить конкретного (лидера — ради титула, соседа — ради топ-8)».
   *  Альтернатива «вырезать героя из сигнатурных пулов всего поля» отвергнута замером: при 10
   *  сигнатурках на состав назначение переезжает почти бесплатно (лучший герой −0.14 к среднему). */
  scoutMax: 2,
  scoutSynergyCut: 0.5,
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
  | { kind: "practice"; accountId: number; heroId: number }
  /** Разбор соперника: состав поля (id пака) теряет долю Hero Synergy (свой счёт не меняет). */
  | { kind: "scout"; teamId: string };

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
    } else if (action.kind === "practice") {
      const key = heroGamesKey(action.accountId, action.heroId);
      heroGames.set(key, (heroGames.get(key) ?? 0) + PREP.practiceGames);
    }
    // scout — работает на поле, не на своём счёте (см. scoutedTeams).
  }
  return { pairGames, heroGames };
}

export function prepPointsLeft(plan: PrepPlan): number {
  return Math.max(0, PREP.budget - plan.actions.length);
}

/** Разобранные составы поля — то, что режет их Hero Synergy (game/realTournament.ts). */
export function scoutedTeams(plan: PrepPlan): ReadonlySet<string> {
  return new Set(plan.actions.flatMap((action) => (action.kind === "scout" ? [action.teamId] : [])));
}
