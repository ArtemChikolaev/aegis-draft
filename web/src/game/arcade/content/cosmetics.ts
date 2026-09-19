// Косметика Аркады (T13.12, идея владельца: «сеты как в Dota — выбивать и надевать»). В 2D без арта
// сетов косметика = рамка медальона, трейл, эффект смерти врагов и оттенок эффектов героя.
// Правило PRD §5.10: косметика не меняет ни одного числа и не входит в сид/лог.
import { Rng } from "../../rng.ts";
import type { ArcadeOutcome, Rarity } from "../types.ts";
import { HERO_PARTS, type DotaSlot, type PartsFamily } from "./parts.ts";
export type { DotaSlot };

/** Слоты: `frame` — наземный эффект у ног, `aura` — свечение героя, `trail` — след, `death` — эффект
 *  смерти врагов, `tint` — оттенок умений, `skin` — облик. Эффекты рисует features/arcade/effects.ts. */
/** `summon` — скин призыва (T13.80): `variant` = `<art>@<skin>` (лист призыва), `hero` — чей призыв; надевается в
 *  гардеробе героя, живёт в `cosmetics.summonSkins`, в `equipped` не попадает. */
/** `form` — скин формы героя (T13.80 срез 3): в Dota это отдельный предмет в своём слоте (Метаморфоза TB — `ability3`,
 *  True Form Lone Druid — `ability_ultimate`, дракон DK — `shapeshift`), поэтому не зависит от надетого облика.
 *  `variant` = лист `<hero>@meta~<имя>`, `hero` — чья форма; живёт в `cosmetics.formSkins[hero]`, в `equipped` не попадает. */
export type CosmeticSlot = "frame" | "aura" | "trail" | "death" | "tint" | "skin" | "summon" | "form";

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
  /** Награда за отметку мастерства (T13.48): не выпадает и не покупается — выдаётся, когда у любого героя есть эта отметка. */
  unlock?: { mark: string };
  /** Встроенные эффекты скина — замена частиц Dota, которых в спрайте нет (дым-плащ и капюшон арканы PA
   *  живут в `pa_arcana_*.vpcf`, в модели их геометрии нет). Вид — как у слота `aura` (features/arcade/effects.ts),
   *  рисуется всегда, поверх него — надетое свечение игрока. */
  /** Скин формы/призыва из бандла сета (id облика героя): в Dota он идёт вместе с сетом, поэтому «как у облика» при надетом
   *  сете показывает именно его (демон Marauder's у сета Marauder's, волки Ambry у сета Ambry). Явный выбор игрока важнее. */
  withSkin?: string;
  fx?: { aura?: string; /** Эффект принадлежит части в этом слоте (пламя волос арканы Lina — голове): заменил часть — эффекта нет. */ slot?: DotaSlot };
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

/** Призматические самоцветы Dota (Prismatic Gem): тон, в который перекрашивается СВЕЧЕНИЕ арканы —
 *  светящиеся линии и ореол, не кожа и не одежда (`gemSheet` в features/arcade/sprites.ts). Пять
 *  цветов из палитры Dota: Golden, Emerald, Cerulean Blue, Brilliant Purple, Ruby. Самоцвет виден
 *  только у арканы со свечением — у облика без светящихся деталей гардероб их не показывает, как и
 *  Dota не даёт гнёзд предметам без эффектов. */
export const GEMS: readonly StyleDef[] = [
  { id: "gem1", hue: 45 },
  { id: "gem2", hue: 140 },
  { id: "gem3", hue: 215 },
  { id: "gem4", hue: 280 },
  { id: "gem5", hue: 350 },
];

