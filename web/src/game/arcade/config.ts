// Коэффициенты Arcade. Своя версия: другая PvE-модель, BALANCE_CONFIG_VERSION Roguelite Run не
// трогаем (PRD §5.15). Менял числа здесь или в content/ — бампни ARCADE_CONFIG_VERSION: она
// пишется в запись истории забега, чтобы результаты разных калибровок не смешивались.
export const ARCADE_CONFIG_VERSION = "a0.22.0";

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
  pit: { x: 1600, y: 1600, radius: 260, leash: 420, regenPerSec: 0.004 },
  /** Ночь (акт 2): радиус обзора вокруг героя; дальше — туман, враги не видны (но идут). */
  night: { visibility: 440 },
  /** Пока Рошан жив, обычные спавны стоят; после его смерти — интенсивность ×postRoshanRate. */
  postRoshanRate: 1.6,
  /** Второй Рошан сильнее первого (как респавн в Dota). */
  secondRoshan: { hpMult: 1.4, dmgMult: 1.25 },
  ancient: { megaEvery: sec(15), megaSize: 8, megaHpMult: 2, lateMult: 2, spawnMult: 1.3 },
  tormentor: { reflectCap: 30 },
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
  /** Secret Shop (T13.8): торговец появляется рядом в окна, живёт lifetime; реролл дорожает. */
  /** Прокачка: реролл офферов за золото (цена растёт) и изгнание апгрейда из пула на забег (как в DMD). */
  levelup: { rerollBase: 30, rerollStep: 20, banishes: 3 },
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
