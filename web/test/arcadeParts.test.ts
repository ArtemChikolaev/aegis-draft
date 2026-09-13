// Облик по слотам и скины призывов (T13.80): правила сборки как в Dota — слот следует надетому облику, у источника
// без части берётся модель по умолчанию, всё как у одного облика = его цельный лист, иначе композит слоёв.
// Данные слотов подменены (vi.mock), чтобы правила проверялись независимо от того, что уже отрендерено.
import { describe, it, expect, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { COSMETICS, COSMETIC_BY_ID, PART_BASE, heroLook, loadoutSheet, partSources, resolveLoadout, summonSheets, wornIsWhole, wornSource } from "../src/game/arcade/content/cosmetics.ts";
import { HEROES } from "../src/game/arcade/content/heroes.ts";
import { useArcade } from "../src/state/arcadeStore.ts";
import { isCompositeSheet } from "../src/features/arcade/sprites.ts";

vi.mock("../src/game/arcade/content/parts.ts", async (orig) => {
  const real = await orig<typeof import("../src/game/arcade/content/parts.ts")>();
  return {
    ...real,
    HERO_PARTS: {
      ...real.HERO_PARTS,
      // Juggernaut: у сета Bladesrunner нет части в слоте `arms` — Dota показывает там часть по умолчанию.
      juggernaut: { slots: ["back", "belt", "arms", "head", "weapon"], sources: { base: ["back", "belt", "arms", "head", "weapon"], bladesrunner: ["back", "belt", "head", "weapon"] } },
    },
  };
});

const jugg = COSMETICS.find((c) => c.id === "skin_jugg_bladesrunner")!;
const arcana = COSMETICS.find((c) => c.id === "skin_jugg_arcana")!;
const owned = [jugg.id, arcana.id];

describe("облик по слотам: правила", () => {
  it("источник надетого облика: сет на базовом теле — он, аркана с другой моделью — base и цельный", () => {
    expect(wornSource("juggernaut", {})).toBe(PART_BASE);
    expect(wornSource("juggernaut", { skin: jugg.id })).toBe("bladesrunner");
    expect(wornSource("juggernaut", { skin: arcana.id })).toBe(PART_BASE);
    expect(wornIsWhole("juggernaut", { skin: arcana.id })).toBe(true);
    expect(wornIsWhole("juggernaut", { skin: jugg.id })).toBe(false);
  });
  it("источники игрока: base всегда, сет — только купленный", () => {
    expect(partSources("juggernaut", [])).toEqual([PART_BASE]);
    expect(partSources("juggernaut", owned)).toEqual([PART_BASE, "bladesrunner"]);
    expect(partSources("zeus", owned)).toEqual([]);
  });
  it("слот следует надетому облику; у источника нет части — модель по умолчанию; чужой сет игнорируется", () => {
    const r = resolveLoadout("juggernaut", { skin: jugg.id }, { weapon: PART_BASE }, owned);
    expect(r).toEqual({ back: "bladesrunner", belt: "bladesrunner", arms: PART_BASE, head: "bladesrunner", weapon: PART_BASE });
    expect(resolveLoadout("juggernaut", {}, { head: "bladesrunner" }, [])).toEqual({ back: PART_BASE, belt: PART_BASE, arms: PART_BASE, head: PART_BASE, weapon: PART_BASE });
  });
  it("лист: всё как у надетого — цельный лист (со стилем); смешение — композит в порядке слотов; всё как у другого сета — его лист", () => {
    expect(loadoutSheet("juggernaut", { skin: jugg.id }, {}, {}, owned)).toBe("juggernaut@bladesrunner");
    expect(loadoutSheet("juggernaut", { skin: jugg.id }, {}, { weapon: PART_BASE }, owned)).toBe("juggernaut+body+bladesrunner.back+bladesrunner.belt+base.arms+bladesrunner.head+base.weapon");
    expect(loadoutSheet("juggernaut", { skin: jugg.id }, {}, { back: PART_BASE, belt: PART_BASE, head: PART_BASE, weapon: PART_BASE }, owned)).toBe("juggernaut");
    expect(loadoutSheet("juggernaut", {}, {}, { back: "bladesrunner", belt: "bladesrunner", head: "bladesrunner", weapon: "bladesrunner" }, owned)).toBe("juggernaut@bladesrunner");
    // Аркана — цельный облик: слоты не применяются.
    expect(loadoutSheet("juggernaut", { skin: arcana.id }, {}, { weapon: PART_BASE }, owned)).toBe("juggernaut@arcana");
    expect(isCompositeSheet("juggernaut+body+base.weapon")).toBe(true);
    expect(isCompositeSheet("juggernaut+body")).toBe(false);
    expect(isCompositeSheet("juggernaut@bladesrunner")).toBe(false);
  });
  it("heroLook: mixed только у композита; листы призывов по надетым скинам своего героя", () => {
    const bear = COSMETICS.find((c) => c.id === "summon_bear_dark_wood")!;
    expect(heroLook("juggernaut", { equipped: { skin: jugg.id }, styles: {}, owned }).mixed).toBe(false);
    expect(heroLook("juggernaut", { equipped: { skin: jugg.id }, styles: {}, owned, loadout: { juggernaut: { weapon: PART_BASE } } }).mixed).toBe(true);
    expect(summonSheets("lone_druid", { lone_druid: { bear: bear.id } })).toEqual({ bear: "bear@dark_wood" });
    expect(summonSheets("lycan", { lycan: { wolf: bear.id } })).toEqual({});
  });
});

describe("облик по слотам: стор", () => {
  const fresh = () => useArcade.setState({ cosmetics: { owned: [...owned, "summon_bear_dark_wood"], equipped: {}, shared: {}, shards: 0, styles: {}, skins: {}, perHero: {}, perHeroLook: false, loadout: {}, summonSkins: {} } });
  it("setPart пишет слот выбранного героя, null снимает; надевание облика целиком сбрасывает слоты", () => {
    fresh();
    useArcade.getState().setHero("juggernaut");
    useArcade.getState().setPart("weapon", PART_BASE);
    expect(useArcade.getState().cosmetics.loadout).toEqual({ juggernaut: { weapon: PART_BASE } });
    useArcade.getState().equip("skin", jugg.id);
    expect(useArcade.getState().cosmetics.loadout).toEqual({});
    useArcade.getState().setPart("head", PART_BASE);
    useArcade.getState().setPart("head", null);
    expect(useArcade.getState().cosmetics.loadout).toEqual({});
  });
  it("сейв без слотов (до T13.80) не ломает setPart", () => {
    useArcade.setState({ cosmetics: { owned, equipped: {}, shards: 0, styles: {}, skins: {} } as never });
    useArcade.getState().setHero("juggernaut");
    useArcade.getState().setPart("weapon", PART_BASE);
    expect(useArcade.getState().cosmetics.loadout).toEqual({ juggernaut: { weapon: PART_BASE } });
  });
  it("setSummonSkin: только свой купленный скин своего призыва; equip слота summon — no-op", () => {
    fresh();
    useArcade.getState().setHero("lone_druid");
    useArcade.getState().setSummonSkin("bear", "summon_bear_dark_wood");
    expect(useArcade.getState().cosmetics.summonSkins).toEqual({ lone_druid: { bear: "summon_bear_dark_wood" } });
    useArcade.getState().setSummonSkin("bear", "summon_bear_iron_claw"); // не куплен
    expect(useArcade.getState().cosmetics.summonSkins.lone_druid.bear).toBe("summon_bear_dark_wood");
    useArcade.getState().setHero("lycan");
    useArcade.getState().setSummonSkin("wolf", "summon_bear_dark_wood"); // чужой
    expect(useArcade.getState().cosmetics.summonSkins.lycan).toBeUndefined();
    useArcade.getState().equip("summon", "summon_bear_dark_wood");
    expect(useArcade.getState().cosmetics.equipped.summon).toBeUndefined();
    useArcade.getState().setHero("lone_druid");
    useArcade.getState().setSummonSkin("bear", null);
    expect(useArcade.getState().cosmetics.summonSkins).toEqual({});
  });
});

// Данные: таблица слотов ↔ манифесты слоёв ↔ листы на диске ↔ косметика сетов. Скины призывов ↔ манифесты и герои.
const rows = (file: string) => existsSync(new URL(`../scripts/blender/${file}`, import.meta.url)) ? readFileSync(new URL(`../scripts/blender/${file}`, import.meta.url), "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t")[0]) : [];
describe("облик по слотам: данные", () => {
  it("под каждый слой из HERO_PARTS есть строка в манифестах слоёв и лист в обоих наборах; у сета есть косметика", async () => {
    const { HERO_PARTS } = await vi.importActual<typeof import("../src/game/arcade/content/parts.ts")>("../src/game/arcade/content/parts.ts");
    for (const [hero, hp] of Object.entries(HERO_PARTS)) {
      expect(HEROES[hero as keyof typeof HEROES], hero).toBeDefined();
      const ids = [`${hero}+body`, ...Object.entries(hp.sources).flatMap(([src, slots]) => slots.map((s) => `${hero}+${src}.${s}`))];
      for (const [file, dir] of [["dota_manifest_parts_px.tsv", "dota_px"], ["dota_manifest_parts_px2.tsv", "dota_px2"]] as const) {
        const man = new Set(rows(file));
        for (const id of ids) {
          expect(man.has(id), `${id} в ${file}`).toBe(true);
          expect(existsSync(new URL(`../public/art/sprites/${dir}/${id}.webp`, import.meta.url)) && existsSync(new URL(`../public/art/sprites/${dir}/${id}.json`, import.meta.url)), `${dir}/${id}`).toBe(true);
        }
      }
      for (const src of Object.keys(hp.sources)) if (src !== PART_BASE) expect(COSMETICS.some((c) => c.slot === "skin" && c.hero === hero && c.variant === `${hero}@${src}`), `${hero}@${src}`).toBe(true);
      for (const slots of Object.values(hp.sources)) for (const s of slots) expect(hp.slots.includes(s), `${hero}: слот ${s} вне порядка`).toBe(true);
    }
  });
  it("скин призыва: герой существует, у него есть этот призыв, лист в обоих манифестах", () => {
    for (const c of COSMETICS.filter((x) => x.slot === "summon")) {
      const art = c.variant.split("@")[0];
      const def = HEROES[c.hero as keyof typeof HEROES];
      expect(def, c.id).toBeDefined();
      expect(Object.values(def.abilities).some((a) => a.summon?.art === art), `${c.id}: у ${c.hero} нет призыва ${art}`).toBe(true);
      for (const f of ["dota_manifest_px.tsv", "dota_manifest_px2.tsv"]) expect(rows(f).filter((id) => id === c.variant).length, `${c.variant} в ${f}`).toBe(1);
      expect(COSMETIC_BY_ID[c.id]).toBe(c);
    }
  });
});
