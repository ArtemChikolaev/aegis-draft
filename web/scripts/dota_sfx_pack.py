#!/usr/bin/env python3
"""Звуковой пакет Аркады из файлов Dota 2 (BACKLOG T13.16 срез 3, владелец: «все возможные звуки — мобы, их удары,
наши удары, эффекты; чтобы не было гробовой тишины»).

Выход: web/public/art/sfx/dota/pack/<группа>/<имя>_N.(m4a|mp3) и pack/index.json:
  abilities.<hero>.{q,w,e,r}   — касты умений героя (sounds/weapons/hero/<folder>/…)
  enemies.<enemyId>.{attack,death,aggro} — удары мобов по герою, их смерть, рык
  ui.{levelup,abilitylevel,coins,buy,lasthit,itemPickup,rune,heroPicked,deny}
  fx.{crit,fireRing,frostShatter,chain,radianceLoop,roshanRoar,whoosh}
Запуск: S2V=~/tools/s2v/Source2Viewer-CLI python3 scripts/dota_sfx_pack.py  (DOTA=, OUT= как у других скриптов).
Клипы в vpk — WAV (жмём afconvert в AAC mono 44 kbps) или MP3 (копируем)."""
import json, os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DOTA = os.environ.get("DOTA", os.path.expanduser("~/Library/Application Support/Steam/steamapps/common/dota 2 beta/game/dota"))
S2V = os.environ.get("S2V", os.path.expanduser("~/tools/s2v/Source2Viewer-CLI"))
OUT = os.environ.get("OUT", os.path.expanduser("~/dota-export/sfxpack"))
DEST = os.path.join(HERE, "..", "public", "art", "sfx", "dota", "pack")
VPK = os.path.join(DOTA, "pak01_dir.vpk")

H = "sounds/weapons/hero/"
C = "sounds/weapons/creep/"
D = "sounds/misc/creep_deaths/"
U = "sounds/ui/"
I = "sounds/items/"

def hero(folder, q, w, e, r):
    return {k: [f"{H}{folder}/{n}" for n in v] for k, v in (("q", q), ("w", w), ("e", e), ("r", r)) if v}

