// Мелкий перф кадра Аркады (аудит 2026-09-19): правила, которые можно держать без браузера.
import { describe, expect, it } from "vitest";
import { COSMETICS, heroSkins, sourceCosmetic } from "../src/game/arcade/content/cosmetics.ts";
import { HERO_IDS } from "../src/game/arcade/content/heroes.ts";
import { hudNeedsBump, sceneNeedsDraw, type HudSeen } from "../src/features/arcade/renderer.ts";

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

describe("HUD цикла экрана (аудит 2026-09-27)", () => {
  const seen: HudSeen = { modal: null, tick: 100, log: 4, at: 1000 };
  it("смена окна — сразу, даже через кадр после прошлого бампа", () => {
    expect(hudNeedsBump(seen, "shop", 100, 4, 1008)).toBe(true);
    expect(hudNeedsBump({ ...seen, modal: "shop" }, null, 100, 4, 1008)).toBe(true);
  });
  it("шаг мира или новый ввод — не чаще раза в 100 мс", () => {
    expect(hudNeedsBump(seen, null, 106, 4, 1050)).toBe(false);
    expect(hudNeedsBump(seen, null, 106, 4, 1100)).toBe(true);
    expect(hudNeedsBump({ ...seen, modal: "build" }, "build", 100, 5, 1100)).toBe(true); // действие в окне сборки
  });
  it("ничего не сдвинулось (пауза, окно без действий) — без рендера сколько угодно долго", () => {
    expect(hudNeedsBump(seen, null, 100, 4, 60_000)).toBe(false);
    expect(hudNeedsBump({ ...seen, modal: "shop" }, "shop", 100, 4, 60_000)).toBe(false);
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
