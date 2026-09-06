// Косметика Аркады (T13.12, идея владельца: «сеты как в Dota — выбивать и надевать»). В 2D без арта
// сетов косметика = рамка медальона, трейл, эффект смерти врагов и оттенок эффектов героя.
// Правило PRD §5.10: косметика не меняет ни одного числа и не входит в сид/лог.
import { Rng } from "../../rng.ts";
import type { ArcadeOutcome, Rarity } from "../types.ts";

export type CosmeticSlot = "frame" | "trail" | "death" | "tint" | "skin";

export interface CosmeticDef {
  id: string;
  slot: CosmeticSlot;
  rarity: Rarity;
  /** Параметр для рендера: цвет-ключ палитры (`--arcade-*`), вариант эффекта, а у скина — имя листа `<hero>@<skin>`. */
  variant: string;
  /** Скин привязан к герою: надетый скин другого героя просто не применяется. */
  hero?: string;
  /** Стили облика — «стили» и самоцветы Dota. См. StyleDef. */
  styles?: readonly StyleDef[];
}

/**
 * Стиль облика. В Dota это две разные вещи, и мы держим обе:
 * - **стиль** (Bladeform Legacy у Juggernaut, Frost Avalanche у Drow) — тот же меш с другим набором
 *   текстур: `sheet: true`, рисуется отдельным листом `<variant>~<id>`;
 * - **самоцвет** (Ethereal Gem у Terrorblade и прочих аркан) — в Dota это параметр цвета материала,
 *   у нас — поворот тона готового листа на `hue` градусов, без перерендера.
 */
export interface StyleDef {
  id: string;
  /** Отдельный лист `<variant>~<id>` (нужен рендер из vpk). */
  sheet?: boolean;
  /** Поворот тона листа в градусах (самоцвет). */
  hue?: number;
}

/** Палитра самоцветов: как Ethereal Gem, только оттенок задаём сами. Поворот тона, поэтому у разных
 *  аркан один и тот же самоцвет даёт разные цвета — игрок видит результат в превью гардероба. */
export const GEMS: readonly StyleDef[] = [
  { id: "gem1", hue: 45 },
  { id: "gem2", hue: 100 },
  { id: "gem3", hue: 160 },
  { id: "gem4", hue: 215 },
  { id: "gem5", hue: 285 },
];

