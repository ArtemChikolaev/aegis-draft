// Нейтральные предметы (T13.8, хвост): пять тиров по минутам, как в Dota (7/17/27/37/60 → сжато под
// акт: 2/5/9/13/17). Один нейтральный слот: новая нейтралка заменяет старую. Эффекты — те же поля
// PlayerStats, что у предметов лавки; величина ×тир.
import type { ArcadeItemDef } from "./items.ts";

export interface NeutralDef {
  id: string;
  tier: 1 | 2 | 3 | 4 | 5;
  effect: ArcadeItemDef["effect"];
}

export const NEUTRAL_TIER_AT_MIN: readonly number[] = [2, 5, 9, 13, 17];

export const NEUTRALS: readonly NeutralDef[] = [
  { id: "arcane_ring", tier: 1, effect: { cooldown: 0.05, regen: 1 } },
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
  { id: "ex_machina", tier: 5, effect: { cooldown: 0.2, attackSpeed: 0.15 } },
];

export const NEUTRAL_BY_ID: Record<string, NeutralDef> = Object.fromEntries(NEUTRALS.map((n) => [n.id, n]));

export function neutralsOfTier(tier: number): NeutralDef[] {
  return NEUTRALS.filter((n) => n.tier === tier);
}
