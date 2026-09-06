#!/usr/bin/env bash
# Пиксельные иконки предметов Dota 2 → web/public/art/items_px/<slug>.png (32×24, палитра 24 без дизеринга).
# Источник: panorama/images/items/<slug>_png.vtex_c в pak01_dir.vpk (Source 2 Viewer CLI отдаёт PNG 88×64).
# Обычные (не пиксельные) иконки предметов берутся из зеркала/CDN (ui/artSource.ts), сюда не входят.
# Использование: S2V=~/tools/s2v/Source2Viewer-CLI bash scripts/dota_item_icons.sh <slug> [<slug>…]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DOTA="${DOTA:-$HOME/Library/Application Support/Steam/steamapps/common/dota 2 beta/game/dota}"
S2V="${S2V:-$HOME/tools/s2v/Source2Viewer-CLI}"
OUT="${OUT:-$HOME/dota-export/itemicons}"
DEST="$HERE/../public/art/items_px"
VPK="$DOTA/pak01_dir.vpk"
[ -f "$VPK" ] || { echo "нет $VPK"; exit 1; }
[ -x "$S2V" ] || { echo "нет Source2Viewer-CLI: $S2V"; exit 1; }
[ $# -gt 0 ] || { echo "укажи слаги предметов"; exit 1; }
mkdir -p "$OUT" "$DEST"
for slug in "$@"; do
  "$S2V" -i "$VPK" -f "panorama/images/items/${slug}_png.vtex_c" -o "$OUT/" -d >/dev/null 2>&1 || true
  src="$(find "$OUT" -name "${slug}_png.png" | head -1)"
  [ -n "$src" ] || { echo "   $slug: иконка не найдена"; continue; }
  sips -z 24 32 "$src" --out "$DEST/$slug.png" >/dev/null 2>&1
  command -v pngquant >/dev/null && pngquant --nofs --speed 1 --force --output "$DEST/$slug.png" 24 "$DEST/$slug.png"
  echo "   $slug → $DEST/$slug.png"
done