export const COSMETICS: readonly CosmeticDef[] = [
  { id: "frame_bronze", slot: "frame", rarity: "standard", variant: "bronze" },
  { id: "frame_silver", slot: "frame", rarity: "refined", variant: "silver" },
  { id: "frame_gold", slot: "frame", rarity: "exotic", variant: "gold" },
  { id: "frame_immortal", slot: "frame", rarity: "arcana", variant: "immortal" },
  { id: "trail_ember", slot: "trail", rarity: "standard", variant: "fire" },
  { id: "trail_frost", slot: "trail", rarity: "refined", variant: "frost" },
  { id: "trail_arc", slot: "trail", rarity: "exotic", variant: "lightning" },
  { id: "trail_aegis", slot: "trail", rarity: "arcana", variant: "aegis" },
  { id: "death_ring", slot: "death", rarity: "standard", variant: "ring" },
  { id: "death_shatter", slot: "death", rarity: "refined", variant: "shatter" },
  { id: "death_nova", slot: "death", rarity: "exotic", variant: "nova" },
  { id: "tint_radiance", slot: "tint", rarity: "standard", variant: "fire" },
  { id: "tint_skadi", slot: "tint", rarity: "refined", variant: "frost" },
  { id: "tint_arcane", slot: "tint", rarity: "exotic", variant: "lightning" },
  // Скины (этап 3, владелец: «арканы и сеты, как в Dota; персона Wei — хороший ход»): модель + озвучка из тех же файлов Dota.
  { id: "skin_sf_arcana", slot: "skin", rarity: "arcana", variant: "shadow_fiend@arcana", hero: "shadow_fiend" },
  { id: "skin_jugg_arcana", slot: "skin", rarity: "arcana", variant: "juggernaut@arcana", hero: "juggernaut" },
  { id: "skin_am_wei", slot: "skin", rarity: "exotic", variant: "anti_mage@wei", hero: "anti_mage" },
  // Партия 2 (2026-09-06, владелец: «у кого-то есть арканы, у кого-то личности»): модели аркан/персон из vpk
  // (`models/heroes/<hero>*` и `models/items/<hero>/arcana*`), озвучка — свои префиксы в dota_voice.sh, нет своей — базовая.
  { id: "skin_cm_arcana", slot: "skin", rarity: "arcana", variant: "crystal_maiden@arcana", hero: "crystal_maiden" },
  { id: "skin_cm_persona", slot: "skin", rarity: "exotic", variant: "crystal_maiden@persona", hero: "crystal_maiden" },
  { id: "skin_dk_persona", slot: "skin", rarity: "exotic", variant: "dragon_knight@persona", hero: "dragon_knight" },
  { id: "skin_mirana_persona", slot: "skin", rarity: "exotic", variant: "mirana@persona", hero: "mirana" },
  { id: "skin_pa_arcana", slot: "skin", rarity: "arcana", variant: "phantom_assassin@arcana", hero: "phantom_assassin" },
  { id: "skin_pa_persona", slot: "skin", rarity: "exotic", variant: "phantom_assassin@persona", hero: "phantom_assassin" },
  { id: "skin_zeus_arcana", slot: "skin", rarity: "arcana", variant: "zeus@arcana", hero: "zeus" },
  { id: "skin_wk_arcana", slot: "skin", rarity: "arcana", variant: "wraith_king@arcana", hero: "wraith_king" },
  { id: "skin_es_arcana", slot: "skin", rarity: "arcana", variant: "earthshaker@arcana", hero: "earthshaker" },
  { id: "skin_qop_arcana", slot: "skin", rarity: "arcana", variant: "queen_of_pain@arcana", hero: "queen_of_pain" },
  { id: "skin_fv_arcana", slot: "skin", rarity: "arcana", variant: "faceless_void@arcana", hero: "faceless_void" },
  { id: "skin_wr_arcana", slot: "skin", rarity: "arcana", variant: "windranger@arcana", hero: "windranger" },
  { id: "skin_ogre_arcana", slot: "skin", rarity: "arcana", variant: "ogre_magi@arcana", hero: "ogre_magi" },
  { id: "skin_razor_arcana", slot: "skin", rarity: "arcana", variant: "razor@arcana", hero: "razor" },
  { id: "skin_invoker_kid", slot: "skin", rarity: "exotic", variant: "invoker@kid", hero: "invoker" },
  // Партия 3 (2026-09-06): арканы героев волн 2–12; у кого нет своей озвучки — говорит голосом базового героя.
  { id: "skin_pudge_arcana", slot: "skin", rarity: "arcana", variant: "pudge@arcana", hero: "pudge" },
  { id: "skin_rubick_arcana", slot: "skin", rarity: "arcana", variant: "rubick@arcana", hero: "rubick" },
  { id: "skin_skywrath_arcana", slot: "skin", rarity: "arcana", variant: "skywrath_mage@arcana", hero: "skywrath_mage" },
  { id: "skin_spectre_arcana", slot: "skin", rarity: "arcana", variant: "spectre@arcana", hero: "spectre" },
  { id: "skin_vs_arcana", slot: "skin", rarity: "arcana", variant: "vengeful_spirit@arcana", hero: "vengeful_spirit" },
  { id: "skin_drow_arcana", slot: "skin", rarity: "arcana", variant: "drow_ranger@arcana", hero: "drow_ranger" },
  // Сеты Dota (T13.27, вопрос владельца «можно ли конкретные предметы из сетов»): сет — это части
  // `models/items/<hero>/<set>_{head,arms,legs,back,weapon}`, которые пришиваются к скелету базового
  // героя ровно как части аркан. Лист — `<hero>@<set>`, редкость exotic (в Dota это не аркана).
  { id: "skin_tb_arcana", slot: "skin", rarity: "arcana", variant: "terrorblade@arcana", hero: "terrorblade" },
  { id: "skin_jugg_bladesrunner", slot: "skin", rarity: "exotic", variant: "juggernaut@bladesrunner", hero: "juggernaut" },
  { id: "skin_pa_darkfeather", slot: "skin", rarity: "exotic", variant: "phantom_assassin@darkfeather", hero: "phantom_assassin" },
  { id: "skin_axe_blackthorn", slot: "skin", rarity: "exotic", variant: "axe@blackthorn", hero: "axe" },
  { id: "skin_pudge_scarecrow", slot: "skin", rarity: "exotic", variant: "pudge@scarecrow", hero: "pudge" },
];

/** Арканы, у которых в Dota есть настоящий стиль (свой набор текстур): лист `<variant>~style1`
 *  рендерится отдельно (строка в манифестах + `--style <токен Valve>`, см. dota_style_textures.sh). */
const SHEET_STYLE_SKINS = new Set([
  "skin_jugg_arcana", "skin_drow_arcana", "skin_pudge_arcana",
  "skin_es_arcana", "skin_qop_arcana", "skin_wr_arcana", "skin_ogre_arcana",
]);
for (const c of COSMETICS) if (SHEET_STYLE_SKINS.has(c.id)) (c as { styles?: readonly StyleDef[] }).styles = [{ id: "style1", sheet: true }, ...GEMS];

// Самоцветы — у всех аркан (владелец 2026-09-06: «у Terrorblade куча гемов, аркана может быть любого цвета»).
// Персоны и сеты цвет не меняют: у них в Dota гнезда под самоцвет нет.
for (const c of COSMETICS) if (c.slot === "skin" && c.rarity === "arcana" && !c.styles) (c as { styles?: readonly StyleDef[] }).styles = GEMS;

