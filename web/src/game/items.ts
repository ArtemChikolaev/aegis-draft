// Предметы Roguelite Run (R8.3) — первый production-набор пассивных карточек, выраженных в слоях
// Tournament Power (R8.2) и условных по тегам героев (R8.1).
//
// ПОЧЕМУ ЭТО НЕ ВТОРОЙ ИНВЕНТАРЬ. PRD §5.10.1 прямо запрещает заводить рядом с Tactics ещё одно
// абстрактное хранилище. Поэтому предмет — такая же пассивная карточка и занимает ТЕ ЖЕ три слота:
// в сейве это тот же список id, в награде — тот же карточный оффер. Разница только в том, куда
// целится эффект: тактика двигает слагаемые `Team OVR`, предмет — слои силы забега, экономику или
// защиту от босса. Team OVR предметами по-прежнему не умножается (инвариант R8.2).
//
// ПОЧЕМУ ОПИСАНИЯ ГЕНЕРИРУЮТСЯ, А НЕ ПИШУТСЯ РУКАМИ. У каждого предмета эффект — данные, поэтому
// строка описания собирается из шаблона по этим же данным. Иначе текст и число разъезжаются при
// первой же калибровке, и карточка начинает врать игроку.
//
// КАЧЕСТВО КАРТОЧКИ (R11.2). Предмет и тактика делят ТРИ слота, и слоты не растут. Значит после
// трёх взятых карт билд был бы заморожен навсегда: расти внутри слота нечем, а это ровно тот же
// потолок, в который упирается рынок игроков на позднем этапе. Поэтому у карточки есть тир по той
// же лестнице, что у героев (`rarity.ts`), и тир масштабирует ЧИСЛА эффекта.
// Цена карточки (`drawback`) при этом НЕ масштабируется: смысл более высокого тира — лучшее
// соотношение пользы к цене, а не пропорционально раздутая карта.
import {
  countAttr,
  countTag,
  distinctGameplayTags,
  hasTag,
  heroTags,
  type HeroAttr,
  type HeroTag,
} from "./heroTags.ts";
import { POWER_LIMITS } from "./tournamentPower.ts";
import { RARITIES, rarityRank, type Rarity } from "./rarity.ts";
import { chargeFactor, temperedPenaltyFactor } from "./editions.ts";

export type ItemCategory =
  | "tagSynergy"
  | "buildDefining"
  | "economy"
  | "bossProtection"
  | "riskReward"
  | "copy";

/** Эффект предмета. Дискриминированный союз: описание, оценка и применение читают ОДНО описание
 *  эффекта, поэтому карточка не может показывать одно, а делать другое. */
export type ItemEffect =
  /** Плоская прибавка к силе ростера за каждого героя с тегом. */
  | { kind: "flatPerTag"; tag: HeroTag; per: number; cap?: number }
  /** Аддитивный множитель (процентные пункты) за каждого героя с тегом. */
  | { kind: "additivePerTag"; tag: HeroTag; per: number; cap?: number }
  /** Аддитивный множитель за каждого героя с атрибутом. */
  | { kind: "additivePerAttr"; attr: HeroAttr; per: number; cap?: number }
  /** X Mult при выполнении условия «разных gameplay-тегов не меньше N». */
  | { kind: "xMultOnDiversity"; min: number; mult: number }
  /** X Mult при выполнении условия «героев с тегом не меньше N». */
  | { kind: "xMultOnTag"; tag: HeroTag; min: number; mult: number }
  /** X Mult при ОТСУТСТВИИ героев с тегом (анти-жадность). */
  | { kind: "xMultWithoutTag"; tag: HeroTag; mult: number }
  /** Безусловный X Mult — платой служит отдельный `drawback`. */
  | { kind: "xMultFlat"; mult: number }
  /** Повторяет лучший ЧУЖОЙ X Mult с указанной эффективностью. */
  | { kind: "copyBestXMult"; rate: number }
  /** Золото каждый Буткемп (отрицательное — цена карточки). */
  | { kind: "goldPerCamp"; gold: number }
  /** Бесплатные реролы рынка каждый Буткемп. */
  | { kind: "freeRerolls"; count: number }
  /** Прибавка к потолку процентов за накопление. */
  | { kind: "interestCap"; bonus: number }
  /** Множитель штрафа босса: 0.4 — штраф уменьшается на 60%. */
  | { kind: "bossPenaltyFactor"; factor: number }
  /** Абсолютный потолок штрафа босса. */
  | { kind: "bossPenaltyCap"; cap: number };

export interface ItemDef {
  id: string;
  category: ItemCategory;
  effect: ItemEffect;
  /** Цена карточки: второй эффект, ухудшающий положение. Trade-off обязателен у сильных карт —
   *  безусловные «+N ко всему» PRD запрещает (§5.10.3). */
  drawback?: ItemEffect;
}

