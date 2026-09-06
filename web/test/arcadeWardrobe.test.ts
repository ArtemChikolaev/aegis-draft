import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { COSMETICS, skinnedHero, skinnedSheet, skinnedStyle } from "../src/game/arcade/content/cosmetics.ts";
import { useArcade } from "../src/state/arcadeStore.ts";
import { previewScale } from "../src/features/arcade/HeroWardrobe.tsx";

// Гардероб (T13.27): облик героя выбирается и покупается в своём окне, у аркан бывают стили.
// Тест держит в согласии три места: cosmetics.ts (какие стили объявлены), манифесты спрайтов
// (есть ли под стиль лист `<variant>~<style>`) и стор (что реально можно надеть).
const rows = (file: string) => readFileSync(new URL(`../scripts/blender/${file}`, import.meta.url), "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t")[0]);

describe("гардероб: облик и стиль", () => {
  beforeEach(() => {
    useArcade.setState({ cosmetics: { owned: [], equipped: {}, shards: 0, styles: {} } });
  });

  it("skinnedSheet без стиля повторяет skinnedHero", () => {
    const eq = { skin: "skin_zeus_arcana" };
    expect(skinnedSheet("zeus", eq)).toBe(skinnedHero("zeus", eq));
    expect(skinnedSheet("lina", eq)).toBe("lina");
  });

  it("отдельный лист берётся только под стиль-текстуру, самоцвет листа не меняет", () => {
    const eq = { skin: "skin_zeus_arcana" };
    const zeus = COSMETICS.find((c) => c.id === "skin_zeus_arcana")!;
    const gem = zeus.styles!.find((st) => st.hue !== undefined)!;
    // Самоцвет — поворот тона того же листа, имя листа прежнее.
    expect(skinnedSheet("zeus", eq, { skin_zeus_arcana: gem.id })).toBe("zeus@arcana");
    expect(skinnedStyle("zeus", eq, { skin_zeus_arcana: gem.id })?.hue).toBe(gem.hue);
    // Выдуманный стиль игнорируется всегда.
    expect(skinnedSheet("zeus", eq, { skin_zeus_arcana: "no_such_style" })).toBe("zeus@arcana");
    expect(skinnedStyle("zeus", eq, { skin_zeus_arcana: "no_such_style" })).toBeNull();
  });

  it("у каждой арканы есть самоцветы, у персон их нет", () => {
    for (const c of COSMETICS.filter((x) => x.slot === "skin")) {
      const gems = (c.styles ?? []).filter((st) => st.hue !== undefined);
      expect(gems.length > 0, c.id).toBe(c.rarity === "arcana");
    }
  });

  it("setStyle принимает только объявленный стиль и снимается по null", () => {
    const withStyles = COSMETICS.find((c) => c.styles && c.styles.length > 0)!;
    useArcade.getState().setStyle(withStyles.id, "no_such_style");
    expect(useArcade.getState().cosmetics.styles[withStyles.id]).toBeUndefined();
    const style = withStyles.styles![0].id;
    useArcade.getState().setStyle(withStyles.id, style);
    expect(useArcade.getState().cosmetics.styles[withStyles.id]).toBe(style);
    useArcade.getState().setStyle(withStyles.id, null);
    expect(useArcade.getState().cosmetics.styles[withStyles.id]).toBeUndefined();
  });

  it("под каждый объявленный стиль есть лист в обоих пиксельных манифестах", () => {
    const px = new Set(rows("dota_manifest_px.tsv")), px2 = new Set(rows("dota_manifest_px2.tsv"));
    for (const c of COSMETICS) for (const st of c.styles ?? []) {
      if (!st.sheet) continue; // самоцвет рисуется поворотом тона того же листа
      expect(px.has(`${c.variant}~${st.id}`), `${c.variant}~${st.id} в dota_manifest_px.tsv`).toBe(true);
      expect(px2.has(`${c.variant}~${st.id}`), `${c.variant}~${st.id} в dota_manifest_px2.tsv`).toBe(true);
    }
  });

  it("покупка скина списывает осколки и его можно надеть", () => {
    useArcade.setState({ cosmetics: { owned: [], equipped: {}, shards: 1000, styles: {} } });
    const skin = COSMETICS.find((c) => c.slot === "skin" && c.hero === "zeus")!;
    expect(useArcade.getState().buyCosmetic(skin.id)).toBe(true);
    useArcade.getState().equip("skin", skin.id);
    expect(useArcade.getState().cosmetics.equipped.skin).toBe(skin.id);
    expect(skinnedSheet("zeus", useArcade.getState().cosmetics.equipped, useArcade.getState().cosmetics.styles)).toBe(skin.variant);
  });
});
// Превью облика тянулось дробным масштабом (стенд 230 css на лист 128 арт-пикселей = 1.8), и
// nearest-neighbour растягивал часть пикселей вдвое, часть нет — облик выходил кашей.
describe("масштаб превью облика", () => {
  it("на увеличении — целое число физических пикселей на арт-пиксель", () => {
    for (const dpr of [1, 2, 3]) {
      const m = previewScale(230, 128, dpr);
      expect(Number.isInteger(Math.round(m * dpr * 1e6) / 1e6), `dpr ${dpr}: масштаб ${m}`).toBe(true);
      expect(m * dpr).toBeGreaterThanOrEqual(1);
    }
  });

  it("на уменьшении масштаб остаётся дробным: миниатюра показывает фигуру целиком, а не кроп", () => {
    const m = previewScale(48, 128, 1);
    expect(m).toBeLessThan(1);
    expect(m * 128).toBeLessThanOrEqual(48 * 1.02 + 0.001);
  });
});