export const COSMETICS: readonly CosmeticDef[] = [
  // Наземные эффекты (владелец 2026-09-07: «свечение под персонажем, как в Dota»): id прежние — они
  // лежат в сохранениях игроков, — а вид новый: кольцо углей, льда, золота Aegis и пустотный вихрь.
  { id: "frame_bronze", slot: "frame", rarity: "standard", variant: "ember" },
  { id: "frame_silver", slot: "frame", rarity: "refined", variant: "frost" },
  { id: "frame_gold", slot: "frame", rarity: "exotic", variant: "gold" },
  { id: "frame_immortal", slot: "frame", rarity: "arcana", variant: "void" },
  // Свечение героя: языки пламени, иней, молнии, золотая пыльца с нимбом. Клавиша T — вспышка.
  { id: "aura_fire", slot: "aura", rarity: "standard", variant: "fire" },
  { id: "aura_frost", slot: "aura", rarity: "refined", variant: "frost" },
  { id: "aura_arc", slot: "aura", rarity: "exotic", variant: "lightning" },
  { id: "aura_aegis", slot: "aura", rarity: "arcana", variant: "aegis" },
  { id: "trail_ember", slot: "trail", rarity: "standard", variant: "fire" },
  { id: "trail_frost", slot: "trail", rarity: "refined", variant: "frost" },
  { id: "trail_arc", slot: "trail", rarity: "exotic", variant: "lightning" },
  { id: "trail_aegis", slot: "trail", rarity: "arcana", variant: "aegis" },
  // Следы второй волны (владелец 2026-09-07: «жирные» следы, разные): кровь, листва, пустота, призрачные копии героя.
  { id: "trail_blood", slot: "trail", rarity: "standard", variant: "blood" },
  { id: "trail_leaves", slot: "trail", rarity: "refined", variant: "leaves" },
  { id: "trail_void", slot: "trail", rarity: "exotic", variant: "void" },
  { id: "trail_spectral", slot: "trail", rarity: "arcana", variant: "spectral" },
  { id: "death_ring", slot: "death", rarity: "standard", variant: "ring" },
  { id: "death_shatter", slot: "death", rarity: "refined", variant: "shatter" },
  { id: "death_nova", slot: "death", rarity: "exotic", variant: "nova" },
  // Трофеи за отметки мастерства (T13.48, аудит: «след спор за очищение лагеря, обломки за Осквернителя/Некроманта»).
  { id: "trail_spores", slot: "trail", rarity: "exotic", variant: "spores", unlock: { mark: "camp" } },
  { id: "death_bones", slot: "death", rarity: "exotic", variant: "bones", unlock: { mark: "necro" } },
  { id: "trail_hoofprints", slot: "trail", rarity: "exotic", variant: "hoofprints", unlock: { mark: "centaur" } },
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
  // Аркана Drow — на теле арканы `drow_arcana.vmdl_c` с её частями; «размазня» была в клипах частей,
  // а не в модели (T13.30).
  { id: "skin_drow_arcana", slot: "skin", rarity: "arcana", variant: "drow_ranger@arcana", hero: "drow_ranger" },
  // Партия 4 (2026-09-08, владелец: «добавь арканы на всех оставшихся персонажей»): пять аркан Dota,
  // которых у нас не было. Список сверен по `scripts/items/items_game.txt` (item_rarity = arcana), а не
  // по памяти: у Invoker арканы нет вовсе (Magus Apex — immortal), больше аркан в игре не осталось.
  { id: "skin_mk_arcana", slot: "skin", rarity: "arcana", variant: "monkey_king@arcana", hero: "monkey_king", styles: [{ id: "style1", sheet: true }, { id: "style2", sheet: true }, { id: "style3", sheet: true }, ...GEMS] },
  // Fiery Soul of the Slayer (item 4794): скальп `origins_flamehair` + текстура тела `lina_base_flamehair` (model_skin 1); сам огонь
  // у Valve — частицы `lina_headflame.vpcf`, в модели его нет — рисуется эффектом `flamehair` (effects.ts). До 2026-09-15
  // под этим id ошибочно лежал сет Battle Caster (4935–4938) — он остался отдельным сетом ниже, сейв мигрирует (arcadeStore).
  { id: "skin_lina_arcana", slot: "skin", rarity: "arcana", variant: "lina@arcana", hero: "lina", fx: { aura: "flamehair", slot: "head" } },
  { id: "skin_lc_arcana", slot: "skin", rarity: "arcana", variant: "legion_commander@arcana", hero: "legion_commander" },
  { id: "skin_techies_arcana", slot: "skin", rarity: "arcana", variant: "techies@arcana", hero: "techies" },
  { id: "skin_io_arcana", slot: "skin", rarity: "arcana", variant: "io@arcana", hero: "io" },
  // Сеты Dota (T13.27, вопрос владельца «можно ли конкретные предметы из сетов»): сет — это части
  // `models/items/<hero>/<set>_{head,arms,legs,back,weapon}`, которые пришиваются к скелету базового
  // героя ровно как части аркан. Лист — `<hero>@<set>`, редкость exotic (в Dota это не аркана).
  { id: "skin_tb_arcana", slot: "skin", rarity: "arcana", variant: "terrorblade@arcana", hero: "terrorblade" },
  { id: "skin_jugg_bladesrunner", slot: "skin", rarity: "exotic", variant: "juggernaut@bladesrunner", hero: "juggernaut" },
  { id: "skin_pa_darkfeather", slot: "skin", rarity: "exotic", variant: "phantom_assassin@darkfeather", hero: "phantom_assassin" },
  { id: "skin_axe_blackthorn", slot: "skin", rarity: "exotic", variant: "axe@blackthorn", hero: "axe" },
  { id: "skin_pudge_scarecrow", slot: "skin", rarity: "exotic", variant: "pudge@scarecrow", hero: "pudge" },
  // Сет каждому герою, у которого не было косметики (T13.27): части `models/items/<hero>/<set>_*`
  // пришиваются к скелету базовой модели тем же Copy Transforms, что и части аркан.
  { id: "skin_phantom_lancer_rakshasa", slot: "skin", rarity: "exotic", variant: "phantom_lancer@rakshasa", hero: "phantom_lancer" },
  { id: "skin_enchantress_the_sheep", slot: "skin", rarity: "exotic", variant: "enchantress@the_sheep", hero: "enchantress" },
  { id: "skin_chen_eye_of_power", slot: "skin", rarity: "exotic", variant: "chen@eye_of_power", hero: "chen" },
  { id: "skin_ancient_apparition_frost_djin", slot: "skin", rarity: "exotic", variant: "ancient_apparition@frost_djin", hero: "ancient_apparition" },
  { id: "skin_monkey_king_fiery_vajrapani", slot: "skin", rarity: "exotic", variant: "monkey_king@fiery_vajrapani", hero: "monkey_king" },
  { id: "skin_monkey_king_cult_of_the_demon_trickster", slot: "skin", rarity: "exotic", variant: "monkey_king@cult_of_the_demon_trickster", hero: "monkey_king", styles: [{ id: "style1", sheet: true }, { id: "style2", sheet: true }, { id: "style3", sheet: true }] },
  { id: "skin_anti_mage_guilt_of_the_survivor", slot: "skin", rarity: "exotic", variant: "anti_mage@guilt_of_the_survivor", hero: "anti_mage" },
  { id: "skin_dark_willow_deathcap_fairy", slot: "skin", rarity: "exotic", variant: "dark_willow@deathcap_fairy", hero: "dark_willow" },
  // Io: его облики — цельные модели в `models/items/io/`, а не части по слотам, поэтому в
  // автоподбор сетов они не попали.
  { id: "skin_io_calavera", slot: "skin", rarity: "exotic", variant: "io@calavera", hero: "io" },
  // Сет каждому герою, у которого не было косметики (T13.27): части `models/items/<hero>/<set>_*`
  // пришиваются к скелету базовой модели тем же Copy Transforms, что и части аркан.
  { id: "skin_lina_dragonfire", slot: "skin", rarity: "exotic", variant: "lina@dragonfire", hero: "lina" },
  { id: "skin_lina_battle_caster", slot: "skin", rarity: "exotic", variant: "lina@battle_caster", hero: "lina" },
  // Сеты Terrorblade (2026-09-19, владелец: «сеты и для обычной формы»): у каждого в Dota свой демон — он привязан через `withSkin`.
  { id: "skin_terrorblade_marauders", slot: "skin", rarity: "exotic", variant: "terrorblade@marauders", hero: "terrorblade" },
  { id: "skin_terrorblade_eternal_purgatory", slot: "skin", rarity: "exotic", variant: "terrorblade@eternal_purgatory", hero: "terrorblade" },
  { id: "skin_terrorblade_foulfell", slot: "skin", rarity: "exotic", variant: "terrorblade@foulfell", hero: "terrorblade" },
  { id: "skin_terrorblade_broken_code", slot: "skin", rarity: "exotic", variant: "terrorblade@broken_code", hero: "terrorblade" },
  { id: "skin_terrorblade_forgotten_station", slot: "skin", rarity: "exotic", variant: "terrorblade@forgotten_station", hero: "terrorblade" },
  // Волна владельца 2026-09-19: Anti-Mage (наборы оружия «с башерами» и «с мантами»), все сеты Shadow Fiend и Drow Ranger —
  // состав по бандлам items_game (в комментарии id бандла), слои частей — на базовом теле и на аркане.
  { id: "skin_shadow_fiend_eternal_harvest", slot: "skin", rarity: "exotic", variant: "shadow_fiend@eternal_harvest", hero: "shadow_fiend" }, // бандл 21070
  { id: "skin_shadow_fiend_souls_tyrant", slot: "skin", rarity: "exotic", variant: "shadow_fiend@souls_tyrant", hero: "shadow_fiend" }, // бандл 21419
  { id: "skin_shadow_fiend_spring_lineage_eternal_harvest", slot: "skin", rarity: "exotic", variant: "shadow_fiend@spring_lineage_eternal_harvest", hero: "shadow_fiend" }, // бандл 22842
  { id: "skin_drow_ranger_sight_of_the_kha_ren_faithful", slot: "skin", rarity: "exotic", variant: "drow_ranger@sight_of_the_kha_ren_faithful", hero: "drow_ranger" }, // бандл 21375
  { id: "skin_drow_ranger_stranger_in_the_wandering_isles", slot: "skin", rarity: "exotic", variant: "drow_ranger@stranger_in_the_wandering_isles", hero: "drow_ranger" }, // бандл 21710
  { id: "skin_drow_ranger_black_ice_constellation", slot: "skin", rarity: "exotic", variant: "drow_ranger@black_ice_constellation", hero: "drow_ranger" }, // бандл 22360
  { id: "skin_anti_mage_basher_blades", slot: "skin", rarity: "exotic", variant: "anti_mage@basher_blades", hero: "anti_mage" }, // бандл 20796
  { id: "skin_anti_mage_arcs_of_manta", slot: "skin", rarity: "exotic", variant: "anti_mage@arcs_of_manta", hero: "anti_mage" }, // бандл 20251
  { id: "skin_lich_rime_lord", slot: "skin", rarity: "exotic", variant: "lich@rime_lord", hero: "lich" },
  { id: "skin_bristleback_wrathrunner", slot: "skin", rarity: "exotic", variant: "bristleback@wrathrunner", hero: "bristleback" },
  { id: "skin_sven_arbiter", slot: "skin", rarity: "exotic", variant: "sven@arbiter", hero: "sven" },
  { id: "skin_storm_spirit_tormenta", slot: "skin", rarity: "exotic", variant: "storm_spirit@tormenta", hero: "storm_spirit" },
  { id: "skin_leshrac_force_of_kylin", slot: "skin", rarity: "exotic", variant: "leshrac@force_of_kylin", hero: "leshrac" },
  { id: "skin_ursa_circus_ursa", slot: "skin", rarity: "exotic", variant: "ursa@circus_ursa", hero: "ursa" },
  { id: "skin_lion_dota_plus_lion", slot: "skin", rarity: "exotic", variant: "lion@dota_plus_lion", hero: "lion" },
  { id: "skin_pugna_furious_phantasm", slot: "skin", rarity: "exotic", variant: "pugna@furious_phantasm", hero: "pugna" },
  { id: "skin_tidehunter_swamp_monster", slot: "skin", rarity: "exotic", variant: "tidehunter@swamp_monster", hero: "tidehunter" },
  { id: "skin_clinkz_khans_champion", slot: "skin", rarity: "exotic", variant: "clinkz@khans_champion", hero: "clinkz" },
  { id: "skin_kunkka_claddish", slot: "skin", rarity: "exotic", variant: "kunkka@claddish", hero: "kunkka" },
  { id: "skin_necrophos_ti8_necro_disaster_of_pestilence", slot: "skin", rarity: "exotic", variant: "necrophos@ti8_necro_disaster_of_pestilence", hero: "necrophos" },
  { id: "skin_venomancer_poison_touch", slot: "skin", rarity: "exotic", variant: "venomancer@poison_touch", hero: "venomancer" },
  { id: "skin_witch_doctor_monke", slot: "skin", rarity: "exotic", variant: "witch_doctor@monke", hero: "witch_doctor" },
  { id: "skin_luna_sets_servant", slot: "skin", rarity: "exotic", variant: "luna@sets_servant", hero: "luna" },
  { id: "skin_bloodseeker_blood_prince_corruption", slot: "skin", rarity: "exotic", variant: "bloodseeker@blood_prince_corruption", hero: "bloodseeker" },
  { id: "skin_riki_junk_rat", slot: "skin", rarity: "exotic", variant: "riki@junk_rat", hero: "riki" },
  { id: "skin_huskar_poseidon", slot: "skin", rarity: "exotic", variant: "huskar@poseidon", hero: "huskar" },
  { id: "skin_slardar_maelrawn_falls", slot: "skin", rarity: "exotic", variant: "slardar@maelrawn_falls", hero: "slardar" },
  { id: "skin_tiny_astral_order", slot: "skin", rarity: "exotic", variant: "tiny@astral_order", hero: "tiny" },
  { id: "skin_chaos_knight_oda_nobunaga", slot: "skin", rarity: "exotic", variant: "chaos_knight@oda_nobunaga", hero: "chaos_knight" },
  { id: "skin_night_stalker_dusk_reaper", slot: "skin", rarity: "exotic", variant: "night_stalker@dusk_reaper", hero: "night_stalker" },
  { id: "skin_doom_cruel_gaze", slot: "skin", rarity: "exotic", variant: "doom@cruel_gaze", hero: "doom" },
  { id: "skin_legion_commander_radiant_conqueror", slot: "skin", rarity: "exotic", variant: "legion_commander@radiant_conqueror", hero: "legion_commander" },
  { id: "skin_templar_assassin_jade_assassin", slot: "skin", rarity: "exotic", variant: "templar_assassin@jade_assassin", hero: "templar_assassin" },
  { id: "skin_medusa_blueice", slot: "skin", rarity: "exotic", variant: "medusa@blueice", hero: "medusa" },
  { id: "skin_silencer_silent_huner", slot: "skin", rarity: "exotic", variant: "silencer@silent_huner", hero: "silencer" },
  { id: "skin_dazzle_shadowflame", slot: "skin", rarity: "exotic", variant: "dazzle@shadowflame", hero: "dazzle" },
  { id: "skin_jakiro_ti7_immortal", slot: "skin", rarity: "exotic", variant: "jakiro@ti7_immortal", hero: "jakiro" },
  { id: "skin_shadow_shaman_dragontooth", slot: "skin", rarity: "exotic", variant: "shadow_shaman@dragontooth", hero: "shadow_shaman" },
  { id: "skin_warlock_greevil_master", slot: "skin", rarity: "exotic", variant: "warlock@greevil_master", hero: "warlock" },
  { id: "skin_tinker_mecha_hornet", slot: "skin", rarity: "exotic", variant: "tinker@mecha_hornet", hero: "tinker" },
  { id: "skin_omniknight_stalwart", slot: "skin", rarity: "exotic", variant: "omniknight@stalwart", hero: "omniknight" },
  { id: "skin_abaddon_alliance_abba", slot: "skin", rarity: "exotic", variant: "abaddon@alliance_abba", hero: "abaddon" },
  { id: "skin_beastmaster_red_talon", slot: "skin", rarity: "exotic", variant: "beastmaster@red_talon", hero: "beastmaster" },
  { id: "skin_brewmaster_traveling_chef", slot: "skin", rarity: "exotic", variant: "brewmaster@traveling_chef", hero: "brewmaster" },
  { id: "skin_centaur_warstomp", slot: "skin", rarity: "exotic", variant: "centaur@warstomp", hero: "centaur" },
  { id: "skin_dark_seer_gombangdae", slot: "skin", rarity: "exotic", variant: "dark_seer@gombangdae", hero: "dark_seer" },
  { id: "skin_death_prophet_carrion_bloom", slot: "skin", rarity: "exotic", variant: "death_prophet@carrion_bloom", hero: "death_prophet" },
  { id: "skin_disruptor_ragethree", slot: "skin", rarity: "exotic", variant: "disruptor@ragethree", hero: "disruptor" },
  { id: "skin_lycan_ambry", slot: "skin", rarity: "exotic", variant: "lycan@ambry", hero: "lycan" },
  { id: "skin_lone_druid_dark_wood", slot: "skin", rarity: "exotic", variant: "lone_druid@dark_wood", hero: "lone_druid" },
  { id: "skin_alchemist_frankenstein", slot: "skin", rarity: "exotic", variant: "alchemist@frankenstein", hero: "alchemist" },
  { id: "skin_bane_gear", slot: "skin", rarity: "exotic", variant: "bane@gear", hero: "bane" },
  { id: "skin_bounty_hunter_maniac", slot: "skin", rarity: "exotic", variant: "bounty_hunter@maniac", hero: "bounty_hunter" },
  { id: "skin_broodmother_firemother", slot: "skin", rarity: "exotic", variant: "broodmother@firemother", hero: "broodmother" },
  { id: "skin_clockwerk_crockwork", slot: "skin", rarity: "exotic", variant: "clockwerk@crockwork", hero: "clockwerk" },
  { id: "skin_earth_spirit_bowling_champion", slot: "skin", rarity: "exotic", variant: "earth_spirit@bowling_champion", hero: "earth_spirit" },
  { id: "skin_elder_titan_worldforger", slot: "skin", rarity: "exotic", variant: "elder_titan@worldforger", hero: "elder_titan" },
  { id: "skin_ember_spirit_efrit_sultan", slot: "skin", rarity: "exotic", variant: "ember_spirit@efrit_sultan", hero: "ember_spirit" },
  { id: "skin_grimstroke_ghost_judger", slot: "skin", rarity: "exotic", variant: "grimstroke@ghost_judger", hero: "grimstroke" },
  { id: "skin_keeper_of_the_light_cradle_of_lights", slot: "skin", rarity: "exotic", variant: "keeper_of_the_light@cradle_of_lights", hero: "keeper_of_the_light" },
  { id: "skin_magnus_forgemaster", slot: "skin", rarity: "exotic", variant: "magnus@forgemaster", hero: "magnus" },
  { id: "skin_mars_imperial_envoy", slot: "skin", rarity: "exotic", variant: "mars@imperial_envoy", hero: "mars" },
  { id: "skin_morphling_abyss_overlord", slot: "skin", rarity: "exotic", variant: "morphling@abyss_overlord", hero: "morphling" },
  { id: "skin_naga_siren_the_leech_queen", slot: "skin", rarity: "exotic", variant: "naga_siren@the_leech_queen", hero: "naga_siren" },
  { id: "skin_natures_prophet_father", slot: "skin", rarity: "exotic", variant: "natures_prophet@father", hero: "natures_prophet" },
  { id: "skin_nyx_assassin_dusky", slot: "skin", rarity: "exotic", variant: "nyx_assassin@dusky", hero: "nyx_assassin" },
  { id: "skin_oracle_saint_bodhisattva", slot: "skin", rarity: "exotic", variant: "oracle@saint_bodhisattva", hero: "oracle" },
  { id: "skin_outworld_destroyer_lucent_gate", slot: "skin", rarity: "exotic", variant: "outworld_destroyer@lucent_gate", hero: "outworld_destroyer" },
  { id: "skin_pangolier_lord_fox", slot: "skin", rarity: "exotic", variant: "pangolier@lord_fox", hero: "pangolier" },
  { id: "skin_phoenix_dark_owl", slot: "skin", rarity: "exotic", variant: "phoenix@dark_owl", hero: "phoenix" },
  { id: "skin_sand_king_red_sand", slot: "skin", rarity: "exotic", variant: "sand_king@red_sand", hero: "sand_king" },
  { id: "skin_shadow_demon_malicioussting", slot: "skin", rarity: "exotic", variant: "shadow_demon@malicioussting", hero: "shadow_demon" },
  { id: "skin_slark_shivshell", slot: "skin", rarity: "exotic", variant: "slark@shivshell", hero: "slark" },
  { id: "skin_spirit_breaker_raging_loco", slot: "skin", rarity: "exotic", variant: "spirit_breaker@raging_loco", hero: "spirit_breaker" },
  { id: "skin_techies_mad_tex", slot: "skin", rarity: "exotic", variant: "techies@mad_tex", hero: "techies" },
  { id: "skin_timbersaw_noise_maker", slot: "skin", rarity: "exotic", variant: "timbersaw@noise_maker", hero: "timbersaw" },
  { id: "skin_troll_warlord_lord_of_war", slot: "skin", rarity: "exotic", variant: "troll_warlord@lord_of_war", hero: "troll_warlord" },
  { id: "skin_tusk_icelord", slot: "skin", rarity: "exotic", variant: "tusk@icelord", hero: "tusk" },
  { id: "skin_void_spirit_taiji_koi", slot: "skin", rarity: "exotic", variant: "void_spirit@taiji_koi", hero: "void_spirit" },
  { id: "skin_weaver_vespoid_stalker", slot: "skin", rarity: "exotic", variant: "weaver@vespoid_stalker", hero: "weaver" },
  { id: "skin_arc_warden_galactic_sentinel", slot: "skin", rarity: "exotic", variant: "arc_warden@galactic_sentinel", hero: "arc_warden" },
  { id: "skin_dawnbreaker_first_light", slot: "skin", rarity: "exotic", variant: "dawnbreaker@first_light", hero: "dawnbreaker" },
  { id: "skin_hoodwink_captain_squyarrrl", slot: "skin", rarity: "exotic", variant: "hoodwink@captain_squyarrrl", hero: "hoodwink" },
  { id: "skin_marci_lotus_keeper", slot: "skin", rarity: "exotic", variant: "marci@lotus_keeper", hero: "marci" },
  { id: "skin_muerta_deathcaster", slot: "skin", rarity: "exotic", variant: "muerta@deathcaster", hero: "muerta" },
  { id: "skin_primal_beast_primeval", slot: "skin", rarity: "exotic", variant: "primal_beast@primeval", hero: "primal_beast" },
  { id: "skin_ringmaster_fear_harvester", slot: "skin", rarity: "exotic", variant: "ringmaster@fear_harvester", hero: "ringmaster" },
  { id: "skin_meepo_sir_meepalot", slot: "skin", rarity: "exotic", variant: "meepo@sir_meepalot", hero: "meepo" },
  { id: "skin_viper_king_viper", slot: "skin", rarity: "exotic", variant: "viper@king_viper", hero: "viper" },
  { id: "skin_enigma_life_cycle", slot: "skin", rarity: "exotic", variant: "enigma@life_cycle", hero: "enigma" },
  { id: "skin_batrider_fiery_heart", slot: "skin", rarity: "exotic", variant: "batrider@fiery_heart", hero: "batrider" },
  { id: "skin_gyrocopter_dwarven_gyrocopter", slot: "skin", rarity: "exotic", variant: "gyrocopter@dwarven_gyrocopter", hero: "gyrocopter" },
  { id: "skin_puck_hippocampus", slot: "skin", rarity: "exotic", variant: "puck@hippocampus", hero: "puck" },
  { id: "skin_snapfire_snailfire", slot: "skin", rarity: "exotic", variant: "snapfire@snailfire", hero: "snapfire" },
  { id: "skin_treant_fungal", slot: "skin", rarity: "exotic", variant: "treant@fungal", hero: "treant" },
  { id: "skin_underlord_abyss_tyrant", slot: "skin", rarity: "exotic", variant: "underlord@abyss_tyrant", hero: "underlord" },
  { id: "skin_undying_love", slot: "skin", rarity: "exotic", variant: "undying@love", hero: "undying" },
  { id: "skin_sniper_odogaron", slot: "skin", rarity: "exotic", variant: "sniper@odogaron", hero: "sniper" },
  { id: "skin_winter_wyvern_wyvern_of_the_sea", slot: "skin", rarity: "exotic", variant: "winter_wyvern@wyvern_of_the_sea", hero: "winter_wyvern" },
  { id: "skin_visage_soul_reaper", slot: "skin", rarity: "exotic", variant: "visage@soul_reaper", hero: "visage" },
  { id: "skin_lifestealer_helmet", slot: "skin", rarity: "exotic", variant: "lifestealer@helmet", hero: "lifestealer" },
  { id: "skin_lich_blizzard_tyrant", slot: "skin", rarity: "exotic", variant: "lich@blizzard_tyrant", hero: "lich" },
  { id: "skin_bristleback_warrior_of_arena", slot: "skin", rarity: "exotic", variant: "bristleback@warrior_of_arena", hero: "bristleback" },
  { id: "skin_sven_endless_fury_sven", slot: "skin", rarity: "exotic", variant: "sven@endless_fury_sven", hero: "sven" },
  { id: "skin_leshrac_dark_forest_punisher", slot: "skin", rarity: "exotic", variant: "leshrac@dark_forest_punisher", hero: "leshrac" },
  { id: "skin_ursa_fierce_heart", slot: "skin", rarity: "exotic", variant: "ursa@fierce_heart", hero: "ursa" },
  { id: "skin_lion_dangerous_collector_red", slot: "skin", rarity: "exotic", variant: "lion@dangerous_collector_red", hero: "lion" },
  { id: "skin_pugna_narcissistic_leech", slot: "skin", rarity: "exotic", variant: "pugna@narcissistic_leech", hero: "pugna" },
  { id: "skin_invoker_covenant_of_the_depths", slot: "skin", rarity: "exotic", variant: "invoker@covenant_of_the_depths", hero: "invoker" },
  { id: "skin_tidehunter_burning_shark", slot: "skin", rarity: "exotic", variant: "tidehunter@burning_shark", hero: "tidehunter" },
  { id: "skin_mirana_blue_wintermoon", slot: "skin", rarity: "exotic", variant: "mirana@blue_wintermoon", hero: "mirana" },
  { id: "skin_clinkz_the_faith_of_avengers", slot: "skin", rarity: "exotic", variant: "clinkz@the_faith_of_avengers", hero: "clinkz" },
  { id: "skin_axe_armor_of_the_wrought_legion", slot: "skin", rarity: "exotic", variant: "axe@armor_of_the_wrought_legion", hero: "axe" },
  { id: "skin_dragon_knight_ascension", slot: "skin", rarity: "exotic", variant: "dragon_knight@ascension", hero: "dragon_knight" },
  { id: "skin_kunkka_inquisitor_tide", slot: "skin", rarity: "exotic", variant: "kunkka@inquisitor_tide", hero: "kunkka" },
  { id: "skin_venomancer_deathbringer", slot: "skin", rarity: "exotic", variant: "venomancer@deathbringer", hero: "venomancer" },
  { id: "skin_witch_doctor_father_of_the_fungal_forest", slot: "skin", rarity: "exotic", variant: "witch_doctor@father_of_the_fungal_forest", hero: "witch_doctor" },
  { id: "skin_luna_bounch_luna", slot: "skin", rarity: "exotic", variant: "luna@bounch_luna", hero: "luna" },
  { id: "skin_bloodseeker_blood_covenant", slot: "skin", rarity: "exotic", variant: "bloodseeker@blood_covenant", hero: "bloodseeker" },
  { id: "skin_riki_frosty_blow", slot: "skin", rarity: "exotic", variant: "riki@frosty_blow", hero: "riki" },
  { id: "skin_huskar_armor_of_reckless_vigor", slot: "skin", rarity: "exotic", variant: "huskar@armor_of_reckless_vigor", hero: "huskar" },
  { id: "skin_slardar_deep_one_slayer", slot: "skin", rarity: "exotic", variant: "slardar@deep_one_slayer", hero: "slardar" },
  { id: "skin_tiny_scarletquarry", slot: "skin", rarity: "exotic", variant: "tiny@scarletquarry", hero: "tiny" },
  { id: "skin_chaos_knight_burning_nightmare_chaos_knight", slot: "skin", rarity: "exotic", variant: "chaos_knight@burning_nightmare_chaos_knight", hero: "chaos_knight" },
  { id: "skin_night_stalker_black_nihility", slot: "skin", rarity: "exotic", variant: "night_stalker@black_nihility", hero: "night_stalker" },
  { id: "skin_doom_ancient_beast", slot: "skin", rarity: "exotic", variant: "doom@ancient_beast", hero: "doom" },
  { id: "skin_templar_assassin_blessed_gifts_of_the_temple", slot: "skin", rarity: "exotic", variant: "templar_assassin@blessed_gifts_of_the_temple", hero: "templar_assassin" },
  { id: "skin_medusa_jewelled_splendor", slot: "skin", rarity: "exotic", variant: "medusa@jewelled_splendor", hero: "medusa" },
  { id: "skin_silencer_silent_guardian", slot: "skin", rarity: "exotic", variant: "silencer@silent_guardian", hero: "silencer" },
  { id: "skin_dazzle_darkclaw_acolyte", slot: "skin", rarity: "exotic", variant: "dazzle@darkclaw_acolyte", hero: "dazzle" },
  { id: "skin_shadow_shaman_eyedancer_wrath", slot: "skin", rarity: "exotic", variant: "shadow_shaman@eyedancer_wrath", hero: "shadow_shaman" },
  { id: "skin_warlock_grimoires", slot: "skin", rarity: "exotic", variant: "warlock@grimoires", hero: "warlock" },
  { id: "skin_tinker_deep_sea_robot", slot: "skin", rarity: "exotic", variant: "tinker@deep_sea_robot", hero: "tinker" },
  { id: "skin_omniknight_divine_anvil", slot: "skin", rarity: "exotic", variant: "omniknight@divine_anvil", hero: "omniknight" },
  { id: "skin_abaddon_blackmist_reaper", slot: "skin", rarity: "exotic", variant: "abaddon@blackmist_reaper", hero: "abaddon" },
  { id: "skin_beastmaster_beast_heart_marauder", slot: "skin", rarity: "exotic", variant: "beastmaster@beast_heart_marauder", hero: "beastmaster" },
  { id: "skin_brewmaster_brew_jousting_panda_and_donkey_kong", slot: "skin", rarity: "exotic", variant: "brewmaster@brew_jousting_panda_and_donkey_kong", hero: "brewmaster" },
  { id: "skin_centaur_armor_of_unstoppable_force", slot: "skin", rarity: "exotic", variant: "centaur@armor_of_unstoppable_force", hero: "centaur" },
  { id: "skin_dark_seer_aqwanderer", slot: "skin", rarity: "exotic", variant: "dark_seer@aqwanderer", hero: "dark_seer" },
  { id: "skin_death_prophet_awakened_thirst", slot: "skin", rarity: "exotic", variant: "death_prophet@awakened_thirst", hero: "death_prophet" },
  { id: "skin_disruptor_kirin_rider", slot: "skin", rarity: "exotic", variant: "disruptor@kirin_rider", hero: "disruptor" },
  { id: "skin_lycan_ascension_of_the_hallowed_beast", slot: "skin", rarity: "exotic", variant: "lycan@ascension_of_the_hallowed_beast", hero: "lycan" },
  { id: "skin_lone_druid_elemental_curse", slot: "skin", rarity: "exotic", variant: "lone_druid@elemental_curse", hero: "lone_druid" },
  { id: "skin_alchemist_jungle_chief", slot: "skin", rarity: "exotic", variant: "alchemist@jungle_chief", hero: "alchemist" },
  { id: "skin_bane_nightmare_demon_mage", slot: "skin", rarity: "exotic", variant: "bane@nightmare_demon_mage", hero: "bane" },
  { id: "skin_batrider_flaming_boogeyman", slot: "skin", rarity: "exotic", variant: "batrider@flaming_boogeyman", hero: "batrider" },
  { id: "skin_bounty_hunter_bounty_scout", slot: "skin", rarity: "exotic", variant: "bounty_hunter@bounty_scout", hero: "bounty_hunter" },
  { id: "skin_broodmother_araknarok_broodmother", slot: "skin", rarity: "exotic", variant: "broodmother@araknarok_broodmother", hero: "broodmother" },
  { id: "skin_clockwerk_clock_soul_of_steam", slot: "skin", rarity: "exotic", variant: "clockwerk@clock_soul_of_steam", hero: "clockwerk" },
  { id: "skin_earth_spirit_legend_of_the_jade_serpent", slot: "skin", rarity: "exotic", variant: "earth_spirit@legend_of_the_jade_serpent", hero: "earth_spirit" },
  { id: "skin_elder_titan_harness_of_the_soulforged", slot: "skin", rarity: "exotic", variant: "elder_titan@harness_of_the_soulforged", hero: "elder_titan" },
  { id: "skin_ember_spirit_blazearmor", slot: "skin", rarity: "exotic", variant: "ember_spirit@blazearmor", hero: "ember_spirit" },
  { id: "skin_grimstroke_tengu_guardian", slot: "skin", rarity: "exotic", variant: "grimstroke@tengu_guardian", hero: "grimstroke" },
  { id: "skin_gyrocopter_flamed_falcon_patrol", slot: "skin", rarity: "exotic", variant: "gyrocopter@flamed_falcon_patrol", hero: "gyrocopter" },
  { id: "skin_keeper_of_the_light_aesir_lord_odin", slot: "skin", rarity: "exotic", variant: "keeper_of_the_light@aesir_lord_odin", hero: "keeper_of_the_light" },
  { id: "skin_magnus_defender_of_joerlak", slot: "skin", rarity: "exotic", variant: "magnus@defender_of_joerlak", hero: "magnus" },
  { id: "skin_mars_arena_champion", slot: "skin", rarity: "exotic", variant: "mars@arena_champion", hero: "mars" },
  { id: "skin_morphling_armor_of_pure_absorption", slot: "skin", rarity: "exotic", variant: "morphling@armor_of_pure_absorption", hero: "morphling" },
  { id: "skin_naga_siren_allure_of_the_deep", slot: "skin", rarity: "exotic", variant: "naga_siren@allure_of_the_deep", hero: "naga_siren" },
  { id: "skin_natures_prophet_abyssal_prophet", slot: "skin", rarity: "exotic", variant: "natures_prophet@abyssal_prophet", hero: "natures_prophet" },
  { id: "skin_nyx_assassin_2023the_one", slot: "skin", rarity: "exotic", variant: "nyx_assassin@2023the_one", hero: "nyx_assassin" },
  { id: "skin_oracle_celestial_navigator", slot: "skin", rarity: "exotic", variant: "oracle@celestial_navigator", hero: "oracle" },
  { id: "skin_outworld_destroyer_herald_of_measureless_ruin", slot: "skin", rarity: "exotic", variant: "outworld_destroyer@herald_of_measureless_ruin", hero: "outworld_destroyer" },
  { id: "skin_pangolier_forest_winter_expedition", slot: "skin", rarity: "exotic", variant: "pangolier@forest_winter_expedition", hero: "pangolier" },
  { id: "skin_sand_king_deserts_deathly_embrace", slot: "skin", rarity: "exotic", variant: "sand_king@deserts_deathly_embrace", hero: "sand_king" },
  { id: "skin_shadow_demon_conqueror_measurement", slot: "skin", rarity: "exotic", variant: "shadow_demon@conqueror_measurement", hero: "shadow_demon" },
  { id: "skin_slark_dark_reef", slot: "skin", rarity: "exotic", variant: "slark@dark_reef", hero: "slark" },
  { id: "skin_snapfire_avalanche_hunteress", slot: "skin", rarity: "exotic", variant: "snapfire@avalanche_hunteress", hero: "snapfire" },
  { id: "skin_spirit_breaker_elemental_realms", slot: "skin", rarity: "exotic", variant: "spirit_breaker@elemental_realms", hero: "spirit_breaker" },
  { id: "skin_timbersaw_chopper_knight", slot: "skin", rarity: "exotic", variant: "timbersaw@chopper_knight", hero: "timbersaw" },
  { id: "skin_treant_ancient_seal_protector", slot: "skin", rarity: "exotic", variant: "treant@ancient_seal_protector", hero: "treant" },
  { id: "skin_troll_warlord_the_mythical_vanquisher", slot: "skin", rarity: "exotic", variant: "troll_warlord@the_mythical_vanquisher", hero: "troll_warlord" },
  { id: "skin_tusk_glacial_squad_commander", slot: "skin", rarity: "exotic", variant: "tusk@glacial_squad_commander", hero: "tusk" },
  { id: "skin_void_spirit_vs_cosmic", slot: "skin", rarity: "exotic", variant: "void_spirit@vs_cosmic", hero: "void_spirit" },
  { id: "skin_weaver_the_dusk_crawler", slot: "skin", rarity: "exotic", variant: "weaver@the_dusk_crawler", hero: "weaver" },
  { id: "skin_arc_warden_dark_carnival", slot: "skin", rarity: "exotic", variant: "arc_warden@dark_carnival", hero: "arc_warden" },
  { id: "skin_dawnbreaker_astral_angel", slot: "skin", rarity: "exotic", variant: "dawnbreaker@astral_angel", hero: "dawnbreaker" },
  { id: "skin_hoodwink_screeauk", slot: "skin", rarity: "exotic", variant: "hoodwink@screeauk", hero: "hoodwink" },
  { id: "skin_marci_blooming_ornaments", slot: "skin", rarity: "exotic", variant: "marci@blooming_ornaments", hero: "marci" },
  { id: "skin_muerta_the_netherbutterfly", slot: "skin", rarity: "exotic", variant: "muerta@the_netherbutterfly", hero: "muerta" },
  { id: "skin_primal_beast_pb_dark_behemoth", slot: "skin", rarity: "exotic", variant: "primal_beast@pb_dark_behemoth", hero: "primal_beast" },
  { id: "skin_ringmaster_the_royal_jester", slot: "skin", rarity: "exotic", variant: "ringmaster@the_royal_jester", hero: "ringmaster" },
  { id: "skin_meepo_dosa", slot: "skin", rarity: "exotic", variant: "meepo@dosa", hero: "meepo" },
  { id: "skin_phantom_lancer_anubis_phantom_lancer", slot: "skin", rarity: "exotic", variant: "phantom_lancer@anubis_phantom_lancer", hero: "phantom_lancer" },
  { id: "skin_enchantress_amberlight", slot: "skin", rarity: "exotic", variant: "enchantress@amberlight", hero: "enchantress" },
  { id: "skin_chen_infernal_psychic", slot: "skin", rarity: "exotic", variant: "chen@infernal_psychic", hero: "chen" },
  { id: "skin_ancient_apparition_aa_cosmic", slot: "skin", rarity: "exotic", variant: "ancient_apparition@aa_cosmic", hero: "ancient_apparition" },
  { id: "skin_dark_willow_burglar_of_wasp", slot: "skin", rarity: "exotic", variant: "dark_willow@burglar_of_wasp", hero: "dark_willow" },
  // Скины призывов (T13.80, владелец: «медведь Lone Druid, волки Lycan… чтобы тоже можно было кастомизировать»):
  // полная модель скина на скелете и анимациях базового призыва (--hide-base в манифесте), лист `<art>@<skin>`.
  { id: "summon_bear_dark_wood", slot: "summon", rarity: "exotic", variant: "bear@dark_wood", hero: "lone_druid", withSkin: "skin_lone_druid_dark_wood" },
  { id: "summon_bear_iron_claw", slot: "summon", rarity: "exotic", variant: "bear@iron_claw", hero: "lone_druid" },
  { id: "summon_spiderling_amber_queen", slot: "summon", rarity: "exotic", variant: "spiderling@amber_queen", hero: "broodmother" },
  { id: "summon_spiderling_lycosidae", slot: "summon", rarity: "exotic", variant: "spiderling@lycosidae", hero: "broodmother" },
  { id: "summon_warlock_golem_obsidian", slot: "summon", rarity: "exotic", variant: "warlock_golem@obsidian", hero: "warlock" },
  { id: "summon_warlock_golem_hellsworn", slot: "summon", rarity: "exotic", variant: "warlock_golem@hellsworn", hero: "warlock" },
  // Срез 3 (2026-09-19): скины форм — отдельные предметы Dota (TB `ability3`, Lone Druid `ability_ultimate`, DK `shapeshift`:
  // подмена `entity_model` модели формы), лист `<hero>@meta~<имя>` — модель скина на скелете и анимациях базовой формы
  // (--hide-base). Волки Lycan — подмена юнита `npc_dota_lycan_wolf` (слот `summon`): у моделей свой скелет, поэтому
  // рендерятся основной моделью со своими клипами, а не частью на скелете базового волка. В комментарии — item ID и имя.
  { id: "form_terrorblade_marauders", slot: "form", rarity: "refined", variant: "terrorblade@meta~marauders", hero: "terrorblade", withSkin: "skin_terrorblade_marauders" }, // 7033 Marauder's Demon Form
  { id: "form_terrorblade_baleful_hollow", slot: "form", rarity: "refined", variant: "terrorblade@meta~baleful_hollow", hero: "terrorblade" }, // 7404 Form of the Baleful Hollow
  { id: "form_terrorblade_eternal_purgatory", slot: "form", rarity: "refined", variant: "terrorblade@meta~eternal_purgatory", hero: "terrorblade", withSkin: "skin_terrorblade_eternal_purgatory" }, // 8276 Form of Eternal Purgatory
  { id: "form_terrorblade_foulfell", slot: "form", rarity: "exotic", variant: "terrorblade@meta~foulfell", hero: "terrorblade", withSkin: "skin_terrorblade_foulfell" }, // 9501 Demon Form of the Foulfell Corruptor
  { id: "form_terrorblade_broken_code", slot: "form", rarity: "exotic", variant: "terrorblade@meta~broken_code", hero: "terrorblade", withSkin: "skin_terrorblade_broken_code" }, // 14339 Chasm of the Broken Code Demon
  { id: "form_terrorblade_forgotten_station", slot: "form", rarity: "exotic", variant: "terrorblade@meta~forgotten_station", hero: "terrorblade", withSkin: "skin_terrorblade_forgotten_station" }, // 26446 Forgotten Station Demon
  { id: "form_lone_druid_onyx_grove", slot: "form", rarity: "exotic", variant: "lone_druid@meta~onyx_grove", hero: "lone_druid" }, // 5089 Form of the Onyx Grove
  { id: "form_lone_druid_atniw", slot: "form", rarity: "exotic", variant: "lone_druid@meta~atniw", hero: "lone_druid" }, // 5193 Form of the Atniw
  { id: "form_lone_druid_iron_claw", slot: "form", rarity: "exotic", variant: "lone_druid@meta~iron_claw", hero: "lone_druid" }, // 6669 Beast of the Iron Claw
  { id: "form_lone_druid_dark_wood", slot: "form", rarity: "exotic", variant: "lone_druid@meta~dark_wood", hero: "lone_druid", withSkin: "skin_lone_druid_dark_wood" }, // 8871 Form of the Dark Wood
  { id: "form_lone_druid_war_burrow", slot: "form", rarity: "refined", variant: "lone_druid@meta~war_burrow", hero: "lone_druid", withSkin: "skin_lone_druid_elemental_curse" }, // 9567 True Form of the War-Burrow Ravager
  { id: "form_dragon_knight_iron_dragon", slot: "form", rarity: "exotic", variant: "dragon_knight@meta~iron_dragon", hero: "dragon_knight" }, // 6615 Kindred of the Iron Dragon
  { id: "form_dragon_knight_blazing_oblivion", slot: "form", rarity: "exotic", variant: "dragon_knight@meta~blazing_oblivion", hero: "dragon_knight" }, // 7671 Elder Drake of Blazing Oblivion
  { id: "form_dragon_knight_burning_scale", slot: "form", rarity: "exotic", variant: "dragon_knight@meta~burning_scale", hero: "dragon_knight" }, // 8979 Shadow of the Burning Scale
  { id: "form_dragon_knight_outland_ravager", slot: "form", rarity: "exotic", variant: "dragon_knight@meta~outland_ravager", hero: "dragon_knight" }, // 9136 Dragon of the Outland Ravager
  { id: "form_dragon_knight_bitterwing", slot: "form", rarity: "refined", variant: "dragon_knight@meta~bitterwing", hero: "dragon_knight" }, // 9644 Bitterwing
  { id: "form_dragon_knight_third_awakening", slot: "form", rarity: "exotic", variant: "dragon_knight@meta~third_awakening", hero: "dragon_knight" }, // 9996 Dragon Form of the Third Awakening
  { id: "form_dragon_knight_scorched_amber", slot: "form", rarity: "exotic", variant: "dragon_knight@meta~scorched_amber", hero: "dragon_knight" }, // 13329 Scorched Amber Dragon Form
  { id: "form_dragon_knight_silverwurm", slot: "form", rarity: "exotic", variant: "dragon_knight@meta~silverwurm", hero: "dragon_knight" }, // 17999 Silverwurm Sacrifice Dragon Form
  { id: "form_dragon_knight_gilded_maw", slot: "form", rarity: "refined", variant: "dragon_knight@meta~gilded_maw", hero: "dragon_knight" }, // 18397 The Gilded Maw Forms
  { id: "form_dragon_knight_griffin_knight", slot: "form", rarity: "exotic", variant: "dragon_knight@meta~griffin_knight", hero: "dragon_knight" }, // 30735 Griffin Knight Dragon Form
  { id: "summon_wolf_great_grey", slot: "summon", rarity: "refined", variant: "wolf@great_grey", hero: "lycan" }, // 4988 Familiar of the Great Grey
  { id: "summon_wolf_icewrack_pack", slot: "summon", rarity: "refined", variant: "wolf@icewrack_pack", hero: "lycan" }, // 5596 Icewrack Pack
  { id: "summon_wolf_hunter_kings", slot: "summon", rarity: "exotic", variant: "wolf@hunter_kings", hero: "lycan" }, // 7050 Borealis and Puppey, Guardians of Ambry
  { id: "summon_wolf_ambry", slot: "summon", rarity: "refined", variant: "wolf@ambry", hero: "lycan", withSkin: "skin_lycan_ambry" }, // 7906 Wolves of Ambry
  { id: "summon_wolf_blood_moon", slot: "summon", rarity: "exotic", variant: "wolf@blood_moon", hero: "lycan" }, // 8998 Wolves of the Blood Moon
  { id: "summon_wolf_grey_ghost", slot: "summon", rarity: "refined", variant: "wolf@grey_ghost", hero: "lycan" }, // 12892 Companion of the Grey Ghost
  { id: "summon_wolf_red_wolf_clan", slot: "summon", rarity: "refined", variant: "wolf@red_wolf_clan", hero: "lycan" }, // 14858 Requiem for Red Wolf Clan Wolves
  { id: "summon_wolf_darkheart", slot: "summon", rarity: "refined", variant: "wolf@darkheart", hero: "lycan" }, // 17640 Darkheart Redemption Wolves
  { id: "summon_wolf_skullhound", slot: "summon", rarity: "exotic", variant: "wolf@skullhound", hero: "lycan", withSkin: "skin_lycan_ascension_of_the_hallowed_beast" }, // 18255 Creed of the Skullhound Summon
];

