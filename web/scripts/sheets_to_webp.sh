#!/usr/bin/env bash
# Разовая конвертация уже готовых листов спрайтов PNG → WebP без потерь (см. dota_pipeline.sh).
# Замер 2026-09-06 на квантованных листах: WebP lossless на ~7% меньше PNG при той же картинке;
# lossy WebP на резких краях с альфой выходит наоборот КРУПНЕЕ, поэтому только -lossless.
# Уровень -z 6, а не 9: на этих листах 9 считает 23 секунды вместо 0.7 и даёт не меньше, а больше.
#   bash scripts/sheets_to_webp.sh [каталог …]   (по умолчанию оба пиксельных набора)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
command -v cwebp >/dev/null || { echo "нужен cwebp (brew install webp)"; exit 1; }
DIRS=("$@")
[ ${#DIRS[@]} -gt 0 ] || DIRS=("$HERE/../public/art/sprites/dota_px2" "$HERE/../public/art/sprites/dota_px" "$HERE/../public/art/sprites/dota")
before=0; after=0; n=0
for d in "${DIRS[@]}"; do
  [ -d "$d" ] || continue
  while IFS= read -r png; do
    webp="${png%.png}.webp"
    b=$(stat -f%z "$png")
    cwebp -lossless -z 6 -quiet "$png" -o "$webp" || { echo "не сконвертировался: $png"; continue; }
    a=$(stat -f%z "$webp")
    rm -f "$png"
    before=$((before + b)); after=$((after + a)); n=$((n + 1))
  done < <(find "$d" -name '*.png')
done
[ "$n" -gt 0 ] || { echo "нечего конвертировать"; exit 0; }
echo "листов: $n · было $((before / 1048576)) МБ → стало $((after / 1048576)) МБ (минус $(( (before - after) * 100 / before ))%)"
