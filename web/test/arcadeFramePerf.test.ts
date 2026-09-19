// Мелкий перф кадра Аркады (аудит 2026-09-19): правила, которые можно держать без браузера.
import { describe, expect, it } from "vitest";
import { COSMETICS, heroSkins, sourceCosmetic } from "../src/game/arcade/content/cosmetics.ts";
import { HERO_IDS } from "../src/game/arcade/content/heroes.ts";
import { sceneNeedsDraw } from "../src/features/arcade/renderer.ts";

describe("сцена на паузе и после конца забега", () => {
  it("идущий забег рисуется каждый кадр", () => {
    for (let frame = 1; frame <= 5; frame++) expect(sceneNeedsDraw(false, false, false, frame)).toBe(true);
  });

  it("застывшая сцена: кадр при входе, после resize и раз в секунду — остальные пропускаются", () => {
    expect(sceneNeedsDraw(true, false, false, 7)).toBe(true); // вход в паузу/итог
    expect(sceneNeedsDraw(true, true, true, 8)).toBe(true); // resize стёр буфер холста
    expect(sceneNeedsDraw(true, true, false, 120)).toBe(true); // страховочный кадр
    const drawn = Array.from({ length: 600 }, (_, i) => sceneNeedsDraw(true, true, false, i + 1)).filter(Boolean).length;
    expect(drawn).toBe(10);
  });
});

describe("индекс обликов по герою", () => {
  it("heroSkins совпадает с фильтром каталога у каждого героя и не теряет порядок", () => {
    for (const hero of HERO_IDS) expect(heroSkins(hero), hero).toEqual(COSMETICS.filter((c) => c.slot === "skin" && c.hero === hero));
    expect(heroSkins("no_such_hero")).toEqual([]);
  });

  it("sourceCosmetic находит сет героя по источнику части", () => {
    const set = COSMETICS.find((c) => c.slot === "skin" && c.hero === "juggernaut" && c.variant === "juggernaut@bladesrunner")!;
    expect(sourceCosmetic("juggernaut", "bladesrunner")).toBe(set);
    expect(sourceCosmetic("juggernaut", "base")).toBeUndefined();
    expect(sourceCosmetic("lina", "bladesrunner")).toBeUndefined();
  });
});
