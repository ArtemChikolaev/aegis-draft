# Аудит 2026-08-11 — 322-0: свежесть референса + живой проход Esports Manager

## Паспорт

- Дата: 2026-08-11
- Наша версия / commit: `b478260` (main, clean)
- Референс и URL/версия: https://322-0.app, бандл `assets/index-BCFh8CR5.js`
- Scope: (1) проверить, не обновился ли референс со снимка 2026-07-16; (2) живой проход Esports Manager (beta) — единственный крупный кусок референса, не начатый у нас (T5.5 ⬜); цель — список «что ещё реализовать», деплой вне scope
- Конфиг / seed / viewport: EM · org «Parity Audit» · WEU · Normal ($100k/mo) · desktop 1280×720; EM недетерминирован снаружи (seed не вводится)
- Проверки и команды: браузерный проход referенса (клики через JS — панель скрыта, computer-скролл таймаутится, известная шишка); наша сторона — grep `web/src` (manual allocation, mode shell), `docs/BACKLOG.md`, `docs/reference-322-0.md`

## Матрица

| Сценарий / capability | Референс: наблюдение | Aegis Draft: наблюдение | Статус | Evidence | Решение / задача |
|---|---|---|---|---|---|
| Свежесть референса | Бандл `index-BCFh8CR5.js` — **тот же, что в снимке 2026-07-16**; новых фич в Classic нет | `docs/reference-322-0.md` актуален | parity | `document.scripts` на живом сайте, 2026-08-11 | Модель референса не переснимать |
| Classic: Peak Rating | По-прежнему `SOON` (disabled) | Peak сделан и откачен (под Real Tournament), memory `career-hero-lifetime-not-pit` | intentional-divergence | Стартовый экран референса | Ничего не делать |
| Classic: manual allocation | Работает | Работает: `game/engine.ts` (`manual`, swap), опция в `StartScreen` | parity | grep `engine.ts:57,150-170` | Отметить в T3.10/MREF при следующей ревизии |
| EM: режим целиком | Полный цикл (ниже) | Только карточка режима + превью «Скоро» (T5.4); T5.5 ⬜ | missing (P2, продуктово запланировано) | Проход ниже | T5.5; этот аудит = живой материал к нему |
| EM: онбординг | Org name (свободный ввод) · регион 6 шт (WEU/EEU/NA/SA/SEA/CN) · сложность = месячный доход $120k/$100k/$80k · предупреждение про wipe beta-сейва | нет | missing | Стартовый экран EM | В T5.5 (3 региона минимум по DoD — у референса 6) |
| EM: мета-прогресс | Aghanim's Shards зарабатываются на TI → перки на старте орга; Shard Shop; Hall of Legends (рекорды) | нет (наш мета-гейт — careerStore для редкости, другая система) | missing | «ACTIVE PERKS · 0 SHARDS», кнопки на старте | T5.5+; не копировать слепо — у нас Stakes/мутаторы (T6.4) |
| EM: tryouts | 8 пиков по 5 карточек (реролл 1, апгрейдится) из **реальных игроков** (Yatoro, SumaiL…) с ролью, IMP/ECO/REL/OVR и **скрытой зарплатой** ($-бендами $..$$$$): «pick on potential» | нет | missing | Проход pick 1→8 | T5.5 |
| EM: hero pool draft | 4 раунда × выбрать 3 из 6 → пул 12 героев орга | нет | missing | «HERO POOL 1/4 — PICK 3 (0/12)» | T5.5 |
| EM: contract negotiation | Зарплаты раскрываются ПОСЛЕ драфта; таблица 13 кандидатов = 8 задрафченных + 5 дешёвых «filler» (низкий OVR, $8–12k) | нет | missing | Таблица «Salaries are now revealed» | T5.5; fillers = защита от несобираемого ростера (наш `academy`-эффект «пол OVR филлера» из констант это подтверждает) |
| EM: select five | 1C/1M/1O/2S, сумма зарплат против дохода, живой счётчик `+$5k/mo`; за бюджет выйти можно только в минус net | нет | missing | «Picked 5/5 · Salaries $95k / income $100k» | T5.5 (DoD «невозможно выйти за бюджет» — у референса мягче: минусовой net разрешён, штрафы `Sd`) |
| EM: hero allocation | Тот же счёт Base + Hero Synergy + Chemistry, что Classic; герой = карточка одного игрока, «draft a hero twice…» — дубликаты допустимы | Счёт есть (Classic/roguelite), EM-обвязки нет | parity (ядро) / missing (обвязка) | Экран «HERO ALLOCATION», числа 73/+3.1/+0.1→76 | Ядро реюзается — не форкать |
| EM: сезонный дашборд | Bank / Net-per-month / Shards · NEXT UP-карточка · ростер с fame ☆, happiness ♥♥♥♥♡, зарплатой, `G/WR/S on team` · World Ranking (ELO, старт 1100, боты 1250–1320, «we sit #64») · Season Feed · Season Outline | нет | missing | Дашборд после «Start the Season» | T5.5 |
| EM: структура сезона | 5 циклов (2×tier2 + Open Qualifier → Online → LAN; неквал = O/L прочёркиваются) + TI Quals (июль) + TI (август); месяц тикает по событиям | нет | missing | Season Outline + «Did not qualify» → `O –, L –` | T5.5; гейт квалификаций — главный смысловой ход сезона |
| EM: розыгрыш события | Мгновенный (без live-reveal): место, приз по таблице призовых, ELO ±, чемпион, таблица | Наш reveal богаче (Classic/roguelite) | intentional-divergence | «5th OF 8 · $4k · 1096 (−4)» | Для EM быстрый исход — правильный темп; наш reveal переиспользовать точечно |
| EM: rival-система | «Placed above our rival — +$25k» после события | нет | missing | Экран результата первого события | T5.5 (мелкая, но живая деталь) |
| EM: random events | Между событиями модалки: «Sponsor Windfall» (+$), «Fan Meet-up» (happiness/fame ростеру, ☆→½ у игрока) | нет | missing | Модалки «RANDOM EVENT» в проходе | T5.5; у нас аналога нет нигде |
| EM: player inspector | Карточка игрока: career hero combos (tier 1–2, games+WR) + **живой fetch datdota** «Heroes at <событие>» | Инспектор в Classic есть (career+event из статики); live-fetch нет | intentional-divergence | «HEROES AT FISSURE UNIVERSE E6 loading…» | Live-fetch не берём — static-first (наш контракт) |
| EM: окна ростера в сезоне | За 3 цикла (Sep→Jan) НИ ОДНОГО окна трансферов/апгрейдов не встречено; апгрейды (`sponsorship`… из констант) в сезоне не всплывали → вероятно offseason/post-TI | нет | unknown | Проход остановлен в Jan S1, до TI не доигран | Дожать при проектировании T5.5: где живут апгрейды и составные окна |

## Приоритеты

- P0: нет.
- P1: нет (ничего из заявленного у нас не сломано; расхождений в реализованных механиках не найдено).
- P2 (продуктовые gaps, всё внутри уже заведённого T5.5): онбординг орга, tryouts со скрытыми зарплатами + fillers, hero-pool драфт, салари-кап отбор, сезон 5 циклов с гейтом квалификаций, ELO world ranking, rival, random events, fame/happiness UI, шард-мета.

## Синхронизация

- PRD: без правок — §5.9.1/§ modes-scenarios уже фиксируют EM как отдельный цикл; новых продуктовых решений не принято (аудит собрал материал, решения — на этапе спеки T5.5).
- BACKLOG: T5.5 — добавлена ссылка на этот аудит как источник живого флоу.
- Skill / rule: без правок (шишка «панель скрыта → клики через JS» уже в памяти `qa-playthrough-headless-playwright`).
- Исправлено сейчас: ничего (дефектов нет).
- Отложено и почему: весь EM — за T5.5 (deps T5.2/T5.4 и открытые решения M-A…M-D в modes-scenarios); окна ростера/апгрейды в сезоне — `unknown`, дожать при спеке.

## Повторная проверка

- [x] воспроизведение больше не падает — n/a, дефектов нет;
- [x] чистая логика / unit tests — код не менялся;
- [x] UI golden path — код не менялся;
- [x] typecheck/build — код не менялся;
- [x] документы не противоречат реализации (T5.5 остаётся ⬜, ссылка добавлена).
