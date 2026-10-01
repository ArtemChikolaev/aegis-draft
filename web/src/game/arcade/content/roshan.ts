// Награда Рошана на выбор (T20.2): Aegis — воскрешение; Cheese — сам восстанавливает полное HP, когда его остаётся ≤ 25%;
// Refresher Shard — следующий ульт не уходит в перезарядку и сбрасывает Q/W/E; Aghanim's Shard (M23) — запасные таланты
// Q/W/E героя (content/talents.ts). Иконки — предметы Dota (`gen:art`, `scripts/dota_item_icons.sh`). Числа — `ARCADE.roshanReward`.
export type RoshanRewardId = "aegis" | "cheese" | "refresher_shard" | "aghanims_shard";

export interface RoshanRewardDef {
  id: RoshanRewardId;
  /** Слаг иконки предмета Dota (`art/items`). */
  art: string;
}

export const ROSHAN_REWARDS: readonly RoshanRewardDef[] = [
  { id: "aegis", art: "aegis" },
  { id: "cheese", art: "cheese" },
  { id: "refresher_shard", art: "refresher_shard" },
  { id: "aghanims_shard", art: "aghanims_shard" },
];
