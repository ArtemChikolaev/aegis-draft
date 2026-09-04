// Предметы Secret Shop среза 0 (T13.8): настоящие предметы Dota с узнаваемым эффектом, иконки —
// `art/items` (те же слаги, что у Roguelite Run). Величина эффекта масштабируется редкостью,
// цена — тоже. Тексты — i18n `arcade.item.<id>` / `.desc`.
import type { Rarity } from "../types.ts";

export interface ArcadeItemDef {
  id: string;
  art: string;
  price: number;
  /** Множитель величины по редкости применяется к числовым эффектам ниже. */
  effect: {
    regen?: number;
    lifesteal?: number;
    armor?: number;
    attackSpeed?: number;
    crit?: number;
    damage?: number;
    moveSpeed?: number;
    maxHp?: number;
    goldPerKill?: number;
    xpMult?: number;
    stunImmune?: boolean;
    cleave?: number;
    cooldown?: number;
  };
}

export const ARCADE_ITEMS: readonly ArcadeItemDef[] = [
  { id: "magic_wand", art: "magic_wand", price: 66, effect: { regen: 3 } },
  { id: "vladmir", art: "vladmir", price: 102, effect: { lifesteal: 0.06 } },
  { id: "assault", art: "assault", price: 138, effect: { armor: 6, attackSpeed: 0.1 } },
  { id: "butterfly", art: "butterfly", price: 144, effect: { crit: 0.15 } },
  { id: "desolator", art: "desolator", price: 120, effect: { damage: 18 } },
  { id: "travel_boots", art: "travel_boots", price: 90, effect: { moveSpeed: 0.1 } },
  { id: "heart", art: "heart", price: 132, effect: { maxHp: 200, regen: 2 } },
  { id: "mask_of_madness", art: "mask_of_madness", price: 84, effect: { attackSpeed: 0.3, armor: -4 } },
  { id: "hand_of_midas", art: "hand_of_midas", price: 108, effect: { goldPerKill: 1, xpMult: 0.1 } },
  { id: "black_king_bar", art: "black_king_bar", price: 126, effect: { stunImmune: true, armor: 2 } },
  { id: "bfury", art: "bfury", price: 114, effect: { cleave: 2, damage: 6 } },
  { id: "octarine_core", art: "octarine_core", price: 120, effect: { cooldown: 0.15, maxHp: 80 } },
];

export const ARCADE_ITEM_BY_ID: Record<string, ArcadeItemDef> = Object.fromEntries(ARCADE_ITEMS.map((i) => [i.id, i]));

export const ITEM_RARITY_MULT: Record<Rarity, number> = { standard: 1, refined: 1.35, exotic: 1.8, arcana: 2.4 };
export const ITEM_PRICE_MULT: Record<Rarity, number> = { standard: 1, refined: 1.6, exotic: 2.5, arcana: 4 };

export interface ShopOffer {
  id: string;
  rarity: Rarity;
  price: number;
}

export interface OwnedItem {
  id: string;
  rarity: Rarity;
}
