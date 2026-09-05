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
