import type { Hero, PlayerHeroStats } from "../../types/data.ts";

/** Строка справочника героев: сколько на герое играли и насколько он распространён. */
export interface HeroPopularityRow {
  id: number;
  name: string;
  picture: string;
  /** Суммарно про-игр на герое во всём датасете. */
  games: number;
  /** Сколько РАЗНЫХ игроков его брали — «широта», отдельно от общего числа игр. */
  players: number;
  /** Доля от всех сыгранных игр (0..1). */
  share: number;
  /** Винрейт, взвешенный по играм (0..1). null — если игр нет. */
  winrate: number | null;
}

export type HeroSort = "games" | "players" | "winrate";

/**
 * Популярность героев из lifetime-статистики `careerPlayerHeroStats`
 * (`{accountId: {heroId: {games, winrate}}}`).
 *
 * Винрейт складываем ВЗВЕШЕННО по играм, а не средним от средних: у игрока с 3 играми и у
 * игрока с 300 вклад не может быть одинаковым. Герои без единой игры остаются в списке с
 * нулями — справочник показывает всех, иначе непонятно, что герой существует и его не берут.
 */
export function heroPopularity(heroes: Hero[], stats: PlayerHeroStats): HeroPopularityRow[] {
  const games = new Map<number, number>();
  const wins = new Map<number, number>();
  const players = new Map<number, number>();

  for (const byHero of Object.values(stats)) {
    for (const [heroId, stat] of Object.entries(byHero)) {
      const id = Number(heroId);
      if (!Number.isFinite(id) || stat.games <= 0) continue;
      games.set(id, (games.get(id) ?? 0) + stat.games);
      wins.set(id, (wins.get(id) ?? 0) + stat.games * (stat.winrate ?? 0));
      players.set(id, (players.get(id) ?? 0) + 1);
    }
  }

  const total = [...games.values()].reduce((sum, value) => sum + value, 0);
  return heroes.map((hero) => {
    const heroGames = games.get(hero.id) ?? 0;
    return {
      id: hero.id,
      name: hero.name,
      picture: hero.picture,
      games: heroGames,
      players: players.get(hero.id) ?? 0,
      share: total > 0 ? heroGames / total : 0,
      winrate: heroGames > 0 ? (wins.get(hero.id) ?? 0) / heroGames : null,
    };
  });
}

/** Сортировка справочника. Вторичный ключ — всегда games: иначе строки с равным
 *  винрейтом/числом игроков прыгают между рендерами. */
export function sortHeroes(rows: HeroPopularityRow[], sort: HeroSort): HeroPopularityRow[] {
  const by: Record<HeroSort, (row: HeroPopularityRow) => number> = {
    games: (row) => row.games,
    players: (row) => row.players,
    winrate: (row) => row.winrate ?? -1,
  };
  const key = by[sort];
  return [...rows].sort((left, right) => key(right) - key(left) || right.games - left.games);
}
