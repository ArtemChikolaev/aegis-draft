#!/usr/bin/env bash
# PostToolUse (Bash): после git push напоминает «Push ≠ deploy» — дождись CI и проверь live.
# Правило CLAUDE.md: после пуша дождись CI и проверь live (пуш сам по себе не деплой).
# Никогда не блокирует (всегда exit 0), no-op при любой ошибке.
input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c "import sys,json;print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null) || exit 0
[ -z "$cmd" ] && exit 0
case "$cmd" in
  *"git push"*)
    echo "🚀 Push ≠ deploy: дождись CI ('gh run watch' / 'gh run list') и проверь live, прежде чем сказать «готово/задеплоено»."
    ;;
esac
exit 0