ABILITIES = {
    "juggernaut": hero("juggernaut", [], ["healing_ward_cast"], [], ["omnislash_attack1", "omnislash_attack2"]),
    "axe": hero("axe", ["berserkers_call"], ["battle_hunger"], ["counterhelix"], ["culling_blade_success"]),
    "crystal_maiden": hero("crystal_maiden", ["freeze_explosion01", "freeze_explosion02"], ["frostbite"], [], ["freezing_field"]),
    "sniper": hero("sniper", ["shrapnel_fire"], [], [], ["sniper_assassinate", "assasinate_damage01"]),
    "zeus": hero("zuus", ["arc_lightning"], ["lightning_bolt"], ["static_field"], ["gods_wrath_cast"]),
    "phantom_assassin": hero("phantom_assassin", ["stifling_dagger_cast"], ["fan_of_knives"], [], ["coup_de_grace"]),
    "anti_mage": hero("antimage", [], ["blink_out", "blink_in"], ["counterspell_cast"], ["mana_void_cast", "mana_void"]),
    "lina": hero("lina", ["dragonslave01", "dragonslave02"], ["lightstrikearray"], ["flame_cloak"], ["lagunablade"]),
    "lich": hero("lich", ["frost_nova"], ["frost_armor"], ["dark_ritual"], ["chain_frost_cast"]),
    "drow_ranger": hero("drow_ranger", [], ["silence"], ["multishot_channel"], []),
    "windranger": hero("windrunner", ["shackleshot_cast", "shackleshot_bind"], ["windrunner_powershot", "powershot_damage01"], ["windrun"], ["focus_fire"]),
    "bristleback": hero("bristlebog", ["goo_cast"], ["quill_cast"], [], ["bristleback"]),
    "sven": hero("sven", ["storm_bolt", "storm_bolt_impact"], [], ["warcry"], ["gods_strength"]),
    "storm_spirit": hero("storm_spirit", ["static_remnant_plant"], ["electric_vortex_cast"], ["overload"], ["ball_lightning"]),
    "leshrac": hero("leshrac", ["split_earth"], ["diabolic_edict01", "diabolic_edict02"], ["lightning_storm01", "lightning_storm02"], ["pulse_nova"]),
    "faceless_void": hero("faceless_void", ["time_walk"], ["time_dilation_cast"], [], ["chronosphere"]),
    "ursa": hero("ursa", ["ursa_earthshock"], ["ursa_overpower"], [], ["ursa_enrage"]),
    "lion": hero("lion", ["lion_impale"], ["lion_voodoo"], ["lion_manadrain"], ["finger_of_death"]),
    # Волна 2 героев (2026-09-06)
    "wraith_king": hero("skeleton_king", ["hellfire_blast"], [], ["mortal_strike_target"], ["reincarnate"]),
    "dragon_knight": hero("dragon_knight", ["dragonknight_fire"], ["dragontail"], [], ["dragonknight_elderdragon_form"]),
    "kunkka": hero("kunkka", ["ability_geyser"], ["tidebringer"], ["x_mark_target"], ["ability_ghost_ship", "ghostship_crash"]),
    "necrophos": hero("necrolyte", ["death_pulse"], ["spirit_form"], [], ["reapers_scythe", "scythe_target"]),
    "razor": hero("razor", ["plasma_field"], ["razor_unstable_current"], ["storm_cast"], ["razor_lightning_strike_01", "razor_lightning_strike_02"]),
    "venomancer": hero("venomancer", ["venomancer_venomous_gale"], [], ["venomancer_plagueward_cast"], ["venomancer_poison_nova"]),
    "witch_doctor": hero("witch_doctor", ["cask_cast", "cask_bounce01"], ["voodoo_restoration"], ["maledict_cast"], ["deathward_build"]),
    "luna": hero("luna", ["luna_lucentbeam_cast"], ["glaives01", "glaives02"], [], ["luna_eclipse_cast"]),
    # Волна 3 героев (2026-09-06)
    "earthshaker": hero("earthshaker", ["fissure"], ["enchant"], [], ["echo_slam"]),
    "bloodseeker": hero("bloodseeker", ["rage"], ["blood_rite_cast", "blood_rite"], [], ["rupture_cast"]),
    "riki": hero("riki", ["riki_smokescreen"], ["riki_blinkstrike"], ["tricks_of_the_trade_cast"], []),
    "queen_of_pain": hero("queenofpain", ["queenofpain_shadowstrike"], ["blink_out"], ["queenofpain_screamofpain"], ["queenofpain_sonicwave"]),
    "viper": hero("viper", [], ["nethertoxin_cast"], [], ["viper_strike"]),
    "ogre_magi": hero("ogre_magi", ["fireblast_cast"], ["ignite_cast"], ["bloodlust_cast"], ["multicast01"]),
    "huskar": hero("huskar", ["inner_fire"], [], [], ["life_break"]),
    "slardar": hero("slardar", ["sprint_on"], ["slithereen_crush"], [], ["amplify_damage"]),
    # Волна 4 героев (2026-09-06)
    "tiny": hero("tiny", ["tiny_avalanche"], ["tiny_toss_throw"], ["tree_grab"], ["tiny_grow"]),
    "spectre": hero("spectre", ["dagger_cast"], [], [], ["haunt_cast", "haunt"]),
    "chaos_knight": hero("chaos_knight", ["chaos_bolt_cast"], ["reality_rift_cast01"], [], ["phantasm"]),
    "night_stalker": hero("nightstalker", ["dota_nightstalker_void"], ["dota_nightstalker_trickling_fear"], [], ["darkness"]),
    "doom": hero("doom_bringer", ["devour"], ["scorched_earth"], [], ["doom"]),
    "legion_commander": hero("legion_commander", ["overwhelming_cast"], ["press_cast"], [], ["duel_cast", "duel"]),
    "templar_assassin": hero("templar_assassin", ["refraction"], ["meld"], [], ["trap_cast", "trap_explode"]),
    "medusa": hero("medusa", ["arrow_split_01"], ["snake_shoot"], [], ["stonegaze"]),
    # Волна 5 героев (2026-09-06)
    "silencer": hero("silencer", ["curse_cast"], [], ["last_word_cast"], ["global_silence_cast"]),
    "skywrath_mage": hero("skywrath", ["arcane_bolt_cast"], ["concussive_shot_cast"], ["ancient_seal"], ["mystic_flare_cast", "mystic_flare"]),
    "dazzle": hero("dazzle", ["poison_cast"], ["shallow_grave"], ["shadow_wave"], []),
    "jakiro": hero("jakiro", ["dual_breath"], ["ice_path_cast"], [], ["macropyre_cast", "macropyre"]),
    "shadow_shaman": hero("shadowshaman", ["shock01"], [], ["shackle_cast"], ["serpent_ward"]),
    "warlock": hero("warlock", ["fatal_bonds_cast"], ["shadowword_cast_heal"], ["warlock_upheaval"], ["rain_of_chaos_cast"]),
    "enigma": hero("enigma", ["malefice"], ["demonic_conversion"], ["midnight_pulse"], ["black_hole_chasm"]),
    "tinker": hero("tinker", ["laser"], ["missile_launch"], ["matrix_grid"], ["rearm"]),
    # Волна 6 героев (2026-09-06)
    "omniknight": hero("omniknight", ["purification"], ["repel"], [], ["guardian_cast"]),
    "abaddon": hero("abaddon", ["death_coil_cast"], ["shield_cast"], [], ["borrowed_time"]),
    "beastmaster": hero("beastmaster", ["wild_axes"], ["call_of_the_wild_boar"], ["inner_beast_cast"], ["primal_roar"]),
    "brewmaster": hero("brewmaster", ["thunder_clap"], ["drunken_haze_cast"], [], ["primal_split_cast"]),
    "centaur": hero("centaur", ["hoof_stomp"], ["double_edge"], [], ["stampede_cast"]),
    "dark_seer": hero("dark_seer", ["dota_dark_seer_vacuum"], ["dota_dark_seer_ion_shield_startup"], ["dota_dark_seer_surge"], ["dota_dark_seer_wall_start"]),
    "death_prophet": hero("death_prophet", ["carrionswarm"], ["silence_cast"], ["spirit_siphon_cast"], ["exorcism_cast"]),
    "disruptor": hero("disruptor", ["thunder_strike_cast"], ["glimpse_begin"], ["kinetic_field"], ["static_storm"]),
    # Волна 7 героев (2026-09-06)
    "lycan": hero("lycan", ["summon_wolves"], ["howl"], [], ["shape_shift"]),
    "lone_druid": hero("lone_druid", ["spirit_bear_cast"], [], ["savage_roar"], ["trueform_cast"]),
    "alchemist": hero("alchemist", ["acid_spray"], ["unstable_concoction_throw"], [], ["chemical_rage_cast"]),
    "bane": hero("bane", ["enfeeble_cast"], ["brain_sap_cast"], ["nightmare"], ["fiends_grip_cast_lp"]),
    "batrider": hero("batrider", [], ["batrider_flamebreak_cast"], ["batrider_firefly_beginning"], ["batrider_flaming_lasso_start"]),
    "bounty_hunter": hero("bounty_hunter", ["shuriken_toss"], [], ["shadow_walk"], ["track"]),
    "broodmother": hero("broodmother", ["spiderling_cast"], ["web_cast"], [], ["insatiable_hunger"]),
    "clockwerk": hero("rattletrap", ["battery_assault_launch01"], ["power_cogs"], ["flare_fire"], ["hookshot_fire"]),
    # Волна 8 героев (2026-09-06)
    "earth_spirit": hero("earth_spirit", ["boulder_smash_target"], ["rolling_boulder_cast"], [], ["magnetize_cast"]),
    "elder_titan": hero("elder_titan", ["echo_stomp_cast"], ["spirit_cast"], [], ["earth_split_cast", "earth_split"]),
    "ember_spirit": hero("ember_spirit", ["searing_chains_cast"], ["sleight_of_fist_cast"], ["flame_guard_cast"], ["fire_remnant_cast"]),
    "grimstroke": hero("grimstroke", ["dark_artistry_cast"], ["ink_phantom_cast"], ["ink_swell_cast"], ["soul_chain_cast"]),
    "gyrocopter": hero("gyrocopter", ["rocket_barrage_active"], ["homing_missile"], ["flack_cannon_activate"], ["call_down_cast"]),
    "magnus": hero("magnataur", ["shockwave_cast"], ["empower_cast"], ["skewer_cast"], ["reverse_polarity_cast", "reverse_polarity"]),
    "mars": hero("mars", ["spear_cast"], ["shield_bash"], [], ["arena_of_blood"]),
    # Волна 9 героев (2026-09-06)
    "morphling": hero("morphling", ["waveform"], ["adaptive_strike_cast"], [], ["replicate"]),
    "naga_siren": hero("naga_siren", ["mirror_image"], ["ensnare_cast"], ["riptide01"], ["song_of_the_siren"]),
    "natures_prophet": hero("furion", ["sprout"], ["teleport_out"], ["force_cast"], ["wrath_cast"]),
    "nyx_assassin": hero("nyx", ["impale"], ["manaburn_target"], [], ["vendetta"]),
    "oracle": hero("oracle", ["fortune_target"], ["edict_cast"], ["purifying_damage"], ["false_promise_cast"]),
    "outworld_destroyer": hero("obsidian_destroyer", [], ["astral_imprison_cast"], [], ["sanity_cast", "sanity_eclipse"]),
    "pangolier": hero("pangolier", ["swashbuckle_cast"], ["shield"], [], ["gyro_start"]),
    "phoenix": hero("phoenix", ["icarus_dive"], ["fire_spirits_launch"], ["sunray_cast"], ["super_nova_cast"]),
    # Волна 10 героев (2026-09-06)
    "puck": hero("puck", ["illusory_orb"], ["waning_rift"], ["phase_shift"], ["dream_coil"]),
    "pudge": hero("pudge", ["hook_throw"], ["rot"], [], ["dismember_swing1"]),
    "rubick": hero("rubick", ["telekinesis_cast"], ["fade_bolt_cast"], [], ["spell_steal_cast"]),
    "sand_king": hero("sand_king", [], ["sand_king_sandstorm_start"], [], ["sand_king_epicenter"]),
    "shadow_demon": hero("shadow_demon", ["disruption"], ["soul_catcher_cast"], ["shadow_poison_cast"], ["demonic_purge_cast"]),
    "slark": hero("slark", ["dark_pact_cast"], ["pounce_cast"], [], ["shadow_dance"]),
    "snapfire": hero("snapfire", ["shotgun_fire"], ["cookie_cast"], ["armor_shredder_target"], ["magma01", "lizard_blob_launch"]),
    "spirit_breaker": hero("spirit_breaker", ["charge_cast"], ["bulldoze"], [], ["nether_strike_in"]),
    # Волна 11 героев (2026-09-06)
    "techies": hero("techies", ["land_mine_plant"], ["reactive_taser_cast"], ["suicide"], ["remote_mine_plant", "remote_mine01"]),
    "terrorblade": hero("terrorblade", ["reflection"], ["conjuration"], ["morph"], ["sunder_cast"]),
    "timbersaw": hero("shredder", ["whirling_death"], ["timberchain"], [], ["chakra_cast"]),
    "treant": hero("treant", ["natures_guise"], ["leech_seed_cast"], ["living_armor"], ["overgrowth_cast"]),
    "troll_warlord": hero("troll_warlord", ["whirling_melee_cast"], ["rampage_cast"], [], ["battle_trance_cast"]),
    "tusk": hero("tusk", ["ice_shards_cast"], ["snowball_cast"], ["tag_team"], ["punch_cast", "punch_damage"]),
    "undying": hero("undying", ["decay_cast"], ["soul_rip_cast"], ["tombstone"], ["flesh_golem_cast"]),
    # Волна 12 героев (2026-09-06)
    "visage": hero("visage", ["grave_chill_cast"], ["soul_assumption_cast"], [], ["summon_familiars"]),
    "void_spirit": hero("void_spirit", ["remnant_cast"], ["dissimilate_cast"], ["pulse_cast"], ["astral_start"]),
    "weaver": hero("weaver", ["swarm_cast"], ["shukuchi"], [], ["time_lapse"]),
    "winter_wyvern": hero("winter_wyvern", [], ["splinter_blast_cast"], ["cold_embrace_cast"], ["winters_curse_cast"]),
    "arc_warden": hero("arc_warden", ["flux_cast"], ["magnetic_field_cast"], ["spark_wraith_cast"], ["tempest_double"]),
    "dawnbreaker": hero("dawnbreaker", ["fire_wreath_cast"], ["celestial_hammer_cast"], [], ["solar_flare"]),
    "hoodwink": hero("hoodwink", ["acorn_shot_bounce01"], ["bushwhack_cast"], ["scurry_cast"], ["sharpshooter_cast"]),
    "shadow_fiend": hero("nevermore", ["shadowraze"], [], [], ["requiem_cast", "requiem_of_souls"]),
    "pugna": hero("pugna", ["netherblast"], ["decrepify"], ["pugna_netherward"], ["lifedrain_cast"]),
    "invoker": hero("invoker", ["cold_snap"], ["sunstrike_ignite"], ["meteor_cast", "meteor"], ["deafening_blast"]),
    "tidehunter": hero("tidehunter", ["tidehunter_gush"], ["kraken_shell"], ["anchorsmash"], ["tidehunter_ravage"]),
    "mirana": hero("mirana", ["starstorm_cast"], ["miranaarrowlaunch1"], ["leap1", "leap2"], ["moonlight_shadow"]),
    "clinkz": hero("clinkz", ["strafe"], [], ["windwalk"], ["death_pact_cast"]),
}