/** Арканы, у которых в Dota есть настоящий стиль (свой набор текстур): лист `<variant>~style1`
 *  рендерится отдельно (строка в манифестах + `--style <токен Valve>`, см. dota_style_textures.sh). */
const SHEET_STYLE_SKINS = new Set([
  "skin_jugg_arcana", "skin_drow_arcana", "skin_pudge_arcana",
  "skin_es_arcana", "skin_qop_arcana", "skin_wr_arcana", "skin_ogre_arcana",
  // Voidstorm Asylum: у Razor второй набор текстур лежит в vpk с токеном `alt` (`--style alt`) —
  // владелец 2026-09-08 «у арканы Разора… разных персон, одна зелёная, вторая фиолетовая».
  "skin_razor_arcana", "skin_spectre_arcana",
]);
for (const c of COSMETICS) if (SHEET_STYLE_SKINS.has(c.id)) (c as { styles?: readonly StyleDef[] }).styles = [{ id: "style1", sheet: true }, ...GEMS];

// Самоцветы — у аркан (владелец 2026-09-06: «у Terrorblade куча гемов, аркана может быть любого цвета»),
// но видны только там, где у листа есть свечение (`sheetGlow`); владелец 2026-09-07: «гемы есть не у всех».
// Персоны и сеты цвет не меняют: у них в Dota гнезда под самоцвет нет.
for (const c of COSMETICS) if (c.slot === "skin" && c.rarity === "arcana" && !c.styles) (c as { styles?: readonly StyleDef[] }).styles = GEMS;

