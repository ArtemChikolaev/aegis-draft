import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { COSMETICS, skinnedHero, skinnedSheet } from "../src/game/arcade/content/cosmetics.ts";
import { useArcade } from "../src/state/arcadeStore.ts";

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

  it("стиль попадает в имя листа только если объявлен у скина", () => {
    const eq = { skin: "skin_zeus_arcana" };
    expect(skinnedSheet("zeus", eq, { skin_zeus_arcana: "style1" })).toBe(
      COSMETICS.find((c) => c.id === "skin_zeus_arcana")!.styles?.includes("style1") ? "zeus@arcana~style1" : "zeus@arcana",
    );
    // Выдуманный стиль игнорируется всегда.
    expect(skinnedSheet("zeus", eq, { skin_zeus_arcana: "no_such_style" })).toBe("zeus@arcana");
  });

  it("setStyle принимает только объявленный стиль и снимается по null", () => {
    const withStyles = COSMETICS.find((c) => c.styles && c.styles.length > 0);
    useArcade.getState().setStyle("skin_zeus_arcana", "no_such_style");
    expect(useArcade.getState().cosmetics.styles.skin_zeus_arcana).toBeUndefined();
    if (!withStyles) return;
    const style = withStyles.styles![0];
    useArcade.getState().setStyle(withStyles.id, style);
    expect(useArcade.getState().cosmetics.styles[withStyles.id]).toBe(style);
    useArcade.getState().setStyle(withStyles.id, null);
    expect(useArcade.getState().cosmetics.styles[withStyles.id]).toBeUndefined();
  });

  it("под каждый объявленный стиль есть лист в обоих пиксельных манифестах", () => {
    const px = new Set(rows("dota_manifest_px.tsv")), px2 = new Set(rows("dota_manifest_px2.tsv"));
    for (const c of COSMETICS) for (const st of c.styles ?? []) {
      expect(px.has(`${c.variant}~${st}`), `${c.variant}~${st} в dota_manifest_px.tsv`).toBe(true);
      expect(px2.has(`${c.variant}~${st}`), `${c.variant}~${st} в dota_manifest_px2.tsv`).toBe(true);
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
