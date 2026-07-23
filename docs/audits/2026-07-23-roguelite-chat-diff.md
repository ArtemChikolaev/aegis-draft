# Chat diff — Roguelite saves, Market/Reserve UX and Chemistry

## Паспорт

- Дата: 2026-07-23
- Участники: пользователь (product owner / playtester), Codex; исходный handoff и часть предшествующей реализации — Claude
- Scope чата: BUG-2026-07-23, продолжение Roguelite slice 3, переработка Буткемпа по скриншотам, исправление Chemistry
- База на старте: Roguelite slice 2 — Reward / Camp / Market economy skeleton
- Состояние на момент записи:
  - исправление совместимости сейва уже в `main` и `origin/main`: `f94ca36`
  - slice 3, новый Camp UX и Chemistry v1.13.0 подготовлены к итоговому коммиту после полной проверки
  - commit `f94ca36` содержит `Co-authored-by: Codex <noreply@openai.com>`

Это не дословная стенограмма, а продуктово-технический diff разговора: что было на входе, какие уточнения появились по ходу живого playtest, что изменили в продукте и как строилось взаимодействие.

## Короткий before → after

| Область | Было | Стало |
|---|---|---|
| Совместимость сейва | точное совпадение `manifest.builtAt`; no-op cron refresh стирал забег | совместимость по детерминированному `manifest.dataHash`; `builtAt` отвечает только за свежесть |
| Market | абстрактные дельты Base / Hero Synergy / Chemistry | реальные предложения: конкретный игрок `A → B` или герой `A → B` |
| Замена игрока | визуально могла читаться как смена ника / стат-модификатор | реально меняется `accountId`; снятый игрок уходит в резерв |
| Понимание состава в Camp | четыре итоговых числа без достаточного контекста | постоянный radar-пентагон, игроки, назначенные герои, Synergy и Chemistry-связи |
| Карточка игрока | мало данных, непонятно, кого и зачем менять | компактная карточка: роль, команда, IMP/ECO/REL, OVR, назначенный герой |
| Резерв | отсутствовал в slice 2 | все снятые игроки + малый hero reserve; бесплатный swap с preview и persist/resume |
| Chemistry | пары, тройки и четвёрки складывались вместе и быстро забивали cap 13 | сумма только уникальных пар; реальный сыгранный тиммейт снова меняет результат |
| Геометрия Camp | правая колонка растянута, пять карточек не помещались в ряд | рабочее место расширено до 1520 px; обе рулетки вмещают по пять карточек и адаптивно складываются на узких экранах |

## Хронология разговора

### 1. Вскрылся no-op save invalidation

Пользователь принёс уже локализованную вместе с Claude причину:

- суточный `chore(data): refresh dataset` изменил `manifest.builtAt`;
- игровые данные фактически не изменились;
- `loadData` вызвал `isRunCompatible`;
- несовпадение timestamp привело к `clearSavedRun`;
- resume исчез, хотя replay был бы тем же.

Запрос был не просто «вернуть кнопку», а устранить неправильную идентичность контента.

#### Решение

Добавлен `manifest.dataHash`:

- Go emitter и mock считают SHA-256 по игровым JSON в фиксированном порядке;
- volatile `manifest.json` в хеш не входит;
- `SavedRun` хранит `dataHash`;
- совместимость сверяет schema version, rating model version и content hash;
- legacy-сейв с `dataBuiltAt` ещё может мигрировать, если старый timestamp совпадает;
- одинаковый контент с новым `builtAt` сохраняет resume;
- реальное изменение игрового JSON честно инвалидирует старый забег.

Результат закоммичен и отправлен:

```text
f94ca36 fix(data): preserve saves across no-op refreshes
Co-authored-by: Codex <noreply@openai.com>
```

#### Правило, забранное в проект навсегда

В `data-contract` зафиксировано:

> `builtAt` — только свежесть, не идентичность контента. Сейвы, replay и другие воспроизводимые артефакты нельзя связывать с volatile metadata; для этого нужен детерминированный content hash.

### 2. Продолжение BACKLOG после slice 2