/** Каталог (часть BALANCE_CONFIG_VERSION — правишь числа, бампай версию в balance.ts).
 *  Числа — placeholder под калибровку `R10`; важна структура и наличие trade-off у сильных карт.
 *  Ориентир силы: один шаг угрозы этапа = `ANTE_FIELD_STEP` (3 очка), поэтому одиночная карточка
 *  должна давать заметно меньше этапа, а собранный билд из трёх — примерно покрывать один шаг. */
export const ITEMS: readonly ItemDef[] = [
  // ── Синергия по gameplay-тегам: награда за осознанный подбор героев ────────────────────────
  { id: "necronomicon", category: "tagSynergy", effect: { kind: "flatPerTag", tag: "summon", per: 2.5, cap: 3 } },
  { id: "mantaStyle", category: "tagSynergy", effect: { kind: "additivePerTag", tag: "illusion", per: 6, cap: 3 } },
  { id: "scytheOfVyse", category: "tagSynergy", effect: { kind: "additivePerTag", tag: "control", per: 2, cap: 5 } },
  { id: "bootsOfTravel", category: "tagSynergy", effect: { kind: "flatPerTag", tag: "global", per: 2, cap: 3 } },
  { id: "guardianGreaves", category: "tagSynergy", effect: { kind: "additivePerTag", tag: "heal", per: 5, cap: 3 } },
  { id: "forceStaff", category: "tagSynergy", effect: { kind: "flatPerTag", tag: "mobility", per: 1.5, cap: 4 } },
  { id: "shadowBlade", category: "tagSynergy", effect: { kind: "additivePerTag", tag: "stealth", per: 8, cap: 3 } },
  { id: "assaultCuirass", category: "tagSynergy", effect: { kind: "flatPerTag", tag: "push", per: 2, cap: 4 } },
  { id: "octarineCore", category: "tagSynergy", effect: { kind: "additivePerTag", tag: "burst", per: 4, cap: 4 } },
  { id: "battleFury", category: "tagSynergy", effect: { kind: "flatPerTag", tag: "scaling", per: 2, cap: 4 } },
  { id: "pipeOfInsight", category: "tagSynergy", effect: { kind: "additivePerTag", tag: "teamfight", per: 3, cap: 4 } },
  { id: "silverEdge", category: "tagSynergy", effect: { kind: "additivePerTag", tag: "pickoff", per: 3, cap: 4 } },

  // ── Синергия по lore: другая ось подбора, часто конфликтует с gameplay-осью ────────────────
  { id: "maskOfMadness", category: "tagSynergy", effect: { kind: "additivePerTag", tag: "beast", per: 4, cap: 4 } },
  { id: "eulsScepter", category: "tagSynergy", effect: { kind: "flatPerTag", tag: "spirit", per: 2.5, cap: 3 } },
  { id: "dagon", category: "tagSynergy", effect: { kind: "additivePerTag", tag: "dark", per: 4, cap: 4 } },
  { id: "holyLocket", category: "tagSynergy", effect: { kind: "flatPerTag", tag: "light", per: 4, cap: 3 } },
  { id: "heartOfTarrasque", category: "tagSynergy", effect: { kind: "additivePerAttr", attr: "str", per: 4, cap: 4 } },
  { id: "butterfly", category: "tagSynergy", effect: { kind: "additivePerAttr", attr: "agi", per: 4, cap: 4 } },

  // ── Build-defining: множители за структуру состава, а не за отдельного героя ───────────────
  { id: "aghanimsScepter", category: "buildDefining", effect: { kind: "xMultOnDiversity", min: 9, mult: 1.18 } },
  { id: "aghanimsShard", category: "buildDefining", effect: { kind: "xMultOnDiversity", min: 7, mult: 1.10 } },
  { id: "bloodstone", category: "buildDefining", effect: { kind: "xMultWithoutTag", tag: "scaling", mult: 1.22 } },
  { id: "vladmirsOffering", category: "buildDefining", effect: { kind: "xMultOnTag", tag: "teamfight", min: 3, mult: 1.15 } },
  { id: "desolator", category: "buildDefining", effect: { kind: "xMultOnTag", tag: "pickoff", min: 3, mult: 1.15 } },

  // ── Copy: сильны только в уже собранном билде ──────────────────────────────────────────────
  // Базовая доля — 0.5, а не 0.7: `rate` упирается в потолок 1.0 (копировать больше 100% чужого
  // множителя нельзя), и при 0.7 два верхних тира давали одно и то же число (R12.3).
  { id: "refresherOrb", category: "copy", effect: { kind: "copyBestXMult", rate: 0.5 } },

  // ── Экономика: не дают силы напрямую (PRD §5.9.3) ──────────────────────────────────────────
  { id: "handOfMidas", category: "economy", effect: { kind: "goldPerCamp", gold: 4 } },
  { id: "bottle", category: "economy", effect: { kind: "freeRerolls", count: 1 } },
  { id: "magicWand", category: "economy", effect: { kind: "interestCap", bonus: 2 } },
  { id: "observerWard", category: "economy", effect: { kind: "freeRerolls", count: 2 }, drawback: { kind: "goldPerCamp", gold: -2 } },

  // ── Защита от босса: контрится подготовкой, а не отменяет правило ──────────────────────────
  // Базовый фактор — 0.55, а не 0.4: срезаемая доля упирается в `bossFactorFloor`, и при 0.4 exotic
  // с arcana сходились в один и тот же пол (R12.3). Ладдер теперь `0.55 / 0.44 / 0.28 / 0.15`.
  { id: "blackKingBar", category: "bossProtection", effect: { kind: "bossPenaltyFactor", factor: 0.55 } },
  { id: "linkensSphere", category: "bossProtection", effect: { kind: "bossPenaltyCap", cap: 2 } },

  // ── Risk/reward: большой множитель за реальную цену ────────────────────────────────────────
  { id: "divineRapier", category: "riskReward", effect: { kind: "xMultFlat", mult: 1.35 }, drawback: { kind: "goldPerCamp", gold: -5 } },
  { id: "radiance", category: "riskReward", effect: { kind: "additivePerTag", tag: "teamfight", per: 6, cap: 5 }, drawback: { kind: "goldPerCamp", gold: -3 } },
  // Порог был 2 stealth-героя при доле тега 9% — выгода не срабатывала почти никогда, а цена
  // платилась всегда: карта выходила доминируемой, то есть не ловушкой, а просто плохой. Замер
  // срабатывания (40 ростеров) это и показал.
  { id: "smokeOfDeceit", category: "riskReward", effect: { kind: "xMultOnTag", tag: "stealth", min: 1, mult: 1.25 }, drawback: { kind: "flatPerTag", tag: "control", per: -1, cap: 2 } },
  { id: "helmOfTheDominator", category: "riskReward", effect: { kind: "xMultOnTag", tag: "summon", min: 2, mult: 1.25 }, drawback: { kind: "goldPerCamp", gold: -1 } },
];