melee = [f"{C}shared/melee_hit0{i}" for i in (1, 2, 3, 4)]
heavy = [f"{C}shared/shared_whoosh_heavy_0{i}" for i in (1, 2, 3)]
ENEMIES = {
    "kobold": {"attack": [f"{C}neutral/kobold_whip_01", f"{C}neutral/kobold_whip_02"], "death": [f"{D}death_kobold_common_0{i}" for i in (1, 2, 3, 4)]},
    "kobold_foreman": {"attack": [f"{C}neutral/kobold_whip_01", f"{C}neutral/kobold_whip_02"], "death": [f"{D}death_kobold_taskmaster"]},
    "hill_troll": {"attack": melee, "death": [f"{D}death_troll_common_0{i}" for i in (1, 2, 3, 4)]},
    "dark_troll": {"attack": melee, "death": [f"{D}death_troll_warlord"]},
    "satyr": {"attack": melee, "death": [f"{D}death_satyr_0{i}" for i in (1, 2, 3, 4)], "aggro": [f"{C}neutral/satyr_hellcaster_cast"]},
    "ogre": {"attack": heavy, "death": [f"{D}death_ogre_0{i}" for i in (1, 2, 3, 4)]},
    "centaur": {"attack": [f"{C}neutral/centaur_khan_stomp_01"] + heavy[:1], "death": [f"{D}death_centaur_khan", f"{D}death_centaur_outrunner"]},
    "wildwing": {"attack": melee, "death": [f"{D}death_wildkin_0{i}" for i in (1, 2, 3)]},
    "hellbear": {"attack": heavy, "death": [f"{D}death_furbolg_ursa", f"{D}death_furbolg_champion"]},
    "golem": {"attack": heavy, "death": [f"{D}death_golem_rock_01", f"{D}death_golem_rock_02", f"{D}death_golem_granite"]},
    "lane_creep": {"attack": [f"{C}good/melee_attack_impact{i}" for i in (1, 2, 3)]},
    "siege_creep": {"attack": [f"{C}good/range_projectile_impact{i}" for i in (2, 3)], "aggro": [f"{C}good/range_projectile_launch"]},
    "roshan": {"attack": [f"{C}roshan/attack0{i}" for i in (1, 2, 3)] + [f"{C}roshan/slam"], "aggro": [f"{C}roshan/grunt0{i}" for i in (1, 2, 3)] + [f"{C}roshan/revenge_roar"]},
    "_generic": {"attack": melee, "death": [f"{D}death_troll_common_01", f"{D}death_kobold_common_01"]},
}
UI = {
    "levelup": [f"{U}levelup"], "abilitylevel": [f"{U}abilitylevel"], "coins": [f"{U}coins"], "buy": [f"{U}buy"],
    "lasthit": [f"{U}last_hit"], "itemPickup": [f"{U}item_pickup_world"], "rune": [f"{I}rune_bounty", f"{I}rune_haste", f"{I}rune_dd"],
    "heroPicked": [f"{U}hero_picked"], "deny": [f"{U}deny_general"], "aegis": [f"{I}aegis_timer"],
}
FX = {
    "crit": [f"{H}phantom_assassin/crit_spatter0{i}" for i in (1, 2, 3)],
    "fireRing": [f"{H}lina/flame_cloak"],
    "frostShatter": [f"{H}crystal_maiden/freeze_explosion01", f"{H}crystal_maiden/freeze_explosion03"],
    "chain": [f"{H}zuus/arc_lightning"],
    "radianceLoop": [f"{I}radiance_loop"],
    "roshanRoar": [f"{C}roshan/revenge_roar"],
    "whoosh": [f"{C}shared/whoosh0{i}" for i in (1, 2, 3)],
    "nova": [f"{H}lich/frost_nova"],
    "zap": [f"{H}zuus/lightning_bolt"],
}

