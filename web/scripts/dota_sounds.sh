#!/usr/bin/env bash
# Звуки ударов героев из файлов Dota 2 → web/public/art/sfx/dota/<hero>/*.m4a + index.json (docs/arcade-dota-sprites.md §6).
# Source 2 Viewer CLI декодирует vsnd_c в wav; afconvert (macOS) жмёт в AAC mono 40 kbps (~6 КБ на удар).
# Использование: S2V=~/tools/s2v/Source2Viewer-CLI bash scripts/dota_sounds.sh   (DOTA= путь к game/dota, OUT= временная папка)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DOTA="${DOTA:-$HOME/Library/Application Support/Steam/steamapps/common/dota 2 beta/game/dota}"
S2V="${S2V:-$HOME/tools/s2v/Source2Viewer-CLI}"
OUT="${OUT:-$HOME/dota-export/sfx}"
DEST="$HERE/../public/art/sfx/dota"
VPK="$DOTA/pak01_dir.vpk"
[ -f "$VPK" ] || { echo "нет $VPK"; exit 1; }
[ -x "$S2V" ] || { echo "нет Source2Viewer-CLI: $S2V"; exit 1; }
command -v afconvert >/dev/null || { echo "нужен afconvert (macOS)"; exit 1; }
# id героя в игре → папка sounds/weapons/hero/<...> в vpk (имена Valve отличаются у части героев).
HEROES="juggernaut:juggernaut axe:axe crystal_maiden:crystal_maiden sniper:sniper zeus:zuus phantom_assassin:phantom_assassin anti_mage:antimage lina:lina lich:lich drow_ranger:drow_ranger windranger:windrunner bristleback:bristlebog sven:sven storm_spirit:storm_spirit leshrac:leshrac faceless_void:faceless_void ursa:ursa lion:lion shadow_fiend:nevermore pugna:pugna invoker:invoker tidehunter:tidehunter mirana:mirana clinkz:clinkz wraith_king:skeleton_king dragon_knight:dragon_knight kunkka:kunkka necrophos:necrolyte razor:razor venomancer:venomancer witch_doctor:witch_doctor luna:luna earthshaker:earthshaker bloodseeker:bloodseeker riki:riki queen_of_pain:queenofpain viper:viper ogre_magi:ogre_magi huskar:huskar slardar:slardar tiny:tiny spectre:spectre chaos_knight:chaos_knight night_stalker:nightstalker doom:doom_bringer legion_commander:legion_commander templar_assassin:templar_assassin medusa:medusa silencer:silencer skywrath_mage:skywrath dazzle:dazzle jakiro:jakiro shadow_shaman:shadowshaman warlock:warlock enigma:enigma tinker:tinker omniknight:omniknight abaddon:abaddon beastmaster:beastmaster brewmaster:brewmaster centaur:centaur dark_seer:dark_seer death_prophet:death_prophet disruptor:disruptor lycan:lycan lone_druid:lone_druid alchemist:alchemist bane:bane batrider:batrider bounty_hunter:bounty_hunter broodmother:broodmother clockwerk:rattletrap earth_spirit:earth_spirit elder_titan:elder_titan ember_spirit:ember_spirit grimstroke:grimstroke gyrocopter:gyrocopter keeper_of_the_light:keeper_of_the_light magnus:magnataur mars:mars morphling:morphling naga_siren:naga_siren natures_prophet:furion nyx_assassin:nyx oracle:oracle outworld_destroyer:obsidian_destroyer pangolier:pangolier phoenix:phoenix puck:puck pudge:pudge rubick:rubick sand_king:sand_king shadow_demon:shadow_demon slark:slark snapfire:snapfire spirit_breaker:spirit_breaker"
mkdir -p "$OUT" "$DEST"
INDEX="$DEST/index.json"; echo "{" > "$INDEX"; first=1
conv() { # $1 wav, $2 m4a
  afconvert -f m4af -d aac -b 40000 -c 1 "$1" "$2" >/dev/null 2>&1
}
pick() { # $1 dir, $2 regex (basename без .wav), $3 max → печатает имена файлов
  ls "$1" 2>/dev/null | grep -E "\.wav$" | sed 's/\.wav$//' | grep -E "$2" | grep -vE 'alt|automaton|arcana|mkg|loop|stop|cast|ability|voice|ti[0-9]|dt20|layer|special' | sort | head -n "$3" || true
}
for pair in $HEROES; do
  id="${pair%%:*}"; folder="${pair##*:}"
  src="$OUT/$id"; mkdir -p "$src"
  "$S2V" -i "$VPK" -f "sounds/weapons/hero/$folder/" -e vsnd_c -o "$src/" -d >/dev/null 2>&1 || true
  dir="$(find "$src" -type d -path "*hero/$folder" | head -1)"
  [ -n "$dir" ] || { echo "   $id: папка звуков не найдена ($folder)"; continue; }
  attack="$(pick "$dir" '^(attack|.*_attack|.*swing)[0-9_]*$' 3)"
  [ -n "$attack" ] || attack="$(pick "$dir" 'attack|swing' 3)"
  pre="$(pick "$dir" '^preattack[0-9]*$|pre_attack' 2)"
  impact="$(pick "$dir" '^(projectile_)?impact[0-9_]*$|arrow_impact|hit[0-9]*$' 3)"
  mkdir -p "$DEST/$id"; rm -f "$DEST/$id"/*.m4a
  entry=""
  for kind in attack pre impact; do
    n=0; names=""
    for f in $(eval echo "\$$kind"); do
      n=$((n+1)); conv "$dir/$f.wav" "$DEST/$id/${kind}_$n.m4a" && names="${names:+$names,}\"${kind}_$n.m4a\""
    done
    [ -n "$names" ] && entry="${entry:+$entry,}\"$kind\":[$names]"
  done
  # Особые петли (Blade Fury у Juggernaut): start_loop + stop.
  if [ "$id" = "juggernaut" ] && [ -f "$dir/bladefury_start_loop.wav" ]; then
    conv "$dir/bladefury_start_loop.wav" "$DEST/$id/spin_loop.m4a"; conv "$dir/bladefury_stop.wav" "$DEST/$id/spin_stop.m4a"
    entry="$entry,\"spinLoop\":\"spin_loop.m4a\",\"spinStop\":\"spin_stop.m4a\""
  fi
  [ $first -eq 1 ] || echo "," >> "$INDEX"; first=0
  printf '  "%s": {%s}' "$id" "$entry" >> "$INDEX"
  echo "   $id ← $folder: $(ls "$DEST/$id" | tr '\n' ' ')"
done
echo "" >> "$INDEX"; echo "}" >> "$INDEX"
du -sh "$DEST"
