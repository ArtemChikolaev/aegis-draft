// Редкость героев Roguelite Run (срез 3b, PRD §5.9.2). Чистый слой ПОВЕРХ score.ts, как tactics/
// bosses: формула Team OVR не меняется (ratingModelVersion цел, golden цел, Quick Draft чист) —
// редкость даёт ДОБАВОЧНЫЙ вклад к слагаемым как отдельный модификатор, не переписывая scoreTeam.
//
// Канал бафа — Hero Synergy (свойство героя): выше редкость → больше вклад назначенного героя; у
// immortal сверх того маленький +OVR игроку (Base). Скоуп только Roguelite Run.
//
// Источник — ЛУТ с рынка (решение playtest 2026-07-24): стартовый драфт весь common, hero re-pick
// на рынке роллит редкость по этапу (поздние этапы — шанс mythic/immortal), «улучшение» поднимает
// тир текущего героя. Первый забег игрока весь common (мета-гейт по careerStore).
import { Rng } from "./rng.ts";
import type { SummandModifiers } from "./anteEconomy.ts";

export type Rarity = "common" | "unique" | "mythic" | "immortal";

/** По возрастанию качества. Индекс = ранг (0 = common). */
export const RARITIES: readonly Rarity[] = ["common", "unique", "mythic", "immortal"];

export function isRarity(value: string): value is Rarity {
  return (RARITIES as readonly string[]).includes(value);
}

export function rarityRank(r: Rarity): number {
  return RARITIES.indexOf(r);
}

/** Следующий тир вверх, либо null для immortal (потолок). */
export function nextRarity(r: Rarity): Rarity | null {
  return RARITIES[rarityRank(r) + 1] ?? null;
}

/** Баланс-коэффициенты редкости (часть BALANCE_CONFIG_VERSION — правишь числа, бампай в balance.ts).
 *  Placeholder, калибровка — `npm run sim`. Immortal редок, поэтому его пакет заметно сильнее. */
export const RARITY = {
  /** Бонус к Hero Synergy за одного назначенного героя этой редкости. */
  heroSynergyBonus: { common: 0, unique: 0.6, mythic: 1.4, immortal: 2.4 } as Record<Rarity, number>,
  /** Сверх Hero Synergy: immortal даёт маленький +OVR игроку (Base). */
  immortalBaseBonus: 1,
  /** Цена «улучшения» — стоимость ДОСТИЖЕНИЯ тира (бамп на один шаг вверх). */
  upgradeCost: { unique: 3, mythic: 5, immortal: 8 } as Record<Exclude<Rarity, "common">, number>,
} as const;

/** Цена поднять героя из `from` в следующий тир; null если уже immortal. `nextRarity` никогда не
 *  возвращает common (это первый тир), поэтому target всегда есть в таблице цен. */
export function upgradeCost(from: Rarity): number | null {
  const target = nextRarity(from);
  return target && target !== "common" ? RARITY.upgradeCost[target] : null;
}

/** Веса редкости при ролле re-pick на этапе `stageIndex` (1-based, номер этапа Буткемпа).
 *  Ранние этапы почти всё common, поздние сдвигают к mythic/immortal (лут прогрессии). */
function rollWeights(stageIndex: number): Record<Rarity, number> {
  const s = Math.max(1, Math.floor(stageIndex));
  return {
    common: Math.max(1, 12 - s * 2),
    unique: 2 + s,
    mythic: Math.max(0, s - 1),
    immortal: Math.max(0, s - 3),
  };
}

/** Детерминированный ролл редкости для входящего героя. Один и тот же (seed, heroId, stage) ⇒ та
 *  же редкость — поэтому market-карта может показать её в превью до покупки, а сама покупка выдаст
 *  ровно то же. */
export function rollRarity(seed: string, heroId: number, stageIndex: number): Rarity {
  const weights = rollWeights(stageIndex);
  const total = RARITIES.reduce((sum, r) => sum + weights[r], 0);
  const rng = new Rng(`${seed}:rarity:hero-${heroId}:stage-${stageIndex}`);
  let roll = rng.int(total);
  for (const r of RARITIES) {
    roll -= weights[r];
    if (roll < 0) return r;
  }
  return "common";
}

/** Вклад редкости АКТИВНЫХ героев в слагаемые Team OVR. Чистая: те же вход ⇒ тот же выход.
 *  Пересчитывается при каждой замене героя (как tactics), поэтому без состояния. */
export function rarityModifiers(
  rarityByHero: Record<string, Rarity>,
  activeHeroes: readonly number[],
): SummandModifiers {
  const mod: SummandModifiers = { base: 0, heroSynergy: 0, chemistry: 0 };
  for (const heroId of activeHeroes) {
    const rarity = rarityByHero[String(heroId)] ?? "common";
    mod.heroSynergy += RARITY.heroSynergyBonus[rarity];
    if (rarity === "immortal") mod.base += RARITY.immortalBaseBonus;
  }
  return mod;
}

/** Строки для UI: по одному активному герою — его редкость и вклад (для breakdown). */
export interface RarityRow {
  heroId: number;
  rarity: Rarity;
  heroSynergyBonus: number;
  baseBonus: number;
}

export function rarityRows(
  rarityByHero: Record<string, Rarity>,
  activeHeroes: readonly number[],
): RarityRow[] {
  return activeHeroes.map((heroId) => {
    const rarity = rarityByHero[String(heroId)] ?? "common";
    return {
      heroId,
      rarity,
      heroSynergyBonus: RARITY.heroSynergyBonus[rarity],
      baseBonus: rarity === "immortal" ? RARITY.immortalBaseBonus : 0,
    };
  });
}
