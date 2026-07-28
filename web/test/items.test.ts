import { describe, expect, it } from "vitest";
import {
  ITEMS,
  ITEM_IDS,
  evaluateItems,
  itemDef,
  itemLabel,
  protectedBossPenalty,
  validateItems,
} from "../src/game/items.ts";
import { POWER_LIMITS, powerLayers, tournamentPower } from "../src/game/tournamentPower.ts";
import { TACTIC_SLOTS } from "../src/game/tactics.ts";
import { heroTags, taggedHeroIds } from "../src/game/heroTags.ts";

/** Пятёрка героев, у которых точно есть нужный тег — условия предметов проверяем на реальных
 *  данных, а не на выдуманных id: иначе тест разошёлся бы с каталогом тегов. */
function heroesWithTag(tag: string, count: number): number[] {
  return taggedHeroIds()
    .filter((id) => {
      const tags = heroTags(id)!;
      return (tags.play as readonly string[]).includes(tag)
        || (tags.lore as readonly string[]).includes(tag);
    })
    .slice(0, count);
}

describe("Каталог предметов", () => {
  it("размер набора в целевой вилке 25–35 и id уникальны", () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(25);
    expect(ITEMS.length).toBeLessThanOrEqual(35);
    expect(new Set(ITEM_IDS).size).toBe(ITEM_IDS.length);
  });

  it("валидатор каталога чист: множители в полосе, у безусловных есть цена", () => {
    expect(validateItems()).toEqual([]);
  });

  it("все объявленные категории реально представлены", () => {
    const categories = new Set(ITEMS.map((item) => item.category));
    for (const required of ["tagSynergy", "buildDefining", "economy", "bossProtection", "riskReward", "copy"]) {
      expect(categories, `нет ни одного предмета категории ${required}`).toContain(required);
    }
  });

  it("у каждого предмета есть генерируемое описание", () => {
    // Описание собирается из тех же данных, что эффект: карточка не может показать одно, а
    // сделать другое. Проверяем, что шаблон находится для любого вида эффекта.
    for (const item of ITEMS) {
      expect(itemLabel(item.effect).template).toMatch(/^item\.effect\./);
      if (item.drawback) expect(itemLabel(item.drawback).template).toMatch(/^item\.effect\./);
    }
  });

  it("сильные X Mult не выходят за полосу, объявленную в R8.2", () => {
    for (const item of ITEMS) {
      const effect = item.effect;
      if (!("mult" in effect)) continue;
      expect(effect.mult).toBeGreaterThanOrEqual(POWER_LIMITS.xMultMin);
      expect(effect.mult).toBeLessThanOrEqual(POWER_LIMITS.xMultMax);
    }
  });
});

describe("Вклад предметов", () => {
  it("пустой набор ничего не даёт", () => {
    const evaluation = evaluateItems([], { activeHeroes: [] });
    expect(evaluation.flat).toBe(0);
    expect(evaluation.additive).toBe(0);
    expect(evaluation.xMults).toEqual([]);
    expect(evaluation.bossPenaltyFactor).toBe(1);
  });

  it("условие на теге считается по активным героям и упирается в cap", () => {
    const item = itemDef("necronomicon")!;
    const per = "per" in item.effect ? item.effect.per : 0;
    const cap = "cap" in item.effect ? item.effect.cap ?? 0 : 0;
    const few = evaluateItems(["necronomicon"], { activeHeroes: heroesWithTag("summon", 2) });
    const many = evaluateItems(["necronomicon"], { activeHeroes: heroesWithTag("summon", cap + 3) });
    expect(few.flat).toBeCloseTo(2 * per, 6);
    expect(many.flat).toBeCloseTo(cap * per, 6);
  });

  it("невыполненное условие показывается, а не молча исчезает", () => {
    // Иначе игрок видит ноль и не понимает, почему карточка не работает.
    const evaluation = evaluateItems(["aghanimsScepter"], { activeHeroes: [] });
    expect(evaluation.xMults).toEqual([]);
    expect(evaluation.sources).toHaveLength(1);
    expect(evaluation.sources[0]).toMatchObject({ itemId: "aghanimsScepter", met: false });
  });

  it("copy повторяет лучший ЧУЖОЙ множитель и не зависит от порядка карточек", () => {
    const withCopy = ["divineRapier", "refresherOrb"];
    const reversed = ["refresherOrb", "divineRapier"];
    const a = evaluateItems(withCopy, { activeHeroes: [] });
    const b = evaluateItems(reversed, { activeHeroes: [] });
    expect([...a.xMults].sort()).toEqual([...b.xMults].sort());
    // 1.35 → копия 1 + 0.35 × 0.7 = 1.245
    expect(a.xMults).toContain(1.35);
    expect(a.xMults.some((mult) => Math.abs(mult - 1.245) < 1e-9)).toBe(true);
  });

  it("copy без чужих множителей не выдумывает эффект", () => {
    const evaluation = evaluateItems(["refresherOrb"], { activeHeroes: [] });
    expect(evaluation.xMults).toEqual([]);
  });

  it("trade-off применяется вместе с эффектом, а не вместо него", () => {
    const evaluation = evaluateItems(["divineRapier"], { activeHeroes: [] });
    expect(evaluation.xMults).toContain(1.35);
    expect(evaluation.goldPerCamp).toBeLessThan(0);
  });

  it("предметы не умножают Team OVR напрямую — они живут в слоях", () => {
    // Инвариант R8.2: сам счёт состава остаётся читаемым.
    const evaluation = evaluateItems(["divineRapier"], { activeHeroes: [] });
    const layers = powerLayers(100, {
      flat: evaluation.flat, additive: evaluation.additive, xMults: evaluation.xMults,
    });
    expect(layers.teamOvr).toBe(100);
    expect(tournamentPower(layers)).toBeCloseTo(135, 6);
  });
});

