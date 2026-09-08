#!/usr/bin/env bash
# Конвейер «модели Dota 2 → спрайт-листы Аркады» одной командой (docs/arcade-dota-sprites.md).
# Использование:
#   DOTA="$HOME/Library/Application Support/Steam/steamapps/common/dota 2 beta/game/dota" \
#   S2V=~/tools/s2v/Source2Viewer-CLI BLENDER=/Applications/Blender.app/Contents/MacOS/Blender \
#   bash dota_pipeline.sh [manifest.tsv]
# Манифест (TSV, # — комментарий): <id в игре>\t<путь vmdl_c в vpk>\t<аргументы render_dota_sprites.py>[\t<части: vmdl_c через запятую>]
# Части — отдельные модели героя (штаны/маска/оружие у героев Dota): пришиваются к скелету основной.
# По умолчанию — полный манифест dota_manifest.tsv (герои, враги, пропсы). Экспорт кладётся в $OUT (по умолчанию ~/dota-export),
# листы — в web/public/art/sprites/dota/ (<id>.json + <id>.webp).
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
  # REUSE=1 — не экспортировать заново, если glb уже лежит в $OUT/$id (экспорт с частями — половина
  # времени строки; при перерендере из-за правки скрипта рендера модель не менялась).
  if [ "${REUSE:-}" = "1" ] && [ -f "$OUT/$id/${vmdl%.vmdl_c}.glb" ]; then echo "   glb уже есть (REUSE=1)"; else
  "$S2V" -i "$VPK" -f "$vmdl" -o "$OUT/$id/" -d --gltf_export_format glb --gltf_export_animations --gltf_export_materials --gltf_textures_adapt 2>&1 | grep -E 'Writing model|Error|error' || true
  fi
  # Берём glb ИМЕННО запрошенной модели: CLI с -d тянет и зависимости (у drow_arcana это базовое
  # тело drow_base), а `head -1` отдавал первый по алфавиту — арканой рисовалось голое тело с
  # навешанными косметическими частями («рассыпуха»). Порядок: точный путь → basename → что нашлось.
  GLB="$OUT/$id/${vmdl%.vmdl_c}.glb"
  if [ ! -f "$GLB" ]; then
    GLB="$(find "$OUT/$id" -name "$(basename "$vmdl" .vmdl_c).glb" ! -path '*/parts/*' | head -1)"
    [ -n "$GLB" ] || GLB="$(find "$OUT/$id" -name '*.glb' ! -name '*_physics.glb' ! -name '*_hitbox*' ! -path '*/parts/*' | head -1)"
  fi
  PARTS=""
  if [ -n "${parts:-}" ]; then
    IFS=',' read -ra PLIST <<< "$parts"
    for pv in "${PLIST[@]}"; do
      pn="$(basename "$pv" .vmdl_c)"; mkdir -p "$OUT/$id/parts/$pn"
      # --gltf_export_animations обязателен и для частей: без него CLI не пишет скин (скелет + веса),
      # и часть застывает в bind-позе рядом с анимированным телом («два персонажа»).
      if [ "${REUSE:-}" != "1" ] || [ -z "$(find "$OUT/$id/parts/$pn" -name '*.glb' 2>/dev/null | head -1)" ]; then
      "$S2V" -i "$VPK" -f "$pv" -o "$OUT/$id/parts/$pn/" -d --gltf_export_format glb --gltf_export_animations --gltf_export_materials --gltf_textures_adapt >/dev/null 2>&1 || true
      fi
      pg="$(find "$OUT/$id/parts/$pn" -name '*.glb' ! -name '*_physics.glb' | head -1)"
      [ -n "$pg" ] && PARTS="${PARTS:+$PARTS,}$pg"
    done
  fi
  # Стиль арканы (--style <токен Valve>): текстуры стиля лежат в vpk отдельно от модели, glb их не
  # привозит — достаём сами в $OUT/$id/styletex и подкладываем рендеру (см. dota_style_textures.sh).
  STYLE_TOK="$(printf '%s' "$args" | sed -n 's/.*--style \([A-Za-z0-9_]*\).*/\1/p')"
  if [ -n "$STYLE_TOK" ]; then
    folder="$(printf '%s' "$vmdl" | cut -d/ -f3)"
    sdir="$OUT/$id/styletex"; rm -rf "$sdir"; mkdir -p "$sdir"
    for root in items heroes; do
      DOTA="$DOTA" S2V="$S2V" bash "$HERE/dota_style_textures.sh" "models/$root/$folder" "$STYLE_TOK" "$sdir" >/dev/null 2>&1 || true
    done
    echo "   стиль $STYLE_TOK: текстур $(find "$sdir" -name '*.png' | wc -l | tr -d ' ')"
    args="$args --style-dir $sdir"
  fi
  # Материалы, которых нет в vpk (--fix-tex <папка материалов> + --mat-map в render_dota_sprites.py):
  # достаём все color-текстуры папки в $OUT/$id/fixtex и отдаём рендеру как --fix-tex-dir.
  FIX_TEX="$(printf '%s' "$args" | sed -n 's/.*--fix-tex \([^ ]*\).*/\1/p')"
  if [ -n "$FIX_TEX" ]; then
    fdir="$OUT/$id/fixtex"; rm -rf "$fdir"; mkdir -p "$fdir"
    FIX_LIST="$("$S2V" -i "$VPK" --vpk_dir 2>/dev/null | sed 's/ .*//' | grep -F "$FIX_TEX" | grep -E '_color_.*\.vtex_c$' || true)"
    for f in $FIX_LIST; do
      "$S2V" -i "$VPK" -f "$f" -o "$fdir/" -d >/dev/null 2>&1 || true
    done
    echo "   fix-tex $FIX_TEX: текстур $(find "$fdir" -name '*.png' | wc -l | tr -d ' ')"
    args="$(printf '%s' "$args" | sed "s|--fix-tex $FIX_TEX|--fix-tex-dir $fdir|")"
  fi
  # Маски свечения (--glow-mask <папка материалов в vpk> → --glow-mask-dir): selfillum лежит в альфе
  # `*_detailmask_*` / в `*_selfillummask_*`, glb их с альфой не привозит — достаём vtex напрямую.
  GLOW_MASK="$(printf '%s' "$args" | sed -n 's/.*--glow-mask \([^ ]*\).*/\1/p')"
  if [ -n "$GLOW_MASK" ]; then
    gdir="$OUT/$id/glowtex"; rm -rf "$gdir"; mkdir -p "$gdir"
    GLOW_LIST="$("$S2V" -i "$VPK" --vpk_dir 2>/dev/null | sed 's/ .*//' | grep -F "$GLOW_MASK" | grep -E '(_detailmask_|_selfillummask_).*\.vtex_c$' || true)"
    for f in $GLOW_LIST; do
      "$S2V" -i "$VPK" -f "$f" -o "$gdir/" -d >/dev/null 2>&1 || true
    done
    echo "   glow-mask $GLOW_MASK: масок $(find "$gdir" -name '*.png' | wc -l | tr -d ' ')"
    args="$(printf '%s' "$args" | sed "s|--glow-mask $GLOW_MASK|--glow-mask-dir $gdir|")"
  fi
  [ -n "$GLB" ] || { echo "   glb не найден для $id — проверь путь vmdl_c (список: $S2V -i \"$VPK\" -l -f $(dirname "$vmdl")/)"; continue; }
  # shellcheck disable=SC2086
  # Без `|| true`: с `set -e` и `pipefail` падение Blender останавливает всю партию. Иначе диалог
  # системы о крахе всплывал бы на каждом герое, а старые листы выглядели бы как свежий результат.
  "$BLENDER" -b -P "$HERE/render_dota_sprites.py" -- --glb "$GLB" --name "$id" --out "$SPRITES" $args ${PARTS:+--parts "$PARTS"} 2>&1 | grep -E 'actions in file|attached|orientation|sheet |cast:|style |autoexpose|loop |glow-|white-to|mat-map|drop-mat|rootlock:|WARN|Error|Traceback'
  # Палитра 256 цветов (pngquant, brew install pngquant): лист худеет в 4–5 раз без видимой потери на 128 px.
  if command -v pngquant >/dev/null 2>&1 && [ -f "$SPRITES/$id.png" ]; then
    # Пиксельные листы: 48 цветов без дизеринга (--nofs) — ровные пятна, как в рисованном пиксель-арте.
    if [[ "$args" == *"--pixel"* ]]; then pngquant --nofs --speed 1 --force --output "$SPRITES/$id.png" 48 "$SPRITES/$id.png"
    else pngquant --quality 75-95 --speed 1 --force --output "$SPRITES/$id.png" 256 "$SPRITES/$id.png"; fi && echo "   pngquant → $(du -h "$SPRITES/$id.png" | cut -f1)"
  fi
  # WebP без потерь поверх квантованного PNG: минус ~7% к весу при той же картинке (brew install webp).
  # Именно lossless: lossy WebP на резких краях с альфой выходит КРУПНЕЕ PNG.
  if command -v cwebp >/dev/null 2>&1 && [ -f "$SPRITES/$id.png" ]; then
    cwebp -lossless -z 6 -quiet "$SPRITES/$id.png" -o "$SPRITES/$id.webp" && rm -f "$SPRITES/$id.png" \
      && echo "   webp → $(du -h "$SPRITES/$id.webp" | cut -f1)"
  fi
done < "$MANIFEST"
echo "== текстуры земли лежат в maps/<набор>_assets/blends/ (см. docs/arcade-dota-sprites.md §4); уже установлены в $SPRITES/terrain/"
ls "$SPRITES"