export const COSMETIC_BY_ID: Record<string, CosmeticDef> = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));

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
/* ─── Облик по слотам (T13.80) ───
   Как в Dota: у героя слоты (голова, оружие, спина…), в каждый можно надеть часть любого своего сета. Основа облика —
   семейство из HERO_PARTS: базовая модель `<hero>`, аркана `<hero>@arcana` или её стиль `<hero>@arcana~style1` (своё
   тело и свои слои). Источник части — `base` (модель по умолчанию), имя основы (её собственные части) или сет
   (`<set>` из `<hero>@<set>`). Слот без записи следует надетому облику: у сета на базовом теле — его часть, иначе часть
   по умолчанию; у основы — её `defaults` (слот без записи у неё пуст, как в Dota у арканы без плаща). Всё как у одного
   облика — рисуется его цельный лист (со стилем), смешение — композит `<основа>+body+<src>.<slot>+…` из слоёв
   (features/arcade/sprites.ts). В сим ничего не идёт. Облик без семейства (персона/аркана, для которой слои не
   подготовлены) — цельный, слоты к нему не применяются. */
export type Loadout = Partial<Record<DotaSlot, string>>;
export const PART_BASE = "base";

/** Косметика источника частей (`<hero>@<src>`): у `base` её нет; у `arcana` — аркана героя. */
export function sourceCosmetic(hero: string, src: string): CosmeticDef | undefined {
  return src === PART_BASE ? undefined : COSMETICS.find((c) => c.slot === "skin" && c.hero === hero && c.variant === `${hero}@${src}`);
}

