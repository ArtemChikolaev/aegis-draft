#!/usr/bin/env bash
# Волна слоёв частей по героям (T13.80): для каждого героя из аргументов — plan → рендер px2/px (RAW=1 REUSE=1) → build.
# Возобновляемо: герой, у которого `<hero>+body` уже есть в манифесте слоёв, пропускается; герой, чей план падает
# (модель без слота в dota_item_index.json / dota_slot_overrides.json), пропускается с записью в лог — волну это не останавливает.
#   bash scripts/dota_part_wave.sh <scratch-dir> anti_mage sven zeus …      # из web/; ~10–15 мин Blender на героя с двумя сетами
# Лог — <scratch-dir>/wave.log; после волны: `npm run typecheck && npx vitest run test/arcadeParts.test.ts` и коммит.
set -uo pipefail
cd "$(dirname "$0")/.."
DIR="${1:?папка для сырых рендеров}"; shift
mkdir -p "$DIR"; LOG="$DIR/wave.log"
say() { echo "=== $(date '+%H:%M:%S') $*" | tee -a "$LOG"; }
for hero in "$@"; do
  if grep -q "^${hero}+body	" scripts/blender/dota_manifest_parts_px2.tsv; then say "$hero: слои уже есть — пропуск"; continue; fi
  if ! npx tsx scripts/dota_part_layers.mts plan --heroes "$hero" --dir "$DIR/$hero" >> "$LOG" 2>&1; then say "$hero: ПЛАН НЕ СОБРАЛСЯ (слот модели) — пропуск"; continue; fi
  say "$hero: рендер px2"; RAW=1 REUSE=1 OUT="$DIR/$hero/export" SPRITES="$DIR/$hero/px2" bash scripts/blender/dota_pipeline.sh "$DIR/$hero/family_px2.tsv" >> "$LOG" 2>&1
  say "$hero: рендер px";  RAW=1 REUSE=1 OUT="$DIR/$hero/export" SPRITES="$DIR/$hero/px"  bash scripts/blender/dota_pipeline.sh "$DIR/$hero/family_px.tsv"  >> "$LOG" 2>&1
  if npx tsx scripts/dota_part_layers.mts build --heroes "$hero" --dir "$DIR/$hero" >> "$LOG" 2>&1; then say "$hero: готово — $(grep "$hero: композит" "$LOG" | tail -2 | sed 's/.*расхождение/расхождение/' | tr '\n' ' ')"; else say "$hero: BUILD УПАЛ — сырьё оставлено в $DIR/$hero для разбора и повторного build"; continue; fi
  rm -rf "$DIR/$hero/px2" "$DIR/$hero/px" "$DIR/$hero/export"   # сырые листы и glb — десятки МБ на героя; только после удачного build
done
say "волна окончена"
