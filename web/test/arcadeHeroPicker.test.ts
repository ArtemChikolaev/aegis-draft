import { beforeEach, describe, expect, it } from "vitest";
import { groupHeroes, recentHeroes, toggleFavorite } from "../src/features/arcade/heroPicker.ts";
import { HERO_IDS } from "../src/game/arcade/content/heroes.ts";
import { useArcade } from "../src/state/arcadeStore.ts";

// Избранные и недавние герои на экране подготовки (владелец 2026-09-12).
describe("выбор героя: избранные, недавние, поиск", () => {
  it("недавние — по ленте забегов, новейшие вперёд, без повторов и не больше лимита", () => {
    const history = [{ hero: "axe" }, { hero: "lina" }, { hero: "axe" }, { hero: "nope" }, { hero: "zeus" }, {}, { hero: "sven" }, { hero: "lich" }, { hero: "puck" }];
    expect(recentHeroes(history, HERO_IDS)).toEqual(["axe", "lina", "zeus", "sven", "lich"]);
    expect(recentHeroes(history, HERO_IDS, 2)).toEqual(["axe", "lina"]);
  });

  it("группы: избранные в порядке добавления, недавние без избранных, остальные по ростеру; поиск сужает все", () => {
    const names = (id: string) => ({ axe: "Axe", lina: "Lina", zeus: "Zeus", sven: "Sven" }[id] ?? id);
    const g = groupHeroes(HERO_IDS, ["lina", "axe"], ["axe", "zeus"], "", names);
    expect(g.favorites).toEqual(["lina", "axe"]);
    expect(g.recent).toEqual(["zeus"]);
    expect(g.rest.length).toBe(HERO_IDS.length - 3);
    expect(g.rest).not.toContain("axe");
    const q = groupHeroes(HERO_IDS, ["lina", "axe"], ["axe", "zeus"], "ZE", names);
    expect(q.favorites).toEqual([]); expect(q.recent).toEqual(["zeus"]); expect(q.rest).toEqual([]);
    const byId = groupHeroes(HERO_IDS, [], [], "anti_m", names);
    expect(byId.rest).toEqual(["anti_mage"]);
    // Чужой id в избранном игнорируется.
    expect(groupHeroes(HERO_IDS, ["ghost" as never], [], "", names).favorites).toEqual([]);
  });

  it("toggleFavorite добавляет/убирает и держит потолок", () => {
    expect(toggleFavorite([], "axe")).toEqual(["axe"]);
    expect(toggleFavorite(["axe", "lina"], "axe")).toEqual(["lina"]);
    const many = HERO_IDS.slice(0, 24);
    expect(toggleFavorite(many, "io").length).toBe(24);
    expect(toggleFavorite(many, "io")).toContain("io");
  });

  describe("стор", () => {
    beforeEach(() => { useArcade.setState({ favorites: [] }); });
    it("toggleFavorite в сторе сохраняет список и отбрасывает чужие id", () => {
      useArcade.getState().toggleFavorite("axe");
      useArcade.getState().toggleFavorite("lina");
      expect(useArcade.getState().favorites).toEqual(["axe", "lina"]);
      useArcade.getState().toggleFavorite("axe");
      expect(useArcade.getState().favorites).toEqual(["lina"]);
      useArcade.getState().toggleFavorite("ghost" as never);
      expect(useArcade.getState().favorites).toEqual(["lina"]);
    });
  });
});
