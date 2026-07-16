# Референс 322-0 — замеренная модель

Снято **2026-07-16** с живого https://322-0.app (бандл `assets/index-BCFh8CR5.js`, 400 КБ + публичная статика `/data/*.json`, 703 пака / 44 события).

Это не пересказ и не догадки: числа ниже либо взяты из их кода дословно, либо выведены из их данных с указанием способа. Файл нужен, чтобы **не переоткрывать это заново** — половина сессии 2026-07-16 ушла на подбор формул по скриншотам, хотя они лежали в бандле готовыми.

Как добывать — [[reference-322-0-extraction]] в памяти; наши решения по итогам — комментарии `ModelVersion` в [rating.go](../pipeline/internal/rating/rating.go); сверка — `node .claude/skills/scoring-model/tools/calibrate_ovr.mjs`.

## Правило добычи

| Что | Где живёт | Как получать |
|---|---|---|
| Hero Synergy, Chemistry, пороги, симуляция турнира, Esports Manager | **клиентский бандл** | дословно, `grep` по бандлу |
| `ovr` / `impact` / `economy` / `reliability` | их закрытый пайплайн | **только вывод** из поведения `packs.json` |

Клиент `ovr` лишь читает (`ovr:a.ovr`) — формулы Base в бандле **нет**. Не ищи.

---

## Classic

### Настройки

```js
дефолт: {mode:"classic", format:"valve_legacy", rerolls:1, scoring:"event", heroAlloc:"auto"}

format:     valve_legacy "Every International and Valve Major"
            standard     "Events from the last ~2 years"
difficulty: Hard 0 rerolls · Easy 1 · Smurfing 2
scoring:    event "rated by their form at that event"   (enabled)
            peak  "career-best form"                    (enabled:false — «SOON»)
heroAlloc:  auto "Each hero is matched to the player who fits it best" · manual
```

Пак = 5 игроков + 5 героев. `valve_legacy` у них — 19 событий, 2011–2025.

### Hero Synergy — дословно

```js
mk = 1.5
vk(e) = e > 0 ? Math.min(1, e/25) : 0
c = Math.round( i.reduce((y,m) => y + vk(m.games), 0) * mk * 10 ) / 10
```

То есть **`Σ 1.5·min(1, games/25)`, максимум ровно 7.5**. Линейный рост до жёсткого потолка на 25 играх — не гипербола. Гипербола их числа не описывает в принципе: перебор `M·g/(g+h)` даёт ошибку 0.5 против 0.04 у линейной, потому что точка «14 игр → заметно ниже максимума» и «30 игр → уже максимум» для гладкой кривой несовместимы.

Сверка на роллах: `[145,101,57,56,14] → 6.8` · `[93,89,67,63,46] → 7.5` · `[109,95,82,46,30] → 7.5` · `[143,107,85,56,41] → 7.5`.

Смысл: ~25 игр на герое = потолок, 300-игровой герой ничем не лучше ⇒ виабельны десятки героев.

### Chemistry — дословно

```js
pk = 230, hk = 4, xk = 13, gk = {2:1, 3:1.6, 4:2.2, 5:3}
Md(e) = Math.min(hk, e/pk)                                  // = min(4, games/230)
for (const y of p) x += (gk[y.ids.length] ?? 1) * Md(y.games);
x = Math.min(x, xk);
```

Считается **по группам 2–5, не по парам**: `p` = все группы `squadSynergy`, целиком лежащие внутри ростера. Множитель по размеру группы. Итог зажат потолком 13.

**Ни current/former-множителей, ни baseline за «в одном ростере» — таких понятий у них нет.**

Сверка: `350 игр → 1.5` · `823 → 3.6` · `267 → 1.2` · `271 → 1.2` — совпадает на всех четырёх.

Их `squadSynergy.json`: 3865 записей — 2859 пар, 701 тройка, 262 четвёрки, **43 пятёрки**; медиана 255 совместных игр, max 1884.

### Пороги подписей — дословно

```js
No(e.base,      88, 94)    // BASE:         GREAT ≥ 88,  INSANE ≥ 94
No(e.heroBonus, 4.5, 6.5)  // HERO SYNERGY: GREAT ≥ 4.5, INSANE ≥ 6.5
No(e.chemBonus, 5, 9)      // CHEMISTRY:    GREAT ≥ 5,   INSANE ≥ 9
```

`No(e,t,n) = e>=n ? "Insane!" : e>=t ? "Great" : null`. Ролл с синергией 6.8 подписан INSANE — то есть порог именно 6.5, а не 7.

---

## Симуляция турнира

### Поле — дословно

