import { describe, expect, it } from "vitest";
import { ITEM_ART, itemArtSlug } from "../src/game/itemArt.ts";
import {
  ITEMS,
  ITEM_IDS,
  ITEM_RARITY,
  conditionAxes,
  effectMatch,
  evaluateItems,
  itemAt,
  itemDef,
  itemLabel,
  protectedBossPenalty,
  validateItems,
} from "../src/game/items.ts";
import { RARITIES } from "../src/game/rarity.ts";
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
    const evaluation = evaluateItems([], { activeHeroes: [], cardRarity: {} });
    expect(evaluation.flat).toBe(0);
    expect(evaluation.additive).toBe(0);
    expect(evaluation.xMults).toEqual([]);
    expect(evaluation.bossPenaltyFactor).toBe(1);
  });

  it("условие на теге считается по активным героям и упирается в cap", () => {
    const item = itemDef("necronomicon")!;
    const per = "per" in item.effect ? item.effect.per : 0;
    const cap = "cap" in item.effect ? item.effect.cap ?? 0 : 0;
    const few = evaluateItems(["necronomicon"], { activeHeroes: heroesWithTag("summon", 2), cardRarity: {} });
    const many = evaluateItems(["necronomicon"], { activeHeroes: heroesWithTag("summon", cap + 3), cardRarity: {} });
    expect(few.flat).toBeCloseTo(2 * per, 6);
    expect(many.flat).toBeCloseTo(cap * per, 6);
  });

  it("невыполненное условие показывается, а не молча исчезает", () => {
    // Иначе игрок видит ноль и не понимает, почему карточка не работает.
    const evaluation = evaluateItems(["aghanimsScepter"], { activeHeroes: [], cardRarity: {} });
    expect(evaluation.xMults).toEqual([]);
    expect(evaluation.sources).toHaveLength(1);
    expect(evaluation.sources[0]).toMatchObject({ itemId: "aghanimsScepter", met: false });
  });

  it("copy повторяет лучший ЧУЖОЙ множитель и не зависит от порядка карточек", () => {
    const withCopy = ["divineRapier", "refresherOrb"];
    const reversed = ["refresherOrb", "divineRapier"];
    const a = evaluateItems(withCopy, { activeHeroes: [], cardRarity: {} });
    const b = evaluateItems(reversed, { activeHeroes: [], cardRarity: {} });
    expect([...a.xMults].sort()).toEqual([...b.xMults].sort());
    // 1.35 → копия 1 + 0.35 × 0.5 = 1.175. Базовая доля 0.5 (было 0.7) — при 0.7 два верхних тира
    // упирались в потолок «не больше 100% чужого множителя» и давали одно число (R12.3).
    expect(a.xMults).toContain(1.35);
    expect(a.xMults.some((mult) => Math.abs(mult - 1.175) < 1e-9)).toBe(true);
  });

  it("copy без чужих множителей не выдумывает эффект", () => {
    const evaluation = evaluateItems(["refresherOrb"], { activeHeroes: [], cardRarity: {} });
    expect(evaluation.xMults).toEqual([]);
  });

  it("trade-off применяется вместе с эффектом, а не вместо него", () => {
    const evaluation = evaluateItems(["divineRapier"], { activeHeroes: [], cardRarity: {} });
    expect(evaluation.xMults).toContain(1.35);
    expect(evaluation.goldPerCamp).toBeLessThan(0);
  });

  it("предметы не умножают Team OVR напрямую — они живут в слоях", () => {
    // Инвариант R8.2: сам счёт состава остаётся читаемым.
    const evaluation = evaluateItems(["divineRapier"], { activeHeroes: [], cardRarity: {} });
    const layers = powerLayers(100, {
      flat: evaluation.flat, additive: evaluation.additive, xMults: evaluation.xMults,
    });
    expect(layers.teamOvr).toBe(100);
    expect(tournamentPower(layers)).toBeCloseTo(135, 6);
  });
});

describe("Защита от босса", () => {
  it("смягчает штраф, но не отменяет правило", () => {
    const bkb = evaluateItems(["blackKingBar"], { activeHeroes: [], cardRarity: {} });
    const protectedPenalty = protectedBossPenalty(6, bkb, 0);
    expect(protectedPenalty).toBeGreaterThan(0);
    expect(protectedPenalty).toBeLessThan(6);
  });

  it("потолок ограничивает даже большой штраф", () => {
    const linkens = evaluateItems(["linkensSphere"], { activeHeroes: [], cardRarity: {} });
    expect(protectedBossPenalty(99, linkens, 0)).toBe(2);
  });

  it("нулевой штраф остаётся нулевым", () => {
    expect(protectedBossPenalty(0, evaluateItems(["blackKingBar"], { activeHeroes: [], cardRarity: {} }), 0)).toBe(0);
  });
});

