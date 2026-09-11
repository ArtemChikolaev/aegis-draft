// Порядок героев на экране подготовки Аркады (владелец 2026-09-12: «избранное, чтобы не искать каждый раз во всём списке»).
// Чистая функция: избранные → недавние (по ленте забегов) → остальные; поиск по имени сужает всё. UI — ArcadeScreen.
import type { HeroId } from "../../game/arcade/content/heroes.ts";

export interface HeroPickerGroups {
  favorites: HeroId[];
  recent: HeroId[];
  rest: HeroId[];
}

/** Недавние герои по ленте забегов (новейшие вперёд), без повторов и без избранных. */
export function recentHeroes(history: readonly { hero?: string }[], all: readonly HeroId[], limit = 5): HeroId[] {
  const out: HeroId[] = [];
  for (const e of history) {
    const h = e.hero as HeroId | undefined;
    if (h && all.includes(h) && !out.includes(h)) out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}

/** Группы карточек: избранные (в порядке добавления), недавние, остальные в порядке ростера; `query` фильтрует по имени/id. */
export function groupHeroes(all: readonly HeroId[], favorites: readonly HeroId[], recent: readonly HeroId[], query: string, nameOf: (id: HeroId) => string): HeroPickerGroups {
  const q = query.trim().toLowerCase();
  const matches = (id: HeroId) => !q || id.includes(q) || nameOf(id).toLowerCase().includes(q);
  const fav = favorites.filter((id) => all.includes(id) && matches(id));
  const rec = recent.filter((id) => !fav.includes(id) && matches(id));
  const rest = all.filter((id) => !fav.includes(id) && !rec.includes(id) && matches(id));
  return { favorites: fav, recent: rec, rest };
}

export function toggleFavorite(favorites: readonly HeroId[], id: HeroId, cap = 24): HeroId[] {
  if (favorites.includes(id)) return favorites.filter((h) => h !== id);
  return [...favorites, id].slice(-cap);
}
