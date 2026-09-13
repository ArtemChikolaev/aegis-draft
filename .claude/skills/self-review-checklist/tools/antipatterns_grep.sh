#!/usr/bin/env bash
# Быстрый скан антипаттернов aegis-draft (Go / TS / данные) по отслеживаемым git-файлам.
# ❌ Критичные категории — нарушение контракта данных, запрещённое деление ролей, секрет литералом,
#    мок вместо боевого датасета — дают exit 1: джоб antipatterns стоит в needs деплоя.
# ⚠️ Остальное — сигналы для ревью, код возврата не меняют.
# Использование: bash .claude/skills/self-review-checklist/tools/antipatterns_grep.sh
set -u
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT" || exit 1
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "antipatterns: $ROOT не git-репозиторий, скан по tracked-файлам невозможен"; exit 1; }
warnings=0
critical=0

# git grep смотрит только отслеживаемые файлы: гитигнорные черновики (**/.tmp_*), node_modules и dist
# в скан не попадают без списков исключений. Шаблоны путей — pathspec git, `:(exclude)` вычитает.
CODE=('*.go' '*.ts' '*.tsx' '*.mts' '*.mjs' '*.js')
# Отладочный вывод ищем только в прикладном коде: CLI-скрипты и tools печатают в консоль по назначению,
# а dev-плагин Vite game-log выводит лог игры в терминал dev-сервера (web/README.md, «Dev: debug logger»).
NOT_APP=(':(exclude,glob)**/scripts/**' ':(exclude,glob)**/tools/**' ':(exclude)web/vite-plugin-game-log.ts')
# Тесты держат заведомо фальшивые секреты-фикстуры (server/internal/*/…_test.go).
NOT_TESTS=(':(exclude,glob)**/*_test.go' ':(exclude,glob)web/test/**' ':(exclude,glob)web/e2e/**')

tracked_grep() { # <аргументы git grep> -- <pathspec…>
  git grep -n -I "$@" 2>/dev/null || true
}

report() { # <crit|warn> <label> <hits>
  [ -n "$3" ] || return 0
  if [ "$1" = crit ]; then
    echo "❌  $2"
    critical=$((critical + 1))
  else
    echo "⚠️  $2"
    warnings=$((warnings + 1))
  fi
  printf '%s\n' "$3" | sed 's/^/    /'
}

echo "== antipatterns scan =="

# --- Критичные ---

# Контракт данных: steamId допустим только на входе стадии normalize; дальше — единый accountId.
# tools не смотрим: валидатор контракта (data-contract/tools) ищет steamId в данных по назначению.
report crit "Контракт: 'steamId' вне pipeline/internal/normalize — контракт требует единый accountId" \
  "$(tracked_grep -e 'steamId' -- "${CODE[@]}" ':(exclude)pipeline/internal/normalize/' ':(exclude,glob)**/tools/**')"

# Роли: деление саппортов 4/5 запрещено (PRD §5.1).
report crit "Роли: деление саппортов (soft/hard support) — запрещено (PRD 5.1)" \
  "$(tracked_grep -e 'soft_support' -e 'hard_support' -e 'semiSupport' -- "${CODE[@]}")"

# Секреты: имени с key/secret/token/password присвоен литерал от 16 символов из алфавита токенов
# (буквы, цифры, + / _ . = : -). Само слово token в коде (ключ таблицы цветов, i18n-строка с пробелами,
# регулярка) секретом не считается.
quote="[\"'\`]"
SECRET_RE="(api[_-]?key|secret|token|passw(or)?d)[a-z0-9_]*[\"']?[[:space:]]*(:=|[:=])[[:space:]]*${quote}[a-z0-9+/_.=:-]{16,}${quote}"
report crit "Секрет литералом в коде (ключ/токен/пароль) — вынеси в env" \
  "$(tracked_grep -i -E -e "$SECRET_RE" -- "${CODE[@]}" '*.py' '*.sh' "${NOT_TESTS[@]}")"

# Данные: мок вместо боевого датасета в web/public/data. Грабля 2026-08-05 (дважды подряд): мок,
# записанный поверх боевого датасета, уехал в main — 22 пака вместо 1415, а в diff этого не видно,
# меняются только числа. Теперь gen:mock пишет в web/.mock-data, сюда мок попадает только явным
# `--out public/data` (CI web-job, изолированная копия дерева). Деплой публикует закоммиченный
# public/data, поэтому категория блокирует. Признак тот же, что у тестов: ratingModelVersion "mock…".
if grep -Eq '"ratingModelVersion"[[:space:]]*:[[:space:]]*"mock' web/public/data/manifest.json 2>/dev/null; then
  report crit "Данные: в web/public/data лежит МОК (ratingModelVersion mock…), а не боевой датасет" \
    "Источник — 'npm run gen:mock -- --out public/data'. Коммитить нельзя: датасет собирает только CI (data-refresh).
Не откатывай вслепую: выясни, чей это прогон, и верни только свой побочный результат (self-review-checklist)."
fi

# --- Предупреждения ---

report warn "Go: fmt.Println/Printf отладка (используй log)" \
  "$(tracked_grep -e 'fmt\.Print' -- '*.go' "${NOT_APP[@]}")"
report warn "TS: console.log (убрать/через логгер)" \
  "$(tracked_grep -e 'console\.log' -- '*.ts' '*.tsx' "${NOT_APP[@]}")"

# Дженерик User-Agent (Liquipedia банит).
report warn "ETL: похоже на дженерик User-Agent — задай кастомный с контактом" \
  "$(tracked_grep -e 'Go-http-client' -e 'User-Agent.*default' -- '*.go')"

# TODO без owner/контекста (TODO(owner) — ок, голый TODO/TODO: — нет).
report warn "TODO без owner/контекста" \
  "$(tracked_grep -E -e 'TODO([^(]|$)' -- '*.go' '*.ts' '*.tsx' "${NOT_APP[@]}")"

# Frontend: per-selector theme-override вместо токенов. Легитимно только в design/tokens.css.
report warn "Frontend: html[data-theme=…]-override вне design/tokens.css — токенизируй цвет (см. frontend-architecture)" \
  "$(tracked_grep -e 'data-theme=' -- 'web/*.css' ':(exclude)web/src/design/tokens.css')"

# Frontend: цвет-литерал в inline-стиле компонента (используй токены/классы дизайн-системы).
report warn "Frontend: цвет-литерал в inline style tsx (используй токены)" \
  "$(tracked_grep -E -e 'style=\{\{[^}]*(#[0-9a-fA-F]{3}|rgba?\()' -- '*.tsx')"

if [ "$critical" -eq 0 ] && [ "$warnings" -eq 0 ]; then
  echo "✅ чисто"
else
  echo "== критичных: $critical, предупреждений: $warnings =="
fi
[ "$critical" -eq 0 ] || exit 1
exit 0