/** Основа надетого облика: семейство слоёв, источник надетого сета на базовом теле (или null у самой основы) и признак,
 *  что выбранный стиль не подготовлен как семейство (смешанный облик покажет основу без стиля). null — облик цельный. */
export interface WornFamily { id: string; family: PartsFamily; worn: string | null; styleDropped: boolean }
export function familyOf(hero: string, equipped: Partial<Record<CosmeticSlot, string>>, styles: Readonly<Record<string, string>> = {}): WornFamily | null {
  const hp = HERO_PARTS[hero];
  if (!hp) return null;
  const def = equipped.skin ? COSMETIC_BY_ID[equipped.skin] : undefined;
  const skin = def && def.slot === "skin" && def.hero === hero ? def : null;
  if (!skin) return hp.families[hero] ? { id: hero, family: hp.families[hero], worn: PART_BASE, styleDropped: false } : null;
  const styled = skinnedSheet(hero, equipped, styles);
  if (hp.families[styled]) return { id: styled, family: hp.families[styled], worn: null, styleDropped: false };
  if (hp.families[skin.variant]) return { id: skin.variant, family: hp.families[skin.variant], worn: null, styleDropped: styled !== skin.variant };
  const set = skin.variant.split("@")[1] ?? "";
  const base = hp.families[hero];
  if (base && base.sources[set]) return { id: hero, family: base, worn: set, styleDropped: styled !== skin.variant };
  return null;
}

