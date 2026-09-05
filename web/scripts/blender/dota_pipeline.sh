#!/usr/bin/env bash
# Конвейер «модели Dota 2 → спрайт-листы Аркады» одной командой (docs/arcade-dota-sprites.md).
# Использование:
#   DOTA="$HOME/Library/Application Support/Steam/steamapps/common/dota 2 beta/game/dota" \
#   S2V=~/tools/s2v/Source2Viewer-CLI BLENDER=/Applications/Blender.app/Contents/MacOS/Blender \
#   bash dota_pipeline.sh [manifest.tsv]
# Манифест (TSV, # — комментарий): <id в игре>\t<путь vmdl_c в vpk>\t<аргументы render_dota_sprites.py>
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
juggernaut	models/heroes/juggernaut/juggernaut.vmdl_c	--dirs 8 --frame 128 --fps 12 --world 84 --anims walk=run,idle=idle,attack=attack,death=death
kobold	models/creeps/neutral_creeps/n_creep_kobold/n_creep_kobold.vmdl_c	--dirs 4 --frame 96 --fps 10 --world 56 --anims walk=run,idle=idle,attack=attack,death=death
roshan	models/creeps/roshan/roshan.vmdl_c	--dirs 8 --frame 256 --fps 12 --world 180 --anims walk=run,idle=idle,attack=attack,death=death
TSV
fi
mkdir -p "$OUT" "$SPRITES"
while IFS=$'\t' read -r id vmdl args; do
  [[ -z "$id" || "$id" == \#* ]] && continue
  echo "== $id ← $vmdl"
  "$S2V" -i "$VPK" -f "$vmdl" -o "$OUT/$id" -d --gltf_export_format glb --gltf_export_animations --gltf_export_materials --gltf_textures_adapt
  GLB="$(find "$OUT/$id" -name '*.glb' | head -1)"
  [ -n "$GLB" ] || { echo "   glb не найден для $id — проверь путь vmdl_c (список: $S2V -i \"$VPK\" -l -f $(dirname "$vmdl")/)"; continue; }
  # shellcheck disable=SC2086
  "$BLENDER" -b -P "$HERE/render_dota_sprites.py" -- --glb "$GLB" --name "$id" --out "$SPRITES" $args 2>&1 | grep -E 'actions in file|sheet |Error|Traceback' || true
done < "$MANIFEST"
echo "== текстуры земли (materials/terrain) → $OUT/terrain (выбрать вручную grass/dirt/water → $SPRITES/terrain/)"
"$S2V" -i "$VPK" -f materials/terrain/ -e vtex_c -o "$OUT/terrain" -d >/dev/null 2>&1 || echo "   экспорт террейна не удался (не критично)"
ls "$SPRITES"