describe("Защита от босса", () => {
  it("смягчает штраф, но не отменяет правило", () => {
    const bkb = evaluateItems(["blackKingBar"], { activeHeroes: [] });
    const protectedPenalty = protectedBossPenalty(6, bkb);
    expect(protectedPenalty).toBeGreaterThan(0);
    expect(protectedPenalty).toBeLessThan(6);
  });

  it("потолок ограничивает даже большой штраф", () => {
    const linkens = evaluateItems(["linkensSphere"], { activeHeroes: [] });
    expect(protectedBossPenalty(99, linkens)).toBe(2);
  });

  it("нулевой штраф остаётся нулевым", () => {
    expect(protectedBossPenalty(0, evaluateItems(["blackKingBar"], { activeHeroes: [] }))).toBe(0);
  });
});

describe("Предметы и слоты", () => {
  it("делят те же три пассивных слота, что тактики — второго инвентаря нет", () => {
    // PRD §5.10.1 запрещает заводить рядом с Tactics второе хранилище.
    expect(TACTIC_SLOTS).toBe(3);
    const equipped = ITEM_IDS.slice(0, TACTIC_SLOTS);
    expect(evaluateItems(equipped, { activeHeroes: [] }).sources.length).toBeGreaterThan(0);
  });

  it("неизвестный id молча игнорируется (сейв старого набора не роняет забег)", () => {
    const evaluation = evaluateItems(["nope", "handOfMidas"], { activeHeroes: [] });
    expect(evaluation.goldPerCamp).toBeGreaterThan(0);
    expect(evaluation.sources.every((source) => source.itemId !== "nope")).toBe(true);
  });
});

// Регресс UI-дефекта: Linken's Sphere (потолок штрафа босса) подписывался как «Roster +2», потому
// что слои `boss`/`economy` падали в общий fallback силового слоя. Контракт «вид эффекта → слой»
// закреплён здесь: подпись в UI строится по нему, поэтому разъехаться они больше не могут.
describe("Слой вклада соответствует виду эффекта", () => {
  const layerOf = (id: string) => evaluateItems([id], { activeHeroes: [] }).sources[0]?.layer;

  it("экономические предметы не выдают себя за силу", () => {
    expect(layerOf("handOfMidas")).toBe("economy");
    expect(layerOf("bottle")).toBe("economy");
    expect(layerOf("magicWand")).toBe("economy");
  });

  it("защита от босса — свой слой, а не прибавка к ростеру", () => {
    expect(layerOf("blackKingBar")).toBe("boss");
    expect(layerOf("linkensSphere")).toBe("boss");
    // И значение — потолок штрафа, а не сила: путать их нельзя.
    const evaluation = evaluateItems(["linkensSphere"], { activeHeroes: [] });
    expect(evaluation.flat).toBe(0);
    expect(evaluation.bossPenaltyCap).toBe(2);
  });

  it("силовые слои различают flat / additive / xMult", () => {
    expect(layerOf("necronomicon")).toBe("flat");
    expect(layerOf("heartOfTarrasque")).toBe("additive");
    expect(layerOf("divineRapier")).toBe("xMult");
  });

  it("каждый вид эффекта каталога имеет определённый слой", () => {
    for (const item of ITEMS) {
      const sources = evaluateItems([item.id], { activeHeroes: [] }).sources;
      expect(sources.length, `${item.id}: вклад не попал ни в один слой`).toBeGreaterThan(0);
      for (const source of sources) {
        expect(["flat", "additive", "xMult", "economy", "boss"]).toContain(source.layer);
      }
    }
  });
});
