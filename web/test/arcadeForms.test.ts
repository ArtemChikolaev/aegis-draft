// Скины форм и волков Lycan (T13.80 срез 3): форма — отдельный предмет Dota в своём слоте (Метаморфоза TB `ability3`,
// True Form Lone Druid `ability_ultimate`, дракон DK `shapeshift`), поэтому выбирается независимо от облика и важнее
// формы надетого скина. Идентичность строк манифеста проверяется по индексу предметов (урок «арканы» Lina): модель скина
// обязана быть подменой именно базовой модели формы этого героя, а волки — подменой юнита `npc_dota_lycan_wolf`.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { COSMETICS, formSheet, heroLook } from "../src/game/arcade/content/cosmetics.ts";
import { HEROES } from "../src/game/arcade/content/heroes.ts";
import { useArcade } from "../src/state/arcadeStore.ts";

const forms = COSMETICS.filter((c) => c.slot === "form");
const tb = forms.find((c) => c.hero === "terrorblade")!;
const ld = forms.find((c) => c.hero === "lone_druid")!;

describe("скины форм: правила", () => {
  it("лист формы — только свой скин формы своего героя; heroLook отдаёт его рендеру", () => {
    expect(formSheet("terrorblade", { terrorblade: tb.id })).toBe(tb.variant);
    expect(formSheet("terrorblade", { terrorblade: ld.id })).toBeNull(); // чужая форма
    expect(formSheet("terrorblade", { terrorblade: "skin_tb_arcana" })).toBeNull(); // не слот form
    expect(formSheet("terrorblade", {})).toBeNull();
    expect(heroLook("terrorblade", { equipped: {}, styles: {}, owned: [tb.id], formSkins: { terrorblade: tb.id } }).form).toBe(tb.variant);
    // Форма не зависит от облика: с арканой скин формы остаётся.
    expect(heroLook("terrorblade", { equipped: { skin: "skin_tb_arcana" }, styles: {}, owned: [tb.id, "skin_tb_arcana"], formSkins: { terrorblade: tb.id } }).form).toBe(tb.variant);
    expect(heroLook("terrorblade", { equipped: {}, styles: {}, owned: [] }).form).toBeNull();
  });
  it("setFormSkin: только свой купленный скин формы выбранного героя; null снимает; equip слота form — no-op; старый сейв без formSkins", () => {
    useArcade.setState({ cosmetics: { owned: [tb.id], equipped: {}, shared: {}, shards: 0, styles: {}, skins: {}, perHero: {}, perHeroLook: false, loadout: {}, summonSkins: {} } });
    useArcade.getState().setHero("terrorblade");
    useArcade.getState().setFormSkin(tb.id);
    expect(useArcade.getState().cosmetics.formSkins).toEqual({ terrorblade: tb.id });
    useArcade.getState().setFormSkin(ld.id); // чужой и не куплен
    expect(useArcade.getState().cosmetics.formSkins).toEqual({ terrorblade: tb.id });
    useArcade.getState().equip("form", tb.id);
    expect(useArcade.getState().cosmetics.equipped.form).toBeUndefined();
    useArcade.getState().setHero("lone_druid");
    useArcade.getState().setFormSkin(tb.id); // куплен, но чужой герой
    expect(useArcade.getState().cosmetics.formSkins?.lone_druid).toBeUndefined();
    useArcade.getState().setHero("terrorblade");
    useArcade.getState().setFormSkin(null);
    expect(useArcade.getState().cosmetics.formSkins).toEqual({});
  });
});

const manRows = (file: string) => readFileSync(new URL(`../scripts/blender/${file}`, import.meta.url), "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t"));
const index = JSON.parse(readFileSync(new URL("../scripts/blender/dota_item_index.json", import.meta.url), "utf8")) as { entityModels: Record<string, { id: string; hero?: string; slot: string; asset: string }> };
const key = (p: string) => p.replace(/\.vmdl_c$/, ".vmdl");

describe("скины форм и волков: данные", () => {
  it("скин формы: у героя есть форма, лист `<hero>@meta~<имя>` в обоих манифестах на скелете базовой формы, модель — подмена этой формы по items_game", () => {
    expect(forms.length).toBeGreaterThan(0);
    for (const f of ["dota_manifest_px.tsv", "dota_manifest_px2.tsv"]) {
      const rows = Object.fromEntries(manRows(f).map((c) => [c[0], c]));
      for (const c of forms) {
        const def = HEROES[c.hero as keyof typeof HEROES];
        expect(def && Object.values(def.abilities).some((a) => a.form !== undefined), `${c.id}: у ${c.hero} нет формы`).toBe(true);
        expect(c.variant.startsWith(`${c.hero}@meta~`), c.id).toBe(true);
        const row = rows[c.variant], base = rows[`${c.hero}@meta`];
        expect(row, `${c.variant} в ${f}`).toBeDefined();
        expect(row[1], `${c.variant}: скелет базовой формы`).toBe(base[1]);
        expect(row[2]).toContain("--hide-base");
        const item = index.entityModels[key(row[3])];
        expect(item, `${c.variant}: ${row[3]} не подмена модели в items_game`).toBeDefined();
        expect(item.hero, c.variant).toBe(c.hero);
        expect(item.asset, `${c.variant}: подменяет не базовую форму`).toBe(key(base[1]));
      }
    }
  });
  it("волки Lycan: лист — сама модель скина (свой скелет), по items_game это подмена юнита npc_dota_lycan_wolf", () => {
    const wolves = COSMETICS.filter((c) => c.slot === "summon" && c.variant.startsWith("wolf@"));
    expect(wolves.length).toBeGreaterThan(0);
    const rows = Object.fromEntries(manRows("dota_manifest_px2.tsv").map((c) => [c[0], c]));
    for (const c of wolves) {
      expect(c.hero).toBe("lycan");
      const item = index.entityModels[key(rows[c.variant][1])];
      expect(item, `${c.variant}: ${rows[c.variant][1]}`).toBeDefined();
      expect([item.hero, item.slot, item.asset], c.variant).toEqual(["lycan", "summon", "npc_dota_lycan_wolf"]);
    }
  });
});
