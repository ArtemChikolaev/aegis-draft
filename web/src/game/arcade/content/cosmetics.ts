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
  // Сет каждому герою, у которого не было косметики (T13.27): части `models/items/<hero>/<set>_*`
  // пришиваются к скелету базовой модели тем же Copy Transforms, что и части аркан.
  { id: "skin_phantom_lancer_rakshasa", slot: "skin", rarity: "exotic", variant: "phantom_lancer@rakshasa", hero: "phantom_lancer" },
  { id: "skin_enchantress_the_sheep", slot: "skin", rarity: "exotic", variant: "enchantress@the_sheep", hero: "enchantress" },
  { id: "skin_chen_eye_of_power", slot: "skin", rarity: "exotic", variant: "chen@eye_of_power", hero: "chen" },
  { id: "skin_ancient_apparition_frost_djin", slot: "skin", rarity: "exotic", variant: "ancient_apparition@frost_djin", hero: "ancient_apparition" },
  { id: "skin_monkey_king_fiery_vajrapani", slot: "skin", rarity: "exotic", variant: "monkey_king@fiery_vajrapani", hero: "monkey_king" },
  { id: "skin_dark_willow_deathcap_fairy", slot: "skin", rarity: "exotic", variant: "dark_willow@deathcap_fairy", hero: "dark_willow" },
  // Io: его облики — цельные модели в `models/items/io/`, а не части по слотам, поэтому в
  // автоподбор сетов они не попали.
  { id: "skin_io_calavera", slot: "skin", rarity: "exotic", variant: "io@calavera", hero: "io" },
  // Сет каждому герою, у которого не было косметики (T13.27): части `models/items/<hero>/<set>_*`
  // пришиваются к скелету базовой модели тем же Copy Transforms, что и части аркан.
  { id: "skin_lina_dragonfire", slot: "skin", rarity: "exotic", variant: "lina@dragonfire", hero: "lina" },
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
