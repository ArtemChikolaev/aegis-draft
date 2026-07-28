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

/**
 * Веса редкости при ролле на этапе `stageIndex` (1-based, номер этапа Буткемпа).
 * Часть `BALANCE_CONFIG_VERSION`: правишь числа — бампай версию.
 *
 * Ранние этапы почти всё common, поздние сдвигают к mythic/immortal (лут прогрессии). Но у верхних
 * тиров есть **ненулевой пол с первого этапа** — жёсткой привязки тиров к этапу нет.
 *
 * Почему пол обязателен (R11.4). Прошлые веса были `mythic = max(0, s-1)`, `immortal = max(0, s-3)`:
 * на первом Буткемпе mythic буквально невозможен, immortal — до четвёртого. Это ровно та «жёсткая
 * привязка тиров к актам», которую `R5.1` уже отверг для форм игроков (`FORM_ODDS`): редкая сильная
 * карта обязана иметь шанс выпасть рано — это редкое, дорогое и определяющее событие, перенос
 * принципа Balatro. Одна и та же лестница не может следовать этому принципу для форм и нарушать
 * его для качества.
 *
 * Веса заданы «на сотню» для читаемости: на этапе 1 это ≈73% common, 22% unique, 4% mythic,
 * 1% immortal. Рост линейный и упирается в потолок, чтобы длинный сезон (`R6.1`, 25 этапов) не
 * выродился в immortal-фарм.
 */
function rollWeights(stageIndex: number): Record<Rarity, number> {
  const step = Math.max(0, Math.floor(stageIndex) - 1);
  return {
    common: Math.max(4, 74 - 17 * step),
    unique: Math.min(55, 22 + 8 * step),
    mythic: Math.min(30, 4 + 6 * step),
    immortal: Math.min(15, 1 + 3 * step),
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
