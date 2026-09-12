// Коэффициенты Arcade. Своя версия: другая PvE-модель, BALANCE_CONFIG_VERSION Roguelite Run не
// трогаем (PRD §5.15). Менял числа здесь или в content/ — бампни ARCADE_CONFIG_VERSION: она
// пишется в запись истории забега, чтобы результаты разных калибровок не смешивались.
export const ARCADE_CONFIG_VERSION = "a0.66.0";

/** Dev-режим владельца (`make dev-all`, только в браузере): в лавке всё стоит 0 — иначе не посмотреть, что
 *  реализовано, не отыграв забег (просьба 2026-09-06). Бот калибровки (tsx) и vitest (node, без window)
 *  сюда не попадают, поэтому баланс и golden-тесты не меняются. */
// `typeof window` проверяем ПЕРВЫМ: под tsx (бот калибровки) и в node-окружении vitest `import.meta.env`
// не существует, и обращение к нему падало бы на импорте модуля.
export const DEV_FREE_SHOP = typeof window !== "undefined" && import.meta.env?.DEV === true;

export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;
export const sec = (s: number): number => Math.round(s * TICK_HZ);

export const ARCADE = {
  world: { w: 3200, h: 3200 },
  /** Акты (PRD §5.15). `short` — разминка среза 0: Рошан на 7:00, победа — дожить до 9:00 с убитым
   *  Рошаном. `full` — как у референса: Рошан на 7:00 и 14:00, Tormentor на 10:30, на 20:00 —
   *  Древний под мегакрипами, две минуты до эскалации; победа — снести Древнего. */
  acts: {
    short: { roshanAt: [sec(7 * 60)], tormentorAt: -1, ancientAt: -1, ancientDeadline: -1, endAt: sec(9 * 60) },
    full: { roshanAt: [sec(7 * 60), sec(14 * 60)], tormentorAt: sec(10.5 * 60), ancientAt: sec(20 * 60), ancientDeadline: sec(22 * 60), endAt: -1 },
    dire: { roshanAt: [sec(7 * 60), sec(14 * 60)], tormentorAt: sec(10.5 * 60), ancientAt: sec(20 * 60), ancientDeadline: sec(22 * 60), endAt: -1, night: true, hpMult: 1.15, speedMult: 1.06 },
    river: { roshanAt: [sec(7 * 60), sec(14 * 60)], tormentorAt: sec(10.5 * 60), ancientAt: sec(20 * 60), ancientDeadline: sec(22 * 60), endAt: -1, hpMult: 1.3, speedMult: 1.08, pit: true },
  } as Record<string, { roshanAt: number[]; tormentorAt: number; ancientAt: number; ancientDeadline: number; endAt: number; night?: boolean; hpMult?: number; speedMult?: number; pit?: boolean }>,
  /** Акт 3: река — полоса поперёк карты, где появляются руны; яма Рошана — круг в центре, босс
   *  привязан к ней (leash) и регенерирует, пока ты снаружи; спавн в это время не глушится. */
  river: { y: 1600, halfWidth: 150 },
  /** Прилив (T13.61, только River): по часам акта с `firstAt` цикл «подъём warnSec → прилив highSec → отлив lowSec».
   *  В прилив русло шире в `halfWidthMult`, в воде герой и рядовые враги медленнее на `slow` (управление остаётся);
   *  полоса ±`safeHalfW` у брода и яма — всегда сухие: безопасный путь есть в любую фазу. Числа стартовые. */
  tide: { firstAt: sec(60), lowSec: 60, warnSec: 6, highSec: 30, halfWidthMult: 1.7, slow: 0.35, safeHalfW: 70 },
  pit: { x: 1600, y: 1600, radius: 260, leash: 420, regenPerSec: 0.004 },
  /** Ночь (акт 2): радиус обзора вокруг героя; дальше — туман, враги не видны (но идут). */
  night: { visibility: 440 },
  /** Пока Рошан жив, обычные спавны стоят; после его смерти — интенсивность ×postRoshanRate. */
  postRoshanRate: 1.6,
  /** Второй Рошан сильнее первого (как респавн в Dota). */
  secondRoshan: { hpMult: 1.4, dmgMult: 1.25 },
  ancient: { megaEvery: sec(15), megaSize: 8, megaHpMult: 2, lateMult: 2, spawnMult: 1.3 },
  tormentor: { reflectCap: 30 },
  /** Яд (T13.39, аудит 2026-09-08): самостоятельный статус, не горение. До `maxStacks` стаков с ОБЩИМ
   *  обновляемым таймером; каждый тик (`tickEvery`) снимает `dps × стаки × tickShare`. Истёк — стаки сгорают. */
  poison: { maxStacks: 5, seconds: 4, tickEvery: 12, tickShare: 0.2 },
  /** Сатир-Осквернитель (T13.41): чемпион лагеря. Спит в центре, пока герой не войдёт; тотемы дают ему щит
   *  (`shieldPerTotem` за живой тотем — с тремя берёт лишь четверть урона), между парами живых тотемов раз в
   *  `lineEvery` тянется полоса порчи: пунктир-телеграф `lineTelegraph`, затем `lineActive` бьёт стоящего на ней.
   *  Паттерн «порыв» — как удар Рошана: телеграф → взрыв → окно восстановления для мили. Уходит за `leash` от
   *  лагеря — возвращается домой и лечится: отступить можно всегда. Контроль работает, но не дольше `ccCap`,
   *  после — `ccResist` иммунитета к повторному (аудит: не выключать контроль совсем). */
  defiler: {
    chaseFrom: 240, chaseSpeed: 138, galeRange: 110, galeTelegraph: sec(1.0), galeRadius: 96, galeDmg: 64, galeStun: 0.45, galeCooldown: sec(3.4), galeRecovery: sec(1.2),
    lineEvery: sec(5), lineTelegraph: sec(1.2), lineActive: sec(1.0), lineWidth: 34, lineDmgMult: 1.8, lineHitEvery: sec(0.6),
    shieldPerTotem: 0.25, leash: 260, regenPerSec: 0.02, ccCap: sec(0.5), ccResist: sec(3),
  },
  /** Аванпост / обзорная башня (T13.42, аудит: «удерживает область, накопив 20–30 с захвата; выход приостанавливает,
   *  не обнуляет; открывает ближайшие события; особенно полезна ночью»). Стоит по seed на другой стороне от лагеря.
   *  Пока герой в `radius`, копится захват до `captureSec`; захвачен — до конца акта маркеры всех активных точек
   *  (лавка, руны, сундук, токен, щедрость) у края экрана, ночью обзор × `nightVisionMult`, сразу золото
   *  bounty × `goldMult`. Спавн вокруг не меняется: держать область — значит держать её под давлением. */
  outpost: { distMin: 650, distMax: 950, minFromCamp: 700, radius: 120, captureSec: 25, goldMult: 2, nightVisionMult: 1.35 },
  /** Лотосовый пруд (T13.43, аудит: «восстановление HP или снятие одной порчи, одно использование на забег»).
   *  Стоит по seed на кольце от старта, подальше от лагеря и аванпоста. Активируется кнопкой подбора рядом. */
  pond: { distMin: 480, distMax: 820, minFromOthers: 450, radius: 48, healFrac: 0.5 },
  /** Порчи забега (T13.43): принимаются по кнопке, до принятия видны награда, штраф и способ снятия.
   *  Проклятый сундук — каждый сундук после первого с шансом `chestChance`, только пока пруд не использован
   *  (нельзя выдать порчу, которую нечем снять): добыча на `lootRarityUp` ступень редкости выше, принял (надел
   *  или в сумку) — «Увядание»: лечение и регенерация × `withering.healMult` до снятия у пруда. */
  curse: {
    chestChance: 0.5, lootRarityUp: 1, withering: { healMult: 0.35 },
    /** Долг лавочнику (T13.51): сумма = base + perMin × минута; доля всего дохода уходит в погашение, пока не выплачен. */
    debt: { base: 60, perMin: 12, share: 0.5 },
    /** Кровавая охота (T13.51): отмеченный чемпион (Кентавр или Некромант) покидает дом и преследует героя, пока не убит. */
    bloodhunt: { speedMult: 1.15 },
  },
  /** Модификаторы билда (T13.75, аудит 2026-09-12 §3). «Долг силы» — в лавке раз за акт: карта школы `debtRarity` сейчас,
   *  взамен порча «Долг лавочнику» на сумму по минуте. «Ритуал очищения» — у пруда: порча снимается и на `ritual.seconds`
   *  превращается в свойство билда: увядание → цветение (лечение/регенерация ×healMult), долг → милость лавочника
   *  (золото ×goldMult), кровавая охота → азарт (урон ×dmgMult). */
  /** Осада леса (T13.78): патруль — знаменосец + `escorts` охраны из пула минуты, первый на `firstAt`, дальше каждые `every`;
   *  знаменосец ходит между местами, охрана держится в `leash` от него, пока герой дальше `aggro`. Убит знаменосец —
   *  `weakSec` секунд лес и волны спавнятся ×`weakMult`, охрана деморализована (берёт +`escortAmp` урона `escortAmpSec` с). */
  siege: { firstAt: sec(60), every: sec(50), escorts: 4, leash: 90, aggro: 220, weakSec: 25, weakMult: 0.5, escortAmp: 0.5, escortAmpSec: 8, maxBearers: 3 },
  build: { debtRarity: "exotic" as const, ritual: { seconds: 180, healMult: 1.5, goldMult: 1.5, dmgMult: 1.1 } },
  /** Кентавр-Страж рощи (T13.45, этап 3 аудита): чемпион с рывком. Спит в роще (по seed, рядом с камнями), пока
   *  герой не войдёт в `wakeRadius` или не ударит. В `chargeRange` — телеграф `chargeTelegraph` (стрелка на позицию
   *  героя), затем рывок `chargeSpeed` на `chargeLen`: попал в героя — `chargeDmg`; врезался в камень — оглушён на
   *  `rockStun` и берёт ×`stunnedDmgMult` урона; добежал — «широкий удар» `slamRadius`/`slamDmg` после `slamTelegraph`.
   *  После — `recovery` окно. Поводок `leash` от рощи, сон/регенерация вне контакта; контроль как у Сатира. Награда:
   *  два предмета exotic на выбор — броня и сапоги (защита/мобильность). */
  centaur: {
    distMin: 600, distMax: 950, minFromOthers: 500, wakeRadius: 140, engageRadius: 420, leash: 260, regenPerSec: 0.02,
    chargeRange: 380, chargeTelegraph: sec(0.8), chargeSpeed: 540, chargeLen: 440, chargeDmg: 70, chargeHitRadius: 34,
    rockStun: sec(2.5), stunnedDmgMult: 1.5, slamTelegraph: sec(0.6), slamRadius: 130, slamDmg: 48, chargeCooldown: sec(4.5), recovery: sec(1.0),
    ccCap: sec(0.5), ccResist: sec(3),
  },
  /** Тролль-Некромант (T13.46, этап 3 аудита): чемпион-призыватель у кургана. Два костяных идола; пока хоть один стоит,
   *  раз в `raiseEvery` поднимает `raiseBase + idolsAlive` скелетов у случайного идола (не больше `maxRisen` живых).
   *  Сам держит дистанцию `keepMin..keepMax` и стреляет (`shot`). Идолы снесены — призыва нет, он уязвим (×`exposedDmgMult`).
   *  Спит/неуязвим до входа в `wakeRadius` (как Кентавр). Награда: три карты школы Зверинец редкости exotic
   *  («улучшение Beast»), если школа недоступна — обычные exotic. */
  necro: {
    distMin: 620, distMax: 960, minFromOthers: 500, wakeRadius: 160, engageRadius: 460, leash: 300, regenPerSec: 0.02,
    idols: 2, idolRing: 90, raiseEvery: sec(6), raiseBase: 2, maxRisen: 12, keepMin: 190, keepMax: 300, shot: { range: 340, every: 2.0, speed: 220, dmgMult: 1.4 },
    exposedDmgMult: 1.3, ccCap: sec(0.5), ccResist: sec(3),
  },
  /** Контракт охоты (T13.50, аудит: «выбирает одного из двух отмеченных чемпионов; награда заранее обозначена:
   *  оружие / защита / усиление школы; контракт можно пропустить»). Предлагается один раз за забег по расписанию
   *  акта, если живы хотя бы два чемпиона (Сатир лагеря, Кентавр, Некромант). Принятый — у цели постоянный
   *  маркер у края экрана; убил — награда сверх обычной. Пропуск без штрафа. */
  contract: { at: { short: sec(3 * 60 + 30), full: sec(8 * 60 + 30), dire: sec(8 * 60 + 30), river: sec(8 * 60 + 30) } as Record<string, number>,
    /** Клятва охотника (T13.72): пока цель жива — урон по обычной толпе ×trashMult, по цели ×targetMult; выполнил — +1 ранг умению. */
    oath: { trashMult: 0.85, targetMult: 1.4 } },
  /** Разлом (T13.58): одно место на акт по seed; открывается по расписанию акта. Игрок выбирает одно из двух
   *  правил и входит в испытание на `duration`: обычный мир втягивается в разлом (рядовые враги исчезают без
   *  награды), часы акта стоят, разлом сам зовёт волны из текущего пула с множителем `spawnMult`; выход за
   *  `arena` — провал без награды. Выжил — один апгрейд редкости `rewardRarity`. После любого исхода —
   *  `respite` без обычного спавна. Числа стартовые. */
  rift: { distMin: 520, distMax: 880, minFromOthers: 450, radius: 56, arena: 340, fromTick: { short: sec(2 * 60 + 15), full: sec(5 * 60), dire: sec(5 * 60), river: sec(5 * 60) } as Record<string, number>, duration: sec(50), respite: sec(8), spawnMult: 2.4, cap: 36, waveEvery: sec(10), waveSize: 5, rewardRarity: "arcana" as const,
    rules: { surge: { spawnMult: 1.5, speedMult: 1.2 }, brittle: { takenMult: 1.6, hpMult: 0.6 }, gloom: { visionMult: 0.55, dmgMult: 1.25 }, silence: { attackMult: 1.8 } } },
  /** Караван лавочника (T13.59): появляется по часам акта на `window`, ждёт героя; едет к цели только пока герой в
   *  `escortRadius`, в пути каждые `raidEvery` тиков зовёт налётчиков из текущего пула. Доехал — на месте цели
   *  встаёт лавка (обычный торговец на `shop.lifetime`) со скидкой `discount` на товары и реролл (владелец 2026-09-11).
   *  Полосы HP у каравана нет. Числа стартовые. */
  caravan: { at: { short: sec(4 * 60), full: sec(9 * 60), dire: sec(9 * 60), river: sec(9 * 60) } as Record<string, number>, window: sec(150), distMin: 420, distMax: 720, minFromOthers: 300, length: 520, speed: 62, escortRadius: 150, raidEvery: sec(6), raidSize: 3, raidRingMin: 220, raidRingMax: 300, discount: 0.7 },
  /** Io (владелец 2026-09-12): радиус шара духов и время полного оборота орбиты. */
  io: { orbR: 16, orbitSec: 3.5 },
  /** Приглашения у края экрана (T13.60): пока аванпост не захвачен, необязательных подсказок не больше `max`
   *  (порядок приоритета — в `ArcadeSim.invitations`); угрозы и выбранные цели показываются всегда. */
  invitations: { max: 2 },
  /** Древняя кузня (T13.52, аудит: «один раз выбирает: усилить аффикс, заменить аффикс или пожертвовать вещью ради
   *  другого слота; деньги получают назначение в поздней части акта; нельзя бесконечно перековывать один предмет»).
   *  Стоит по seed, остывает к `fromTick` акта (до этого не работает), одно использование на забег, цены растут с минутой. */
  forge: { distMin: 500, distMax: 850, minFromOthers: 450, radius: 52, fromTick: { short: sec(4 * 60 + 30), full: sec(12 * 60), dire: sec(12 * 60), river: sec(12 * 60) } as Record<string, number>, temper: { base: 40, perMin: 6 }, reforge: { base: 30, perMin: 5 }, sacrifice: { base: 20, perMin: 4 } },
  /** Гром-голем (T13.53, «Громозавр» аудита: «заряжает несколько отмеченных областей, затем цепь молний; читать порядок
   *  зон; безопасный сектор остаётся даже у стены; награда — гибрид молнии»). Логово по seed; спит до входа. В бою раз в
   *  `every` ставит `zones` зон вокруг героя на `zoneDist` в трёх из четырёх сторон (четвёртая — безопасный сектор), телеграф
   *  `telegraph`, затем удар `strikeDmg` по стоящим в зонах и на `active` тиков цепь молний между зонами (`chainDmg`,
   *  ширина `chainWidth`). Модель — голем (лист `golem`), у Dota нет модели громозавра в нашем наборе. */
  thunder: {
    distMin: 640, distMax: 980, minFromOthers: 500, wakeRadius: 170, engageRadius: 480, leash: 300, regenPerSec: 0.02,
    every: sec(6.5), zones: 3, zoneDist: 115, zoneRadius: 80, telegraph: sec(1.2), strikeDmg: 55, chainDmg: 42, chainWidth: 26, active: sec(0.6), chainHitEvery: sec(0.5),
    chaseFrom: 260, chaseSpeed: 118, ccCap: sec(0.5), ccResist: sec(3),
  },
  /** Страж переправы (T13.54, аудит: «попеременно перекрывает части моста щитами/волнами; перемещаться между
   *  островками, не пытаться пробить временный щит; награда — руническая»). Только акт River: брод в русле реки на
   *  `fordDx` от ямы. Спит до входа. В бою чередует фазы: `shieldSec` под щитом (урона не берёт), затем `openSec`
   *  открыт; каждые `waveEvery` пускает волну через русло — вертикальная полоса высотой в русло с «островком»
   *  (разрывом `gapH`) на случайной высоте, идёт `waveSpeed` px/с на `waveLen` px; попал под волну — `waveDmg`.
   *  Награда: руны DD/щита/магии на `runeSec` с и амулет exotic. */
  warden: {
    fordDx: [700, 1100] as [number, number], wakeRadius: 170, engageRadius: 460, leash: 260, regenPerSec: 0.02,
    shieldSec: 3, openSec: 4, waveEvery: sec(2.6), waveSpeed: 240, waveLen: 780, waveW: 22, gapH: 110, waveDmg: 38, waveHitEvery: sec(0.5),
    keepMin: 140, keepMax: 220, runeSec: 45, ccCap: sec(0.5), ccResist: sec(3),
  },
  /** Охотник Dire (T13.55, аудит: «отмечает будущую позицию атаки и готовит короткую засаду; следить за меткой и звуком;
   *  попадание нельзя получать из полной невидимости без предупреждения; награда — трофей охоты и выбор крит/защита»).
   *  Только акт Dire. Охотится в `huntRadius` от логова: скрыт (не цель, неуязвим), раз в `every` ставит метку там, куда
   *  герой придёт через `leadSec` по направлению движения, телеграф `telegraph` (метка + звук), прыжок: удар `strikeDmg`
   *  в `strikeRadius`, затем `exposedSec` виден и уязвим (медленно преследует), потом снова скрывается. */
  stalker: {
    distMin: 620, distMax: 960, minFromOthers: 500, huntRadius: 560, leash: 700, regenPerSec: 0.02,
    every: sec(4.5), leadSec: 1.0, telegraph: sec(1.0), strikeRadius: 70, strikeDmg: 58, strikeStun: 0.3, exposedSec: 2.5, chaseSpeed: 96,
    ccCap: sec(0.5), ccResist: sec(3),
  },
  /** Заражённый лагерь (T13.40, аудит 2026-09-08, первая «цель карты»): три тотема порчи стоят на карте по seed
   *  на `distMin..distMax` от старта. Пока герой в `engageRadius`, каждые `guardEvery` тиков прибывает охрана
   *  (`guardBase` + `guardPerDestroyed` за каждый снесённый тотем; HP охраны ×(1 + guardHpPerDestroyed × снесённых)).
   *  Лагерь спит, пока герой не войдёт в `wakeRadius` или не ударит тотем/Сатира; разбуженный отпускает за `engageRadius`.
   *  Снёс все три — выбор из трёх апгрейдов редкости `rewardRarity`. Можно уйти в любой момент: награда только за
   *  завершение, штрафа нет. */
  camp: { distMin: 720, distMax: 1000, radius: 130, totemRing: 78, totems: 3, wakeRadius: 200, engageRadius: 460, guardEvery: sec(4), guardBase: 2, guardPerDestroyed: 1, guardHpPerDestroyed: 0.35, guardRingMin: 190, guardRingMax: 260, rewardRarity: "exotic" as const },
  spawn: {
    /** Врагов в секунду: base + perMin × минута. */
    base: 1.7,
    perMin: 0.85,
    cap: 460,
    ringMin: 560,
    ringMax: 680,
    /** Множители силы врагов по минутам — до `kneeMin` линейно, дальше (полный акт) — пологий хвост:
     *  линейный рост, откалиброванный на 9 минут, к 20-й давал ×4 HP и 19 спавнов/с (0% побед бота). */
    hpPerMin: 0.16,
    dmgPerMin: 0.06,
    kneeMin: 9,
    lateHpPerMin: 0.06,
    lateDmgPerMin: 0.02,
    latePerMin: 0.15,
  },
  waves: {
    every: sec(30),
    size: 6,
    siegeEvery: 5,
    /** Элитный голем на этих секундах. */
    golemAt: [180, 270, 360].map(sec),
  },
  player: {
    r: 16,
    maxHp: 620,
    /** Регенерация заметная: «отбежал — отдышался» должно занимать десятки секунд, не минуты. */
    regen: 4,
    armor: 3,
    speed: 172,
    damage: 24,
    attackInterval: 0.85,
    /** Мили-дальность больше зоны контакта с Рошаном (40+16+2): иначе бить босса можно только стоя в его уроне. */
    range: 88,
    cleaveTargets: 2,
    cleaveRadius: 44,
    critChance: 0,
    critMult: 1.8,
    /** Радиус сбора XP больше дальности удара: убитый на расстоянии удара враг отдаёт опыт без шага к нему
     *  (e2e 2026-09-05: игрок у стены с 23 убийствами оставался 1-го уровня). */
    pickup: 112,
    contactEvery: 0.7,
    reviveInvuln: 2.2,
    revivePush: 220,
  },
  xp: {
    /** XP до следующего уровня: base + perLevel × уровень + quad × уровень². Квадратичный член
     *  держит потолок ~20–22 к 9:00 (с линейной кривой бот брал 30-й — a0.2.0). */
    base: 12,
    perLevel: 9,
    quad: 0.5,
    shardCap: 240,
    magnetSpeed: 420,
  },
  /** Веса редкости карточки школы по минутам: standard/refined/exotic/arcana. */
  rarity: {
    start: [72, 24, 4, 0],
    end: [38, 36, 20, 6],
    endMin: 8,
    mult: { standard: 1, refined: 1.35, exotic: 1.8, arcana: 2.4 } as Record<string, number>,
    /** Надбавка к потолку рангов за редкость (T13.18, «как в Death Must Die»): обычный вариант
     *  улучшения упирается в свой `maxRank`, редкий поднимает потолок — редкость решает не только
     *  «насколько сильнее сейчас», но и «как далеко это можно докачать». */
    rankBonus: { standard: 0, refined: 0, exotic: 1, arcana: 2 } as Record<string, number>,
  },
  /** Руны (T13.32): раз в 2 минуты со сдвигом от bounty, лежат 45 с; эффекты — по мотивам Dota. */
  rune: {
    first: sec(90),
    every: sec(120),
    lifetime: sec(45),
    dd: { seconds: 45, mult: 2 },
    shield: { seconds: 45, frac: 0.5 },
    arcane: { seconds: 50, cooldown: 0.3 },
    illusion: { seconds: 75, count: 2, dmgFrac: 0.35 },
  },
  /** Руны щедрости: первая на 0:50, дальше каждые 100 с; живёт 40 с; эффект 60 с. */
  greed: {
    firstAt: sec(50),
    every: sec(100),
    lifetime: sec(40),
    duration: sec(60),
    spawnMult: 2,
    xpMult: 2,
    /** Постоянная надбавка к HP/урону врагов за каждую взятую руну. */
    powerPerStack: 0.08,
    distMin: 340,
    distMax: 420,
  },
  /** Прокачка: реролл офферов за золото (цена растёт) и изгнание апгрейда из пула на забег (как в DMD). */
  levelup: { rerollBase: 30, rerollStep: 20, banishes: 3 },
  /** Secret Shop (T13.8): торговец появляется рядом в окна, живёт lifetime; реролл дорожает. */
  shop: {
    at: [sec(3 * 60), sec(6 * 60)],
    lifetime: sec(45),
    offers: 3,
    slots: 6,
    rerollBase: 40,
    rerollStep: 25,
    distMin: 260,
    distMax: 340,
  },
  /** Нейтральные предметы: токен тира рядом с игроком на минутах NEUTRAL_TIER_AT_MIN, живёт lifetime. */
  neutral: { lifetime: sec(60), distMin: 200, distMax: 300 },
  /** Экипировка (T13.14): сундуки с 1:00 каждые 150 с (живут 60 с); шанс дропа с обычного врага мал,
   *  элита и боссы роняют всегда; тир по минуте (7/14); сумка забега — 12. */
  loot: { chestFirstAt: sec(60), chestEvery: sec(150), chestLifetime: sec(60), distMin: 220, distMax: 320, commonChance: 0.004, bagCap: 12, lootLifetime: sec(90), tier2At: sec(7 * 60), tier3At: sec(14 * 60) },
  /** Bounty-руны: каждые 3 минуты, золото растёт с минутой. */
  bounty: {
    every: sec(3 * 60),
    lifetime: sec(40),
    base: 30,
    perMin: 6,
  },
  /** Авто-каст (общий для видов способностей): порог врагов в радиусе и HP. */
  autoCast: { aoeEnemies: 3, healHpPct: 0.6, ultEnemies: 8, ultHpPct: 0.32 },
  boss: {
    slamRange: 96,
    /** Рошан звереет, если жив дольше enrageAfter секунд после появления. */
    enrageAfter: sec(120),
    /** Рошан не даёт бесконечно кайтить: дальше chaseFrom он бежит быстрее игрока-без-бонусов. */
    chaseFrom: 220,
    chaseSpeed: 150,
    slamTelegraph: sec(0.9),
    slamRadius: 124,
    slamDmg: 92,
    slamStun: 0.8,
    slamCooldown: sec(2.8),
    /** После удара Рошан стоит — окно наказания для мили; читаемый ритм «увернись → ударь → отойди». */
    slamRecovery: sec(1.3),
    /** Контакт босса реже и слабее обычного: его угроза — удар по телеграфу, а не прилипание. */
    contactEvery: 1.1,
  },
} as const;
