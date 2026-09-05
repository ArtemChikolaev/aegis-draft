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