Пользователь передал подробный handoff Claude:

- готовый economy skeleton;
- фаза Camp и persist экономики;
- Reward 1-of-3;
- Market с тремя абстрактными рычагами;
- difficulty calibration;
- будущие границы rarity, tactics, meta unlocks.

Следующей реализацией стал slice 3: **реальные рычаги + резерв**.

#### Что добавили

- `anteMarket.ts` как тонкий слой между `RunEconomy` и существующим `RunEngine.score()`;
- детерминированные contextual offers по `seed + campId + rerollN`;
- каждая рулетка всегда содержит пять уникальных игроков и пять уникальных героев;
- игроки берутся из доступных ролевых пулов без скрытого фильтра «только улучшения», поэтому осмысленные рискованные предложения сохраняются;
- для входящего игрока перебираются все активные слоты той же роли и выбирается замена с максимальным итоговым Team OVR;
- для входящего героя перебираются все пять активных героев и выбирается замена с максимальным Team OVR после существующего Hungarian matching;
- preview рассчитывает полный `Base / Hero Synergy / Chemistry before → after`;
- покупка игрока меняет настоящий `accountId`;
- каждый снятый игрок добавляется на скамейку и остаётся доступен;
- снятый герой попадает в reserve hero pool;
- swap из резерва бесплатен;
- action log воспроизводит перестройки после reload/resume;
- identity уже показанных офферов не меняется бесплатно после соседней перестановки, но preview пересчитывается.

### 3. Первый screenshot-playtest: «как что менять — ничего не понятно»

Пользователь показал Camp и сформулировал не техническую, а продуктовую проблему:

- четыре числа не дают понять текущий состав;
- непонятно, кто с кем синергирует;
- непонятно, какие герои назначены;
- замена игрока должна быть реальным поиском другого игрока, например `60 OVR → 80 OVR`, а не сменой nickname;
- карточки игроков должны быть компактными, по духу 322-0;
- для героев пока достаточно простой замены, потому что rarity/upgrade ещё не реализованы;
- после перестановки визуально казалось, что ничего не изменилось.

#### Ответ реализации

Camp превратился из списка economy-карт в рабочее место:

- слева постоянно виден тот же Pentagon, что в драфте/турнире;
- на вершинах — активные игроки, роли, герои и OVR;
- на рёбрах — Chemistry;
- под radar — Base / Hero Synergy / Chemistry и их подробные строки;
- справа — Reward, Market, Reserve и переход дальше;
- market player offer показывает полноценную карточку входящего игрока и отдельную строку `кого заменяет`;
- карточка показывает команду, роль, IMP/ECO/REL, OVR и назначенного героя;
- hero re-pick читается слева направо как `входящий герой → заменяемый герой`, а также показывает лучшее назначение игроку и число сыгранных им матчей;
- reserve player swap показывает конкретный слот и точный score preview;
- swap немедленно обновляет radar;
- reload/resume сохраняет активный состав и скамейку;
- mobile layout складывает сравнение вертикально и не режет вершины Pentagon.

### 4. Второй screenshot-playtest: «33 играл с этими ребятами, а Chemistry почти не меняется»

Пользователь заметил важное расхождение:

- market предлагал `Noticed → 33`;
- 33 действительно играл с Insania, Boxi и Nisha;
- карточка показывала Base и Hero Synergy, но не показывала прирост Chemistry;
- после покупки Chemistry визуально оставалась почти той же;
- правая композиция всё ещё казалась слишком растянутой.

Это оказался не gap данных.

#### Точная диагностика

В production data нужные связи присутствовали:

- `33 + Insania` — 166 игр;
- `33 + Boxi` — 166 игр;
- `33 + Nisha` — 166 игр.

Старая формула считала одновременно:

- пары;
- вложенные тройки;
- четвёрки;
- затем обрезала сумму cap’ом 13.

Для показанного состава:

```text
до замены:    raw Chemistry 14.86 → cap 13
после 33:     raw Chemistry 22.08 → cap 13
```

То есть данные и preview были реальными, но повторный учёт одних отношений делал решение невидимым.

