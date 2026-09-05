import { describe, expect, it } from "vitest";
import { dictionaries, type Locale } from "../src/i18n/core.ts";
import { TACTICS } from "../src/game/tactics.ts";
import { ITEMS } from "../src/game/items.ts";
import { CAMP_ACTIONS } from "../src/game/campActions.ts";
import { BOSSES } from "../src/game/bossConditions.ts";
import { MUTATORS } from "../src/game/dynastyMutators.ts";
import { TALENTS, UPGRADES } from "../src/game/arcade/content/schools.ts";
import { ARCADE_ITEMS } from "../src/game/arcade/content/items.ts";
import { HEROES, HERO_IDS } from "../src/game/arcade/content/heroes.ts";
import { COSMETICS } from "../src/game/arcade/content/cosmetics.ts";
import { NEUTRALS } from "../src/game/arcade/content/neutrals.ts";
import { GEAR_BASES, UNIQUES } from "../src/game/arcade/content/gear.ts";

// Ключи карт/боссов/мутаторов собираются в рантайме шаблоном (`${kind}.${id}`, `${item ? "item" : "tactic"}.${id}`),
// поэтому tsc их не проверяет, а grep по литералу не видит. 2026-09-02 шесть `tactic.*` удалили как
// «мёртвые» — Буткемп упал целиком. Этот тест держит контракт «каталог ↔ словарь» для обеих локалей.
const expectedKeys = [
  ...Object.keys(TACTICS).flatMap((id) => [`tactic.${id}`, `tactic.desc.${id}`]),
  ...ITEMS.map((item) => `item.${item.id}`),
  ...Object.keys(CAMP_ACTIONS).flatMap((id) => [`action.${id}`, `action.desc.${id}`]),
  ...Object.keys(BOSSES).flatMap((id) => [`boss.${id}`, `boss.desc.${id}`]),
  ...Object.keys(MUTATORS).flatMap((id) => [`mutator.${id}`, `mutator.desc.${id}`]),
  ...UPGRADES.flatMap((u) => [`arcade.up.${u.id}`, `arcade.up.${u.id}.desc`]),
  ...Object.values(TALENTS).flat().map((id) => `arcade.t.${id}`),
  ...ARCADE_ITEMS.flatMap((i) => [`arcade.item.${i.id}`, `arcade.item.${i.id}.desc`]),
  ...[...new Set(HERO_IDS.map((h) => HEROES[h].kit))].flatMap((kit) => ["q", "w", "e", "r"].flatMap((k) => [`arcade.ab.${kit}.${k}`, `arcade.ab.${kit}.${k}.desc`])),
  ...[...new Set(HERO_IDS.filter((h) => HEROES[h].kit !== h).map((h) => HEROES[h].kit))].map((a) => `arcade.arch.${a}`),
  ...COSMETICS.map((c) => `arcade.cosmetic.${c.id}`),
  ...NEUTRALS.flatMap((n) => [`arcade.neutral.${n.id}`, `arcade.neutral.${n.id}.desc`]),
  ...GEAR_BASES.map((b) => `arcade.gearName.${b.id}`),
  ...Object.values(UNIQUES).map((u) => `arcade.gearName.${u.base}`),
];

describe("i18n: ключи каталогов карт существуют в обеих локалях", () => {
  for (const locale of Object.keys(dictionaries) as Locale[]) {
    it(locale, () => {
      const dict = dictionaries[locale] as Record<string, string>;
      const missing = expectedKeys.filter((key) => dict[key] === undefined);
      expect(missing).toEqual([]);
    });
  }
});