/** Надетый облик цельный (персона/аркана без семейства): слоты к нему не применяются. */
export function wornIsWhole(hero: string, equipped: Partial<Record<CosmeticSlot, string>>, styles: Readonly<Record<string, string>> = {}): boolean {
  return !!HERO_PARTS[hero] && familyOf(hero, equipped, styles) === null;
}

/** Источники частей семейства, которыми игрок владеет: `base`, купленные сеты и своя аркана. */
export function partSources(hero: string, owned: readonly string[], familyId = hero): string[] {
  const fam = HERO_PARTS[hero]?.families[familyId];
  if (!fam) return [];
  return Object.keys(fam.sources).filter((src) => src === PART_BASE || owned.includes(sourceCosmetic(hero, src)?.id ?? ""));
}

/** Слоты по умолчанию: у основы — её `defaults`; у сета на базовом теле — его части, остальное — модель по умолчанию. */
function defaultsOf(fam: WornFamily, worn: string | null = fam.worn): Partial<Record<DotaSlot, string>> {
  if (worn === null) return { ...fam.family.defaults };
  const out: Partial<Record<DotaSlot, string>> = {};
  for (const slot of Object.keys(fam.family.defaults) as DotaSlot[]) out[slot] = fam.family.sources[worn]?.includes(slot) ? worn : fam.family.defaults[slot];
  for (const slot of fam.family.sources[worn] ?? []) out[slot] = worn;
  return out;
}

