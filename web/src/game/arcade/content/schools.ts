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
  // Легендарные (T13.18, владелец: «разбить на тиры, чтобы выпадали мега-сильные пассивки»): один ранг,
  // предлагаются редко (шанс растёт с минутами) и гарантированно на 12/18/24 уровнях. Механика — sim.ts по id.
  { id: "leg_heart", school: "radiance", type: "power", maxRank: 1, legendary: true, neutral: true, art: "heart" },
  { id: "leg_octarine", school: "skadi", type: "cast", maxRank: 1, legendary: true, neutral: true, art: "octarine_core" },
  { id: "leg_refresher", school: "maelstrom", type: "cast", maxRank: 1, legendary: true, neutral: true, art: "refresher" },
  { id: "leg_bkb", school: "radiance", type: "passive", maxRank: 1, legendary: true, neutral: true, art: "black_king_bar" },
  { id: "leg_daedalus", school: "skadi", type: "attack", maxRank: 1, legendary: true, neutral: true, art: "greater_crit" },
  { id: "leg_satanic", school: "maelstrom", type: "attack", maxRank: 1, legendary: true, neutral: true, art: "satanic" },
  { id: "leg_rad_sun", school: "radiance", type: "power", maxRank: 1, legendary: true, art: "radiance" },
  { id: "leg_rad_phoenix", school: "radiance", type: "passive", maxRank: 1, legendary: true, art: "aegis" },
  { id: "leg_ska_glacier", school: "skadi", type: "power", maxRank: 1, legendary: true, art: "skadi" },
  { id: "leg_ska_avalanche", school: "skadi", type: "strike", maxRank: 1, legendary: true, art: "shivas_guard" },
  { id: "leg_mae_thunder", school: "maelstrom", type: "attack", maxRank: 1, legendary: true, art: "mjollnir" },
  { id: "leg_mae_haste", school: "maelstrom", type: "power", maxRank: 1, legendary: true, art: "maelstrom" },
];

export const LEGENDARY_UPGRADES: readonly UpgradeDef[] = UPGRADES.filter((u) => u.legendary);
/** Уровни, на которых легендарный апгрейд предлагается гарантированно (если остались невзятые). */
export const LEGENDARY_LEVELS: readonly number[] = [12, 18, 24];

export const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

/** Таланты 10/15/20/25 — общая лестница героев (см. content/heroes.ts). */
export { HERO_TALENTS as TALENTS } from "./heroes.ts";
