// Общая лестница качества Roguelite Run: тиры, ранги и детерминированный ролл по этапу.
//
// ПОЧЕМУ ОТДЕЛЬНЫЙ МОДУЛЬ. Качество завелось у героев (срез 3b), а теперь его получают и предметы
// (R11.2). Лестница у них ОДНА: те же четыре тира и та же кривая ролла по этапу — иначе «mythic»
// значил бы у героя и у карточки разное, и редкость перестала бы быть единым языком качества.
// Что именно тир ДАЁТ, остаётся знанием каждой сущности: `heroRarity.ts` знает про Hero Synergy и
// цены героя, `items.ts` — про масштаб эффекта карточки.
import { Rng } from "./rng.ts";

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

/** Веса редкости при ролле на этапе `stageIndex` (1-based, номер этапа Буткемпа).
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

/** Детерминированный ролл редкости. Один и тот же `(seed, key, stage)` ⇒ тот же тир — поэтому
 *  карточка может показать качество в превью до покупки, а сама покупка выдаст ровно то же.
 *  `key` разводит сущности между собой: `hero-14`, `card-dagon`. */
export function rollRarity(seed: string, key: string, stageIndex: number): Rarity {
  const weights = rollWeights(stageIndex);
  const total = RARITIES.reduce((sum, r) => sum + weights[r], 0);
  const rng = new Rng(`${seed}:rarity:${key}:stage-${stageIndex}`);
  let roll = rng.int(total);
  for (const r of RARITIES) {
    roll -= weights[r];
    if (roll < 0) return r;
  }
  return "common";
}