describe("Предметы и слоты", () => {
  it("делят те же пять пассивных слотов, что тактики — второго инвентаря нет", () => {
    // PRD §5.10.1 запрещает заводить рядом с Tactics второе хранилище.
    expect(TACTIC_SLOTS).toBe(5);
    const equipped = ITEM_IDS.slice(0, TACTIC_SLOTS);
    expect(evaluateItems(equipped, { activeHeroes: [], cardRarity: {} }).sources.length).toBeGreaterThan(0);
  });

  it("неизвестный id молча игнорируется (сейв старого набора не роняет забег)", () => {
    const evaluation = evaluateItems(["nope", "handOfMidas"], { activeHeroes: [], cardRarity: {} });
    expect(evaluation.goldPerCamp).toBeGreaterThan(0);
    expect(evaluation.sources.every((source) => source.itemId !== "nope")).toBe(true);
  });
});

// Регресс UI-дефекта: Linken's Sphere (потолок штрафа босса) подписывался как «Roster +2», потому
// что слои `boss`/`economy` падали в общий fallback силового слоя. Контракт «вид эффекта → слой»
// закреплён здесь: подпись в UI строится по нему, поэтому разъехаться они больше не могут.
describe("Слой вклада соответствует виду эффекта", () => {
  const layerOf = (id: string) => evaluateItems([id], { activeHeroes: [], cardRarity: {} }).sources[0]?.layer;

  it("экономические предметы не выдают себя за силу", () => {
    expect(layerOf("handOfMidas")).toBe("economy");
    expect(layerOf("bottle")).toBe("economy");
    expect(layerOf("magicWand")).toBe("economy");
  });

  it("защита от босса — свой слой, а не прибавка к ростеру", () => {
    expect(layerOf("blackKingBar")).toBe("boss");
    expect(layerOf("linkensSphere")).toBe("boss");
    // И значение — потолок штрафа, а не сила: путать их нельзя.
    const evaluation = evaluateItems(["linkensSphere"], { activeHeroes: [], cardRarity: {} });
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
      const sources = evaluateItems([item.id], { activeHeroes: [], cardRarity: {} }).sources;
      expect(sources.length, `${item.id}: вклад не попал ни в один слой`).toBeGreaterThan(0);
      for (const source of sources) {
        expect(["flat", "additive", "xMult", "economy", "boss"]).toContain(source.layer);
      }
    }
  });
});