/** Как тир карточки масштабирует её эффект (часть BALANCE_CONFIG_VERSION).
 *  Placeholder под калибровку `npm run sim`. */
export const ITEM_RARITY = {
  /** Множитель числовой части эффекта по тиру. Каталог объявлен в common. */
  magnitude: { common: 1, unique: 1.25, mythic: 1.6, immortal: 2 } as Record<Rarity, number>,
  /** Нижняя граница множителя штрафа босса: полный иммунитет отменял бы правило, а не готовил
   *  к нему (боссы обязаны контриться подготовкой, а не выключаться карточкой). */
  bossFactorFloor: 0.15,
} as const;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Целочисленный эффект под тир (R12.3).
 *
 * Умножение с округлением на маленьких значениях даёт двум соседним тирам ОДНО число: `freeRerolls: 1`
 * при `magnitude {1, 1.25, 1.6, 2}` шёл `1 / 1 / 2 / 2`, то есть refined Bottle был буквально той же
 * картой, что standard, а exotic — той же, что arcana. То же ломало `magicWand` и `observerWard`
 * (refined == exotic). Жалоба плейтеста звучала прямо: «качество никак не коррелирует с
 * характеристиками».
 *
 * Поэтому округление подпирается снизу РАНГОМ тира: каждый следующий тир строго полезнее
 * предыдущего даже там, где умножение этого не даёт. Знак сохраняется — растёт магнитуда, как и при
 * умножении (у `drawback` числа не масштабируются вовсе, но `scaleEffect` обязана быть корректной
 * для любого входа, а не только для фактического каталога).
 */
function scaleMagnitudeInt(value: number, k: number, rank: number): number {
  if (value === 0) return 0;
  const magnitude = Math.max(Math.round(Math.abs(value) * k), Math.abs(value) + rank);
  return value < 0 ? -magnitude : magnitude;
}

/** Эффект карточки этого тира. Чистая: описание, оценка и превью читают ОДНУ функцию, поэтому
 *  подпись не может разойтись с числом (тот же инвариант, что у `itemLabel` от `effect`). */