```js
i1(e,t,n) = t + n*Math.sqrt(-2*Math.log(e()))*Math.cos(2*Math.PI*e())   // Box-Muller
strength  = Math.round(Math.min(99, Math.max(76, i1(r, 86, 5))))
```

**17 ботов ~ Normal(mean=86, sd=5), клампится в [76, 99]**, плюс игрок = 18 команд.

### Вероятность победы — дословно

```js
l1 = 22
ch(a,b) = 1 / (1 + Math.pow(10, -(a.strength - b.strength)/l1))
```

ELO по **основанию 10** с делителем 22. Эквивалентный натуральный делитель — `22/ln10 = 9.55`.

### Сетка

```js
r.forEach((I,G) => { const Re = G%4===0 || G%4===3 ? "A" : "B"; ... })
```

Команды сортируются по силе и разводятся по двум группам **змейкой** (1-4-5-8 → A, 2-3-6-7 → B), не случайным шафлом. Серия: `Math.ceil(bestOf/2)` побед.

### Имена ботов

Префиксы (24): `Mid or, Feeding, Smurfing, Tilted, Roshan's, Divine, Salty, Boosted, Eternal, 322, Throwback, Glorious, Hard, GG, Courier, Megacreep, Aegis, Rampage, Disconnected, Tinker, Naga, Brood, Last Hit, Smoke`

Существительные (23): `Andromedas, Disasters, Rejects, Believers, Throwers, Snipers, Goblins, Wisps, Creeps, Couriers, Bots, Tinkerers, Pugs, Stacks, Gankers, Roamers, Wards, Rats, Demons, Dragons, Pandas, Spirits, Penguins`

Спец-имена (16): `No Tinker, No Techies, No Meepo, No Pudge, No Riki, No Invoker, No Earthshaker, No Spectre, No Bristleback, Nyx Sideways, QOP Backwards, SF Upside Down, AM Jungle, Void Diagonal, WK Roaming, OD Bench`

Логика: **4–8 спец-имён гарантированно** (`s = 4 + floor(rnd*5)`), остальные — `префикс + существительное`.

---

## Base / OVR — выведено из данных, не из кода

Формулы в бандле нет. Замеры по `packs.json` (703 пака, 3516 игроков):

```
корреляция(placement, team base) = −0.858
  место 1 → 85.6   место 4 → 80.6   место 9  → 71.7
  место 2 → 82.9   место 5 → 77.8   место 13 → 68.1
  место 3 → 82.9   место 7 → 76.0
```

**Доля «командного» в дисперсии OVR игрока: 92%** (индивидуального — 8%). Разброс OVR внутри команды — **2.0** при общем sd 7.8, тогда как компоненты внутри команды гуляют на 3.8–6.4.

Доказательство, что командный член отдельный: `|взвеш.сумма(IMP,ECO,REL) − OVR|` = **3.1 в среднем, до 21.7**. У чисто индивидуальной модели было бы ~0 (у нас до фикса — 0.3, то есть чистое округление).

### Распределение OVR

**Нормальное**: skew 0.05, kurtosis −0.69, квантили совпадают с `N(74.1, 7.8)` в пределах 2.3.

```
        min  p05  p25  p50  p75  p90  p99  max   mean   sd
player   55   62   68   74   80   84   91   98   74.1  7.8
base   56.8   62 68.2 74.4   80 84.2 88.6 94.2  74.1  7.5
```

Максимум стоит в **3.05σ** от среднего — для нормальной выборки из 3516 ожидается 3.63σ, то есть согласуется. Ничего экзотического в их хвосте нет.

### Компоненты

```
             min  max  mean    sd
impact        50  100  75.0   9.0
economy       50  100  75.0  10.1
reliability   50  100  73.4   7.8
```

Ровно `min=50`, `max=100`, `mean=75.0` ⇒ полоса **50..100 = 50 + ранг/2**. Компоненты живут **отдельно** от шкалы OVR.

### Потолок черри-пика

Лучший по каждой роли во всём пуле: `97/96/96/98/95` → base **96.4** → Team OVR **~105.4**. Игроки собирают 102 (подтверждено скриншотом).

### Пул

44 события: 14 TI + 5 major + 25 обычных tier-1. **Престижа у TI нет**: TI med=74 mean=74.3, non-TI med=74 mean=74.0 — совпадают, у non-TI максимум даже выше (98 против 95). Возможность дать TI буст у них была, и они ей не воспользовались.

---

## Esports Manager (beta)

### Старт

```js
roster: [Carry 84, Mid 82, Off 80, Sup 78, Hard Sup 76]   // salary 2e4, fame 4, happiness 70
cash: 1e6
heroPool: [101, 102, 103]
month: 1, window: "cycle-start"
```

