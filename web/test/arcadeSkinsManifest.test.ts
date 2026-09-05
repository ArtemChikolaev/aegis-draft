import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COSMETICS, skinnedHero } from "../src/game/arcade/content/cosmetics.ts";
import { HEROES } from "../src/game/arcade/content/heroes.ts";

// Скины — контент из трёх мест (cosmetics.ts, манифесты спрайтов, i18n): тест держит их в согласии, иначе скин
// в лавке косметики есть, а листа под него нет (2026-09-06, партия 2 аркан/персон).
const rows = (file: string) => readFileSync(new URL(`../scripts/blender/${file}`, import.meta.url), "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t")[0]);

describe("скины Аркады: косметика ↔ манифесты спрайтов ↔ герои", () => {
  const skins = COSMETICS.filter((c) => c.slot === "skin");
  it("каждый скин привязан к существующему герою и назван `<hero>@<skin>`", () => {
    expect(skins.length).toBeGreaterThanOrEqual(18);
    for (const s of skins) {
      expect(s.hero && HEROES[s.hero as keyof typeof HEROES], s.id).toBeTruthy();
      expect(s.variant.startsWith(`${s.hero}@`), s.id).toBe(true);
    }
  });
  it("под каждый скин есть строка в обоих пиксельных манифестах", () => {
    const px = new Set(rows("dota_manifest_px.tsv")), px2 = new Set(rows("dota_manifest_px2.tsv"));
    for (const s of skins) { expect(px.has(s.variant), `${s.variant} в dota_manifest_px.tsv`).toBe(true); expect(px2.has(s.variant), `${s.variant} в dota_manifest_px2.tsv`).toBe(true); }
  });
  it("у каждого героя из HEROES есть строка в манифестах спрайтов", () => {
    const px2 = new Set(rows("dota_manifest_px2.tsv"));
    for (const id of Object.keys(HEROES)) expect(px2.has(id), id).toBe(true);
  });
  it("skinnedHero: скин чужого героя не применяется", () => {
    expect(skinnedHero("zeus", { skin: "skin_zeus_arcana" })).toBe("zeus@arcana");
    expect(skinnedHero("lina", { skin: "skin_zeus_arcana" })).toBe("lina");
  });
});