export function scaleEffect(effect: ItemEffect, rarity: Rarity): ItemEffect {
  const k = ITEM_RARITY.magnitude[rarity];
  const rank = rarityRank(rarity);
  if (k === 1) return effect;
  switch (effect.kind) {
    case "flatPerTag":
    case "additivePerTag":
    case "additivePerAttr":
      return { ...effect, per: round2(effect.per * k) };
    case "xMultOnDiversity":
    case "xMultOnTag":
    case "xMultWithoutTag":
    case "xMultFlat":
      // Растёт ИЗБЫТОК над 1, а не сам множитель: ×1.10 и ×1.50 иначе росли бы несопоставимо.
      // Потолок — `xMultHard`: полоса `xMultMax` описывает обычную карту, а высокий тир редок и
      // проходит по тому же исключению, что risk/reward-карты.
      return { ...effect, mult: Math.min(POWER_LIMITS.xMultHard, round2(1 + (effect.mult - 1) * k)) };
    case "copyBestXMult":
      return { ...effect, rate: Math.min(1, round2(effect.rate * k)) };
    case "goldPerCamp":
      return { ...effect, gold: scaleMagnitudeInt(effect.gold, k, rank) };
    case "freeRerolls":
      return { ...effect, count: scaleMagnitudeInt(effect.count, k, rank) };
    case "interestCap":
      return { ...effect, bonus: scaleMagnitudeInt(effect.bonus, k, rank) };
    case "bossPenaltyFactor":
      // Сильнее = МЕНЬШЕ фактор: растёт срезаемая доля штрафа.
      return { ...effect, factor: Math.max(ITEM_RARITY.bossFactorFloor, round2(1 - (1 - effect.factor) * k)) };
    case "bossPenaltyCap":
      // Сильнее = НИЖЕ потолок штрафа.
      return { ...effect, cap: round2(effect.cap / k) };
  }
}

/** Карточка этого тира целиком: усиленный эффект и НЕ тронутая цена. */
export function itemAt(def: ItemDef, rarity: Rarity): { effect: ItemEffect; drawback?: ItemEffect } {
  return { effect: scaleEffect(def.effect, rarity), drawback: def.drawback };
}

/** Название тира ПРЕДМЕТА (R11.5). Механическая лестница у героев и карточек одна (`rarity.ts`) —
 *  это один рычаг баланса, и раздваивать его нельзя. А вот ЧИТАЕТСЯ качество предмета иначе:
 *  «immortal-герой» и «immortal-предмет» рядом слипались бы в одну сущность. Поэтому у предметов
 *  своя шкала имён и своя палитра (`--card-tier-*`), с красной вершиной. */
export const ITEM_TIERS = {
  common: "standard",
  unique: "refined",
  mythic: "exotic",
  immortal: "arcana",
} as const satisfies Record<Rarity, string>;

export type ItemTier = (typeof ITEM_TIERS)[Rarity];

export function itemTier(rarity: Rarity): ItemTier {
  return ITEM_TIERS[rarity];
}

export const ITEM_IDS: readonly string[] = ITEMS.map((item) => item.id);

const BY_ID = new Map(ITEMS.map((item) => [item.id, item]));

export function isItemId(value: string): boolean {
  return BY_ID.has(value);
}

export function itemDef(id: string): ItemDef | null {
  return BY_ID.get(id) ?? null;
}

/** Что предмет знает о ростере. Только теги активных героев — состав игроков предметы не читают:
 *  за игроков отвечают тактики и слагаемые Team OVR. */
export interface ItemContext {
  activeHeroes: readonly number[];
  /** Тир каждой карточки (id → редкость). Отсутствующая ЗАПИСЬ — common, поэтому старый сейв и
   *  первый забег читаются без миграции.
   *
   *  Поле ОБЯЗАТЕЛЬНОЕ, хотя `{}` — валидное значение. Причина конкретная: когда оно было
   *  опциональным, вызов в слоте Буткемпа его просто не передал, и одна карточка показывала два
   *  разных числа — «+7.5% mult» в описании против «Mult +6%» во вкладе. Обязательность делает
   *  этот класс ошибки ошибкой компиляции, а не находкой ручного прохода. */
  cardRarity: Record<string, Rarity>;
  /** Заряды Charged-карт (R13.5): id → число зарядов. Отсутствующая запись — 0. Обязательное по
   *  той же причине, что cardRarity: опциональный контекст однажды разъехался между описанием и
   *  вкладом. Усиливаются только СИЛОВЫЕ слои (flat/additive/xMult) — экономика и защита от
   *  босса зарядом не растут. */
  cardCharges: Record<string, number>;
}

/** Вклад предметов: слои силы + экономика + защита от босса. Чистая функция от ростера, как
 *  tactics: условие пере-вычисляется после каждой замены героя. */