### Фазы сезона

```js
["cycle-start", "pre-lan", "post-tournament", "pre-ti", "post-ti", "offseason"]
```

### Призовые по типам турниров (USD)

```js
online: [85, 50, 28, 18, 10, 10, 5, 5]                                    ×1000
tier2:  [28, 17, 10, 6, 3.5, 3.5, 2, 2]                                   ×1000
lan:    [280, 140, 85, 55, 35, 35, 18, 18, 9, 9, 9, 9]                    ×1000
ti:     [850, 420, 250, 155, 90, 90, 55, 55, 28, 28, 28, 28, 14, 14, 14, 14, 0, 0]  ×1000
```

### Fame

```js
tiTitle: 2, lanTitle: 1, onlineTitle: 0.5, tier2Title: 0.25, tiTop4: 0.5
noTop8Season: −0.5, seasonDecay: −0.5, starDivisor: 2, max: 10
```

### Happiness

```js
start: 70, title: +8, eventTop3: +3, lanBottom: −4, missTi: −6
unhappyThreshold: 30, min: 0, max: 100
```

### Жизненный цикл игрока

```js
retireBase: 0.02, retireVeteranBonus: 0.03, retireUnhappyBonus: 0.05
veteranSeasons: 3, leaveChance: 0.35, fameBumpPerStar: 0.04
driftMin: −3, driftMax: +3, driftHappyBias: +1, driftSadBias: −1
ovrMin: 55, ovrMax: 99, freeHeroRerolls: 2
```

### Апгрейды

Стоимости `da = [10, 20, 40, 80, 120]` (по уровням), эффекты `Pr = {sponsorshipPerLevel: 6e3, negotiatorPerLevel: 0.02, academyPerLevel: 1, fameAgencyBonus: 1}`.

| id | Эффект | Стоимость |
|---|---|---|
| `sponsorship` | +$6k дохода в месяц за уровень | 10/20/40/80/120 |
| `scouting` | +1 реролл трайаутов за сезон за уровень | 10/20/40/80/120 |
| `negotiator` | −2% ко всем зарплатам за уровень | 10/20/40/80/120 |
| `academy` | пол OVR дешёвого филлера +1 за уровень | 10/20/40/80/120 |
| `deeperPool` | пул героев 12 → 14 | 40 |
| `fameAgency` | новые подписания стартуют с +0.5★ fame | 40 |
| `insurance` | первый штраф за минусовой баланс за сезон прощается | 60 |
| `extraPick` | трайауты: 8 → 9 пиков | 60 |
| `sixthMan` / `coach` / `analyst` | «Coming soon» | 60/80/80 |

### Прочее

```js
Sd = {happinessPenalty: −6, famePenalty: −0.25}
$  = {visaSubFee: 1e4, visaBenchOvr: −6, visaBenchHappiness: −10, ...}
```

---

## Где мы разошлись (на 2026-07-16, после v1.10.0)

Сошлось: шкала и все квантили OVR, хвост, доля команды (92%), внутрикомандный разброс (2.0), потолок черри-пика (105.4 = 105.4), Hero Synergy, Chemistry, группы 2–5, пороги, valve_legacy.

Осталось:

| Что | У нас | У них | Статус |
|---|---|---|---|
| Компоненты внутри команды | impact 4.9, rel 4.3 | 3.8, 5.5 | на OVR не влияет — OVR собирается в z из командного и индивидуального члена, а не из компонент |
| Placement | нет (Liquipedia недоступна) | есть в данных | прокси — winrate на событии, `teamZ` |

Симуляция турнира приведена к их параметрам **2026-07-16** ([tournament.ts](../web/src/game/tournament.ts), тесты в `web/test/tournament.test.ts`). Что было до этого и почему меняли:

| Что | Было у нас | Стало (322-0) | Замер |
|---|---|---|---|
| Поле ботов | кусочная лестница | `round(clamp(76, 99, N(86, 5)))` | было mean 83.8 / sd 5.2 против их 86.0 / 4.9 — поле мягче на 2 очка и ступенчатое |
| Вероятность победы | `1/(1+e^(Δ/12))` | `1/(1+10^(−Δ/22))` | при перевесе 10 очков фаворит брал 70% вместо 74%; наш делитель эквивалентен 27.6 по базе 10 против их 22 |
| Развод по группам | случайный шафл | змейка 1-4-5-8 по силе | на 20k роллов перекос силы между группами был 1.82 в среднем и **до 9.3** в худших — одна группа смертельная, другая прогулка. Змейка держит 0.39 (худший 1.8) |
