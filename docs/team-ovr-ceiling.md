# Team OVR — абсолютный потолок и как его достичь

Исследование на текущем датасете (`ratingModelVersion` v1.12.0, mock data).  
Метод: перебор всех валидных пятёрок (по одному игроку на роль) среди топ-/боттом-кандидатов пула + `scoreTeam` с оптимальным назначением героев; сиды проверялись через `RunEngine`.

## Короткий ответ

| Вопрос | Ответ |
|--------|-------|
| Можно ли выше **116.90**? | **Нет.** Это потолок на формате **Last 5 years**. |
| Потолок на **Last 2 years** (как на скрине настроек)? | **113.10** — другой пул, absmax-ростер недоступен. |
| Минимум (last_5y) | **~58.9** (перебор среди худших ~12 игроков на роль → 58.88) |
| Минимум (last_2y) | **~59.2** (перебор среди худших 8 на роль) |
| 116.90 за ≤100 рероллов? | **Да**, seed `hbfcp4o79` — **91** суммарный реролл при оптимальной стратегии (см. ниже). |

---

## Абсолютный максимум: 116.90

### Настройки (обязательно)

| Параметр | Значение |
|----------|----------|
| Mode | **Team packs** |
| Time Pool | **Last 5 years** ← не Last 2 years! |
| Difficulty | **Easy** (безлимитные рероллы) |
| Rating Model | **Event rating** |
| Hero Allocation | **Automatic** |
| Hardcore | **Off** |

### Идеальная пятёрка

| Роль | Игрок | OVR | Команда / событие |
|------|-------|-----|-------------------|
| Safelane | skiter | 96 | Tundra @ ESL One Fall 2021 (`league-13404`) |
| Mid | drown | 99 | Tundra @ ESL One Fall 2021 |
| Offlane | 33 | 96 | Tundra @ ESL One Fall 2021 |
| Support | Saksa | 96 | Tundra (`league-14268`) |
| Support | Save- | 95 | BB Team (`league-15475`) |

### Идеальные герои

| Игрок | Герой |
|-------|-------|
| skiter | Sven |
| drown | Pangolier |
| 33 | Doom |
| Saksa | Tusk |
| Save- | Muerta |

### Разбивка счёта

```
Base         96.4   (средний event-OVR пятёрки)
Hero Synergy  7.5   (максимум: 5 × 1.5 при 25+ pro-играх на героя)
Chemistry    13.0   (потолок SCORING.chemTotalMax)
─────────────────
Team OVR    116.9   (отображается как 116.90)
```

Почему не выше: у drown (99 OVR) и остальных уже максимальные синергии; chemistry упирается в потолок 13; base выше не поднять — нет другой валидной пятёрки с лучшей суммой OVR + химии.

---

## Потолок на Last 2 years: 113.10

Если оставить **Last 2 years**, absmax-игроки (Tundra 2021, BB Team 2024 и т.д.) **выпадают из пула**.  
Лучшая найденная пятёрка:

| Роль | Игрок | OVR | Событие |
|------|-------|-----|---------|
| Safelane | Satanic | 95 | TEAM VISION (`league-18111`) |
| Mid | No[o]ne- | 94 | Cloud9 (`league-16881`) |
| Offlane | MieRo | 91 | BoomBoys (`league-19543`) |
| Support | Save- | 92 | BoomBoys (`league-19543`) |
| Support | Kataomi\` | 91 | Cloud9 (`league-16881`) |

Герои: Terrorblade, Storm Spirit, Beastmaster, Muerta, Tusk → base 92.6 + syn 7.5 + chem 13 = **113.10**.

---

## Минимально возможный Team OVR

Минимум — не «5 самых слабых по роли по отдельности», а худшая **комбинация** с учётом двух саппортов и синергий.

| Формат | Team OVR | Пример пятёрки (OVR) |
|--------|----------|----------------------|
| last_5y | **~58.9** | NPC:54 · Leostyle^^!:54 · overplay:55 · Wu:55 · Panda:55 (и близкие комбинации) |
| last_2y | **~59.2** | jikroy:56 · All over again:58 · XD:58 · Varizh:58 · Se:58 |

Точное значение по всему пулу (~10⁹ комбинаций) не перебиралось; оценка стабилизируется на ~58.9 для last_5y при расширении окна снизу с 8 до 12 игроков на роль.

---

## Как воспроизвести 116.90

### Вариант A — seed за ≤100 рероллов (рекомендуется)

**Seed:** `hbfcp4o79`

**Run code** (вставить в поле Seed на экране настроек):

```
eyJ2IjoxLCJzIjoxLCJyIjoidjEuMTIuMCIsIm0iOiJjbGFzc2ljIiwiZCI6InRlYW0iLCJmIjoibGFzdF81eSIsIm4iOi0xLCJjIjoiZXZlbnQiLCJhIjoiYXV0byIsInNlZWQiOiJoYmZjcDRvNzkifQ
```

**Ссылка:**

```
https://artemchikolaev.github.io/aegis-draft/#/run=eyJ2IjoxLCJzIjoxLCJyIjoidjEuMTIuMCIsIm0iOiJjbGFzc2ljIiwiZCI6InRlYW0iLCJmIjoibGFzdF81eSIsIm4iOi0xLCJjIjoiZXZlbnQiLCJhIjoiYXV0byIsInNlZWQiOiJoYmZjcDRvNzkifQ
```

**План действий по шагам для seed `hbfcp4o79` (ровно 91 реролл):**

1. Hero: сделать **5** рероллов, взять **Void Spirit**.
2. Hero: без реролла взять **Clockwerk**.
3. Hero: без реролла взять **Dragon Knight**.
4. Hero: без реролла взять **Rubick**.
5. Hero: сделать **4** реролла, взять **Bristleback**.
6. Player: сделать **16** рероллов, взять **Saksa** (support 96, `league-14268`).
7. Player: сделать **3** реролла, взять **33** (offlane 96, `league-13404`).
8. Player: сделать **23** реролла, взять **drown** (mid 99, `league-13404`).
9. Player: сделать **35** рероллов, взять **Save-** (support 95, `league-15475`).
10. Player: сделать **5** рероллов, взять **skiter** (safelane 96, `league-13404`).

Проверка суммы: герои **9** (5+0+0+0+4), игроки **82** (16+3+23+35+5), всего **91**.

Примечание: здесь важен не «идеальный» фиксированный набор из Sven/Pango/Doom/Tusk/Muerta, а то, что `Auto`-назначение находит максимум синергии внутри уже выбранного пула героев. Для этого seed шаги выше воспроизводят 116.90 стабильно.

> Если играть «как попало» (игроки раньше героев), тот же seed может потребовать **2000+** рероллов. Для бюджета ≤100 важен порядок: **герои → игроки**.

### Вариант B — любой seed с Easy (без лимита рероллов)

При тех же настройках и **last_5y** почти любой seed достижим с бесконечными рероллами.  
Пример с относительно небольшим счётчиком рероллов:

| Seed | Суммарные рероллы |
|------|-------------------|
| `absmax-wxhwpe-9n` | 438 |
| `absmax-1shbyv1-2i` | 543 |
| `absmax-snjsn-8` | 930 |

Run code для `absmax-wxhwpe-9n`:

```
eyJ2IjoxLCJzIjoxLCJyIjoidjEuMTIuMCIsIm0iOiJjbGFzc2ljIiwiZCI6InRlYW0iLCJmIjoibGFzdF81eSIsIm4iOi0xLCJjIjoiZXZlbnQiLCJhIjoiYXV0byIsInNlZWQiOiJhYnNtYXgtd3hod3BlLTluIn0
```

Стратегия та же: целевые герои и игроки, реролл до появления.

---

## Частые ошибки

1. **Last 2 years вместо Last 5 years** — потолок 113.10, не 116.90.
2. **Hardcore On** — не влияет на OVR, но меняет UX; для воспроизведения не нужен.
3. **Mixed draft** — другая механика и другой потолок (team-success base).
4. **Рероллы до игроков** — резко увеличивает нужное число рероллов на том же seed.

---

## Методология (для будущих проверок)

После обновления данных (`gen:mock` / ETL) перепроверить:

1. **Потолок** — перебор top-12 игроков на роль в `poolForFormat(packs, events, "last_5y")` + `scoreTeam`.
2. **Сиды** — симуляция `RunEngine` с целевой пятёркой/героями и подсчёт рероллов.
3. При смене `ratingModelVersion` — бамп версии и повтор замера.

Экспериментальные скрипты поиска сидов (`find_*_seed.mjs`) удалены; логика воспроизводима по этому документу.