export interface ItemEvaluation {
  flat: number;
  additive: number;
  xMults: number[];
  goldPerCamp: number;
  freeRerolls: number;
  interestCapBonus: number;
  /** Множитель штрафа босса (произведение факторов) и абсолютный потолок, если он задан. */
  bossPenaltyFactor: number;
  bossPenaltyCap: number | null;
  /** Построчный разбор для UI: игрок обязан видеть, что именно сработало. */
  sources: ItemSource[];
}

export interface ItemSource {
  itemId: string;
  /** Слой, в который лёг вклад — подпись в разложении силы. */
  layer: "flat" | "additive" | "xMult" | "economy" | "boss";
  value: number;
  /** Условие выполнено. Невыполненное условие тоже показывается — иначе непонятно, почему ноль. */
  met: boolean;
}

function emptyEvaluation(): ItemEvaluation {
  return {
    flat: 0, additive: 0, xMults: [], goldPerCamp: 0, freeRerolls: 0,
    interestCapBonus: 0, bossPenaltyFactor: 1, bossPenaltyCap: null, sources: [],
  };
}

/** Насколько раз сработало условие «за каждого героя с тегом», с учётом cap. */
function tagCount(effect: { tag: HeroTag; cap?: number }, ctx: ItemContext): number {
  const n = countTag(ctx.activeHeroes, effect.tag);
  return effect.cap == null ? n : Math.min(effect.cap, n);
}

function applyEffect(
  effect: ItemEffect, itemId: string, ctx: ItemContext, out: ItemEvaluation,
  // Множитель Charged-зарядов (R13.5). Масштабирует ТОЛЬКО силовые слои: у flat/additive растёт
  // величина, у X Mult — бонусная часть (1 + (x−1)·f). Экономика и boss-защита не заряжаются.
  chargeScale = 1,
): void {
  const xm = (mult: number) => 1 + (mult - 1) * chargeScale;
  switch (effect.kind) {
    case "flatPerTag": {
      const value = tagCount(effect, ctx) * effect.per * chargeScale;
      out.flat += value;
      out.sources.push({ itemId, layer: "flat", value, met: value !== 0 });
      return;
    }
    case "additivePerTag": {
      const value = tagCount(effect, ctx) * effect.per * chargeScale;
      out.additive += value;
      out.sources.push({ itemId, layer: "additive", value, met: value !== 0 });
      return;
    }
    case "additivePerAttr": {
      const raw = countAttr(ctx.activeHeroes, effect.attr);
      const value = (effect.cap == null ? raw : Math.min(effect.cap, raw)) * effect.per * chargeScale;
      out.additive += value;
      out.sources.push({ itemId, layer: "additive", value, met: value !== 0 });
      return;
    }
    case "xMultOnDiversity": {
      const met = distinctGameplayTags(ctx.activeHeroes) >= effect.min;
      if (met) out.xMults.push(xm(effect.mult));
      out.sources.push({ itemId, layer: "xMult", value: met ? xm(effect.mult) : 1, met });
      return;
    }
    case "xMultOnTag": {
      const met = countTag(ctx.activeHeroes, effect.tag) >= effect.min;
      if (met) out.xMults.push(xm(effect.mult));
      out.sources.push({ itemId, layer: "xMult", value: met ? xm(effect.mult) : 1, met });
      return;
    }
    case "xMultWithoutTag": {
      const met = countTag(ctx.activeHeroes, effect.tag) === 0;
      if (met) out.xMults.push(xm(effect.mult));
      out.sources.push({ itemId, layer: "xMult", value: met ? xm(effect.mult) : 1, met });
      return;
    }
    case "xMultFlat": {
      out.xMults.push(xm(effect.mult));
      out.sources.push({ itemId, layer: "xMult", value: xm(effect.mult), met: true });
      return;
    }
    case "copyBestXMult":
      // Обрабатывается вторым проходом: нужен уже собранный список чужих множителей.
      return;
    case "goldPerCamp": {
      out.goldPerCamp += effect.gold;
      out.sources.push({ itemId, layer: "economy", value: effect.gold, met: true });
      return;
    }
    case "freeRerolls": {
      out.freeRerolls += effect.count;
      out.sources.push({ itemId, layer: "economy", value: effect.count, met: true });
      return;
    }
    case "interestCap": {
      out.interestCapBonus += effect.bonus;
      out.sources.push({ itemId, layer: "economy", value: effect.bonus, met: true });
      return;
    }
    case "bossPenaltyFactor": {
      out.bossPenaltyFactor *= effect.factor;
      out.sources.push({ itemId, layer: "boss", value: effect.factor, met: true });
      return;
    }
    case "bossPenaltyCap": {
      out.bossPenaltyCap = out.bossPenaltyCap == null
        ? effect.cap
        : Math.min(out.bossPenaltyCap, effect.cap);
      out.sources.push({ itemId, layer: "boss", value: effect.cap, met: true });
      return;
    }
  }
}

