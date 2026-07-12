# Design language — Aegis Draft

Визуальная айдентика проекта. Это **design-spec**, а не глобальное правило: 322-0 остаётся только UX-референсом, **не** pixel-copy. Реализация — исключительно через токены `web/src/design/tokens.css` (механика — скилл `frontend-architecture`).

## Характер
Dota 2 **tournament roguelike**. НЕ B2B security dashboard, НЕ онлайн-курсы (Skillbox/Skillfactory). Editorial-подача: крупная типографика, много воздуха, **цвет как арт/сигнал — не заливка всего интерфейса**.

## Dark (тема по умолчанию)
- Фон — **pure black**, типографика — white.
- Акцент — **редкие green animated art fields** (баннеры/арт-блоки), а не сплошная зелень.
- Вдохновение: OpenAI (строгий чёрный), Cursor.

## Light
- Фон — **ivory** (Anthropic-like), акценты — **orange**, вставки — **black inset sections**.
- Цвет — сигнал/арт, не фон интерфейса.

## Тон и копирайт
- Верхняя подпись: «**DOTA 2 · TOURNAMENT ROGUELIKE**» / «DOTA 2 · ТУРНИРНЫЙ РОГАЛИК».
- Hero: «**Собери состав. Переживи турнир.**», путь **groups → playoffs → final**.
- Без маркетингового шума («BUILD IMPOSSIBLE ROSTERS» и подобного).
- Режимы (Classic / Esports Manager / Real Tournament) — **крупные самостоятельные заголовки**, описания вторичны.

## Инвариант реализации
- Цвет — **только токен** (light/dark работают сами). Всегда-тёмные арт-панели/радар/модалки — **инвертные токены** (`--surface-invert`, `--brand-*`), а не `html[data-theme=…]`-костыли.
- Проверяй новый UI на реальных скринах **обеих тем** и на **полном flow** (start → draft → result), а не на изолированном компоненте.

Ссылки: скилл `frontend-architecture`, PRD §5.9 (режимы), parity-аудит `docs/audits/2026-07-11-322-0-quick-draft-parity.md`.
