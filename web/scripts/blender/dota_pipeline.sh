#!/usr/bin/env bash
# Конвейер «модели Dota 2 → спрайт-листы Аркады» одной командой (docs/arcade-dota-sprites.md).
# Использование:
#   DOTA="$HOME/Library/Application Support/Steam/steamapps/common/dota 2 beta/game/dota" \
#   S2V=~/tools/s2v/Source2Viewer-CLI BLENDER=/Applications/Blender.app/Contents/MacOS/Blender \
#   bash dota_pipeline.sh [manifest.tsv]
# Манифест (TSV, # — комментарий): <id в игре>\t<путь vmdl_c в vpk>\t<аргументы render_dota_sprites.py>[\t<части: vmdl_c через запятую>]
# Части — отдельные модели героя (штаны/маска/оружие у героев Dota): пришиваются к скелету основной.
# По умолчанию — спайк: Juggernaut, кобольд, Рошан. Экспорт кладётся в $OUT (по умолчанию ~/dota-export),
# листы — в web/public/art/sprites/dota/.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DOTA="${DOTA:-$HOME/Library/Application Support/Steam/steamapps/common/dota 2 beta/game/dota}"
S2V="${S2V:-$HOME/tools/s2v/Source2Viewer-CLI}"
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
OUT="${OUT:-$HOME/dota-export}"
SPRITES="$HERE/../../public/art/sprites/dota"
VPK="$DOTA/pak01_dir.vpk"
[ -f "$VPK" ] || { echo "нет $VPK — установи Dota 2 или задай DOTA=..."; exit 1; }
[ -x "$S2V" ] || { echo "нет Source2Viewer-CLI: $S2V"; exit 1; }
[ -x "$BLENDER" ] || { echo "нет Blender: $BLENDER"; exit 1; }
MANIFEST="${1:-}"
if [ -z "$MANIFEST" ]; then
  MANIFEST="$(mktemp)"
  cat > "$MANIFEST" <<'TSV'
# id	vmdl_c	render args
juggernaut	models/heroes/juggernaut/juggernaut.vmdl_c	--dirs 8 --frame 128 --fps 12 --world 84 --anims walk=run_run,idle=idle,attack=attack,death=death	models/heroes/juggernaut/juggernaut_pants.vmdl_c,models/heroes/juggernaut/jugg_mask.vmdl_c,models/heroes/juggernaut/jugg_sword.vmdl_c,models/heroes/juggernaut/jugg_bracers.vmdl_c,models/heroes/juggernaut/jugg_cape.vmdl_c
kobold	models/creeps/neutral_creeps/n_creep_kobold/kobold_a/n_creep_kobold_a.vmdl_c	--dirs 4 --frame 96 --fps 10 --world 56 --anims walk=run,idle=idle,attack=attack,death=death
roshan	models/creeps/roshan/roshan.vmdl_c	--dirs 4 --frame 160 --fps 10 --max-frames 10 --world 180 --anims walk=roshan_run,idle=roshan_idle,attack=roshan_attack,death=roshan_die
TSV
fi
mkdir -p "$OUT" "$SPRITES"
while IFS=$'\t' read -r id vmdl args parts; do
  [[ -z "$id" || "$id" == \#* ]] && continue
  echo "== $id ← $vmdl"
  # -o со слэшем на конце = папка (при одном совпадении -f CLI иначе трактует -o как имя файла).
  mkdir -p "$OUT/$id"
  "$S2V" -i "$VPK" -f "$vmdl" -o "$OUT/$id/" -d --gltf_export_format glb --gltf_export_animations --gltf_export_materials --gltf_textures_adapt 2>&1 | grep -E 'Writing model|Error|error' || true
  GLB="$(find "$OUT/$id" -name '*.glb' ! -name '*_physics.glb' ! -name '*_hitbox*' | head -1)"
  PARTS=""
  if [ -n "${parts:-}" ]; then
    IFS=',' read -ra PLIST <<< "$parts"
    for pv in "${PLIST[@]}"; do
      pn="$(basename "$pv" .vmdl_c)"; mkdir -p "$OUT/$id/parts/$pn"
      "$S2V" -i "$VPK" -f "$pv" -o "$OUT/$id/parts/$pn/" -d --gltf_export_format glb --gltf_export_materials --gltf_textures_adapt >/dev/null 2>&1 || true
      pg="$(find "$OUT/$id/parts/$pn" -name '*.glb' ! -name '*_physics.glb' | head -1)"
      [ -n "$pg" ] && PARTS="${PARTS:+$PARTS,}$pg"
    done
  fi
  [ -n "$GLB" ] || { echo "   glb не найден для $id — проверь путь vmdl_c (список: $S2V -i \"$VPK\" -l -f $(dirname "$vmdl")/)"; continue; }
  # shellcheck disable=SC2086
  "$BLENDER" -b -P "$HERE/render_dota_sprites.py" -- --glb "$GLB" --name "$id" --out "$SPRITES" $args ${PARTS:+--parts "$PARTS"} 2>&1 | grep -E 'actions in file|attached|orientation|sheet |Error|Traceback' || true
done < "$MANIFEST"
echo "== текстуры земли (materials/terrain) → $OUT/terrain (выбрать вручную grass/dirt/water → $SPRITES/terrain/)"
"$S2V" -i "$VPK" -f materials/terrain/ -e vtex_c -o "$OUT/terrain" -d >/dev/null 2>&1 || echo "   экспорт террейна не удался (не критично)"
ls "$SPRITES"
