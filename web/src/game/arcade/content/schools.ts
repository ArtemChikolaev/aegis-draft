// Школы среза 0 (боги DMD на языке Dota): Radiance — горение, Skadi — заморозка,
// Maelstrom — молния. Механика каждого апгрейда — в sim.ts по id; здесь — реестр и ранги.
// Тексты — в i18n (`arcade.up.<id>` / `arcade.up.<id>.desc`), иконки — `art/items`.
import type { SchoolId, UpgradeDef } from "../types.ts";

export const SCHOOLS: readonly SchoolId[] = ["radiance", "skadi", "maelstrom", "beast"];

/** Иконка школы — внутреннее имя предмета Dota (см. ui/artSource itemArtSources). */
/** Иконки — настоящие предметы-тёзки школ (Eye of Skadi, Maelstrom); зеркалятся `npm run gen:art`. */
export const SCHOOL_ART: Record<SchoolId, string> = {
  radiance: "radiance",
  skadi: "skadi",
  maelstrom: "maelstrom",
  beast: "helm_of_the_dominator",
};

// Дерево как у богов DMD: сначала ИСТОЧНИК статуса (аура/удар/залп), потом модификаторы к нему (`requires`) —
// иначе на первом уровне предлагалось «+25% урона огнём» без единого источника огня.
export const UPGRADES: readonly UpgradeDef[] = [
  { id: "rad_aura", school: "radiance", type: "power", maxRank: 3 },
  { id: "rad_strike", school: "radiance", type: "attack", maxRank: 3 },
  { id: "rad_ring", school: "radiance", type: "strike", maxRank: 3 },
  { id: "rad_blast", school: "radiance", type: "passive", maxRank: 3, requires: ["rad_aura", "rad_strike", "rad_ring"] },
  { id: "rad_inferno", school: "radiance", type: "power", maxRank: 3, requires: ["rad_aura", "rad_strike", "rad_ring"] },
  { id: "ska_bite", school: "skadi", type: "attack", maxRank: 3 },
  { id: "ska_snap", school: "skadi", type: "passive", maxRank: 3, requires: ["ska_bite", "ska_shards", "ska_aura"] },
  { id: "ska_shards", school: "skadi", type: "strike", maxRank: 3 },
  { id: "ska_aura", school: "skadi", type: "power", maxRank: 3 },
  { id: "ska_shatter", school: "skadi", type: "passive", maxRank: 3, requires: ["ska_bite", "ska_shards", "ska_aura", "ska_snap"] },
  { id: "mae_chain", school: "maelstrom", type: "attack", maxRank: 3 },
  { id: "mae_static", school: "maelstrom", type: "cast", maxRank: 3 },
  { id: "mae_overcharge", school: "maelstrom", type: "power", maxRank: 3, requires: ["mae_chain", "mae_static", "mae_clap"] },
  { id: "mae_clap", school: "maelstrom", type: "strike", maxRank: 3 },
  { id: "mae_mjollnir", school: "maelstrom", type: "power", maxRank: 3, requires: ["mae_chain", "mae_static", "mae_clap"] },
  // Зверинец (T13.21, питомцы как призывы DMD): ястреб собирает опыт, волк кусает и замедляет, медведь бьёт и оглушает;
  // стая и рёв — модификаторы, требуют зверя.
  { id: "beast_hawk", school: "beast", type: "power", maxRank: 3 },
  { id: "beast_wolf", school: "beast", type: "strike", maxRank: 3 },
  { id: "beast_bear", school: "beast", type: "attack", maxRank: 3 },
  { id: "beast_pack", school: "beast", type: "power", maxRank: 2, requires: ["beast_wolf"] },
  { id: "beast_roar", school: "beast", type: "passive", maxRank: 3, requires: ["beast_wolf", "beast_bear"] },
  // Гибриды двух школ (T13.21): открываются, когда обе школы уже в билде — ещё один слой путей.
  { id: "hyb_steam", school: "radiance", type: "passive", maxRank: 2, requiresSchools: ["radiance", "skadi"] },
  { id: "hyb_superconductor", school: "skadi", type: "passive", maxRank: 2, requiresSchools: ["skadi", "maelstrom"] },
  { id: "hyb_plasma", school: "maelstrom", type: "passive", maxRank: 2, requiresSchools: ["radiance", "maelstrom"] },
  { id: "hyb_wild_hunt", school: "beast", type: "passive", maxRank: 2, requiresSchools: ["beast", "skadi"] },
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
  // Партия 2 (2026-09-06): у «Зверинца» легендарок не было вовсе, а нейтральных — всего шесть на три школы.
  { id: "leg_butterfly", school: "skadi", type: "passive", maxRank: 1, legendary: true, neutral: true, art: "butterfly" },
  { id: "leg_moonshard", school: "maelstrom", type: "attack", maxRank: 1, legendary: true, neutral: true, art: "moon_shard" },
  { id: "leg_lotus", school: "radiance", type: "passive", maxRank: 1, legendary: true, neutral: true, art: "lotus_orb" },
  { id: "leg_bloodstone", school: "skadi", type: "cast", maxRank: 1, legendary: true, neutral: true, art: "bloodstone" },
  { id: "leg_beast_alpha", school: "beast", type: "power", maxRank: 1, legendary: true, art: "helm_of_the_dominator" },
  { id: "leg_beast_kennel", school: "beast", type: "strike", maxRank: 1, legendary: true, art: "necronomicon" },
];

