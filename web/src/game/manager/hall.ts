// Hall of Legends (T5.5 срез 4) — межкарьерная память организации: каждый игрок, носивший
// цвета орга, и рекорды за все карьеры. По духу 322-0, но БЕЗ шардов и перков: усиление меты —
// отдельная система (решается вместе с T6.4 Stakes), а зал — чистая трофейная комната.
//
// Продуктовое решение среза 4: история сезонов Manager живёт ЗДЕСЬ, в общий careerStore
// (история забегов) сезонные записи не пишутся — форма CareerEntry под забег, не под сезон.
import type { Role } from "../../types/data.ts";
import type { ManagerState } from "./engine.ts";

export interface HallPlayer {
  nickname: string;
  role: Role;
  peakOvr: number;
  seasons: number;
  titles: number;
}

export interface HallState {
  v: 1;
  careers: number;
  seasons: number;
  titles: number;
  finaleTitles: number;
  finaleAppearances: number;
  bestElo: number;
  players: Record<number, HallPlayer>;
}

export function emptyHall(): HallState {
  return { v: 1, careers: 0, seasons: 0, titles: 0, finaleTitles: 0, finaleAppearances: 0, bestElo: 0, players: {} };
}

export function recordCareerStart(hall: HallState): HallState {
  return { ...hall, careers: hall.careers + 1 };
}

/** Зафиксировать завершённый сезон. Зовётся на переходе season → offseason: ростер ещё
 *  сезонный (замены оффсезона не применены), календарь доигран. Мутирует копию. */
export function recordSeason(hall: HallState, state: ManagerState): HallState {
  const titles = state.calendar.filter((slot) => slot.result?.placement === 1).length;
  const finale = state.calendar.find((slot) => slot.kind === "finale");
  const next: HallState = {
    ...hall,
    seasons: hall.seasons + 1,
    titles: hall.titles + titles,
    finaleTitles: hall.finaleTitles + (finale?.result?.placement === 1 ? 1 : 0),
    finaleAppearances: hall.finaleAppearances + (finale?.result ? 1 : 0),
    bestElo: Math.max(hall.bestElo, state.elo),
    players: { ...hall.players },
  };
  for (const player of state.roster) {
    const id = player.candidate.player.accountId;
    const prev = next.players[id];
    next.players[id] = {
      nickname: player.candidate.player.nickname,
      role: player.candidate.player.role,
      peakOvr: Math.max(prev?.peakOvr ?? 0, player.candidate.player.ovr),
      seasons: (prev?.seasons ?? 0) + 1,
      titles: (prev?.titles ?? 0) + titles,
    };
  }
  return next;
}
