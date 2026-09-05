// Школы среза 0 (боги DMD на языке Dota): Radiance — горение, Skadi — заморозка,
// Maelstrom — молния. Механика каждого апгрейда — в sim.ts по id; здесь — реестр и ранги.
// Тексты — в i18n (`arcade.up.<id>` / `arcade.up.<id>.desc`), иконки — `art/items`.
import type { SchoolId, UpgradeDef } from "../types.ts";

export const SCHOOLS: readonly SchoolId[] = ["radiance", "skadi", "maelstrom"];

/** Иконка школы — внутреннее имя предмета Dota (см. ui/artSource itemArtSources). */
/** Иконки — настоящие предметы-тёзки школ (Eye of Skadi, Maelstrom); зеркалятся `npm run gen:art`. */
export const SCHOOL_ART: Record<SchoolId, string> = {
  radiance: "radiance",
  skadi: "skadi",
  maelstrom: "maelstrom",
};

export const UPGRADES: readonly UpgradeDef[] = [
  { id: "rad_aura", school: "radiance", type: "power", maxRank: 3 },
  { id: "rad_strike", school: "radiance", type: "attack", maxRank: 3 },
  { id: "rad_ring", school: "radiance", type: "strike", maxRank: 3 },
  { id: "rad_blast", school: "radiance", type: "passive", maxRank: 3 },
  { id: "rad_inferno", school: "radiance", type: "power", maxRank: 3 },
  { id: "ska_bite", school: "skadi", type: "attack", maxRank: 3 },
  { id: "ska_snap", school: "skadi", type: "passive", maxRank: 3 },
  { id: "ska_shards", school: "skadi", type: "strike", maxRank: 3 },
  { id: "ska_aura", school: "skadi", type: "power", maxRank: 3 },
  { id: "ska_shatter", school: "skadi", type: "passive", maxRank: 3 },
  { id: "mae_chain", school: "maelstrom", type: "attack", maxRank: 3 },
  { id: "mae_static", school: "maelstrom", type: "cast", maxRank: 3 },
  { id: "mae_overcharge", school: "maelstrom", type: "power", maxRank: 3 },
  { id: "mae_clap", school: "maelstrom", type: "strike", maxRank: 3 },
  { id: "mae_mjollnir", school: "maelstrom", type: "power", maxRank: 3 },
];

export const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

/** Таланты 10/15/20/25 — общая лестница героев (см. content/heroes.ts). */
export { HERO_TALENTS as TALENTS } from "./heroes.ts";