/** Слоты надетого облика без выборов игрока (что показывает «как у облика» в гардеробе). */
export function defaultLoadout(hero: string, equipped: Partial<Record<CosmeticSlot, string>>, styles: Readonly<Record<string, string>> = {}): Partial<Record<DotaSlot, string>> {
  const fam = familyOf(hero, equipped, styles);
  return fam ? defaultsOf(fam) : {};
}

/** Слоты, в которых на этой основе есть из чего выбирать: у слота больше одного источника либо единственный — не тот, что
 *  надет по умолчанию. Слот, закреплённый за основой (арбалет арканы Drow: другой лук на её хват не ложится —
 *  scripts/blender/dota_part_exclusions.json), гардероб не показывает — выбирать там нечего. */
export function choosableSlots(hero: string, familyId: string): DotaSlot[] {
  const hp = HERO_PARTS[hero], fam = hp?.families[familyId];
  if (!hp || !fam) return [];
  return hp.slots.filter((slot) => { const srcs = Object.keys(fam.sources).filter((src) => fam.sources[src].includes(slot)); return srcs.length > 1 || (srcs.length === 1 && srcs[0] !== fam.defaults[slot]); });
}

/** Слот → источник после правил: явный выбор (если источник свой и даёт эту часть), иначе как у надетого облика. */
export function resolveLoadout(hero: string, equipped: Partial<Record<CosmeticSlot, string>>, styles: Readonly<Record<string, string>>, loadout: Loadout, owned: readonly string[]): Partial<Record<DotaSlot, string>> {
  const fam = familyOf(hero, equipped, styles);
  if (!fam) return {};
  const mine = new Set(partSources(hero, owned, fam.id));
  const out = defaultsOf(fam);
  for (const slot of HERO_PARTS[hero]!.slots) {
    const pick = loadout[slot];
    if (pick && mine.has(pick) && fam.family.sources[pick]?.includes(slot)) out[slot] = pick;
  }
  return out;
}

