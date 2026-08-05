#!/usr/bin/env bash
# Быстрый скан антипаттернов aegis-draft (Go / TS / данные). Не блокирует, только сигналит.
# Использование: bash .claude/skills/self-review-checklist/tools/antipatterns_grep.sh
set -u
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT" || exit 0
hits=0
# Служебные директории (CLI-скрипты, tools, вендор) — не прикладной код, антипаттерны там ок.
EXCLUDES=(--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=scripts --exclude-dir=tools --exclude-dir=dist --exclude-dir=build)
scan() { # <label> <grep-args...>
  local label="$1"; shift
  local out
  out=$(grep -rnI "${EXCLUDES[@]}" "$@" 2>/dev/null)
  if [ -n "$out" ]; then
    echo "⚠️  $label"
    echo "$out" | sed 's/^/    /'
    hits=$((hits+1))
  fi
}

echo "== antipatterns scan =="

# Отладочный вывод
scan "Go: fmt.Println/Printf отладка (используй log)" --include=*.go -e 'fmt\.Print'
scan "TS: console.log (убрать/через логгер)" --include=*.ts --include=*.tsx -e 'console\.log'

# Секреты в коде
scan "Возможный секрет в коде (ключ/токен) — вынеси в env" --include=*.go --include=*.ts --include=*.tsx -e 'api[_-]?key *[:=] *"' -e 'token *[:=] *"'

# Контракт данных: steamId допустим только на входе стадии normalize; дальше должен быть accountId.
steam_hits=$(grep -rnI "${EXCLUDES[@]}" --include=*.go --include=*.ts --include=*.tsx -e 'steamId' . 2>/dev/null | grep -v '^\./pipeline/internal/normalize/' || true)
if [ -n "$steam_hits" ]; then
  echo "⚠️  Проектная: 'steamId' вне normalize — контракт требует единый accountId"
  echo "$steam_hits" | sed 's/^/    /'
  hits=$((hits+1))
fi

# Роли: запрещённое деление саппортов 4/5
scan "Проектная: деление саппортов (soft/hard support) — запрещено (PRD 5.1)" --include=*.go --include=*.ts --include=*.tsx -e 'soft_support' -e 'hard_support' -e 'semiSupport'

# Дженерик User-Agent (Liquipedia банит)
scan "ETL: похоже на дженерик User-Agent — задай кастомный с контактом" --include=*.go -e 'Go-http-client' -e 'User-Agent.*default'

# TODO без owner/контекста (TODO(owner) — ок, голый TODO/TODO: — нет)
scan "TODO без owner/контекста" --include=*.go --include=*.ts --include=*.tsx -E -e 'TODO([^(]|$)'

# Frontend: per-selector theme-override вместо токенов. Легитимно только в design/tokens.css.
theme_hits=$(grep -rnI "${EXCLUDES[@]}" --include=*.css -e 'data-theme=' web 2>/dev/null | grep -v 'design/tokens.css' || true)
if [ -n "$theme_hits" ]; then
  echo "⚠️  Frontend: html[data-theme=…]-override вне design/tokens.css — токенизируй цвет (см. frontend-architecture)"
  echo "$theme_hits" | sed 's/^/    /'
  hits=$((hits+1))
fi

# Frontend: цвет-литерал в inline-стиле компонента (используй токены/классы дизайн-системы)
scan "Frontend: цвет-литерал в inline style tsx (используй токены)" --include=*.tsx -E -e 'style=\{\{[^}]*(#[0-9a-fA-F]{3}|rgba?\()'

# Данные: мок вместо боевого датасета в web/public/data.
#
# Грабля 2026-08-05, повторилась дважды подряд: `npm run gen:mock` пишет В ТОТ ЖЕ каталог, где
# лежит боевой датасет, собранный CI. Прогнал мок для проверки UI, добавил каталог в коммит целиком
# — и в main уехали 22 пака вместо 1415. На глаз в diff это не видно: файлы те же, меняются только
# числа внутри. Порог 100 берётся с запасом: мок — 22 пака, боевой — больше тысячи.
if [ -f web/public/data/packs.json ]; then
  pack_count=$(node -e "const p=require('./web/public/data/packs.json');const a=Array.isArray(p)?p:p.packs;console.log(Array.isArray(a)?a.length:0)" 2>/dev/null || echo "-1")
  if [ "$pack_count" != "-1" ] && [ "$pack_count" -lt 100 ]; then
    echo "⚠️  Данные: в web/public/data лежит МОК ($pack_count паков), а не боевой датасет."
    echo "    Это следы 'npm run gen:mock'. Коммитить их нельзя — датасет собирает только CI."
    echo "    Вернуть: git checkout origin/main -- web/public/data"
    hits=$((hits+1))
  fi
fi

if [ "$hits" -eq 0 ]; then
  echo "✅ чисто"
fi
exit 0