// R11.2: качество карточки. Слоты не растут, поэтому тир — единственный способ билду расти
// после третьей карты; масштабируются ЧИСЛА эффекта, но не его цена.
describe("Качество карточки", () => {
  it("тир усиливает эффект и не трогает цену", () => {
    const radiance = itemDef("radiance")!; // additivePerTag + drawback goldPerCamp
    const common = itemAt(radiance, "common");
    const immortal = itemAt(radiance, "immortal");
    expect(common.effect.kind).toBe("additivePerTag");
    if (common.effect.kind === "additivePerTag" && immortal.effect.kind === "additivePerTag") {
      expect(immortal.effect.per).toBeGreaterThan(common.effect.per);
      expect(immortal.effect.cap).toBe(common.effect.cap);
    }
    // Цена — тот же объект: высокий тир даёт лучшее СООТНОШЕНИЕ, а не раздутую карту целиком.
    expect(immortal.drawback).toEqual(common.drawback);
  });

  it("масштаб монотонен по тиру у всех карточек каталога", () => {
    const magnitudeOf = (effect: ReturnType<typeof itemAt>["effect"]): number => {
      switch (effect.kind) {
        case "flatPerTag": case "additivePerTag": case "additivePerAttr": return effect.per;
        case "xMultOnDiversity": case "xMultOnTag": case "xMultWithoutTag": case "xMultFlat":
          return effect.mult;
        case "copyBestXMult": return effect.rate;
        case "goldPerCamp": return effect.gold;
        case "freeRerolls": return effect.count;
        case "interestCap": return effect.bonus;
        // Антибоссовые: сильнее = МЕНЬШЕ число, поэтому сравниваем со знаком минус.
        case "bossPenaltyFactor": return -effect.factor;
        case "bossPenaltyCap": return -effect.cap;
      }
    };
    for (const item of ITEMS) {
      const ladder = RARITIES.map((r) => magnitudeOf(itemAt(item, r).effect));
      for (let i = 1; i < ladder.length; i += 1) {
        expect(ladder[i]).toBeGreaterThanOrEqual(ladder[i - 1]);
      }
    }
  });

  it("X Mult высокого тира не пробивает абсолютный потолок", () => {
    for (const item of ITEMS) {
      const top = itemAt(item, "immortal").effect;
      if ("mult" in top) expect(top.mult).toBeLessThanOrEqual(POWER_LIMITS.xMultHard);
    }
    // Валидатор каталога знает про тиры и молчит на текущем наборе.
    expect(validateItems()).toEqual([]);
  });

  it("evaluateItems читает тир из контекста, отсутствие записи = common", () => {
    const heroes = heroesWithTag("teamfight", 5);
    const plain = evaluateItems(["radiance"], { activeHeroes: heroes, cardRarity: {} });
    const noRecord = evaluateItems(["radiance"], { activeHeroes: heroes, cardRarity: {} });
    const mythic = evaluateItems(["radiance"], { activeHeroes: heroes, cardRarity: { radiance: "mythic" } });
    expect(noRecord.additive).toBe(plain.additive);
    expect(mythic.additive).toBeGreaterThan(plain.additive);
    // Цена (goldPerCamp у radiance) осталась прежней.
    expect(mythic.goldPerCamp).toBe(plain.goldPerCamp);
  });

  // Тот же дефект, что поймал ручной проход: описание карточки было масштабировано тиром, а
  // вклад — нет. Здесь связка проверяется в чистом слое и детерминированно (в e2e она зависит от
  // того, есть ли на ростере герой с нужным тегом).
  it("число в описании и число во вкладе — одно и то же на любом тире", () => {
    const heroes = heroesWithTag("teamfight", 2);
    for (const rarity of RARITIES) {
      const scaled = itemAt(itemDef("radiance")!, rarity);
      const label = itemLabel(scaled.effect);
      const evaluation = evaluateItems(["radiance"], {
        activeHeroes: heroes,
        cardRarity: { radiance: rarity },
      });
      expect(evaluation.additive).toBeCloseTo(Number(label.params.per) * heroes.length, 5);
    }
  });

  it("босс: высокий тир срезает больше штрафа, но иммунитет не выдаёт", () => {
    const bkb = itemDef("blackKingBar")!;
    const top = itemAt(bkb, "immortal").effect;
    expect(top.kind).toBe("bossPenaltyFactor");
    if (top.kind === "bossPenaltyFactor") {
      expect(top.factor).toBeLessThan(0.4);
      expect(top.factor).toBeGreaterThanOrEqual(ITEM_RARITY.bossFactorFloor);
    }
  });
});

