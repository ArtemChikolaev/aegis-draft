// Облик по слотам и скины призывов (T13.80, срез 2 — семейства основ): правила сборки как в Dota — слот следует
// надетому облику, у сета без части берётся модель по умолчанию, у арканы — её слоты по умолчанию (пустой слот пуст),
// всё как у одного облика = его цельный лист, иначе композит слоёв на теле основы. Стиль основы — своё семейство;
// без него смешанный облик честно помечен `styleDropped`. Данные слотов подменены (vi.mock), чтобы правила
// проверялись независимо от того, что уже отрендерено.
import { describe, it, expect, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { COSMETICS, COSMETIC_BY_ID, PART_BASE, defaultLoadout, familyOf, heroLook, loadoutSheet, partSources, resolveLoadout, summonSheets, wornIsWhole } from "../src/game/arcade/content/cosmetics.ts";
import { HEROES } from "../src/game/arcade/content/heroes.ts";
import { migrateCosmeticsV2, useArcade } from "../src/state/arcadeStore.ts";
import { ByteLru, isCompositeSheet } from "../src/features/arcade/sprites.ts";

vi.mock("../src/game/arcade/content/parts.ts", async (orig) => {
  const real = await orig<typeof import("../src/game/arcade/content/parts.ts")>();
  return {
    ...real,
    HERO_PARTS: {
      ...real.HERO_PARTS,
      // Juggernaut: у сета Bladesrunner нет части в слоте `arms` — Dota показывает там часть по умолчанию. Аркана — своя
      // основа (hero_base 9059): по умолчанию арканная маска, без плаща; стиль 1 отрендерен как семейство, стиль «нет».
      juggernaut: {
        slots: ["back", "legs", "arms", "head", "weapon"],
        families: {
          juggernaut: { defaults: { back: "base", legs: "base", arms: "base", head: "base", weapon: "base" }, sources: { base: ["back", "legs", "arms", "head", "weapon"], bladesrunner: ["back", "legs", "head", "weapon"] } },
          "juggernaut@arcana": { defaults: { legs: "base", arms: "base", head: "arcana", weapon: "base" }, sources: { base: ["back", "legs", "arms", "head", "weapon"], arcana: ["head"], bladesrunner: ["back", "legs", "head", "weapon"] } },
          "juggernaut@arcana~style1": { defaults: { legs: "base", arms: "base", head: "arcana", weapon: "base" }, sources: { base: ["back", "legs", "arms", "head", "weapon"], arcana: ["head"], bladesrunner: ["back", "legs", "head", "weapon"] } },
        },
      },
      // MK: аркана со стилями, из которых семейством отрендерен только базовый.
      monkey_king: {
        slots: ["back", "armor", "shoulder", "head", "weapon"],
        families: {
          monkey_king: { defaults: { back: "base", armor: "base", shoulder: "base", head: "base", weapon: "base" }, sources: { base: ["back", "armor", "shoulder", "head", "weapon"], fiery_vajrapani: ["armor", "shoulder", "head", "weapon"] } },
          "monkey_king@arcana": { defaults: { back: "base", armor: "base", shoulder: "base", head: "arcana", weapon: "base" }, sources: { base: ["back", "armor", "shoulder", "head", "weapon"], arcana: ["head"], fiery_vajrapani: ["armor", "shoulder", "head", "weapon"] } },
        },
      },
    },
  };
});

const jugg = COSMETICS.find((c) => c.id === "skin_jugg_bladesrunner")!;
const arcana = COSMETICS.find((c) => c.id === "skin_jugg_arcana")!;
const paArcana = COSMETICS.find((c) => c.id === "skin_pa_arcana")!;
const owned = [jugg.id, arcana.id, paArcana.id];
const S1 = { [arcana.id]: "style1" };
const GEM = { [arcana.id]: "gem2" };

describe("облик по слотам: основы", () => {
  it("семейство: базовая модель, сет на ней, аркана и её стиль; персона без слоёв — цельный облик", () => {
    expect(familyOf("juggernaut", {})).toMatchObject({ id: "juggernaut", worn: PART_BASE });
    expect(familyOf("juggernaut", { skin: jugg.id })).toMatchObject({ id: "juggernaut", worn: "bladesrunner" });
    expect(familyOf("juggernaut", { skin: arcana.id })).toMatchObject({ id: "juggernaut@arcana", worn: null, styleDropped: false });
    expect(familyOf("juggernaut", { skin: arcana.id }, S1)).toMatchObject({ id: "juggernaut@arcana~style1", styleDropped: false });
    // Самоцвет — не отдельный лист: семейство то же, стиль не теряется.
    expect(familyOf("juggernaut", { skin: arcana.id }, GEM)).toMatchObject({ id: "juggernaut@arcana", styleDropped: false });
    expect(familyOf("phantom_assassin", { skin: paArcana.id })).toBeNull();
    expect(wornIsWhole("phantom_assassin", { skin: paArcana.id })).toBe(true);
    expect(wornIsWhole("juggernaut", { skin: arcana.id })).toBe(false);
    expect(wornIsWhole("zeus", {})).toBe(false);
  });
  it("источники игрока: base всегда, сет и аркана — только свои; у семейства арканы есть её собственные части", () => {
    expect(partSources("juggernaut", [])).toEqual([PART_BASE]);
    expect(partSources("juggernaut", owned)).toEqual([PART_BASE, "bladesrunner"]);
    expect(partSources("juggernaut", owned, "juggernaut@arcana")).toEqual([PART_BASE, "arcana", "bladesrunner"]);
    expect(partSources("juggernaut", [jugg.id], "juggernaut@arcana")).toEqual([PART_BASE, "bladesrunner"]);
    expect(partSources("zeus", owned)).toEqual([]);
  });
  it("слоты по умолчанию: сет + модель по умолчанию; у арканы — её маска и без плаща", () => {
    expect(defaultLoadout("juggernaut", { skin: jugg.id })).toEqual({ back: "bladesrunner", legs: "bladesrunner", arms: PART_BASE, head: "bladesrunner", weapon: "bladesrunner" });
    expect(defaultLoadout("juggernaut", { skin: arcana.id })).toEqual({ legs: PART_BASE, arms: PART_BASE, head: "arcana", weapon: PART_BASE });
    expect(defaultLoadout("phantom_assassin", { skin: paArcana.id })).toEqual({});
  });
  it("слот следует надетому облику; чужой или невозможный выбор игнорируется; на аркане можно надеть чужую голову и плащ", () => {
    expect(resolveLoadout("juggernaut", { skin: jugg.id }, {}, { weapon: PART_BASE }, owned)).toEqual({ back: "bladesrunner", legs: "bladesrunner", arms: PART_BASE, head: "bladesrunner", weapon: PART_BASE });
    expect(resolveLoadout("juggernaut", {}, {}, { head: "bladesrunner" }, [])).toEqual({ back: PART_BASE, legs: PART_BASE, arms: PART_BASE, head: PART_BASE, weapon: PART_BASE });
    // У Bladesrunner нет наручей — выбор `arms: bladesrunner` невозможен, остаётся по умолчанию.
    expect(resolveLoadout("juggernaut", {}, {}, { arms: "bladesrunner" }, owned).arms).toBe(PART_BASE);
    expect(resolveLoadout("juggernaut", { skin: arcana.id }, {}, { head: "bladesrunner", back: PART_BASE }, owned)).toEqual({ legs: PART_BASE, arms: PART_BASE, head: "bladesrunner", weapon: PART_BASE, back: PART_BASE });
    // Арканная маска без арканы в собственности недоступна и на базовом теле её слоя нет.
    expect(resolveLoadout("juggernaut", {}, {}, { head: "arcana" }, owned).head).toBe(PART_BASE);
  });
  it("лист: цельный, пока слоты повторяют облик; цельный лист другого сета/базы; иначе композит на теле основы", () => {
    expect(loadoutSheet("juggernaut", { skin: jugg.id }, {}, {}, owned)).toBe("juggernaut@bladesrunner");
    expect(loadoutSheet("juggernaut", { skin: jugg.id }, {}, { weapon: PART_BASE }, owned)).toBe("juggernaut+body+bladesrunner.back+bladesrunner.legs+base.arms+bladesrunner.head+base.weapon");
    expect(loadoutSheet("juggernaut", { skin: jugg.id }, {}, { back: PART_BASE, legs: PART_BASE, head: PART_BASE, weapon: PART_BASE }, owned)).toBe("juggernaut");
    expect(loadoutSheet("juggernaut", {}, {}, { back: "bladesrunner", legs: "bladesrunner", head: "bladesrunner", weapon: "bladesrunner" }, owned)).toBe("juggernaut@bladesrunner");
    // Аркана: своё семейство — по умолчанию цельный лист (со стилем), с чужой головой — композит на арканном теле.
    expect(loadoutSheet("juggernaut", { skin: arcana.id }, {}, {}, owned)).toBe("juggernaut@arcana");
    expect(loadoutSheet("juggernaut", { skin: arcana.id }, S1, {}, owned)).toBe("juggernaut@arcana~style1");
    expect(loadoutSheet("juggernaut", { skin: arcana.id }, {}, { head: "bladesrunner" }, owned)).toBe("juggernaut@arcana+body+base.legs+base.arms+bladesrunner.head+base.weapon");
    expect(loadoutSheet("juggernaut", { skin: arcana.id }, S1, { head: "bladesrunner" }, owned)).toBe("juggernaut@arcana~style1+body+base.legs+base.arms+bladesrunner.head+base.weapon");
    // Персона без слоёв — цельный лист, слоты не применяются.
    expect(loadoutSheet("phantom_assassin", { skin: paArcana.id }, {}, { weapon: PART_BASE }, owned)).toBe("phantom_assassin@arcana");
    expect(isCompositeSheet("juggernaut@arcana~style1+body+base.weapon")).toBe(true);
    expect(isCompositeSheet("juggernaut+body")).toBe(false);
    expect(isCompositeSheet("juggernaut@bladesrunner")).toBe(false);
  });
  it("стиль без семейства (A3): цельный облик остаётся со стилем, смешанный падает на основу без стиля и помечен", () => {
    const mk = COSMETICS.find((c) => c.id === "skin_mk_arcana")!;
    const fv = COSMETICS.find((c) => c.id === "skin_monkey_king_fiery_vajrapani")!;
    const mine = [mk.id, fv.id];
    const st2 = { [mk.id]: "style2" };
    expect(loadoutSheet("monkey_king", { skin: mk.id }, st2, {}, mine)).toBe("monkey_king@arcana~style2");
    expect(heroLook("monkey_king", { equipped: { skin: mk.id }, styles: st2, owned: mine }).styleDropped).toBe(false);
    const look = heroLook("monkey_king", { equipped: { skin: mk.id }, styles: st2, owned: mine, loadout: { monkey_king: { weapon: "fiery_vajrapani" } } });
    expect(look.sheet).toBe("monkey_king@arcana+body+base.back+base.armor+base.shoulder+arcana.head+fiery_vajrapani.weapon");
    expect(look).toMatchObject({ mixed: true, styleDropped: true, family: "monkey_king@arcana" });
    expect(look.parts).toEqual({ back: PART_BASE, armor: PART_BASE, shoulder: PART_BASE, head: "arcana", weapon: "fiery_vajrapani" });
  });
  it("встроенный эффект скина живёт в своём слоте: пламя арканы Lina гаснет, когда голова заменена (реальные семейства)", () => {
    const lina = COSMETICS.find((c) => c.id === "skin_lina_arcana")!, df = COSMETICS.find((c) => c.id === "skin_lina_dragonfire")!;
    const mine = [lina.id, df.id];
    expect(heroLook("lina", { equipped: { skin: lina.id }, styles: {}, owned: mine }).fx).toEqual({ aura: "flamehair" });
    expect(heroLook("lina", { equipped: { skin: lina.id }, styles: {}, owned: mine, loadout: { lina: { arms: "dragonfire" } } }).fx).toEqual({ aura: "flamehair" });
    expect(heroLook("lina", { equipped: { skin: lina.id }, styles: {}, owned: mine, loadout: { lina: { head: "dragonfire" } } }).fx).toBeNull();
    expect(heroLook("lina", { equipped: { skin: df.id }, styles: {}, owned: mine }).fx).toBeNull();
  });
  it("heroLook: mixed только у композита; листы призывов по надетым скинам своего героя", () => {
    const bear = COSMETICS.find((c) => c.id === "summon_bear_dark_wood")!;
    expect(heroLook("juggernaut", { equipped: { skin: jugg.id }, styles: {}, owned })).toMatchObject({ mixed: false, family: "juggernaut", styleDropped: false });
    expect(heroLook("juggernaut", { equipped: { skin: jugg.id }, styles: {}, owned, loadout: { juggernaut: { weapon: PART_BASE } } }).mixed).toBe(true);
    expect(heroLook("phantom_assassin", { equipped: { skin: paArcana.id }, styles: {}, owned })).toMatchObject({ mixed: false, family: null, parts: {} });
    expect(summonSheets("lone_druid", { lone_druid: { bear: bear.id } })).toEqual({ bear: "bear@dark_wood" });
    expect(summonSheets("lycan", { lycan: { wolf: bear.id } })).toEqual({});
  });
});

describe("облик по слотам: стор", () => {
  const fresh = () => useArcade.setState({ cosmetics: { owned: [...owned, "summon_bear_dark_wood"], equipped: {}, shared: {}, shards: 0, styles: {}, skins: {}, perHero: {}, perHeroLook: false, loadout: {}, summonSkins: {} } });
  it("setPart пишет слот выбранного героя, null снимает; сет целиком сбрасывает слоты, основа (аркана/база) их сохраняет", () => {
    fresh();
    useArcade.getState().setHero("juggernaut");
    useArcade.getState().setPart("weapon", PART_BASE);
    expect(useArcade.getState().cosmetics.loadout).toEqual({ juggernaut: { weapon: PART_BASE } });
    useArcade.getState().equip("skin", jugg.id);
    expect(useArcade.getState().cosmetics.loadout).toEqual({});
    useArcade.getState().setPart("head", "bladesrunner");
    useArcade.getState().equip("skin", arcana.id);
    expect(useArcade.getState().cosmetics.loadout).toEqual({ juggernaut: { head: "bladesrunner" } });
    useArcade.getState().equip("skin", null);
    expect(useArcade.getState().cosmetics.loadout).toEqual({ juggernaut: { head: "bladesrunner" } });
    useArcade.getState().resetParts();
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
  it("миграция v2: слоты по item_slot Dota, прежняя «аркана» Lina остаётся надетым Battle Caster", () => {
    const c = { owned: ["skin_lina_arcana", "skin_mk_arcana"], skins: { lina: "skin_lina_arcana" }, loadout: { lina: { misc: "arcana", shoulder: "arcana", head: "dragonfire" }, monkey_king: { misc: "arcana" }, juggernaut: { belt: "bladesrunner" }, axe: { back: "base" }, phantom_assassin: { weapon: "darkfeather" } } as Record<string, Record<string, string>> };
    migrateCosmeticsV2(c as never);
    expect(c.owned).toEqual(["skin_lina_arcana", "skin_mk_arcana", "skin_lina_battle_caster"]);
    expect(c.skins.lina).toBe("skin_lina_battle_caster");
    expect(c.loadout).toEqual({ lina: { arms: "battle_caster", neck: "battle_caster", head: "dragonfire" }, monkey_king: { head: "arcana" }, juggernaut: { legs: "bladesrunner" }, axe: { head: "base" }, phantom_assassin: { weapon: "darkfeather" } });
    // Повторная миграция ничего не удваивает.
    migrateCosmeticsV2(c as never);
    expect(c.owned).toHaveLength(3);
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

describe("кэш композитов (A4)", () => {
  it("байтовый бюджет: вытесняются давно не читанные, свежепрочитанный остаётся", () => {
    const lru = new ByteLru<string>(100);
    lru.set("a", "A", 40);
    lru.set("b", "B", 40);
    expect(lru.get("a")).toBe("A"); // освежили a — вытесняться должен b
    lru.set("c", "C", 40);
    expect(lru.has("b")).toBe(false);
    expect(lru.has("a")).toBe(true);
    expect(lru.bytes).toBe(80);
    lru.set("d", "D", 100); // один большой — выталкивает всё остальное, сам остаётся даже впритык
    expect([lru.has("a"), lru.has("c"), lru.has("d"), lru.bytes]).toEqual([false, false, true, 100]);
    lru.set("d", "D2", 10); // перезапись пересчитывает байты
    expect(lru.bytes).toBe(10);
    lru.clear();
    expect([lru.size, lru.bytes]).toEqual([0, 0]);
  });
});

// Данные: таблица слотов ↔ манифесты слоёв ↔ листы на диске ↔ косметика ↔ индекс предметов Dota. Скины призывов ↔ манифесты и герои.
const manRows = (file: string) => existsSync(new URL(`../scripts/blender/${file}`, import.meta.url)) ? readFileSync(new URL(`../scripts/blender/${file}`, import.meta.url), "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t")) : [];
const rows = (file: string) => manRows(file).map((c) => c[0]);
describe("облик по слотам: данные", () => {
  it("под каждый слой из HERO_PARTS есть строка в манифестах слоёв и лист в обоих наборах; у источника есть косметика; у семейства — строка основы", async () => {
    const { HERO_PARTS } = await vi.importActual<typeof import("../src/game/arcade/content/parts.ts")>("../src/game/arcade/content/parts.ts");
    const main = new Set(rows("dota_manifest_px2.tsv"));
    for (const [hero, hp] of Object.entries(HERO_PARTS)) {
      expect(HEROES[hero as keyof typeof HEROES], hero).toBeDefined();
      expect(hp.families[hero], `${hero}: нет базового семейства`).toBeDefined();
      for (const [famId, fam] of Object.entries(hp.families)) {
        expect(main.has(famId), `${famId}: нет строки основы в dota_manifest_px2.tsv`).toBe(true);
        const ids = [`${famId}+body`, ...Object.entries(fam.sources).flatMap(([src, slots]) => slots.map((s) => `${famId}+${src}.${s}`))];
        for (const [file, dir] of [["dota_manifest_parts_px.tsv", "dota_px"], ["dota_manifest_parts_px2.tsv", "dota_px2"]] as const) {
          const man = new Set(rows(file));
          for (const id of ids) {
            expect(man.has(id), `${id} в ${file}`).toBe(true);
            expect(existsSync(new URL(`../public/art/sprites/${dir}/${id}.webp`, import.meta.url)) && existsSync(new URL(`../public/art/sprites/${dir}/${id}.json`, import.meta.url)), `${dir}/${id}`).toBe(true);
          }
        }
        for (const src of Object.keys(fam.sources)) if (src !== PART_BASE) expect(COSMETICS.some((c) => c.slot === "skin" && c.hero === hero && c.variant === `${hero}@${src}`), `${hero}@${src}`).toBe(true);
        for (const slots of Object.values(fam.sources)) for (const s of slots) expect(hp.slots.includes(s), `${famId}: слот ${s} вне порядка`).toBe(true);
        for (const [s, src] of Object.entries(fam.defaults)) expect(fam.sources[src]?.includes(s as never), `${famId}: слот по умолчанию ${s}=${src} без слоя`).toBe(true);
      }
    }
  });
  it("слой лежит в слоте своего предмета по items_game (A2): item_slot из индекса ↔ слот в id слоя", () => {
    const index = JSON.parse(readFileSync(new URL("../scripts/blender/dota_item_index.json", import.meta.url), "utf8")) as { models: Record<string, { slot: string; swaps?: Record<string, string> }>; bases: Record<string, { swaps?: Record<string, string> }[]> };
    // Подменённая модель (арканный вариант части: `*_arcana_*` у MK, `*_refit` у Drow) наследует слот исходного предмета:
    // обратная карта подмен из самого индекса, а не догадка по имени.
    const original: Record<string, string> = {};
    for (const it of [...Object.values(index.models), ...Object.values(index.bases).flat()]) for (const [from, to] of Object.entries(it.swaps ?? {})) original[to] = from;
    const overrides = JSON.parse(readFileSync(new URL("../scripts/blender/dota_slot_overrides.json", import.meta.url), "utf8")) as Record<string, { slot: string }>;
    const slotOfModel = (p: string) => { const k = p.replace(/\.vmdl_c$/, ".vmdl"); return index.models[k]?.slot ?? overrides[k]?.slot; };
    for (const c of manRows("dota_manifest_parts_px2.tsv")) {
      if (c[0].endsWith("+body")) continue;
      const slot = c[0].slice(c[0].lastIndexOf(".") + 1);
      for (const p of (c[3] ?? "").split(",").filter(Boolean)) {
        const s = slotOfModel(p) ?? slotOfModel(original[p.replace(/\.vmdl_c$/, ".vmdl")] ?? "");
        expect(s, `${c[0]}: ${p} не в индексе`).toBeDefined();
        expect(s, `${c[0]}: ${p}`).toBe(slot);
      }
    }
  });
  it("аркана Lina (A1) — настоящий предмет 4794 (origins_flamehair), Battle Caster — отдельный сет", () => {
    const px2 = Object.fromEntries(manRows("dota_manifest_px2.tsv").map((c) => [c[0], c]));
    expect(px2["lina@arcana"]?.[3]).toContain("models/items/lina/origins_flamehair/origins_flamehair.vmdl_c");
    expect(px2["lina@arcana"]?.[2]).toContain("--style flamehair");
    expect(px2["lina@battle_caster"]?.[3]).toContain("hairoftheslayerr");
    expect(px2["lina@arcana"]?.[3]).not.toContain("hairoftheslayerr");
    expect(COSMETIC_BY_ID.skin_lina_battle_caster).toMatchObject({ rarity: "exotic", variant: "lina@battle_caster" });
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
