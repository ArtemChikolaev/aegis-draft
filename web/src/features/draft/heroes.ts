import { useRun } from "../../state/runStore.ts";
import type { Hero } from "../../types/data.ts";

/** Хук: функция heroName(id) по загруженному справочнику героев. */
export function useHeroName(): (id: number) => string {
  const heroes = useRun((s) => s.data?.heroes ?? []);
  const map = new Map(heroes.map((h) => [h.id, h.name]));
  return (id: number) => map.get(id) ?? `#${id}`;
}

/** Хук: функция hero(id) → {name, picture} по справочнику (для портретов). */
export function useHero(): (id: number) => Pick<Hero, "name" | "picture"> {
  const heroes = useRun((s) => s.data?.heroes ?? []);
  const map = new Map(heroes.map((h) => [h.id, h]));
  return (id: number) => {
    const hero = map.get(id);
    return hero ? { name: hero.name, picture: hero.picture } : { name: `#${id}`, picture: "" };
  };
}
