import { useRun } from "../../state/runStore.ts";

/** Хук: функция heroName(id) по загруженному справочнику героев. */
export function useHeroName(): (id: number) => string {
  const heroes = useRun((s) => s.data?.heroes ?? []);
  const map = new Map(heroes.map((h) => [h.id, h.name]));
  return (id: number) => map.get(id) ?? `#${id}`;
}
