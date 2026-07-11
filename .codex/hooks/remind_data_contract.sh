#!/usr/bin/env bash
# PostToolUse (Edit|Write): напоминает про синхронизацию контракта данных и версий.
# Никогда не блокирует (всегда exit 0), no-op при любой ошибке.
input=$(cat)
path=$(printf '%s' "$input" | python3 -c "import sys,json;print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null) || exit 0
[ -z "$path" ] && exit 0
case "$path" in
  */schema/*.schema.json)
    echo "🔁 Изменена JSON Schema → синхронизируй оба конца: Go pipeline/internal/model и TS web/src/types (ре-ген из схемы). Формат сломан не аддитивно? → бампни schemaVersion. Скилл: data-contract."
    ;;
  */web/public/data/*.json)
    echo "🔁 Изменены сгенерированные данные → провалидируй: node .claude/skills/data-contract/tools/validate_data.mjs. Проверь единый accountId (нет steamId)."
    ;;
  */internal/rating/*|*scoring*|*rating*)
    echo "🔁 Похоже, тронута модель рейтинга → менял формулу/веса/окно? Бампни manifest.ratingModelVersion. Скилл: scoring-model."
    ;;
esac
exit 0