#### Исправление

Chemistry v1.13.0:

```text
pairBonus = min(4, games / 230)
Chemistry = min(13, sum(unique roster pairs))
```

- scoring выбирает только `ids.length === 2`;
- группы 3–5 остаются в датасете как исторический агрегат, но не суммируются поверх пар;
- для класса сценария Noticed → 33 тест фиксирует примерно `10.526 → 12.691`;
- `ratingModelVersion` повышен `v1.12.0 → v1.13.0`;
- старые v1.12-сейвы намеренно несовместимы: в отличие от `builtAt`-refresh, здесь итоговый Team OVR действительно изменился;
- в `reference-322-0.md` записано осознанное расхождение: измеренная формула 322-0 использует группы 2–5, но Aegis Draft её не копирует из-за playtest-дефекта;
- в `scoring-model` добавлено постоянное правило не учитывать вложенные группы повторно.

### 5. Расширение рабочего места под рынок 5+5

После перехода к двум полноценным рулеткам:

- `max-width` Camp расширен `1320 → 1520`, не меняя ширину остальных экранов;
- desktop layout использует пропорции `.84fr / 1.16fr` с минимальной шириной team panel 420 px;
- игроки и герои выводятся отдельными сетками по пять колонок;
- при ширине до 980 px workbench складывается в одну колонку, а до 680 px обе рулетки переходят на две колонки;
- карточки резерва остаются компактными, а foil-эффект ограничен рамками конкретной карточки;
- на viewport 390 px `document.scrollWidth === viewportWidth === 390`, горизонтального overflow нет.

## Как общались

### Роли

- **Пользователь** действовал как product owner и живой playtester: давал контекст предыдущего агента, показывал реальные скриншоты, описывал не CSS-симптом, а ожидаемую игровую семантику.
- **Codex** действовал как implementation/review partner: сначала восстанавливал архитектурные границы, затем локализовал конкретные причины по данным и коду, после чего менял реализацию и проверял её в живом интерфейсе.

### Рабочий цикл

Разговор шёл итерациями:

```text
handoff / screenshot
  → формулировка наблюдаемой проблемы
  → discovery существующих модулей
  → гипотеза и измерение
  → короткий план
  → реализация
  → unit / real data / mock / browser
  → новый screenshot-playtest
```

### Характер сообщений Codex

- перед инструментальной работой давались короткие status updates;
- назывались применяемые проектные навыки и причина их использования;
- сначала сообщался результат диагностики, затем детали;
- продуктовые предположения отделялись от доказанных фактов;
- при формульной проблеме приводились конкретные raw/capped значения;
- пользовательский сервер на 5173 не трогался; визуальная проверка шла на 5273;
- после HMR-шума выполнялся чистый reload, чтобы отделить transient dev error от runtime defect;
- mock failure не маскировался: тестовую подготовку сделали dataset-agnostic, а генератор рынка теперь обязан либо собрать полный пакет 5+5, либо явно завершиться ошибкой.

### Главный поворот разговора

Изначально групповая Chemistry 2–5 была принята как parity с измеренным 322-0. Пользовательская проверка на 33 показала, что буквальное копирование референса создаёт плохое продуктовое поведение. После этого приоритет сменился:

```text
literal reference parity
  → объяснимое решение игрока
  → уникальные pair contributions
```

Это не случайный balance tweak, а осознанное product divergence, записанное в PRD, BACKLOG, reference audit и scoring skill.

## Архитектурные решения

### Что переиспользовали

- `RunEngine.score()` — единый источник полного score breakdown;
- существующие `Candidate`, `CandidateRef`, `accountId`;
- `Pentagon`, `SynergyBreakdown`, `PlayerInspector`;
- UI primitives из `ui/`;
- design tokens и RU/EN i18n;
- action-log replay в `runPersist` / `runStore`;
- `squadSynergy` pair records для Chemistry.

### Что создали

- `web/src/game/anteMarket.ts` — только contextual offer orchestration;
- contextual offer payloads с реальными player/hero swaps;
- reserve player / reserve heroes в RunEngine snapshot/replay;
- Camp workbench layout и компактные player cards;
- regression tests для structural market, reserve resume и pair-only Chemistry.