def export(src_path):
    """vpk-путь без расширения → локальный файл (.wav или .mp3) или None."""
    base = os.path.join(OUT, src_path)
    for ext in (".wav", ".mp3"):
        if os.path.exists(base + ext):
            return base + ext
    subprocess.run([S2V, "-i", VPK, "-f", src_path + ".vsnd_c", "-o", OUT + "/", "-d"], capture_output=True)
    for ext in (".wav", ".mp3"):
        if os.path.exists(base + ext):
            return base + ext
    return None

def place(group, name, sources):
    out = []
    os.makedirs(os.path.join(DEST, group), exist_ok=True)
    for i, src in enumerate(sources, 1):
        f = export(src)
        if not f:
            print("  нет:", src); continue
        if f.endswith(".mp3"):
            fn = f"{name}_{i}.mp3"; shutil.copy(f, os.path.join(DEST, group, fn))
        else:
            fn = f"{name}_{i}.m4a"
            r = subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "44000", "-c", "1", f, os.path.join(DEST, group, fn)], capture_output=True)
            if r.returncode != 0:
                print("  afconvert:", src); continue
        out.append(fn)
    return out

def main():
    if not os.path.exists(VPK): sys.exit(f"нет {VPK}")
    if not os.access(S2V, os.X_OK): sys.exit(f"нет Source2Viewer-CLI: {S2V}")
    os.makedirs(OUT, exist_ok=True)
    if os.path.isdir(DEST): shutil.rmtree(DEST)
    os.makedirs(DEST)
    index = {"abilities": {}, "enemies": {}, "ui": {}, "fx": {}}
    for hid, keys in ABILITIES.items():
        index["abilities"][hid] = {k: place("abilities", f"{hid}_{k}", v) for k, v in keys.items()}
    for eid, cats in ENEMIES.items():
        index["enemies"][eid] = {c: place("enemies", f"{eid}_{c}", v) for c, v in cats.items()}
    for n, v in UI.items(): index["ui"][n] = place("ui", n, v)
    for n, v in FX.items(): index["fx"][n] = place("fx", n, v)
    with open(os.path.join(DEST, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
    total = sum(os.path.getsize(os.path.join(dp, fn)) for dp, _, fns in os.walk(DEST) for fn in fns)
    print(f"пакет: {sum(len(fns) for _, _, fns in os.walk(DEST))} файлов, {total // 1024} КБ → {DEST}")

if __name__ == "__main__":
    main()
