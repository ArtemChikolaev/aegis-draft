import { describe, expect, it } from "vitest";
import {
  GAMEPLAY_TAGS,
  HERO_TAGS_VERSION,
  LORE_TAGS,
  countAttr,
  countTag,
  distinctGameplayTags,
  hasTag,
  heroTags,
  heroesNeedingReview,
  taggedHeroIds,
  validateHeroTags,
} from "../src/game/heroTags.ts";
import { ITEMS } from "../src/game/items.ts";
import { loadGameData } from "./helpers/data.ts";

// Этот файл И ЕСТЬ валидатор тегов из DoD R8.1: он гоняется в CI, поэтому новый герой в датасете
// или опечатка в словаре краснеют сразу, а не всплывают в условиях предметов.
describe("hero tags — валидатор курируемого файла", () => {
  const data = loadGameData();
  const heroIds = data.heroes.map((hero) => hero.id);

  it("покрывает всех героев датасета и не содержит лишних", () => {
    const issues = validateHeroTags(heroIds);
    // Сообщение важнее самого падения: при рефреше данных сразу видно, кого дотегировать.
    expect(issues.map((i) => `${i.heroId}: ${i.problem}`)).toEqual([]);
    expect(taggedHeroIds()).toHaveLength(heroIds.length);
  });

  it("словари закрыты, объективный слой заполнен, gameplay-теги непусты", () => {
    for (const heroId of heroIds) {
      const tags = heroTags(heroId)!;
      expect(tags.attr).toBeTruthy();
      expect(tags.range).toBeTruthy();
      expect(tags.play.length).toBeGreaterThan(0);
      for (const tag of tags.lore) expect(LORE_TAGS).toContain(tag);
      for (const tag of tags.play) expect(GAMEPLAY_TAGS).toContain(tag);
    }
  });

  it("каждый тег словаря реально кем-то используется", () => {
    // Мёртвый тег хуже отсутствующего: под него можно написать предмет, который никогда не сработает.
    for (const tag of [...LORE_TAGS, ...GAMEPLAY_TAGS]) {
      expect(countTag(heroIds, tag), `тег "${tag}" не назначен ни одному герою`).toBeGreaterThan(0);
    }
  });

  it("распределение не выродилось: ни один тег не покрывает почти всех", () => {
    // Тег, который есть у 80% ростера, не различает сборки и как условие бесполезен.
    for (const tag of [...LORE_TAGS, ...GAMEPLAY_TAGS]) {
      const share = countTag(heroIds, tag) / heroIds.length;
      expect(share, `тег "${tag}" покрывает ${Math.round(100 * share)}% героев`).toBeLessThan(0.6);
    }
  });

  it("каждому тегу, который читает предмет, хватает героев добить cap (R12.7)", () => {
    // Предмет с cap выше числа носителей тега никогда не выйдет на полную силу — это мёртвый
    // потолок, который выглядит как контент. Требуем запас: героев минимум cap + 1, чтобы даже
    // один бан/вылет не делал полный cap математически недостижимым.
    for (const item of ITEMS) {
      const effect = item.effect as { kind: string; tag?: string; cap?: number; min?: number };
      if (!effect.tag) continue;
      const need = (effect.cap ?? effect.min ?? 1) + 1;
      const carriers = countTag(heroIds, effect.tag as Parameters<typeof countTag>[1]);
      expect(carriers, `«${item.id}» читает тег "${effect.tag}": носителей ${carriers}, нужно ≥ ${need}`)
        .toBeGreaterThanOrEqual(need);
    }
  });

  it("все четыре атрибута представлены", () => {
    for (const attr of ["str", "agi", "int", "universal"] as const) {
      expect(countAttr(heroIds, attr)).toBeGreaterThan(0);
    }
  });

  it("детерминизм: чтение не зависит от порядка обращения", () => {
    const first = heroIds.map((id) => JSON.stringify(heroTags(id)));
    const second = [...heroIds].reverse().map((id) => JSON.stringify(heroTags(id))).reverse();
    expect(first).toEqual(second);
    expect(HERO_TAGS_VERSION).toBe(1);
  });

  it("хелперы условий считают по набору, а не по одному герою", () => {
    // Anti-Mage (1) mobility, Axe (2) control+teamfight, Pudge (14) undead+control.
    expect(hasTag(1, "mobility")).toBe(true);
    expect(hasTag(1, "undead")).toBe(false);
    expect(countTag([1, 2, 14], "control")).toBe(2);
    expect(countTag([14, 42, 85], "undead")).toBe(3);
    expect(distinctGameplayTags([1])).toBe(heroTags(1)!.play.length);
    expect(distinctGameplayTags([1, 1, 1])).toBe(heroTags(1)!.play.length);
    expect(distinctGameplayTags([])).toBe(0);
    expect(hasTag(999_999, "control")).toBe(false);
  });

  it("спорные классификации помечены явно, а не выданы за факт", () => {
    const review = heroesNeedingReview();
    // Флаг обязан быть узким: если «на ревью» половина файла, он перестаёт что-то значить.
    expect(review.length).toBeLessThan(0.1 * heroIds.length);
  });
});
