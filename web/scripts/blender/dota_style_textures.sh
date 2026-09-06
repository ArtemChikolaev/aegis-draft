#!/usr/bin/env bash
# Текстуры стиля арканы из vpk (docs/arcade-dota-sprites.md §8). Стили Dota («Bladeform Legacy» у
# Juggernaut, «Frost Avalanche» у Drow, стили Pudge/Earthshaker/…) — это НЕ другая модель, а другой
# набор color-текстур: рядом с `<part>_color_<hash>.vtex_c` в vpk лежит `<part>_<style>_color_<hash>.vtex_c`.
# glb из Source2Viewer привозит только базовые, поэтому текстуры стиля достаём отдельно, а
# render_dota_sprites.py подменяет их по имени (--style/--style-dir).
#
#   bash dota_style_textures.sh <подстрока пути материалов> <style1|style2> <куда>
#   bash dota_style_textures.sh models/items/juggernaut/arcana v2 ~/dota-export/styles/jugg_v2
# Токен стиля у Valve стоит по-разному: у Drow/Pudge суффиксом (`..._style1_color_...`), у Juggernaut
# в середине (`juggernaut_arcana_v2_body_color`), поэтому фильтр ловит его в любой позиции.
set -euo pipefail
DOTA="${DOTA:-$HOME/Library/Application Support/Steam/steamapps/common/dota 2 beta/game/dota}"
S2V="${S2V:-$HOME/tools/s2v/Source2Viewer-CLI}"
VPK="$DOTA/pak01_dir.vpk"
NEEDLE="${1:?путь материалов, напр. models/items/juggernaut}"
STYLE="${2:?style1 или style2}"
OUT="${3:?куда класть PNG}"
[ -f "$VPK" ] || { echo "нет $VPK"; exit 1; }
[ -x "$S2V" ] || { echo "нет Source2Viewer-CLI: $S2V"; exit 1; }
mkdir -p "$OUT"
LIST="$(mktemp)"
"$S2V" -i "$VPK" --vpk_dir 2>/dev/null | sed 's/ .*//' \
  | grep -F "materials/$NEEDLE" | grep '\.vtex_c$' \
  | grep -E "_${STYLE}_.*_?color_|_color_${STYLE}_" > "$LIST" || true
n=$(wc -l < "$LIST" | tr -d ' ')
echo "== $NEEDLE / $STYLE: текстур $n"
[ "$n" != "0" ] || { rm -f "$LIST"; exit 1; }
while read -r f; do
  [ -n "$f" ] || continue
  "$S2V" -i "$VPK" -f "$f" -o "$OUT/" -d >/dev/null 2>&1 || echo "   не извлеклась: $f"
done < "$LIST"
rm -f "$LIST"
find "$OUT" -name '*.png' | wc -l | xargs echo "   PNG в $OUT:"
