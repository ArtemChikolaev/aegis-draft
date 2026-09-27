// Нейтральные предметы (T13.8, хвост): пять тиров по минутам, как в Dota (7/17/27/37/60 → сжато под
// акт: 2/5/9/13/17). Один нейтральный слот: новая нейтралка заменяет старую. Эффекты — те же поля
// PlayerStats, что у предметов лавки; величина ×тир.
import type { ArcadeItemDef } from "./items.ts";

/** Свойство нейтралки (T20.5), как в Dota: не только статы. Числа — `ARCADE.neutralProps`, срабатывания — в симе. */
export type NeutralPropId = "arcane_ring" | "trusty_shovel" | "cloak_of_flames" | "timeless_relic" | "mirror_shield" | "fallen_sky" | "ex_machina";

export interface NeutralDef {
  id: string;
  /** Внутреннее имя предмета Dota = id (иконка в `art/items`). */
  tier: 1 | 2 | 3 | 4 | 5;
  effect: ArcadeItemDef["effect"];
  /** Свойство (T20.5): у предметов с ним статы урезаны — свойство и есть главная часть. */
  prop?: NeutralPropId;
}

export const NEUTRAL_TIER_AT_MIN: readonly number[] = [2, 5, 9, 13, 17];

/** Зачарования нейтралок (как в Dota 7.39: у нейтрального предмета случайный модификатор-префикс со своим бонусом).
 *  Величина ×тир предмета, чтобы зачарование поздней нейтралки было заметнее. */
export interface NeutralEnchantDef { id: string; effect: ArcadeItemDef["effect"] }
export const NEUTRAL_ENCHANTS: readonly NeutralEnchantDef[] = [
  { id: "blooded", effect: { lifesteal: 0.03 } },
  { id: "swift", effect: { moveSpeed: 0.03 } },
  { id: "keen", effect: { crit: 0.04 } },
  { id: "stalwart", effect: { armor: 2 } },
  { id: "vital", effect: { maxHp: 60 } },
  { id: "arcane", effect: { cooldown: 0.04 } },
  { id: "greedy", effect: { goldPerKill: 1 } },
  { id: "wise", effect: { xpMult: 0.05 } },
  { id: "furious", effect: { attackSpeed: 0.08 } },
  { id: "sharp", effect: { damage: 6 } },
];
export const NEUTRAL_ENCHANT_BY_ID: Record<string, NeutralEnchantDef> = Object.fromEntries(NEUTRAL_ENCHANTS.map((e) => [e.id, e]));

export const NEUTRALS: readonly NeutralDef[] = [
  // Тир 1–5 по 6 предметов (2026-09-06, владелец: «нейтралки всегда одни и те же» — было по 3 на тир при двух офферах).
  { id: "arcane_ring", tier: 1, effect: { regen: 1 }, prop: "arcane_ring" },
  { id: "trusty_shovel", tier: 1, effect: { maxHp: 60 }, prop: "trusty_shovel" },
  { id: "occult_bracelet", tier: 1, effect: { cooldown: 0.04, damage: 6 } },
  { id: "royal_jelly", tier: 1, effect: { regen: 2, maxHp: 60 } },
  { id: "grove_bow", tier: 2, effect: { attackSpeed: 0.15, damage: 8 } },
  { id: "vampire_fangs", tier: 2, effect: { lifesteal: 0.08 } },
  { id: "whisper_of_the_dread", tier: 2, effect: { damage: 14, cooldown: 0.04 } },
  { id: "elven_tunic", tier: 3, effect: { attackSpeed: 0.2, moveSpeed: 0.05 } },
  { id: "cloak_of_flames", tier: 3, effect: { armor: 4 }, prop: "cloak_of_flames" },
  { id: "craggy_coat", tier: 3, effect: { armor: 8, maxHp: 80 } },
  { id: "ninja_gear", tier: 4, effect: { moveSpeed: 0.1, crit: 0.08 } },
  { id: "timeless_relic", tier: 4, effect: { cooldown: 0.08 }, prop: "timeless_relic" },
  { id: "havoc_hammer", tier: 4, effect: { damage: 28, maxHp: 100 } },
  { id: "mirror_shield", tier: 5, effect: { armor: 6, maxHp: 200 }, prop: "mirror_shield" },
  { id: "fallen_sky", tier: 5, effect: { damage: 24, moveSpeed: 0.06 }, prop: "fallen_sky" },
  { id: "pirate_hat", tier: 5, effect: { attackSpeed: 0.25, moveSpeed: 0.1, goldPerKill: 2 } },
  { id: "broom_handle", tier: 1, effect: { damage: 8 } },
  { id: "faded_broach", tier: 1, effect: { maxHp: 90, moveSpeed: 0.03 } },
  { id: "vambrace", tier: 2, effect: { damage: 12, armor: 2 } },
  { id: "philosophers_stone", tier: 2, effect: { goldPerKill: 1, xpMult: 0.08 } },
  { id: "pupils_gift", tier: 2, effect: { maxHp: 120, crit: 0.05 } },
  { id: "paladin_sword", tier: 3, effect: { lifesteal: 0.08, damage: 10 } },
  { id: "titan_sliver", tier: 3, effect: { armor: 7, maxHp: 100 } },
  { id: "enchanted_quiver", tier: 3, effect: { attackSpeed: 0.2, crit: 0.06 } },
  { id: "spell_prism", tier: 4, effect: { cooldown: 0.12, regen: 3 } },
  { id: "mind_breaker", tier: 4, effect: { damage: 22, attackSpeed: 0.1 } },
  { id: "trickster_cloak", tier: 4, effect: { moveSpeed: 0.1, armor: 5 } },
  { id: "apex", tier: 5, effect: { damage: 40, crit: 0.1 } },
  { id: "giants_ring", tier: 5, effect: { maxHp: 350, cleave: 1 } },
  { id: "ex_machina", tier: 5, effect: { cooldown: 0.1, attackSpeed: 0.1 }, prop: "ex_machina" },
];

export const NEUTRAL_BY_ID: Record<string, NeutralDef> = Object.fromEntries(NEUTRALS.map((n) => [n.id, n]));

export function neutralsOfTier(tier: number): NeutralDef[] {
  return NEUTRALS.filter((n) => n.tier === tier);
}