const sameSlots = (slots: readonly DotaSlot[], a: Partial<Record<DotaSlot, string>>, b: Partial<Record<DotaSlot, string>>) => slots.every((s) => a[s] === b[s]);

/** Имя листа облика по слотам: цельный лист надетого облика (со стилем), если слоты его и повторяют; цельный лист
 *  другого сета/базовой модели, если всё собрано из него; иначе композит `<основа>+body+<src>.<slot>+…` в порядке отрисовки. */
export function loadoutSheet(hero: string, equipped: Partial<Record<CosmeticSlot, string>>, styles: Readonly<Record<string, string>>, loadout: Loadout, owned: readonly string[]): string {
  const whole = skinnedSheet(hero, equipped, styles);
  const fam = familyOf(hero, equipped, styles);
  if (!fam) return whole;
  const slots = HERO_PARTS[hero]!.slots;
  const resolved = resolveLoadout(hero, equipped, styles, loadout, owned);
  if (sameSlots(slots, resolved, defaultsOf(fam))) return whole;
  if (fam.id === hero) for (const src of Object.keys(fam.family.sources)) if (src !== fam.worn && sameSlots(slots, resolved, defaultsOf(fam, src))) return src === PART_BASE ? hero : `${hero}@${src}`;
  return `${fam.id}+body` + slots.filter((s) => resolved[s]).map((s) => `+${resolved[s]}.${s}`).join("");
}

/** Явный выбор «обычная модель» в слотах формы и призыва: не следовать бандлу надетого сета. */
export const LOOK_DEFAULT = "base";

/** Скины формы/призыва из бандла надетого облика героя (`withSkin`). */
function bundledWith(hero: string, slot: "form" | "summon", equipped: Partial<Record<CosmeticSlot, string>>): CosmeticDef[] {
  const worn = equipped.skin;
  return worn ? COSMETICS.filter((c) => c.slot === slot && c.hero === hero && c.withSkin === worn) : [];
}

/** Листы призывов героя: art → `<art>@<skin>`. Явный выбор игрока (скин этого героя и этого призыва, либо LOOK_DEFAULT —
 *  обычная модель) важнее; без выбора призыв следует бандлу надетого сета (волки Ambry у сета Ambry). */
export function summonSheets(hero: string, summonSkins: Readonly<Record<string, Readonly<Record<string, string>>>>, equipped: Partial<Record<CosmeticSlot, string>> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of bundledWith(hero, "summon", equipped)) out[c.variant.split("@")[0]] = c.variant;
  for (const [art, id] of Object.entries(summonSkins[hero] ?? {})) {
    if (id === LOOK_DEFAULT) { delete out[art]; continue; }
    const def = COSMETIC_BY_ID[id];
    if (def && def.slot === "summon" && def.hero === hero && def.variant.startsWith(`${art}@`)) out[art] = def.variant;
  }
  return out;
}

/** Лист формы героя по надетому скину формы: `<hero>@meta~<имя>` (только скин формы этого героя), иначе null —
 *  тогда форма берётся у надетого облика (`<hero>@<skin>@meta`) или базовая (`<hero>@meta`). */
export function formSheet(hero: string, formSkins: Readonly<Record<string, string>>, equipped: Partial<Record<CosmeticSlot, string>> = {}): string | null {
  if (formSkins[hero] === LOOK_DEFAULT) return `${hero}@meta`; // явная «обычная форма» — даже при аркане со своим демоном
  const def = COSMETIC_BY_ID[formSkins[hero] ?? ""];
  if (def && def.slot === "form" && def.hero === hero) return def.variant;
  return bundledWith(hero, "form", equipped)[0]?.variant ?? null; // форма из бандла надетого сета
}

/** Всё, что нужно рендеру и превью от косметики героя (T13.80): лист облика (цельный или композит), состав по слотам,
 *  основа, признак «стиль не перенесён в смешанный облик» и листы призывов. */
export interface HeroLook { sheet: string; mixed: boolean; family: string | null; parts: Partial<Record<DotaSlot, string>>; styleDropped: boolean; /** Встроенный эффект надетого облика; null — нет или его часть заменена в слоте. */ fx: { aura: string } | null; summons: Record<string, string>; /** Лист скина формы (Метаморфоза, True Form…) или null — форма как у облика. */ form: string | null }
export function heroLook(hero: string, c: { equipped: Partial<Record<CosmeticSlot, string>>; styles: Readonly<Record<string, string>>; owned: readonly string[]; loadout?: Readonly<Record<string, Loadout>>; summonSkins?: Readonly<Record<string, Readonly<Record<string, string>>>>; formSkins?: Readonly<Record<string, string>> }): HeroLook {
  const loadout = c.loadout?.[hero] ?? {};
  const sheet = loadoutSheet(hero, c.equipped, c.styles, loadout, c.owned);
  const mixed = sheet !== skinnedSheet(hero, c.equipped, c.styles);
  const fam = familyOf(hero, c.equipped, c.styles);
  const parts = fam ? resolveLoadout(hero, c.equipped, c.styles, loadout, c.owned) : {};
  const def = c.equipped.skin ? COSMETIC_BY_ID[c.equipped.skin] : undefined;
  const skin = def && def.slot === "skin" && def.hero === hero ? def : undefined;
  const own = skin?.variant.split("@")[1];
  const fxOn = !!skin?.fx?.aura && (!skin.fx.slot || !fam || parts[skin.fx.slot] === own);
  return { sheet, mixed, family: fam?.id ?? null, parts, styleDropped: mixed && !!fam?.styleDropped, fx: fxOn ? { aura: skin!.fx!.aura! } : null, summons: summonSheets(hero, c.summonSkins ?? {}, c.equipped), form: formSheet(hero, c.formSkins ?? {}, c.equipped) };
}

export const DUPLICATE_SHARDS: Record<Rarity, number> = { standard: 5, refined: 12, exotic: 30, arcana: 80 };
/** Цена конкретного предмета за осколки (трата дублей): ~4–6 дублей своей редкости. */
const SHARD_PRICE_FULL: Record<Rarity, number> = { standard: 20, refined: 50, exotic: 120, arcana: 320 };
/** Косметика бесплатна во всех сборках (владелец 2026-09-07: «сделай всю косметику пока полностью
 *  бесплатной, чтобы можно было выбирать и в prod»). Полные цены остаются в SHARD_PRICE_FULL на день,
 *  когда экономику осколков включат обратно. */
export const SHARD_PRICE: Record<Rarity, number> = { standard: 0, refined: 0, exotic: 0, arcana: 0 };
void SHARD_PRICE_FULL;

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
    const pool = COSMETICS.filter((c) => c.rarity === rarity && !c.unlock);
    const def = pool[rng.int(pool.length)];
    const duplicate = have.has(def.id);
    have.add(def.id);
    drops.push({ id: def.id, duplicate, shards: duplicate ? DUPLICATE_SHARDS[rarity] : 0 });
  }
  return drops;
}
