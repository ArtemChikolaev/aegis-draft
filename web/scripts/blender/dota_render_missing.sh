#!/usr/bin/env bash
# Дорендерить только недостающие листы: строки манифеста, у которых в $SPRITES нет <id>.png.
# Нужно, когда манифест пополнили после запуска полного перерендера (он копирует манифест на старте).
#   OUT=… S2V=… SPRITES=…/dota_px2 bash dota_render_missing.sh dota_manifest_px2.tsv
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SPRITES="${SPRITES:-$HERE/../../public/art/sprites/dota}"
MANIFEST="${1:-$HERE/dota_manifest.tsv}"
TMP="$(mktemp)"
while IFS=$'\t' read -r id rest; do
  [[ -z "$id" || "$id" == \#* ]] && continue
  [ -f "$SPRITES/$id.png" ] || printf '%s\t%s\n' "$id" "$rest"
done < "$MANIFEST" > "$TMP"
n=$(grep -c . "$TMP" || true)
echo "== недостающих листов в $SPRITES: $n"
[ "$n" != "0" ] || { rm -f "$TMP"; exit 0; }
cut -f1 "$TMP"
SPRITES="$SPRITES" bash "$HERE/dota_pipeline.sh" "$TMP"
rm -f "$TMP"