export function evaluateItems(equipped: readonly string[], ctx: ItemContext): ItemEvaluation {
  const out = emptyEvaluation();
  const chargeScaleOf = (id: string) => chargeFactor(ctx.cardCharges?.[id] ?? 0);
  const items = equipped
    .map(itemDef)
    .filter((item): item is ItemDef => item != null)
    // Тир применяется ЗДЕСЬ, один раз: дальше вся оценка работает с уже усиленным эффектом, и
    // ни одна ветка не может забыть про редкость.
    .map((item) => ({ id: item.id, ...itemAt(item, ctx.cardRarity?.[item.id] ?? "common") }));

  for (const item of items) {
    // Заряды (R13.5) усиливают ЭФФЕКТ карты; drawback — её цена, он зарядом не растёт:
    // иначе Charged наказывал бы за то самое удержание условия, за которое награждает.
    applyEffect(item.effect, item.id, ctx, out, chargeScaleOf(item.id));
    if (item.drawback) applyEffect(item.drawback, item.id, ctx, out);
  }

  // Copy-эффекты вторым проходом: они удваивают лучший ЧУЖОЙ множитель, поэтому обязаны видеть
  // итоговый список. Без второго прохода результат зависел бы от порядка карточек в слотах.
  for (const item of items) {
    if (item.effect.kind !== "copyBestXMult") continue;
    const best = out.xMults.reduce((top, mult) => Math.max(top, mult), 1);
    const copied = best > 1 ? 1 + (best - 1) * item.effect.rate * chargeScaleOf(item.id) : 1;
    if (copied > 1) out.xMults.push(copied);
    out.sources.push({ itemId: item.id, layer: "xMult", value: copied, met: copied > 1 });
  }

  return out;
}

/** Есть ли у предмета силовой эффект (flat/additive/xMult) — только такие карты имеет смысл
 *  выдавать Charged (R13.5): заряды усиливают силовые слои, economy/boss-карта не выросла бы. */
export function hasPowerEffect(itemId: string): boolean {
  const def = BY_ID.get(itemId);
  if (!def) return false;
  switch (def.effect.kind) {
    case "flatPerTag":
    case "additivePerTag":
    case "additivePerAttr":
    case "xMultOnDiversity":
    case "xMultOnTag":
    case "xMultWithoutTag":
    case "xMultFlat":
    case "copyBestXMult":
      return true;
    default:
      return false;
  }
}

/** Кто из АКТИВНЫХ героев участвует в условии эффекта (R11.7).
 *
 *  Зачем. Теги (`R8.1`) жили только в данных: карточка обещала «+9.6% за героя с тегом illusion»,
 *  а посмотреть, есть ли такие в составе, было негде — половина каталога (`tagSynergy`) оставалась
 *  непроверяемой глазами. Показывать «все теги героя» — шум (у героя их несколько); полезно ровно
 *  обратное: по конкретной карточке показать, КТО её сейчас включает.
 *
 *  Считается из тех же `countTag`/`countAttr`/`distinctGameplayTags`, что и сам эффект, поэтому
 *  подсветка не может разойтись с числом. */
export type EffectMatchKind = "tag" | "attr" | "diversity" | "withoutTag" | "none";

export interface EffectMatch {
  kind: EffectMatchKind;
  /** Герои, на которых смотрит условие. Для `withoutTag` — те, кто его ЛОМАЕТ. */
  heroIds: number[];
  /** Сколько из них реально засчитано (cap уже применён). */
  counted: number;
  /** Порог условия, если он есть. */
  min?: number;
  /** Потолок «за каждого», если он есть. */
  cap?: number;
  met: boolean;
  tag?: HeroTag;
  attr?: HeroAttr;
  /** Для `diversity`: сколько разных gameplay-тегов набралось. */
  distinct?: number;
}

const NO_MATCH: EffectMatch = { kind: "none", heroIds: [], counted: 0, met: true };