export const LEGENDARY_UPGRADES: readonly UpgradeDef[] = UPGRADES.filter((u) => u.legendary);
/** Уровни, на которых легендарный апгрейд предлагается гарантированно (если остались невзятые). */
export const LEGENDARY_LEVELS: readonly number[] = [12, 18, 24];

export const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

/** Таланты 10/15/20/25 — общая лестница героев (см. content/heroes.ts). */
export { HERO_TALENTS as TALENTS } from "./heroes.ts";

/**
 * Числа карточки школы: что именно даёт апгрейд СЕЙЧАС и что даст следующий ранг (владелец
 * 2026-09-07: «хочется наглядности, как растёт процент урона, а то ничего не понятно»). Формулы —
 * зеркало sim.ts (burnMult, lightningMult, applyBurn/applyChill и др.); меняешь там — меняй здесь,
 * тест `arcadeFigures.test.ts` держит их в согласии на ключевых точках.
 * `power` — сумма множителей редкости взятых рангов (ARCADE.rarity.mult), `rank` — число рангов.
 */
export interface UpgradeFigure {
  /** Ключ подписи `arcade.fig.<key>`. */
  key: string;
  value: number;
  /** Проценты (value = доля), секунды или штуки. */
  unit?: "pct" | "s" | "x";
}

export interface UpgradeCtx {
  /** Мощь других апгрейдов игрока (для множителей огня/молний). */
  power: (id: string) => number;
}

export function upgradeFigures(id: string, rank: number, power: number, ctx: UpgradeCtx): UpgradeFigure[] {
  const burnMult = (1 + 0.25 * ctx.power("rad_inferno")) * (ctx.power("leg_rad_sun") > 0 ? 1.75 : 1);
  const lightningMult = (1 + 0.2 * ctx.power("mae_mjollnir")) * (ctx.power("leg_mae_thunder") > 0 ? 1.5 : 1);
  const p = power;
  switch (id) {
    case "rad_aura": return [{ key: "auraDps", value: 8 * p * burnMult }];
    case "rad_strike": return [{ key: "burnDps", value: 6 * p * burnMult }, { key: "burnSec", value: 3, unit: "s" }];
    case "rad_ring": return [{ key: "boltDmg", value: 18 * p * burnMult }, { key: "every", value: 3 / (1 + 0.15 * p), unit: "s" }];
    case "rad_blast": return [{ key: "blastDmg", value: 25 * p * burnMult }];
    case "rad_inferno": return [{ key: "fireDmg", value: 0.25 * p, unit: "pct" }, { key: "auraRadius", value: 110 * (1 + 0.1 * p) }];
    case "ska_bite": return [{ key: "slow", value: Math.min(0.6, 0.3 + 0.05 * p), unit: "pct" }, { key: "slowSec", value: 2.5, unit: "s" }];
    case "ska_snap": return [{ key: "freezeSec", value: 0.8 + 0.3 * p, unit: "s" }];
    case "ska_shards": return [{ key: "shardDmg", value: 14 * p }, { key: "every", value: 2.2 / (1 + 0.1 * p), unit: "s" }];
    case "ska_aura": return [{ key: "fieldSlow", value: Math.min(0.5, 0.15 * p), unit: "pct" }];
    case "ska_shatter": return [{ key: "vsFrozen", value: 0.4 * p, unit: "pct" }, { key: "vsSlowed", value: 0.1 * p, unit: "pct" }];
    case "mae_chain": return [{ key: "chainChance", value: 0.25 + 0.08 * p, unit: "pct" }, { key: "chainDmg", value: 20 * p * lightningMult }, { key: "chainTargets", value: 3 + Math.floor(ctx.power("mae_mjollnir") * 2) + (ctx.power("leg_mae_thunder") > 0 ? 4 : 0), unit: "x" }];
    case "mae_static": return [{ key: "zapDmg", value: 24 * p * lightningMult }, { key: "zapTargets", value: 1 + Math.floor(p / 2), unit: "x" }, { key: "every", value: 1.6, unit: "s" }];
    case "mae_overcharge": return [{ key: "attackSpeed", value: 0.12 * p, unit: "pct" }, { key: "moveSpeed", value: 0.04 * p, unit: "pct" }];
    case "mae_clap": return [{ key: "clapDmg", value: 40 * p * lightningMult }, { key: "stunSec", value: 0.6, unit: "s" }];
    case "mae_mjollnir": return [{ key: "lightningDmg", value: 0.2 * p, unit: "pct" }, { key: "chainTargetsBonus", value: Math.floor(p * 2), unit: "x" }];
    case "beast_hawk": return [{ key: "xpRadius", value: 110 + 30 * rank }];
    case "beast_wolf": return [{ key: "petDmg", value: 14 * rank }];
    case "beast_bear": return [{ key: "petDmg", value: 30 * rank }];
    case "beast_pack": return [{ key: "wolves", value: 1 + rank, unit: "x" }];
    case "beast_roar": return [{ key: "petPower", value: 0.35 * rank, unit: "pct" }];
    case "hyb_steam": return [{ key: "vsBurningChilled", value: 0.25 * p, unit: "pct" }];
    case "hyb_superconductor": return [{ key: "vsFrozenZap", value: 0.35 * p, unit: "pct" }];
    case "hyb_plasma": return [{ key: "plasmaDps", value: 5 * p }];
    case "hyb_wild_hunt": return [{ key: "vsSlowedPets", value: 0.3 * p, unit: "pct" }];
    default: return [];
  }
}
