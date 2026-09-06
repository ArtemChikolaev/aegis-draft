#!/usr/bin/env bash
# Дорендерить только те строки манифеста, у которых лист неполный:
#   * нет файла <id>.png в $SPRITES, либо
#   * в <id>.json нет ряда анимации, который просит `--anims` этой строки.
# Нужно, когда манифест пополнили после старта полного перерендера (он копирует манифест на старте)
# или когда правило выбора клипа изменилось и часть листов осталась без ряда (например `cast`).
#   OUT=… S2V=… SPRITES=…/dota_px2 bash dota_render_missing.sh dota_manifest_px2.tsv
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SPRITES="${SPRITES:-$HERE/../../public/art/sprites/dota}"
MANIFEST="${1:-$HERE/dota_manifest.tsv}"
TMP="$(mktemp)"
SPRITES="$SPRITES" MANIFEST="$MANIFEST" python3 - > "$TMP" <<'PY'
import json, os, re
sprites, manifest = os.environ["SPRITES"], os.environ["MANIFEST"]
for line in open(manifest, encoding="utf-8"):
    line = line.rstrip("\n")
    if not line or line.startswith("#"):
        continue
    cols = line.split("\t")
    sid, args = cols[0], cols[2] if len(cols) > 2 else ""
    png, js = os.path.join(sprites, sid + ".png"), os.path.join(sprites, sid + ".json")
    if not os.path.exists(png) or not os.path.exists(js):
        print(line); continue
    m = re.search(r"--anims (\S+)", args)
    if not m:
        continue
    want = {p.split("=", 1)[0] for p in m.group(1).split(",") if "=" in p}
    try:
        have = set(json.load(open(js, encoding="utf-8")).get("anims", {}))
    except Exception:
        print(line); continue
    if want - have:
        print(line)
PY
n=$(grep -c . "$TMP" || true)
echo "== неполных листов в $SPRITES: $n"
[ "$n" != "0" ] || { rm -f "$TMP"; exit 0; }
cut -f1 "$TMP" | tr '\n' ' '; echo
SPRITES="$SPRITES" bash "$HERE/dota_pipeline.sh" "$TMP"
rm -f "$TMP"
