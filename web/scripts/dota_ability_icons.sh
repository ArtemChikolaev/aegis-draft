#!/usr/bin/env bash
# Иконки способностей героев из Dota 2 → web/public/art/abilities/<heroId>_<q|w|e|r>.png (64 px).
# Источник: panorama/images/spellicons/<dota_hero>_<ability>_png.vtex_c в pak01_dir.vpk (Source 2 Viewer CLI отдаёт PNG 128 px).
# Использование: S2V=~/tools/s2v/Source2Viewer-CLI bash scripts/dota_ability_icons.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DOTA="${DOTA:-$HOME/Library/Application Support/Steam/steamapps/common/dota 2 beta/game/dota}"
S2V="${S2V:-$HOME/tools/s2v/Source2Viewer-CLI}"
OUT="${OUT:-$HOME/dota-export/spellicons}"
DEST="$HERE/../public/art/abilities"
VPK="$DOTA/pak01_dir.vpk"
[ -f "$VPK" ] || { echo "нет $VPK"; exit 1; }
[ -x "$S2V" ] || { echo "нет Source2Viewer-CLI: $S2V"; exit 1; }
mkdir -p "$OUT" "$DEST"
# heroId: q w e r — внутренние имена способностей Dota (без префикса героя), префикс — папка/имя героя в Dota.
MAP='
juggernaut juggernaut blade_fury healing_ward blade_dance omni_slash
axe axe berserkers_call battle_hunger counter_helix culling_blade
crystal_maiden crystal_maiden crystal_nova frostbite brilliance_aura freezing_field
sniper sniper shrapnel headshot take_aim assassinate
zeus zuus arc_lightning lightning_bolt static_field thundergods_wrath
phantom_assassin phantom_assassin stifling_dagger phantom_strike blur coup_de_grace
anti_mage antimage mana_break blink counterspell mana_void
lina lina dragon_slave light_strike_array fiery_soul laguna_blade
lich lich frost_nova frost_shield sinister_gaze chain_frost
drow_ranger drow_ranger frost_arrows wave_of_silence multishot marksmanship
windranger windrunner shackleshot powershot windrun focusfire
bristleback bristleback viscous_nasal_goo quill_spray bristleback warpath
sven sven storm_bolt great_cleave warcry gods_strength
storm_spirit storm_spirit static_remnant electric_vortex overload ball_lightning
leshrac leshrac split_earth diabolic_edict lightning_storm pulse_nova
faceless_void faceless_void time_walk time_dilation time_lock chronosphere
ursa ursa earthshock overpower fury_swipes enrage
lion lion impale voodoo mana_drain finger_of_death
shadow_fiend nevermore shadowraze1 necromastery dark_lord requiem
pugna pugna nether_blast decrepify nether_ward life_drain
invoker invoker cold_snap sun_strike chaos_meteor deafening_blast
tidehunter tidehunter gush kraken_shell anchor_smash ravage
mirana mirana starfall arrow leap invis
clinkz clinkz strafe searing_arrows wind_walk death_pact
wraith_king skeleton_king hellfire_blast spectral_blade mortal_strike reincarnation
dragon_knight dragon_knight breathe_fire dragon_tail dragon_blood elder_dragon_form
kunkka kunkka torrent tidebringer x_marks_the_spot ghostship
necrophos necrolyte death_pulse ghost_shroud heartstopper_aura reapers_scythe
razor razor plasma_field static_link storm_surge eye_of_the_storm
venomancer venomancer venomous_gale poison_sting plague_ward poison_nova
witch_doctor witch_doctor paralyzing_cask voodoo_restoration maledict death_ward
luna luna lucent_beam moon_glaive lunar_blessing eclipse
earthshaker earthshaker fissure enchant_totem aftershock echo_slam
bloodseeker bloodseeker bloodrage blood_bath thirst rupture
riki riki smoke_screen blink_strike tricks_of_the_trade backstab
queen_of_pain queenofpain shadow_strike blink scream_of_pain sonic_wave
viper viper poison_attack nethertoxin corrosive_skin viper_strike
ogre_magi ogre_magi fireblast ignite bloodlust multicast
huskar huskar inner_fire burning_spear berserkers_blood life_break
slardar slardar sprint slithereen_crush bash amplify_damage
tiny tiny avalanche toss tree_grab grow
spectre spectre spectral_dagger desolate dispersion haunt
chaos_knight chaos_knight chaos_bolt reality_rift chaos_strike phantasm
night_stalker night_stalker void crippling_fear hunter_in_the_night darkness
doom doom_bringer devour scorched_earth infernal_blade doom
legion_commander legion_commander overwhelming_odds press_the_attack moment_of_courage duel
templar_assassin templar_assassin refraction meld psi_blades psionic_trap
medusa medusa split_shot mystic_snake mana_shield stone_gaze
silencer silencer curse_of_the_silent glaives_of_wisdom last_word global_silence
skywrath_mage skywrath_mage arcane_bolt concussive_shot ancient_seal mystic_flare
dazzle dazzle poison_touch shallow_grave shadow_wave bad_juju
jakiro jakiro dual_breath ice_path liquid_fire macropyre
shadow_shaman shadow_shaman ether_shock voodoo shackles mass_serpent_ward
warlock warlock fatal_bonds shadow_word upheaval rain_of_chaos
enigma enigma malefice demonic_conversion midnight_pulse black_hole
tinker tinker laser heat_seeking_missile defense_matrix rearm
omniknight omniknight purification repel hammer_of_purity guardian_angel
abaddon abaddon death_coil aphotic_shield frostmourne borrowed_time
beastmaster beastmaster wild_axes call_of_the_wild inner_beast primal_roar
brewmaster brewmaster thunder_clap cinder_brew drunken_brawler primal_split
centaur centaur hoof_stomp double_edge return stampede
dark_seer dark_seer vacuum ion_shell surge wall_of_replica
death_prophet death_prophet carrion_swarm silence spirit_siphon exorcism
disruptor disruptor thunder_strike glimpse kinetic_field static_storm
lycan lycan summon_wolves howl feral_impulse shapeshift
lone_druid lone_druid spirit_bear spirit_link savage_roar true_form
alchemist alchemist acid_spray unstable_concoction corrosive_weaponry chemical_rage
bane bane enfeeble brain_sap nightmare fiends_grip
batrider batrider sticky_napalm flamebreak firefly flaming_lasso
bounty_hunter bounty_hunter shuriken_toss jinada wind_walk track
broodmother broodmother spawn_spiderlings spin_web incapacitating_bite insatiable_hunger
clockwerk rattletrap battery_assault power_cogs rocket_flare hookshot
earth_spirit earth_spirit boulder_smash rolling_boulder geomagnetic_grip magnetize
elder_titan elder_titan echo_stomp ancestral_spirit natural_order earth_splitter
ember_spirit ember_spirit searing_chains sleight_of_fist flame_guard fire_remnant
grimstroke grimstroke dark_artistry ink_creature spirit_walk soul_chain
gyrocopter gyrocopter rocket_barrage homing_missile flak_cannon call_down
keeper_of_the_light keeper_of_the_light illuminate blinding_light chakra_magic will_o_wisp
magnus magnataur shockwave empower skewer reverse_polarity
mars mars spear gods_rebuke bulwark arena_of_blood
morphling morphling waveform adaptive_strike_agi morph_agi replicate
naga_siren naga_siren mirror_image ensnare rip_tide song_of_the_siren
natures_prophet furion sprout teleportation force_of_nature wrath_of_nature
nyx_assassin nyx_assassin impale mana_burn spiked_carapace vendetta
oracle oracle fortunes_end fates_edict purifying_flames false_promise
outworld_destroyer obsidian_destroyer arcane_orb astral_imprisonment essence_aura sanity_eclipse
pangolier pangolier swashbuckle shield_crash lucky_shot gyroshell
phoenix phoenix icarus_dive fire_spirits sun_ray supernova
'
missing=""
while read -r id dota q w e r; do
  [ -n "$id" ] || continue
  keys=(q w e r); names=("$q" "$w" "$e" "$r")
  for i in 0 1 2 3; do
    key="${keys[$i]}"; name="${dota}_${names[$i]}"
    src="$OUT/panorama/images/spellicons/${name}_png.png"
    if [ ! -f "$src" ]; then
      "$S2V" -i "$VPK" -f "panorama/images/spellicons/${name}_png.vtex_c" -o "$OUT/" -d >/dev/null 2>&1 || true
    fi
    if [ -f "$src" ]; then
      sips -z 64 64 "$src" --out "$DEST/${id}_${key}.png" >/dev/null 2>&1
    else
      missing="$missing ${id}_${key}(${name})"
    fi
  done
done <<< "$MAP"
command -v pngquant >/dev/null && pngquant --quality 70-95 --force --ext .png 128 "$DEST"/*.png >/dev/null 2>&1 || true
echo "иконок: $(ls "$DEST" | wc -l | tr -d ' ') · $(du -sh "$DEST" | cut -f1)"
[ -z "$missing" ] || echo "не найдены:$missing"