export function effectMatch(effect: ItemEffect, ctx: ItemContext): EffectMatch {
  const withTag = (tag: HeroTag) => ctx.activeHeroes.filter((id) => hasTag(id, tag));
  switch (effect.kind) {
    case "flatPerTag":
    case "additivePerTag": {
      const heroIds = withTag(effect.tag);
      const counted = effect.cap == null ? heroIds.length : Math.min(effect.cap, heroIds.length);
      return { kind: "tag", heroIds, counted, cap: effect.cap, met: counted > 0, tag: effect.tag };
    }
    case "additivePerAttr": {
      const heroIds = ctx.activeHeroes.filter((id) => heroTags(id)?.attr === effect.attr);
      const counted = effect.cap == null ? heroIds.length : Math.min(effect.cap, heroIds.length);
      return { kind: "attr", heroIds, counted, cap: effect.cap, met: counted > 0, attr: effect.attr };
    }
    case "xMultOnTag": {
      const heroIds = withTag(effect.tag);
      return {
        kind: "tag", heroIds, counted: heroIds.length, min: effect.min,
        met: heroIds.length >= effect.min, tag: effect.tag,
      };
    }
    case "xMultWithoutTag": {
      // Условие «без тега»: подсвечиваем нарушителей — именно они выключают карточку.
      const heroIds = withTag(effect.tag);
      return {
        kind: "withoutTag", heroIds, counted: heroIds.length,
        met: heroIds.length === 0, tag: effect.tag,
      };
    }
    case "xMultOnDiversity": {
      const distinct = distinctGameplayTags(ctx.activeHeroes);
      return {
        kind: "diversity", heroIds: [], counted: distinct, min: effect.min,
        met: distinct >= effect.min, distinct,
      };
    }
    default:
      // Экономика, защита от босса, безусловный множитель и copy условия по героям не имеют.
      return NO_MATCH;
  }
}

/** По каким тегам и атрибутам у ЭКИПИРОВАННЫХ карточек сейчас есть условие (R11.7).
 *
 *  Нужно, чтобы на узкой карточке героя показывать не все его теги (их в среднем четыре — это
 *  шум), а только те, что во что-то играют прямо сейчас. Редкость сюда не входит: тир меняет
 *  ЧИСЛА эффекта, но не ось, по которой он смотрит.
 *
 *  Условие `drawback` учитывается наравне с основным: герой, за которого карточка берёт цену,
 *  для игрока не менее важен, чем герой, за которого она платит. */
export function conditionAxes(equipped: readonly string[]): { tags: HeroTag[]; attrs: HeroAttr[] } {
  const tags = new Set<HeroTag>();
  const attrs = new Set<HeroAttr>();
  const scan = (effect: ItemEffect) => {
    if ("tag" in effect) tags.add(effect.tag);
    if ("attr" in effect) attrs.add(effect.attr);
  };
  for (const id of equipped) {
    const def = itemDef(id);
    if (!def) continue;
    scan(def.effect);
    if (def.drawback) scan(def.drawback);
  }
  return { tags: [...tags], attrs: [...attrs] };
}

/** Данные для генерации подписи карточки. UI собирает строку по шаблону, поэтому текст не может
 *  разойтись с числом при калибровке. */
export interface ItemLabel {
  template: string;
  params: Record<string, string | number>;
}

export function itemLabel(effect: ItemEffect): ItemLabel {
  switch (effect.kind) {
    case "flatPerTag":
      return { template: "item.effect.flatPerTag", params: { per: effect.per, tag: effect.tag, cap: effect.cap ?? 0 } };
    case "additivePerTag":
      return { template: "item.effect.additivePerTag", params: { per: effect.per, tag: effect.tag, cap: effect.cap ?? 0 } };
    case "additivePerAttr":
      return { template: "item.effect.additivePerAttr", params: { per: effect.per, attr: effect.attr, cap: effect.cap ?? 0 } };
    case "xMultOnDiversity":
      return { template: "item.effect.xMultOnDiversity", params: { mult: effect.mult, min: effect.min } };
    case "xMultOnTag":
      return { template: "item.effect.xMultOnTag", params: { mult: effect.mult, min: effect.min, tag: effect.tag } };
    case "xMultWithoutTag":
      return { template: "item.effect.xMultWithoutTag", params: { mult: effect.mult, tag: effect.tag } };
    case "xMultFlat":
      return { template: "item.effect.xMultFlat", params: { mult: effect.mult } };
    case "copyBestXMult":
      return { template: "item.effect.copyBestXMult", params: { rate: Math.round(effect.rate * 100) } };
    case "goldPerCamp":
      return { template: "item.effect.goldPerCamp", params: { gold: effect.gold } };
    case "freeRerolls":
      return { template: "item.effect.freeRerolls", params: { count: effect.count } };
    case "interestCap":
      return { template: "item.effect.interestCap", params: { bonus: effect.bonus } };
    case "bossPenaltyFactor":
      return { template: "item.effect.bossPenaltyFactor", params: { percent: Math.round((1 - effect.factor) * 100) } };
    case "bossPenaltyCap":
      return { template: "item.effect.bossPenaltyCap", params: { cap: effect.cap } };
  }
}