### Чего намеренно не делали

- не мутировали игрока «дельтой OVR» вместо реальной замены;
- не добавляли hero rarity/upgrade;
- не превращали reroll героя в upgrade;
- не переносили game logic в UI;
- не использовали `builtAt` как content identity;
- не скрывали ухудшающие structural offers: ловушки остаются частью экономики, но каждая карточка честно показывает полный score impact;
- не копировали group-based Chemistry только ради формального parity.

## Проверки

Финальная матрица после Chemistry/UX-итерации:

- real production data: `262 passed`, `3 golden skipped`;
- generated mock: `262 passed`, `3 skipped`;
- golden fixtures: `3 passed`;
- Playwright desktop + mobile: `44 passed`;
- JSON Schema validation: зелёная;
- TypeScript `tsc --noEmit`: зелёный;
- Vite production build: зелёный;
- Go `gofmt`, `go vet`, `go build`: зелёные;
- desktop визуальная проверка: зелёная;
- mobile 390 px: без horizontal overflow;
- Camp reload/resume: зелёный;
- antipattern scan: только существующие `console.log` в dev-плагине `vite-plugin-game-log.ts`.

## Карта основных файлов

### Уже закоммиченный save fix

- `schema/manifest.schema.json`
- `pipeline/internal/emit/*`
- `web/scripts/gen_mock.mjs`
- `web/src/state/runPersist.ts`
- `web/src/state/runStore.ts`
- `.claude/skills/data-contract/SKILL.md`
- commit `f94ca36`

### Продолжение, подготовленное в этом срезе

- `web/src/game/anteMarket.ts`
- `web/src/game/anteEconomy.ts`
- `web/src/game/engine.ts`
- `web/src/state/runStore.ts`
- `web/src/features/run/CampScreen.tsx`
- `web/src/features/run/camp.css`
- `web/src/features/draft/Pentagon.tsx`
- `web/src/game/score.ts`
- `web/src/i18n/core.ts`
- `schema/squadSynergy.schema.json`
- `pipeline/internal/{aggregate,model,rating}`
- `web/test/{anteMarket,engine,runPersist,score}.test.ts`
- `web/e2e/anteRun.spec.ts`
- `docs/{PRD,BACKLOG,reference-322-0}.md`
- `.claude/skills/scoring-model/SKILL.md`

## Зафиксированные шишки

1. **Volatile metadata не является content identity.**
   - `builtAt` годится для freshness/status.
   - save/replay compatibility требует deterministic content hash.

2. **Не складывать вложенные представления одного сигнала.**
   - пара + содержащая её тройка + четвёрка — повторный учёт;
   - hard cap может скрыть реальную разницу между решениями.

3. **Карточка решения обязана показывать сущность, а не только итог.**
   - игрок должен видеть `кого снимаем`, `кого берём`, их статы, героя и полный score impact.

4. **Мутация состава должна быть реальной и воспроизводимой.**
   - новый игрок = другой `accountId`;
   - reserve и active roster должны переживать action replay и resume.

5. **Reference parity не выше читаемого геймплея.**
   - измеренную формулу сохраняем как evidence;
   - плохое для нашего цикла поведение оформляем как intentional divergence.

6. **UI playtest проверяет причинность, не только красоту.**
   - после клика должны измениться radar, связи и breakdown;
   - «ничего не произошло» может быть формульным cap-багом, а не React/UI-багом.

## Что осталось после чата

- Незакоммиченный slice 3 + Chemistry v1.13.0 нужно оформить отдельным commit.
- При коммите сохранить принятую в репозитории атрибуцию Codex:

```text
Co-authored-by: Codex <noreply@openai.com>
```

- Push сам по себе не равен deploy: после push нужно дождаться CI и отдельно проверить live.
- Следующий продуктовый слой по BACKLOG остаётся прежним: hero rarity/upgrade/meta unlocks — отдельный slice 3b; Tactics — slice 4.
