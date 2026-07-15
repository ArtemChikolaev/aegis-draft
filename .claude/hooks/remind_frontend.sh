#!/usr/bin/env bash
# PostToolUse (Edit|Write): фронт-гард — цвет только токеном, без data-theme-костылей.
# Правило CLAUDE.md: цвет = токен (design/tokens.css), не хардкод; никаких html[data-theme]-костылей.
# Никогда не блокирует (всегда exit 0), no-op при любой ошибке. Скилл: frontend-architecture.
input=$(cat)
path=$(printf '%s' "$input" | python3 -c "import sys,json;print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null) || exit 0
[ -z "$path" ] && exit 0

# только исходники фронта
case "$path" in
  */web/src/*.ts|*/web/src/*.tsx|*/web/src/*.css) ;;
  *) exit 0 ;;
esac
# design/ — легальный дом токенов и темы, там объявление цвета — норма
case "$path" in
  */web/src/design/*) exit 0 ;;
esac
[ -f "$path" ] || exit 0

msgs=""
# хардкод hex-цвета (3/4/6/8 знаков) вне токенов
if grep -EnI '#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})' "$path" >/dev/null 2>&1; then
  msgs="${msgs}🎨 Похоже, хардкод hex-цвета → цвет только через токен (design/tokens.css), var(--…). "
fi
# data-theme-костыли в компоненте/стиле
if grep -nI 'data-theme' "$path" >/dev/null 2>&1; then
  msgs="${msgs}🚫 'data-theme' вне design/ — это костыль; тему бери токенами, не селектором [data-theme]. "
fi
[ -n "$msgs" ] && echo "${msgs}Скилл: frontend-architecture."
exit 0