/** «Полезность» числовой части эффекта — нормализованная так, что БОЛЬШЕ всегда значит лучше для
 *  игрока. У защиты от босса полезнее меньшее число (меньший множитель штрафа, ниже его потолок),
 *  поэтому она входит со знаком минус.
 *
 *  Зачем нормализация. Инвариант «тир обязан усиливать карту» иначе пришлось бы писать по ветке на
 *  каждый вид эффекта — ровно так и вышло раньше: проверялись только `xMult` и `bossPenaltyFactor`,
 *  а целочисленные экономические эффекты ехали мимо проверки. `switch` без `default` делает
 *  пропущенный вид ошибкой компиляции, а не находкой плейтеста. */
function usefulness(effect: ItemEffect): number {
  switch (effect.kind) {
    case "flatPerTag":
    case "additivePerTag":
    case "additivePerAttr":
      return effect.per;
    case "xMultOnDiversity":
    case "xMultOnTag":
    case "xMultWithoutTag":
    case "xMultFlat":
      return effect.mult;
    case "copyBestXMult":
      return effect.rate;
    case "goldPerCamp":
      return effect.gold;
    case "freeRerolls":
      return effect.count;
    case "interestCap":
      return effect.bonus;
    case "bossPenaltyFactor":
      return -effect.factor;
    case "bossPenaltyCap":
      return -effect.cap;
  }
}

/** Проверка каталога (зовётся тестом): множители в объявленных границах, у сильных карт есть цена,
 *  и каждый следующий тир СТРОГО полезнее предыдущего. */
export function validateItems(): string[] {
  const issues: string[] = [];
  for (const item of ITEMS) {
    const mult = item.effect.kind === "xMultOnDiversity" || item.effect.kind === "xMultOnTag"
      || item.effect.kind === "xMultWithoutTag" || item.effect.kind === "xMultFlat"
      ? item.effect.mult
      : null;
    if (mult != null && (mult < POWER_LIMITS.xMultMin || mult > POWER_LIMITS.xMultMax)) {
      issues.push(`${item.id}: X Mult ${mult} вне полосы ${POWER_LIMITS.xMultMin}–${POWER_LIMITS.xMultMax}`);
    }
    // Безусловный множитель обязан иметь цену — иначе это «+N ко всему», запрещённое PRD.
    if (item.effect.kind === "xMultFlat" && !item.drawback) {
      issues.push(`${item.id}: безусловный X Mult без trade-off`);
    }
    // Даже на верхнем тире карточка не имеет права выйти за абсолютный потолок множителей.
    if (mult != null) {
      const top = scaleEffect(item.effect, "immortal");
      const topMult = "mult" in top ? top.mult : mult;
      if (topMult > POWER_LIMITS.xMultHard) {
        issues.push(`${item.id}: immortal X Mult ${topMult} выше потолка ${POWER_LIMITS.xMultHard}`);
      }
    }
    // Каждый следующий тир обязан быть СТРОГО полезнее предыдущего — по ЛЮБОМУ виду эффекта.
    // Раньше проверялись только `xMult` и `bossPenaltyFactor`, поэтому пять карт каталога годами
    // имели пары одинаковых тиров (R12.3). Проверка попарная, а не «immortal против common»: именно
    // в середине лестницы и слипались тиры.
    for (let rank = 1; rank < RARITIES.length; rank += 1) {
      const lower = RARITIES[rank - 1];
      const upper = RARITIES[rank];
      const before = usefulness(scaleEffect(item.effect, lower));
      const after = usefulness(scaleEffect(item.effect, upper));
      if (after <= before) {
        issues.push(
          `${item.id}: ${ITEM_TIERS[upper]} не сильнее ${ITEM_TIERS[lower]} (${before} → ${after})`,
        );
      }
    }
  }
  if (new Set(ITEM_IDS).size !== ITEM_IDS.length) issues.push("дублирующиеся id предметов");
  return issues;
}

/** Штраф босса после защиты предметами: сначала множитель, затем абсолютный потолок.
 *  Предметы СМЯГЧАЮТ правило, но не отменяют его — босс обязан оставаться поводом
 *  перестроить состав, а не строкой, которую можно выключить покупкой (PRD §5.9.3). */
export function protectedBossPenalty(
  penalty: number,
  items: ItemEvaluation,
  /** Число АКТИВНЫХ Tempered-карт (LG4). Обязателен по уроку cardRarity: опциональный контекст
   *  однажды разъехался между потребителями — store, sim и sweep обязаны судить одинаково. */
  activeTempered: number,
): number {
  const scaled = Math.max(0, penalty) * items.bossPenaltyFactor * temperedPenaltyFactor(activeTempered);
  return items.bossPenaltyCap == null ? scaled : Math.min(scaled, items.bossPenaltyCap);
}
