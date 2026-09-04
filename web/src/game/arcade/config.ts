// Коэффициенты Arcade. Своя версия: другая PvE-модель, BALANCE_CONFIG_VERSION Roguelite Run не
// трогаем (PRD §5.15). Менял числа здесь или в content/ — бампни ARCADE_CONFIG_VERSION: она
// пишется в запись истории забега, чтобы результаты разных калибровок не смешивались.
export const ARCADE_CONFIG_VERSION = "a0.3.0";

export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;
export const sec = (s: number): number => Math.round(s * TICK_HZ);

export const ARCADE = {
  world: { w: 3200, h: 3200 },
  /** Срез 0: Рошан на 7:00, победа — дожить до 9:00 с убитым Рошаном. */
  roshanAt: sec(7 * 60),
  endAt: sec(9 * 60),
  /** Пока Рошан жив, обычные спавны стоят; после его смерти — интенсивность ×postRoshanRate. */
  postRoshanRate: 1.6,
  spawn: {
    /** Врагов в секунду: base + perMin × минута. */
    base: 1.1,
    perMin: 0.62,
    cap: 460,
    ringMin: 560,
    ringMax: 680,
    /** Множители силы врагов по минутам. */
    hpPerMin: 0.2,
    dmgPerMin: 0.06,
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
  juggernaut: {
    q: { duration: 4, cooldown: 16, radius: 104, dps: [0, 42, 66, 90, 114], speedBonus: 0.12 },
    w: { duration: 8, cooldown: 32, radius: 170, healPct: [0, 0.028, 0.034, 0.04, 0.046] },
    e: { crit: [0, 0.2, 0.25, 0.3, 0.35], mult: 1.8 },
    r: { duration: 1.5, cooldown: [0, 70, 62, 54], slashes: [0, 5, 7, 9], dmg: [0, 110, 200, 290], radius: 230 },
    autoCast: { qEnemies: 4, qRadius: 130, wHpPct: 0.6, rEnemies: 10, rHpPct: 0.32 },
  },
  boss: {
    slamRange: 96,
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
    enrageAt: sec(9 * 60),
  },
} as const;
