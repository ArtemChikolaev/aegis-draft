#!/usr/bin/env bash
# Конвейер «модели Dota 2 → спрайт-листы Аркады» одной командой (docs/arcade-dota-sprites.md).
# Использование:
#   DOTA="$HOME/Library/Application Support/Steam/steamapps/common/dota 2 beta/game/dota" \
#   S2V=~/tools/s2v/Source2Viewer-CLI BLENDER=/Applications/Blender.app/Contents/MacOS/Blender \
#   bash dota_pipeline.sh [manifest.tsv]
# Манифест (TSV, # — комментарий): <id в игре>\t<путь vmdl_c в vpk>\t<аргументы render_dota_sprites.py>[\t<части: vmdl_c через запятую>]
# Части — отдельные модели героя (штаны/маска/оружие у героев Dota): пришиваются к скелету основной.
# По умолчанию — полный манифест dota_manifest.tsv (герои, враги, пропсы). Экспорт кладётся в $OUT (по умолчанию ~/dota-export),
# листы — в web/public/art/sprites/dota/.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DOTA="${DOTA:-$HOME/Library/Application Support/Steam/steamapps/common/dota 2 beta/game/dota}"
S2V="${S2V:-$HOME/tools/s2v/Source2Viewer-CLI}"
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
OUT="${OUT:-$HOME/dota-export}"
SPRITES="${SPRITES:-$HERE/../../public/art/sprites/dota}"   # SPRITES=…/dota_px для пиксельных листов (§7)
VPK="$DOTA/pak01_dir.vpk"
[ -f "$VPK" ] || { echo "нет $VPK — установи Dota 2 или задай DOTA=..."; exit 1; }
[ -x "$S2V" ] || { echo "нет Source2Viewer-CLI: $S2V"; exit 1; }
[ -x "$BLENDER" ] || { echo "нет Blender: $BLENDER"; exit 1; }
MANIFEST="${1:-$HERE/dota_manifest.tsv}"
[ -f "$MANIFEST" ] || { echo "нет манифеста $MANIFEST"; exit 1; }
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
      # --gltf_export_animations обязателен и для частей: без него CLI не пишет скин (скелет + веса),
      # и часть застывает в bind-позе рядом с анимированным телом («два персонажа»).
      "$S2V" -i "$VPK" -f "$pv" -o "$OUT/$id/parts/$pn/" -d --gltf_export_format glb --gltf_export_animations --gltf_export_materials --gltf_textures_adapt >/dev/null 2>&1 || true
      pg="$(find "$OUT/$id/parts/$pn" -name '*.glb' ! -name '*_physics.glb' | head -1)"
      [ -n "$pg" ] && PARTS="${PARTS:+$PARTS,}$pg"
    done
  fi
  [ -n "$GLB" ] || { echo "   glb не найден для $id — проверь путь vmdl_c (список: $S2V -i \"$VPK\" -l -f $(dirname "$vmdl")/)"; continue; }
  # shellcheck disable=SC2086
  "$BLENDER" -b -P "$HERE/render_dota_sprites.py" -- --glb "$GLB" --name "$id" --out "$SPRITES" $args ${PARTS:+--parts "$PARTS"} 2>&1 | grep -E 'actions in file|attached|orientation|sheet |WARN|Error|Traceback' || true
  # Палитра 256 цветов (pngquant, brew install pngquant): лист худеет в 4–5 раз без видимой потери на 128 px.
  if command -v pngquant >/dev/null 2>&1 && [ -f "$SPRITES/$id.png" ]; then
    # Пиксельные листы: 48 цветов без дизеринга (--nofs) — ровные пятна, как в рисованном пиксель-арте.
    if [[ "$args" == *"--pixel"* ]]; then pngquant --nofs --speed 1 --force --output "$SPRITES/$id.png" 48 "$SPRITES/$id.png"
    else pngquant --quality 75-95 --speed 1 --force --output "$SPRITES/$id.png" 256 "$SPRITES/$id.png"; fi && echo "   pngquant → $(du -h "$SPRITES/$id.png" | cut -f1)"
  fi
done < "$MANIFEST"
echo "== текстуры земли лежат в maps/<набор>_assets/blends/ (см. docs/arcade-dota-sprites.md §4); уже установлены в $SPRITES/terrain/"
ls "$SPRITES"
