// Коэффициенты Arcade. Своя версия: другая PvE-модель, BALANCE_CONFIG_VERSION Roguelite Run не
// трогаем (PRD §5.15). Менял числа здесь или в content/ — бампни ARCADE_CONFIG_VERSION: она
// пишется в запись истории забега, чтобы результаты разных калибровок не смешивались.
export const ARCADE_CONFIG_VERSION = "a0.1.0";

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
    regen: 1.6,
    armor: 3,
    speed: 172,
    damage: 24,
    attackInterval: 0.85,
    range: 74,
    cleaveTargets: 2,
    cleaveRadius: 44,
    critChance: 0,
    critMult: 1.8,
    pickup: 64,
    contactEvery: 0.7,
    reviveInvuln: 2.2,
    revivePush: 220,
  },
  xp: {
    /** XP до следующего уровня: base + perLevel × уровень. */
    base: 10,
    perLevel: 7,
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
  juggernaut: {
    q: { duration: 4, cooldown: 16, radius: 104, dps: [0, 42, 66, 90, 114], speedBonus: 0.12 },
    w: { duration: 8, cooldown: 32, radius: 170, healPct: [0, 0.028, 0.034, 0.04, 0.046] },
    e: { crit: [0, 0.2, 0.25, 0.3, 0.35], mult: 1.8 },
    r: { duration: 1.5, cooldown: [0, 70, 62, 54], slashes: [0, 5, 7, 9], dmg: [0, 110, 200, 290], radius: 230 },
    autoCast: { qEnemies: 4, qRadius: 130, wHpPct: 0.6, rEnemies: 10, rHpPct: 0.32 },
  },
  boss: {
    slamRange: 96,
    slamTelegraph: sec(0.75),
    slamRadius: 124,
    slamDmg: 78,
    slamStun: 0.8,
    slamCooldown: sec(2.4),
    enrageAt: sec(9 * 60),
  },
} as const;