export const COSMETIC_BY_ID: Record<string, CosmeticDef> = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));
export const COSMETIC_SLOTS: readonly CosmeticSlot[] = ["skin", "frame", "trail", "death", "tint"];

/** Имя листа/озвучки героя с учётом надетого скина: `<hero>@<skin>`, если скин этого героя надет, иначе id героя.
 *  Стиль сюда НЕ входит: озвучка у стилей общая со скином. */
export function skinnedHero(hero: string, equipped: Partial<Record<CosmeticSlot, string>>): string {
  const id = equipped.skin;
  const def = id ? COSMETIC_BY_ID[id] : undefined;
  return def && def.slot === "skin" && def.hero === hero ? def.variant : hero;
}

/** Имя листа спрайтов с учётом скина и выбранного стиля: `<hero>@<skin>~<style>`. */
export function skinnedSheet(
  hero: string,
  equipped: Partial<Record<CosmeticSlot, string>>,
  styles: Readonly<Record<string, string>> = {},
): string {
  const id = equipped.skin;
  const def = id ? COSMETIC_BY_ID[id] : undefined;
  if (!def || def.slot !== "skin" || def.hero !== hero) return hero;
  const style = def.styles?.find((st) => st.id === styles[def.id]);
  return style?.sheet ? `${def.variant}~${style.id}` : def.variant;
}

/** Стиль, выбранный для надетого скина этого героя (или null): нужен рендеру для поворота тона. */
export function skinnedStyle(
  hero: string,
  equipped: Partial<Record<CosmeticSlot, string>>,
  styles: Readonly<Record<string, string>> = {},
): StyleDef | null {
  const id = equipped.skin;
  const def = id ? COSMETIC_BY_ID[id] : undefined;
  if (!def || def.slot !== "skin" || def.hero !== hero) return null;
  return def.styles?.find((st) => st.id === styles[def.id]) ?? null;
}

/** Осколки Aegis за дубликат — по редкости. */
export const DUPLICATE_SHARDS: Record<Rarity, number> = { standard: 5, refined: 12, exotic: 30, arcana: 80 };
/** Цена конкретного предмета за осколки (трата дублей): ~4–6 дублей своей редкости. */
const SHARD_PRICE_FULL: Record<Rarity, number> = { standard: 20, refined: 50, exotic: 120, arcana: 320 };
/** В dev-сборке косметика бесплатна: владелец гоняет `make dev-all` и должен видеть все скины сразу,
 *  не фармя осколки (просьба 2026-09-06). В прод-сборке цены обычные. */
export const SHARD_PRICE: Record<Rarity, number> =
  typeof window !== "undefined" && import.meta.env?.DEV === true
    ? { standard: 0, refined: 0, exotic: 0, arcana: 0 }
    : SHARD_PRICE_FULL;

export interface CosmeticDrop {
  id: string;
  duplicate: boolean;
  shards: number;
}

/** Дроп по итогу забега: детерминирован сидом и исходом (не золотом и не временем суток), чтобы
 *  перезапуск того же сида не был «слот-машиной». Число бросков: 1 за забег + 1 за Рошана + 1 за
 *  победу; редкость растёт с рангом. Реплеи дропа не дают (решает вызывающий). */
export function rollCosmeticDrops(seed: string, outcome: ArcadeOutcome, owned: readonly string[]): CosmeticDrop[] {
  const rng = new Rng(`cosmetics:${seed}:${outcome.outcome}:${outcome.tick}`);
  let rolls = 1 + (outcome.roshanKilled ? 1 : 0) + (outcome.outcome === "victory" ? 1 : 0);
  if (outcome.tick < 60 * 60) rolls = 0; // меньше минуты — не забег
  const t = Math.min(1, outcome.rank / 20);
  const weights: Record<Rarity, number> = { standard: 70 - 40 * t, refined: 24 + 16 * t, exotic: 5 + 16 * t, arcana: 1 + 8 * t };
  const drops: CosmeticDrop[] = [];
  const have = new Set(owned);
  for (let i = 0; i < rolls; i++) {
    let roll = rng.float() * (weights.standard + weights.refined + weights.exotic + weights.arcana);
    let rarity: Rarity = "standard";
    for (const r of ["standard", "refined", "exotic", "arcana"] as const) { roll -= weights[r]; if (roll <= 0) { rarity = r; break; } }
    const pool = COSMETICS.filter((c) => c.rarity === rarity);
    const def = pool[rng.int(pool.length)];
    const duplicate = have.has(def.id);
    have.add(def.id);
    drops.push({ id: def.id, duplicate, shards: duplicate ? DUPLICATE_SHARDS[rarity] : 0 });
  }
  return drops;
}