// R11.7: карточка обязана показывать, КТО из активных героев её включает. Считается из тех же
// countTag/countAttr, что и сам эффект, — подсветка не может разойтись с числом.
describe("Подсветка подходящих героев", () => {
  it("per-tag: подсвечивает всех с тегом и честно говорит про потолок", () => {
    const def = itemDef("mantaStyle")!; // additivePerTag illusion, cap 3
    const heroes = heroesWithTag("illusion", 4);
    const match = effectMatch(def.effect, { activeHeroes: heroes, cardRarity: {} });
    expect(match.kind).toBe("tag");
    expect(match.tag).toBe("illusion");
    expect(match.heroIds).toEqual(heroes);
    // Сверх потолка герои всё равно подсвечены, но засчитано ровно `cap`.
    expect(match.counted).toBe(3);
    expect(match.cap).toBe(3);
    expect(match.met).toBe(true);
  });

  it("подсвеченные герои совпадают с тем, за что реально платит эффект", () => {
    const def = itemDef("pipeOfInsight")!; // additivePerTag teamfight
    const heroes = heroesWithTag("teamfight", 3);
    const match = effectMatch(def.effect, { activeHeroes: heroes, cardRarity: {} });
    const evaluation = evaluateItems([def.id], { activeHeroes: heroes, cardRarity: {} });
    const per = def.effect.kind === "additivePerTag" ? def.effect.per : 0;
    expect(evaluation.additive).toBeCloseTo(match.counted * per, 5);
  });

  it("порог xMultOnTag: пока не набрано — условие не выполнено", () => {
    const def = itemDef("vladmirsOffering")!; // xMultOnTag teamfight, min 3
    const few = effectMatch(def.effect, { activeHeroes: heroesWithTag("teamfight", 2), cardRarity: {} });
    const enough = effectMatch(def.effect, { activeHeroes: heroesWithTag("teamfight", 3), cardRarity: {} });
    expect(few.min).toBe(3);
    expect(few.met).toBe(false);
    expect(enough.met).toBe(true);
  });

  it("«без тега»: подсвечиваются НАРУШИТЕЛИ, а пустой список = условие выполнено", () => {
    const def = itemDef("bloodstone")!; // xMultWithoutTag scaling
    const breakers = heroesWithTag("scaling", 2);
    const broken = effectMatch(def.effect, { activeHeroes: breakers, cardRarity: {} });
    expect(broken.kind).toBe("withoutTag");
    expect(broken.heroIds).toEqual(breakers);
    expect(broken.met).toBe(false);
    const clean = effectMatch(def.effect, { activeHeroes: [], cardRarity: {} });
    expect(clean.heroIds).toEqual([]);
    expect(clean.met).toBe(true);
  });

  it("diversity считает разные gameplay-теги, а не героев", () => {
    const def = itemDef("aghanimsShard")!; // xMultOnDiversity min 7
    const match = effectMatch(def.effect, { activeHeroes: taggedHeroIds().slice(0, 5), cardRarity: {} });
    expect(match.kind).toBe("diversity");
    expect(match.heroIds).toEqual([]);
    expect(match.distinct).toBeGreaterThan(0);
    expect(match.min).toBe(7);
  });

  it("у карточек без условия по героям подсветки нет вовсе", () => {
    for (const id of ["handOfMidas", "bottle", "magicWand", "blackKingBar", "linkensSphere", "refresherOrb"]) {
      const match = effectMatch(itemDef(id)!.effect, { activeHeroes: taggedHeroIds().slice(0, 5), cardRarity: {} });
      expect(match.kind, id).toBe("none");
      expect(match.heroIds, id).toEqual([]);
    }
  });
});

// R11.7: по каким осям у экипированного билда есть условие. Нужно, чтобы узкая карточка героя
// показывала не все его теги (в среднем четыре — шум), а только играющие прямо сейчас.
describe("Оси условий экипированного билда", () => {
  it("собирает теги и атрибуты из эффектов", () => {
    const axes = conditionAxes(["mantaStyle", "butterfly"]);
    expect(axes.tags).toContain("illusion"); // mantaStyle
    expect(axes.attrs).toContain("agi"); // butterfly
  });

  it("учитывает условие drawback наравне с основным", () => {
    // smokeOfDeceit: выгода за stealth, ЦЕНА за control. Герой, за которого карточка берёт цену,
    // для игрока не менее важен, чем тот, за которого платит.
    const axes = conditionAxes(["smokeOfDeceit"]);
    expect(axes.tags).toContain("stealth");
    expect(axes.tags).toContain("control");
  });

  it("карточки без условий по героям осей не добавляют", () => {
    expect(conditionAxes(["handOfMidas", "bottle", "refresherOrb"])).toEqual({ tags: [], attrs: [] });
  });

  it("пустой билд и неизвестные id не роняют расчёт", () => {
    expect(conditionAxes([])).toEqual({ tags: [], attrs: [] });
    expect(conditionAxes(["nope", "signatureSpecialists"])).toEqual({ tags: [], attrs: [] });
  });

  it("оси не дублируются, даже если условие повторяется в нескольких карточках", () => {
    const axes = conditionAxes(["vladmirsOffering", "pipeOfInsight"]); // обе про teamfight
    expect(axes.tags.filter((tag) => tag === "teamfight")).toHaveLength(1);
  });
});

// R14.5: таблица иконок обязана покрывать ВЕСЬ каталог и не содержать лишнего. Иначе новый предмет
// молча приезжает без картинки, а удалённый оставляет мёртвый слаг — оба случая на глаз незаметны.
describe("иконки предметов", () => {
  it("ITEM_ART покрывает каталог один-в-один", () => {
    expect(Object.keys(ITEM_ART).sort()).toEqual([...ITEM_IDS].sort());
  });

  it("itemArtSlug отдаёт null для не-предметов", () => {
    expect(itemArtSlug(undefined)).toBeNull();
    expect(itemArtSlug("signatureSpecialists")).toBeNull();
    expect(itemArtSlug("shadowBlade")).toBe("invis_sword");
  });
});
