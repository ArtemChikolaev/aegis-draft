import { useMemo } from "react";
import { useRun } from "../../state/runStore.ts";
import type { Hero } from "../../types/data.ts";

const NO_HEROES: Hero[] = [];

/** Индекс героев по id — один на датасет, а не на каждый рендер каждого компонента: хуки ниже
 *  зовут ~15 компонентов (карточки, пентагон, лагерь), и пересобирать Map на 120+ героев при
 *  каждом их рендере было лишней работой. Стабильный пустой массив — чтобы селектор не отдавал
 *  новую ссылку, пока данные не загружены. */
function useHeroIndex(): Map<number, Hero> {
  const heroes = useRun((s) => s.data?.heroes ?? NO_HEROES);
  return useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes]);
}

/** Хук: функция heroName(id) по загруженному справочнику героев. */
export function useHeroName(): (id: number) => string {
  const map = useHeroIndex();
  return (id: number) => map.get(id)?.name ?? `#${id}`;
}

/** Хук: функция hero(id) → {name, picture} по справочнику (для портретов). */
export function useHero(): (id: number) => Pick<Hero, "name" | "picture"> {
  const map = useHeroIndex();
  return (id: number) => {
    const hero = map.get(id);
    return hero ? { name: hero.name, picture: hero.picture } : { name: `#${id}`, picture: "" };
  };
}
