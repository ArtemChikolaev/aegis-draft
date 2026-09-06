// Arcade — чистый детерминированный сим (PRD §5.15, BACKLOG T13.1).
//
// Контракт детерминизма: состояние — функция ТОЛЬКО от `seed` и последовательности `ArcadeInput`
// по тикам. Внутри нет Date/rAF/Math.random и трансцендентных функций (`Math.sin/cos/atan2/exp` у
// браузеров расходятся в младших битах) — направления берутся из таблицы констант, дистанции
// через sqrt (IEEE гарантирует округление). Один тик = 1/60 с (config.TICK_HZ).
//
// Сим не знает про рендер: `fx` — журнал визуальных событий с ttl, рендерер читает его и
// ничего в сим не пишет. Level-up останавливает мир (`pending`) до `input.choose`.
import { Rng } from "../rng.ts";
import { ObstacleGrid, generateMap } from "./mapgen.ts";
import { PETS, type PetKind } from "./content/pets.ts";
import { ARCADE, DT, TICK_HZ, sec } from "./config.ts";
import { ENEMY_KINDS, spawnPool } from "./content/enemies.ts";
import { LEGENDARY_LEVELS, LEGENDARY_UPGRADES, SCHOOLS, TALENTS, UPGRADES, UPGRADE_BY_ID } from "./content/schools.ts";
import { rankOf, type RankRules } from "./content/ranks.ts";
import { ARCADE_ITEMS, ARCADE_ITEM_BY_ID, ITEM_PRICE_MULT, itemEffectsAt, type ShopOffer } from "./content/items.ts";
import { HEROES, type AbilityDef, type HeroDef, type HeroId } from "./content/heroes.ts";
import { NEUTRAL_BY_ID, NEUTRAL_ENCHANTS, NEUTRAL_ENCHANT_BY_ID, NEUTRAL_TIER_AT_MIN, neutralsOfTier, type NeutralDef } from "./content/neutrals.ts";
import { gearEffect, rollGear, uniqueGear, type GearItem } from "./content/gear.ts";
import {
  IDLE_INPUT,
  sameInput,
  type AbilityKey,
  type ActId,
  type ArcadeEventCounters,
  type ArcadeInput,
  type ArcadeOptions,
  type ArcadeOutcome,
  type Enemy,
  type EnemyKind,
  type Fx,
  type FxKind,
  type InputLogEntry,
  type Offer,
  type Player,
  type PlayerStats,
  type Projectile,
  type Rarity,
  type SchoolId,
  type Shard,
  type Shrine,
  type Spot,
  SHOP_ACT,
  type Pet,
} from "./types.ts";

/** 16 направлений по кругу — константы вместо Math.cos/sin (детерминизм между движками). */
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0], [0.9238795325112867, 0.3826834323650898], [0.7071067811865476, 0.7071067811865476], [0.3826834323650898, 0.9238795325112867],
  [0, 1], [-0.3826834323650898, 0.9238795325112867], [-0.7071067811865476, 0.7071067811865476], [-0.9238795325112867, 0.3826834323650898],
  [-1, 0], [-0.9238795325112867, -0.3826834323650898], [-0.7071067811865476, -0.7071067811865476], [-0.3826834323650898, -0.9238795325112867],
  [0, -1], [0.3826834323650898, -0.9238795325112867], [0.7071067811865476, -0.7071067811865476], [0.9238795325112867, -0.3826834323650898],
];
const COS15 = 0.9659258262890683, SIN15 = 0.25881904510252074, COS30 = 0.8660254037844387, SIN30 = 0.5;

function rotate(x: number, y: number, c: number, s: number): [number, number] {
  return [x * c - y * s, x * s + y * c];
}

const ABILITY_KEYS: readonly AbilityKey[] = ["q", "w", "e", "r"];
/** Индекс вида врага для fx смерти (рендер восстанавливает вид по числу). */
export const KIND_INDEX: Record<string, number> = Object.fromEntries(Object.keys(ENEMY_KINDS).map((id, i) => [id, i]));
export const KIND_BY_INDEX: readonly string[] = Object.keys(ENEMY_KINDS);
const R_LEVELS = [6, 12, 18];
const GRID = 72;
/** Питомец подошёл к новой цели, а перезарядка ещё идёт: бьёт не позже чем через 0.2 с (тиков) — см. tickPets. */
const PET_REARM = 12;

function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export class ArcadeSim {
  readonly seed: string;
  readonly rng: Rng;
  readonly rank: RankRules;
  readonly hero: HeroDef;
  tick = 0;
  shrine: Shrine = { alive: false, x: 0, y: 0, until: 0 };
  greedUntil = 0;
  greedStacks = 0;
  shopkeeper: Spot = { alive: false, x: 0, y: 0, until: 0, value: 0 };
  bounty: Spot = { alive: false, x: 0, y: 0, until: 0, value: 0 };
  /** Открытый магазин останавливает мир, как выбор карточки. */
  shopOpen = false;
  shopOffers: ShopOffer[] = [];
  /** Токен нейтралки на карте и открытый выбор (мир стоит, как в лавке). */
  neutralToken: Spot = { alive: false, x: 0, y: 0, until: 0, value: 0 };
  neutralOpen = false;
  neutralOffers: NeutralDef[] = [];
  /** Зачарования к предложенным нейтралкам (параллельно neutralOffers). */
  neutralEnchants: string[] = [];
  private neutralIdx = 0;
  /** Добыча: сундук на карте, предметы на земле, открытый экран подбора (мир стоит). */
  chest: Spot = { alive: false, x: 0, y: 0, until: 0, value: 0 };
  groundLoot: { x: number; y: number; item: GearItem; until: number }[] = [];
  lootOpen: GearItem | null = null;
  /** Всё подобранное за забег — в инвентарь по итогу. */
  loot: GearItem[] = [];
  private nextChestAt = ARCADE.loot.chestFirstAt;
  private lootSeq = 0;
  private aegisDropped = false;
  shopRerolls = 0;
  private shopIdx = 0;
  private nextBountyAt = ARCADE.bounty.every;
  private nextShrineAt: number;
  private nextTrollPackAt: number;
  readonly act: ActId;
  /** Препятствия карты (деревья/камни из общего генератора): герой и обычные враги их обходят, боссы/структуры — нет. */
  readonly obstacles: ObstacleGrid;
  private readonly roshanAt: number[];
  private roshanIdx = 0;
  private roshanSpawnedAt = 0;
  private tormentorSpawned = false;
  ancient: Enemy | null = null;
  private nextMegaAt = 0;
  player: Player;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  shards: Shard[] = [];
  /** Питомцы школы «Зверинец» — состав синхронизируется с рангами апгрейдов (syncPets). */
  pets: Pet[] = [];
  /** Прокачка: сколько рероллов сделано (цена растёт), изгнанные апгрейды и остаток изгнаний. */
  levelRerolls = 0;
  banished = new Set<string>();
  banishesLeft = ARCADE.levelup.banishes;
  fx: Fx[] = [];
  pending: Offer[] | null = null;
  over: ArcadeOutcome | null = null;
  roshan: Enemy | null = null;
  roshanKilled = false;
  aegisDrop: { x: number; y: number } | null = null;
  /** Камера/тряска — подсказки рендеру (не влияют на сим). */
  shake = 0;
  readonly events: ArcadeEventCounters = { hits: 0, crits: 0, casts: 0, ults: 0, hurt: 0, kills: 0, eliteKills: 0, pickups: 0, castQ: 0, castW: 0, castE: 0, castR: 0, hurtBy: -1 };
  private nextEnemyId = 1;
  private spawnAcc = 0;
  private lastWaveAt = 0;
  private golemIdx = 0;
  private lastInput: ArcadeInput = { ...IDLE_INPUT };
  private grid = new Map<number, Enemy[]>();
  /** Счётчик вызовов step(): ключ input-лога. Тик не годится — он стоит, пока висит выбор карточки. */
  steps = 0;
  /** Input-лог (записывается всегда: он дешёвый и нужен реплею/шарингу). */
  readonly log: InputLogEntry[] = [];

  constructor(seed: string, options: ArcadeOptions = {}) {
    this.seed = seed;
    this.rank = rankOf(options.rank ?? 0);
    this.hero = HEROES[(options.hero as HeroId) in HEROES ? (options.hero as HeroId) : "juggernaut"];
    this.act = options.act === "full" || options.act === "dire" || options.act === "river" ? options.act : "short";
    this.obstacles = new ObstacleGrid(generateMap(seed, this.act).obstacles);
    this.rng = new Rng(`arcade:${seed}:r${this.rank.step}:${this.hero.id}:${this.act}`);
    this.roshanAt = ARCADE.acts[this.act].roshanAt.map((t, i) => (i === 0 && this.rank.earlyRoshan ? t - sec(60) : t));
    this.nextShrineAt = ARCADE.greed.firstAt;
    this.nextTrollPackAt = sec(45);
    const P = ARCADE.player;
    this.player = {
      x: ARCADE.world.w / 2, y: ARCADE.world.h / 2, hp: P.maxHp, level: 1, xp: 0, xpNext: xpToNext(1), gold: 0, kills: 0,
      facingX: 1, facingY: 0, aimX: 1, aimY: 0, aimUntil: 0, attackCd: 0, stunUntil: 0, invulnUntil: 0, aegis: false, aegisUsed: false,
      abilities: { q: 0, w: 0, e: 0, r: 0 }, cooldowns: { q: 0, w: 0, e: 0, r: 0 },
      spinUntil: 0, wardUntil: 0, wardX: 0, wardY: 0, burstLeft: 0, burstNextAt: 0, fieldUntil: 0, zoneUntil: 0, zoneX: 0, zoneY: 0, armorBuffUntil: 0, hasteUntil: 0, stacks: 0, stackTarget: -1, sigUntil: 0, reincAt: 0, sigArmed: false, rageUntil: 0, rageMult: 0, frenzyUntil: 0, frenzyMult: 0, evadeUntil: 0, evadeChance: 0, drainUntil: 0, drainTarget: -1,
      schools: [], upgrades: {}, talents: [], items: [], neutral: null, neutralEnchant: null, gear: {}, bag: [], stats: baseStats(), ringAt: 0, shardsAt: 0, staticAt: 0,
    };
    // Первое очко — сразу в Q: так первые 30 секунд не голые (в Dota первый уровень тоже с абилкой).
    this.player.abilities.q = 1;
    for (const g of options.gear ?? []) this.player.gear[g.slot] = g;
    // Уникальный Aegis of the Immortal: одно воскрешение уже на старте.
    if (Object.values(this.player.gear).some((g) => g.unique === "aegis_of_the_immortal")) this.player.aegis = true;
    this.recomputeStats();
  }

  /** Ночной акт: рендер ограничивает обзор, сим — нет (враги идут как обычно). */
  get night(): boolean {
    return ARCADE.acts[this.act].night === true;
  }

  /** Акт 3: яма Рошана и река. */
  get pit(): boolean {
    return ARCADE.acts[this.act].pit === true;
  }

  /** Игрок внутри ямы (акт 3) — только тогда Рошан преследует и обычный спавн стоит. */
  playerInPit(): boolean {
    const P = ARCADE.pit;
    return this.pit && len(this.player.x - P.x, this.player.y - P.y) <= P.radius + 40;
  }

  get seconds(): number {
    return this.tick / TICK_HZ;
  }

  get minutes(): number {
    return this.tick / TICK_HZ / 60;
  }

  aliveEnemies(): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive) n++;
    return n;
  }

  /** Один тик. Пока висит выбор уровня или забег окончен — мир стоит. */
  step(input: ArcadeInput): void {
    if (this.over) return;
    if (!sameInput(input, this.lastInput)) {
      this.log.push([this.steps, input.mx, input.my, input.cast, input.choose, input.act]);
      this.lastInput = { ...input };
    }
    this.steps++;
    if (this.pending) {
      if (input.choose >= 0 && input.choose < this.pending.length) this.applyOffer(this.pending[input.choose]);
      else if (input.choose === -2) this.rerollPending();
      else if (input.act >= 30 && input.act < 33) this.banishPending(input.act - 30);
      return;
    }
    if (this.shopOpen) {
      this.shopAction(input.act);
      return;
    }
    if (this.neutralOpen) {
      this.neutralAction(input.act);
      return;
    }
    if (this.lootOpen) {
      this.lootAction(input.act);
      return;
    }
    const p = this.player;
    this.tick++;
    this.shake = Math.max(0, this.shake - 1);
    this.tickCooldowns();
    this.movePlayer(input);
    this.spawnTick();
    this.rebuildGrid();
    this.moveEnemies();
    this.tickRupture();
    this.heroPassives();
    this.tickPets();
    this.playerCombat(input);
    this.schoolEffects();
    this.moveProjectiles();
    this.collectShards();
    this.regenAndHazards();
    this.pruneFx();
    if (p.hp <= 0) this.onLethal();
    const A = ARCADE.acts[this.act];
    if (A.endAt > 0 && this.tick >= A.endAt && this.roshanKilled && !this.over) this.finish("victory");
  }

  // ---------- игрок ----------

  private tickCooldowns(): void {
    const p = this.player;
    p.attackCd = Math.max(0, p.attackCd - 1);
    for (const k of ABILITY_KEYS) p.cooldowns[k] = Math.max(0, p.cooldowns[k] - 1);
  }

  private movePlayer(input: ArcadeInput): void {
    const p = this.player;
    if (this.tick < p.stunUntil) return;
    let dx = input.mx / 16, dy = input.my / 16;
    const l = len(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    if (l > 0.05) { p.facingX = dx / (l > 1 ? 1 : l); p.facingY = dy / (l > 1 ? 1 : l); }
    let speed = p.stats.speed;
    if (this.tick < p.spinUntil || this.tick < p.hasteUntil) speed *= 1.12;
    if (this.tick < p.fieldUntil) speed *= 0.5;
    const ox = p.x, oy = p.y;
    p.x = clamp(p.x + dx * speed * DT, ARCADE.player.r, ARCADE.world.w - ARCADE.player.r);
    p.y = clamp(p.y + dy * speed * DT, ARCADE.player.r, ARCADE.world.h - ARCADE.player.r);
    [p.x, p.y] = this.obstacles.resolve(p.x, p.y, ARCADE.player.r);
    // Упёрлись в дерево/камень (прошли меньше 40% шага) — скользим по касательной, а не стоим носом в ствол.
    // Без этого бот калибровки, идущий по прямой, терял 25 п.п. побед; игроку тоже приятнее.
    if (l > 0.05) {
      const want = speed * DT * Math.min(1, l), got = len(p.x - ox, p.y - oy);
      if (got < want * 0.4) {
        const [sx, sy] = this.obstacles.steer(ox, oy, dx, dy, ARCADE.player.r);
        p.x = clamp(ox + sx * speed * DT, ARCADE.player.r, ARCADE.world.w - ARCADE.player.r);
        p.y = clamp(oy + sy * speed * DT, ARCADE.player.r, ARCADE.world.h - ARCADE.player.r);
        [p.x, p.y] = this.obstacles.resolve(p.x, p.y, ARCADE.player.r);
      }
    }
  }

  private playerCombat(input: ArcadeInput): void {
    const p = this.player;
    const stunned = this.tick < p.stunUntil;
    // --- автоатака: мили — удар + клив, дальний бой — снаряд ---
    if (!stunned && p.attackCd === 0 && this.tick >= p.spinUntil && p.burstLeft === 0 && this.tick >= p.fieldUntil) {
      const target = this.nearestEnemy(p.x, p.y, p.stats.range);
      if (target) {
        // Спрайт разворачивается к цели на время удара, ноги продолжают бежать куда жмут (см. renderer).
        { const ax = target.x - p.x, ay = target.y - p.y, al = len(ax, ay) || 1; p.aimX = ax / al; p.aimY = ay / al; p.aimUntil = this.tick + sec(0.45); }
        {
          let k = 1;
          if (this.hero.signature?.kind === "fiery_soul" && this.tick < p.sigUntil) k *= 1 - Math.min(0.6, this.hero.signature.value * this.sigScale());
          if (this.tick < p.frenzyUntil) k *= 1 - p.frenzyMult;
          p.attackCd = sec(p.stats.attackInterval * Math.max(0.25, k));
        }
        if (this.hero.ranged) {
          const d = len(target.x - p.x, target.y - p.y) || 1;
          this.spawnProjectile(p.x, p.y, (target.x - p.x) / d * 560, (target.y - p.y) / d * 560, 6, 0, sec(1.2), 0, "arrow", false, true);
        } else {
          this.onAttackHit(target);
          let cleave = ARCADE.player.cleaveTargets - 1 + p.stats.cleave;
          for (const e of this.enemies) {
            if (cleave <= 0) break;
            if (!e.alive || e === target) continue;
            if (len(e.x - target.x, e.y - target.y) <= ARCADE.player.cleaveRadius) { this.onAttackHit(e, 0.6); cleave--; }
          }
          this.pushFx("slash", p.x, p.y, target.x, target.y, 10);
        }
      }
    }
    // --- способности: ручной каст или авто-каст по виду ---
    if (!stunned) {
      const masks: Record<AbilityKey, number> = { q: 1, w: 2, e: 4, r: 8 };
      for (const key of ABILITY_KEYS) {
        const ab = this.hero.abilities[key];
        if (ab.passive || p.abilities[key] === 0 || p.cooldowns[key] > 0) continue;
        if ((input.cast & masks[key]) !== 0 || this.wantsCast(ab)) this.castAbility(key, ab);
      }
    }
    this.tickActiveAbilities();
  }

  /** Авто-каст: одно правило на вид, чтобы тач без кнопок и бот играли одинаково. */
  private wantsCast(ab: AbilityDef): boolean {
    const p = this.player;
    const A = ARCADE.autoCast;
    const hpPct = p.hp / p.stats.maxHp;
    const radius = ab.radius ?? 150;
    const near = this.countEnemiesWithin(p.x, p.y, radius);
    const bossNear = this.roshan?.alive === true && len(this.roshan.x - p.x, this.roshan.y - p.y) < radius;
    switch (ab.kind) {
      case "ward": return hpPct < A.healHpPct;
      case "spin": case "nova": case "arc_lightning": case "battle_hunger": case "berserker_call": case "shrapnel":
        return near >= A.aoeEnemies || (hpPct < 0.5 && near >= 1) || bossNear;
      case "frostbite": case "lightning_bolt":
        return bossNear || this.eliteWithin(p.x, p.y, radius) !== null || near >= A.aoeEnemies;
      case "assassinate": case "mana_void": return bossNear || this.eliteWithin(p.x, p.y, radius) !== null || near >= 6;
      case "culling_blade": return this.cullTarget(ab) !== null;
      case "omni": case "freezing_field": case "thundergod":
        return near >= A.ultEnemies || bossNear || (hpPct < A.ultHpPct && near >= 3);
      // Собственные киты шаблонных героев.
      case "line_burst": case "meteor": case "gust": case "multishot": case "remnant": case "edict":
        return near >= A.aoeEnemies || (hpPct < 0.5 && near >= 1) || bossNear;
      case "goo": case "rupture": case "corrosive": return bossNear || this.eliteWithin(p.x, p.y, radius) !== null || near >= A.aoeEnemies;
      case "dash": return (hpPct < 0.4 && near >= 1) || (ab.value.some((v) => v > 0) && (near >= A.aoeEnemies || bossNear));
      case "armor_buff": case "frenzy": case "haste": case "rage": case "death_pact": case "damage_ward":
        return near >= A.aoeEnemies || bossNear || (hpPct < 0.5 && near >= 1);
      case "mass_freeze": case "requiem": case "ravage":
        return near >= A.ultEnemies || bossNear || (hpPct < A.ultHpPct && near >= 3);
      case "life_drain": return bossNear || this.eliteWithin(p.x, p.y, radius) !== null || (hpPct < 0.6 && near >= 2);
      default: return false;
    }
  }

  private castAbility(key: AbilityKey, ab: AbilityDef): void {
    const p = this.player;
    const lvl = p.abilities[key];
    const ult = this.talentPower("t25_ult") ? 1.5 : 1;
    const value = ab.value[lvl] * (key === "r" ? ult : 1);
    const radius = ab.radius ?? 150;
    let cast = true;
    switch (ab.kind) {
      case "spin":
        p.spinUntil = this.tick + sec(ab.duration ?? 4);
        this.pushFx("spin", p.x, p.y, 0, 0, sec(ab.duration ?? 4));
        break;
      case "ward":
        p.wardUntil = this.tick + sec(ab.duration ?? 8);
        p.wardX = p.x - p.facingX * 30;
        p.wardY = p.y - p.facingY * 30;
        break;
      case "omni":
        p.burstLeft = ab.count?.[lvl] ?? 5;
        p.burstNextAt = this.tick;
        p.invulnUntil = Math.max(p.invulnUntil, this.tick + sec(ab.duration ?? 1.5));
        this.shake = 14;
        break;
      case "nova": {
        const center = this.nearestEnemy(p.x, p.y, 300) ?? p;
        for (const e of this.enemiesWithin(center.x, center.y, radius)) { this.damageEnemy(e, value, "burst"); this.applyChill(e, 0.5, ab.duration ?? 3); }
        this.pushFx("nova", center.x, center.y, radius, 0, 16);
        break;
      }
      case "frostbite": {
        const target = this.eliteWithin(p.x, p.y, radius) ?? this.nearestEnemy(p.x, p.y, radius);
        if (!target) { cast = false; break; }
        if (!target.kind.unstoppable) target.freezeUntil = Math.max(target.freezeUntil, this.tick + sec(this.statusSec(target.kind.boss ? 1 : ab.duration ?? 2)));
        this.damageEnemy(target, value, "burst");
        this.pushFx("zap", p.x, p.y, target.x, target.y, 10);
        break;
      }
      case "freezing_field":
        p.fieldUntil = this.tick + sec(ab.duration ?? 6);
        p.burstLeft = Math.round((ab.duration ?? 6) * 10);
        p.burstNextAt = this.tick;
        this.shake = 10;
        break;
      case "shrapnel": {
        const center = this.nearestEnemy(p.x, p.y, 320) ?? p;
        p.zoneX = center.x; p.zoneY = center.y; p.zoneUntil = this.tick + sec(ab.duration ?? 8);
        break;
      }
      case "assassinate": {
        const target = this.strongestWithin(p.x, p.y, radius);
        if (!target) { cast = false; break; }
        this.damageEnemy(target, value, "crit");
        this.pushFx("zap", p.x, p.y, target.x, target.y, 14);
        this.shake = 6;
        break;
      }
      case "mana_void": {
        // Маны в рогалике нет: пустота бьёт по «истраченному» — урон растёт с потерянным здоровьем цели, взрыв задевает соседей.
        const target = this.strongestWithin(p.x, p.y, radius);
        if (!target) { cast = false; break; }
        const missing = 1 - Math.max(0, target.hp) / Math.max(1, target.maxHp);
        const dmg = value * (1 + 1.2 * Math.min(1, Math.max(0, missing)));
        this.damageEnemy(target, dmg, "crit");
        for (const o of this.enemiesWithin(target.x, target.y, 120)) if (o !== target) this.damageEnemy(o, dmg * 0.5, "burst");
        this.pushFx("nova", target.x, target.y, 120, 0, 14);
        this.shake = 8;
        break;
      }
      case "berserker_call":
        for (const e of this.enemiesWithin(p.x, p.y, radius)) if (!e.kind.unstoppable) e.stunUntil = Math.max(e.stunUntil, this.tick + sec(this.statusSec(value)));
        p.armorBuffUntil = this.tick + sec(ab.duration ?? 3);
        this.pushFx("nova", p.x, p.y, radius, 0, 14);
        break;
      case "battle_hunger": {
        const targets = this.enemiesWithin(p.x, p.y, radius).sort((a, b) => len(a.x - p.x, a.y - p.y) - len(b.x - p.x, b.y - p.y)).slice(0, ab.count?.[lvl] ?? 3);
        if (targets.length === 0) { cast = false; break; }
        for (const e of targets) { this.applyBurn(e, value, ab.duration ?? 5); this.applyChill(e, 0.2, ab.duration ?? 5, false); }
        break;
      }
      case "culling_blade": {
        const target = this.cullTarget(ab);
        if (!target) { cast = false; break; }
        if (target.kind.boss) this.damageEnemy(target, value * 2, "crit");
        else { this.damageEnemy(target, target.hp + 1, "crit"); p.cooldowns.r = -1; p.hasteUntil = this.tick + sec(ab.duration ?? 3); }
        this.shake = 8;
        if (!target.alive && !target.kind.boss) { this.pushFx("burst", target.x, target.y, 50, 0, 14); }
        break;
      }
      case "arc_lightning": {
        const from = this.nearestEnemy(p.x, p.y, radius);
        if (!from) { cast = false; break; }
        this.pushFx("zap", p.x, p.y, from.x, from.y, 8);
        this.damageEnemy(from, value, "zap");
        this.chainLightning(from, value, (ab.count?.[lvl] ?? 4) - 1);
        break;
      }
      case "lightning_bolt": {
        const target = this.eliteWithin(p.x, p.y, radius) ?? this.nearestEnemy(p.x, p.y, radius);
        if (!target) { cast = false; break; }
        this.damageEnemy(target, value, "zap");
        target.stunUntil = Math.max(target.stunUntil, this.tick + sec(this.statusSec(ab.duration ?? 0.5)));
        this.pushFx("zap", target.x, target.y - 200, target.x, target.y, 12);
        break;
      }
      case "thundergod":
        for (const e of this.enemiesWithin(p.x, p.y, radius)) { this.damageEnemy(e, value, "zap"); this.pushFx("zap", e.x, e.y - 120, e.x, e.y, 10); }
        this.shake = 16;
        break;
      // ---- собственные киты шаблонных героев (2026-09-06) ----
      case "dash": {
        // Blink/Leap/Time Walk/Phantom Strike/Ball Lightning: при низком HP — рывок от ближайшего врага, иначе — к сильнейшему.
        const nearest = this.nearestEnemy(p.x, p.y, 600);
        if (!nearest) { cast = false; break; }
        const escape = p.hp / p.stats.maxHp < 0.4;
        const target = escape ? null : (this.strongestWithin(p.x, p.y, radius) ?? nearest);
        let dx: number, dy: number;
        if (target) { dx = target.x - p.x; dy = target.y - p.y; } else { dx = p.x - nearest.x; dy = p.y - nearest.y; }
        const d = len(dx, dy) || 1;
        const dist = target ? Math.min(radius, Math.max(0, d - 26)) : radius;
        const ox = p.x, oy = p.y;
        p.x = Math.min(ARCADE.world.w - 40, Math.max(40, p.x + dx / d * dist));
        p.y = Math.min(ARCADE.world.h - 40, Math.max(40, p.y + dy / d * dist));
        [p.x, p.y] = this.obstacles.resolve(p.x, p.y, ARCADE.player.r);
        p.invulnUntil = Math.max(p.invulnUntil, this.tick + sec(0.35));
        if (value > 0) { for (const e of this.enemiesWithin(p.x, p.y, 110)) this.damageEnemy(e, value, "zap"); this.pushFx("nova", p.x, p.y, 110, 0, 10); }
        this.pushFx("slash", ox, oy, p.x, p.y, 8);
        break;
      }
      case "line_burst": case "meteor": {
        // Shadowraze / Dragon Slave / Powershot / Earth Spike / Split Earth / Chaos Meteor: зоны по направлению взгляда.
        // Прицел — на ближайшего врага (как автоприцел в DMD): игрок и бот кайтят спиной к толпе, и зоны по взгляду летели мимо.
        const n = ab.count?.[lvl] ?? 3;
        const aim = this.nearestEnemy(p.x, p.y, 420);
        let fx = p.facingX, fy = p.facingY;
        if (aim) { fx = aim.x - p.x; fy = aim.y - p.y; }
        const fl = len(fx, fy) || 1;
        fx /= fl; fy /= fl;
        const step = radius * 1.6 + 20;
        for (let i = 1; i <= n; i++) {
          const cx = p.x + fx * step * i, cy = p.y + fy * step * i;
          for (const e of this.enemiesWithin(cx, cy, radius)) {
            this.damageEnemy(e, value, "burst");
            if (ab.duration && !e.kind.unstoppable) e.stunUntil = Math.max(e.stunUntil, this.tick + sec(this.statusSec(ab.duration)));
            if (ab.kind === "meteor") this.applyBurn(e, value * 0.25, 3);
          }
          this.pushFx("nova", cx, cy, radius, 0, 12);
        }
        break;
      }
      case "armor_buff":
        p.armorBuffUntil = this.tick + sec(ab.duration ?? 5);
        this.pushFx("heal", p.x, p.y - 30, 0, 0, 14);
        break;
      case "rage":
        p.rageUntil = this.tick + sec(ab.duration ?? 8); p.rageMult = value;
        p.hasteUntil = Math.max(p.hasteUntil, p.rageUntil);
        this.pushFx("levelup", p.x, p.y, 0, 0, 20);
        break;
      case "death_pact":
        this.heal(p.stats.maxHp * 0.3);
        p.rageUntil = this.tick + sec(ab.duration ?? 12); p.rageMult = value;
        this.pushFx("revive", p.x, p.y, 0, 0, 24);
        break;
      case "frenzy":
        p.frenzyUntil = this.tick + sec(ab.duration ?? 4); p.frenzyMult = value;
        break;
      case "haste":
        p.hasteUntil = this.tick + sec(ab.duration ?? 5);
        p.evadeUntil = p.hasteUntil; p.evadeChance = value;
        break;
      case "damage_ward":
        p.wardUntil = this.tick + sec(ab.duration ?? 10);
        p.wardX = p.x; p.wardY = p.y;
        break;
      case "life_drain": {
        const target = this.eliteWithin(p.x, p.y, radius) ?? this.strongestWithin(p.x, p.y, radius) ?? this.nearestEnemy(p.x, p.y, radius);
        if (!target) { cast = false; break; }
        p.drainUntil = this.tick + sec(ab.duration ?? 4); p.drainTarget = target.id;
        break;
      }
      case "gust": {
        const hit = this.enemiesWithin(p.x, p.y, radius);
        if (hit.length === 0) { cast = false; break; }
        for (const e of hit) {
          const dx = e.x - p.x, dy = e.y - p.y, d = len(dx, dy) || 1;
          if (!e.kind.unstoppable && !e.kind.structure) { e.x = Math.min(ARCADE.world.w - 20, Math.max(20, e.x + dx / d * 90)); e.y = Math.min(ARCADE.world.h - 20, Math.max(20, e.y + dy / d * 90)); [e.x, e.y] = this.obstacles.resolve(e.x, e.y, e.kind.r * 0.8); }
          this.damageEnemy(e, value, "burst");
          this.applyChill(e, 0.5, ab.duration ?? 2, false);
        }
        this.pushFx("nova", p.x, p.y, radius, 0, 12);
        break;
      }
      case "multishot": {
        const n = ab.count?.[lvl] ?? 5;
        const fl = len(p.facingX, p.facingY) || 1;
        const base = Math.atan2(p.facingY / fl, p.facingX / fl);
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * (Math.PI * 70 / 180) / Math.max(1, n - 1);
          this.spawnProjectile(p.x, p.y, Math.cos(a) * 520, Math.sin(a) * 520, 6, value, sec(radius / 520), 1, "arrow", false);
        }
        break;
      }
      case "remnant":
        p.zoneX = p.x; p.zoneY = p.y; p.zoneUntil = this.tick + sec(12);
        this.pushFx("zap", p.x, p.y - 40, p.x, p.y, 8);
        break;
      case "edict":
        p.zoneUntil = this.tick + sec(ab.duration ?? 7);
        break;
      case "mass_freeze":
        for (const e of this.enemiesWithin(p.x, p.y, radius)) if (!e.kind.unstoppable) e.freezeUntil = Math.max(e.freezeUntil, this.tick + sec(this.statusSec(e.kind.boss ? 1.5 : ab.duration ?? 3.5)));
        // Внутри Chronosphere Void бьёт вдвое чаще — иначе ульт без урона.
        p.frenzyUntil = this.tick + sec(ab.duration ?? 3.5); p.frenzyMult = 0.5;
        this.pushFx("nova", p.x, p.y, radius, 0, sec(ab.duration ?? 3.5));
        this.shake = 10;
        break;
      case "requiem": {
        const souls = p.stacks;
        const dmg = value + souls * (ab.count?.[lvl] ?? 6);
        for (const e of this.enemiesWithin(p.x, p.y, radius)) { this.damageEnemy(e, dmg, "burst"); this.applyChill(e, 0.5, 3, false); }
        p.stacks = Math.floor(souls / 2);
        this.pushFx("nova", p.x, p.y, radius, 0, 20);
        this.shake = 14;
        break;
      }
      case "goo": {
        const target = this.eliteWithin(p.x, p.y, radius) ?? this.strongestWithin(p.x, p.y, radius) ?? this.nearestEnemy(p.x, p.y, radius);
        if (!target) { cast = false; break; }
        this.damageEnemy(target, value, "burst");
        this.applyChill(target, 0.5, ab.duration ?? 3);
        this.pushFx("zap", p.x, p.y, target.x, target.y, 8);
        break;
      }
      case "ravage":
        for (const e of this.enemiesWithin(p.x, p.y, radius)) { this.damageEnemy(e, value, "burst"); if (!e.kind.unstoppable) e.stunUntil = Math.max(e.stunUntil, this.tick + sec(this.statusSec(ab.duration ?? 1.5))); }
        this.pushFx("nova", p.x, p.y, radius, 0, 18);
        this.shake = 16;
        break;
      // ---- волна 3 (2026-09-06) ----
      case "rupture": {
        // Bloodseeker: цель кровоточит за каждый пройденный шаг (tickRupture) — в толпе враги бегут к герою и режут себя сами.
        const target = this.eliteWithin(p.x, p.y, radius) ?? this.strongestWithin(p.x, p.y, radius) ?? this.nearestEnemy(p.x, p.y, radius);
        if (!target) { cast = false; break; }
        target.ruptureUntil = this.tick + sec(ab.duration ?? 8); target.ruptureDps = value; target.lastX = target.x; target.lastY = target.y;
        this.damageEnemy(target, value, "burst");
        this.pushFx("zap", p.x, p.y, target.x, target.y, 8);
        break;
      }
      case "corrosive": {
        // Slardar: сильнейшая цель получает на value больше урона от всего (damageEnemy).
        const target = this.eliteWithin(p.x, p.y, radius) ?? this.strongestWithin(p.x, p.y, radius) ?? this.nearestEnemy(p.x, p.y, radius);
        if (!target) { cast = false; break; }
        target.ampUntil = this.tick + sec(ab.duration ?? 10); target.ampMult = value;
        this.pushFx("zap", p.x, p.y, target.x, target.y, 8);
        break;
      }
      default: cast = false;
    }
    if (!cast) return;
    if (key === "r") this.events.ults++; else this.events.casts++;
    if (key === "q") this.events.castQ++; else if (key === "w") this.events.castW++; else if (key === "e") this.events.castE++; else this.events.castR++;
    const sig = this.hero.signature;
    if (sig?.kind === "fiery_soul") p.sigUntil = this.tick + sec(sig.duration ?? 6); // Lina: скорость атаки после каста
    if (sig?.kind === "overload") p.sigArmed = true; // Storm: следующий удар бьёт по площади
    if (sig?.kind === "aftershock") { // Earthshaker: любой каст — толчок земли вокруг
      const sc = this.sigScale();
      for (const e of this.enemiesWithin(p.x, p.y, sig.radius ?? 160)) { this.damageEnemy(e, sig.value * sc, "burst"); if (!e.kind.unstoppable) e.stunUntil = Math.max(e.stunUntil, this.tick + sec(this.statusSec(0.6))); }
      this.pushFx("nova", p.x, p.y, sig.radius ?? 160, 0, 10);
    }
    // Culling Blade после добивания уходит на короткую перезарядку (3 с), не на полную и не на ноль.
    if (ab.kind === "culling_blade" && p.cooldowns.r === -1) p.cooldowns.r = sec(1.5);
    else p.cooldowns[key] = sec(ab.cooldown * (1 - p.stats.cooldown) * (key === "r" && this.upgradePower("leg_refresher") > 0 ? 0.5 : 1));
    // Multicast (Ogre Magi): с шансом умение срабатывает ещё раз на следующем тике (перезарядка сбрасывается до 1 тика).
    if (sig?.kind === "multicast" && key !== "r" && ab.cooldown > 0 && this.rng.float() < Math.min(0.6, sig.value * this.sigScale())) { p.cooldowns[key] = 1; this.pushFx("levelup", p.x, p.y, 0, 0, 12); }
    if (key === "q" || key === "r") this.thunderclap();
    this.staticField();
  }

  /** Тик активных эффектов: вихрь, тотем, серии ударов (Omnislash/Freezing Field), зона Shrapnel. */
  private tickActiveAbilities(): void {
    const p = this.player;
    const H = this.hero.abilities;
    if (this.tick < p.spinUntil && this.tick % 6 === 0 && H.q.kind === "spin") {
      const dps = H.q.value[p.abilities.q];
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (len(e.x - p.x, e.y - p.y) <= (H.q.radius ?? 104) + e.kind.r) this.damageEnemy(e, dps * 0.1, "spin");
      }
    }
    if (this.tick < p.wardUntil && H.w.kind === "ward") {
      const d = len(p.x - p.wardX, p.y - p.wardY);
      if (d > 40) { p.wardX += (p.x - p.wardX) / d * 120 * DT; p.wardY += (p.y - p.wardY) / d * 120 * DT; }
      if (this.tick % 30 === 0 && len(p.x - p.wardX, p.y - p.wardY) <= (H.w.radius ?? 170)) this.heal(p.stats.maxHp * H.w.value[p.abilities.w] * 0.5);
    }
    if (p.burstLeft > 0 && this.tick >= p.burstNextAt) {
      const ult = this.talentPower("t25_ult") ? 1.5 : 1;
      if (H.r.kind === "omni") {
        const candidates = this.enemiesWithin(p.x, p.y, H.r.radius ?? 230);
        if (candidates.length === 0) p.burstLeft = 0;
        else {
          const target = candidates[this.rng.int(candidates.length)];
          this.damageEnemy(target, H.r.value[p.abilities.r] * ult, "slash");
          this.pushFx("slash", p.x, p.y, target.x, target.y, 12);
          p.burstLeft--;
          p.burstNextAt = this.tick + Math.max(3, Math.floor(sec(H.r.duration ?? 1.5) / (H.r.count?.[p.abilities.r] ?? 5)));
        }
      } else if (H.r.kind === "freezing_field") {
        const radius = H.r.radius ?? 270;
        const ex = p.x + (this.rng.float() * 2 - 1) * radius, ey = p.y + (this.rng.float() * 2 - 1) * radius;
        for (const e of this.enemiesWithin(ex, ey, 80)) this.damageEnemy(e, H.r.value[p.abilities.r] * ult, "burst");
        for (const e of this.enemiesWithin(p.x, p.y, radius)) this.applyChill(e, 0.4, 0.5, false);
        this.pushFx("burst", ex, ey, 80, 0, 12);
        p.burstLeft--;
        p.burstNextAt = this.tick + 6;
        if (this.tick >= p.fieldUntil) p.burstLeft = 0;
      } else p.burstLeft = 0;
    }
    // Лавина (легендарный Skadi): каждые 8 с вмораживает всех вокруг на 1.2 с.
    if (this.upgradePower("leg_ska_avalanche") > 0 && this.tick % sec(8) === 0) {
      for (const e of this.enemiesWithin(p.x, p.y, 210)) if (!e.kind.unstoppable) e.freezeUntil = Math.max(e.freezeUntil, this.tick + sec(this.statusSec(e.kind.boss ? 0.6 : 1.2)));
      this.pushFx("nova", p.x, p.y, 210, 0, 14);
    }
    // Nether Ward (Pugna): тотем бьёт ближайшего врага в радиусе.
    const dwKey = ABILITY_KEYS.find((k) => H[k].kind === "damage_ward");
    if (dwKey && this.tick < p.wardUntil && this.tick % 15 === 0) {
      const t = this.nearestEnemy(p.wardX, p.wardY, H[dwKey].radius ?? 200);
      if (t) { this.damageEnemy(t, H[dwKey].value[p.abilities[dwKey]], "zap"); this.pushFx("zap", p.wardX, p.wardY - 30, t.x, t.y, 6); }
    }
    // Static Remnant (Storm): мина взрывается, когда враг подошёл. Слот — любой (Doom: Scorched Earth в W).
    const remKey = ABILITY_KEYS.find((k) => H[k].kind === "remnant");
    if (remKey && this.tick < p.zoneUntil) {
      const r = H[remKey].radius ?? 130;
      if (this.countEnemiesWithin(p.zoneX, p.zoneY, r * 0.55) > 0) {
        for (const e of this.enemiesWithin(p.zoneX, p.zoneY, r)) this.damageEnemy(e, H[remKey].value[p.abilities[remKey]], "zap");
        this.pushFx("nova", p.zoneX, p.zoneY, r, 0, 12);
        p.zoneUntil = 0;
      }
    }
    // Diabolic Edict (Leshrac) / Eye of the Storm (Razor R) / Haunt (Spectre R): случайные разряды по врагам вокруг героя.
    // Раньше проверялся только слот W — ульт Razor молчал (2026-09-06).
    const edKey = ABILITY_KEYS.find((k) => H[k].kind === "edict");
    if (edKey && this.tick < p.zoneUntil && this.tick % 8 === 0) {
      const around = this.enemiesWithin(p.x, p.y, H[edKey].radius ?? 260);
      if (around.length > 0) { const e = around[this.rng.int(around.length)]; this.damageEnemy(e, H[edKey].value[p.abilities[edKey]], "burst"); this.pushFx("burst", e.x, e.y, 24, 0, 8); }
    }
    // Life Drain / Mana Drain: канал по цели с лечением.
    if (this.tick < p.drainUntil && this.tick % 6 === 0) {
      const key = ABILITY_KEYS.find((k) => H[k].kind === "life_drain");
      const t = key ? this.enemies.find((e) => e.alive && e.id === p.drainTarget) : undefined;
      if (!key || !t || len(t.x - p.x, t.y - p.y) > (H[key].radius ?? 300) + 120) p.drainUntil = 0;
      else {
        const dmg = H[key].value[p.abilities[key]] * 0.1 * (key === "r" && this.talentPower("t25_ult") ? 1.5 : 1);
        this.damageEnemy(t, dmg, "burst");
        this.heal(dmg);
        if (this.tick % 12 === 0) this.pushFx("zap", t.x, t.y, p.x, p.y, 6);
      }
    }
    if (this.tick < p.zoneUntil && H.q.kind === "shrapnel" && this.tick % 12 === 0) {
      const radius = H.q.radius ?? 180;
      for (const e of this.enemiesWithin(p.zoneX, p.zoneY, radius)) { this.damageEnemy(e, H.q.value[p.abilities.q] * 0.2, "burst"); this.applyChill(e, 0.3, 0.4, false); }
    }
  }

  /** Zeus Static Field: любой каст снимает долю текущего HP всем вокруг (у босса — ограниченно). */
  private staticField(): void {
    const ab = this.hero.abilities.e;
    const lvl = this.player.abilities.e;
    if (ab.kind !== "static_field" || lvl === 0) return;
    const p = this.player;
    for (const e of this.enemiesWithin(p.x, p.y, ab.radius ?? 320)) this.damageEnemy(e, Math.min(e.hp * ab.value[lvl], e.kind.boss ? 60 : 1e9), "zap");
  }

  private eliteWithin(x: number, y: number, radius: number): Enemy | null {
    let best: Enemy | null = null, bestD = radius;
    for (const e of this.enemies) {
      if (!e.alive || !(e.kind.elite || e.kind.boss)) continue;
      const d = len(e.x - x, e.y - y) - e.kind.r;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  private strongestWithin(x: number, y: number, radius: number): Enemy | null {
    let best: Enemy | null = null;
    for (const e of this.enemies) {
      if (!e.alive || len(e.x - x, e.y - y) > radius + e.kind.r) continue;
      if (!best || e.kind.boss || (!best.kind.boss && e.maxHp > best.maxHp)) best = e;
    }
    return best;
  }

  private cullTarget(ab: AbilityDef): Enemy | null {
    const p = this.player;
    const threshold = ab.value[p.abilities.r] || 0;
    const radius = ab.radius ?? 130;
    let best: Enemy | null = null;
    for (const e of this.enemies) {
      if (!e.alive || len(e.x - p.x, e.y - p.y) > radius + e.kind.r) continue;
      if (e.kind.boss || (e.hp <= threshold && (!best || e.maxHp > best.maxHp))) best = e;
    }
    return best;
  }

  /** Maelstrom `mae_clap`: каст Q/R — нова со станом. */
  private thunderclap(): void {
    const power = this.upgradePower("mae_clap");
    if (power === 0) return;
    const p = this.player;
    const dmg = 40 * power * this.lightningMult();
    for (const e of this.enemiesWithin(p.x, p.y, 150)) {
      this.damageEnemy(e, dmg, "zap");
      e.stunUntil = Math.max(e.stunUntil, this.tick + sec(0.6));
    }
    this.pushFx("nova", p.x, p.y, 150, 0, 18);
  }

  private onAttackHit(e: Enemy, scale = 1): void {
    const p = this.player;
    let dmg = p.stats.damage * scale;
    let kind: FxKind = "hit";
    if (this.rng.float() < p.stats.critChance) { dmg *= p.stats.critMult; kind = "crit"; }
    this.events.hits++;
    if (kind === "crit") this.events.crits++;
    const head = this.hero.abilities.w;
    if (head.kind === "headshot" && p.abilities.w > 0 && this.rng.float() < 0.3) { dmg += head.value[p.abilities.w]; e.stunUntil = Math.max(e.stunUntil, this.tick + sec(0.25)); kind = "crit"; }
    // Фирменные пассивки (T13.15): души SF, ярость Ursa, меткость Drow, Time Lock Void — до удара; Cleave и Overload — после.
    const sig = this.hero.signature;
    const sc = this.sigScale();
    if (sig?.kind === "souls") dmg += p.stacks * sig.value * sc;
    else if (sig?.kind === "swipes") {
      if (p.stackTarget === e.id) p.stacks = Math.min(sig.cap ?? 12, p.stacks + 1); else { p.stacks = 1; p.stackTarget = e.id; }
      dmg += p.stacks * sig.value * sc;
    } else if (sig?.kind === "marksmanship") {
      if (Math.hypot(e.x - p.x, e.y - p.y) >= (sig.radius ?? 220)) { dmg *= 1 + sig.value * sc; kind = "crit"; }
    } else if (sig?.kind === "timelock" && this.rng.float() < Math.min(0.5, sig.value * sc)) {
      dmg += 20 * sc; e.stunUntil = Math.max(e.stunUntil, this.tick + sec(sig.duration ?? 0.5)); kind = "crit";
    }
    // Пассивки собственных китов на удар: Searing Arrows, Mana Break, Frost Arrows; ярость (God's Strength/Enrage/Warpath/Death Pact).
    for (const key of ABILITY_KEYS) {
      const ab = this.hero.abilities[key];
      const lvl = p.abilities[key];
      if (!ab.passive || lvl === 0) continue;
      if (ab.kind === "searing") { dmg += ab.value[lvl]; this.applyBurn(e, ab.value[lvl] * 0.5, 2); }
      else if (ab.kind === "mana_break") { dmg += ab.value[lvl]; this.applyChill(e, 0.25, 0.6, false); }
      else if (ab.kind === "frost_arrows") this.applyChill(e, ab.value[lvl], 2, false);
    }
    if (this.tick < p.rageUntil) dmg *= 1 + p.rageMult;
    this.damageEnemy(e, dmg, kind);
    if (sig?.kind === "cleave") { for (const o of this.enemiesWithin(e.x, e.y, sig.radius ?? 85)) if (o !== e) this.damageEnemy(o, dmg * Math.min(0.95, sig.value * sc), "slash"); }
    if (sig?.kind === "overload" && p.sigArmed) {
      p.sigArmed = false;
      for (const o of this.enemiesWithin(e.x, e.y, sig.radius ?? 80)) this.damageEnemy(o, sig.value * sc, "zap");
      this.pushFx("nova", e.x, e.y, sig.radius ?? 80, 0, 10);
    }
    if (p.stats.lifesteal > 0) p.hp = Math.min(p.stats.maxHp, p.hp + dmg * p.stats.lifesteal);
    // Школы «Attack»: статусы с удара.
    const burn = this.upgradePower("rad_strike");
    if (burn > 0) this.applyBurn(e, 6 * burn * this.burnMult(), 3);
    const chill = this.upgradePower("ska_bite");
    if (chill > 0) this.applyChill(e, Math.min(0.6, 0.3 + 0.05 * chill), 2.5);
    const chain = this.upgradePower("mae_chain");
    if (chain > 0 && this.rng.float() < 0.25 + 0.08 * chain) this.chainLightning(e, 20 * chain * this.lightningMult(), 3 + Math.floor(this.upgradePower("mae_mjollnir") * 2) + (this.upgradePower("leg_mae_thunder") > 0 ? 4 : 0) + Math.floor(this.upgradePower("hyb_superconductor") * 2));
  }

  private chainLightning(from: Enemy, dmg: number, targets: number): void {
    let current = from;
    const visited = new Set<number>([from.id]);
    for (let i = 0; i < targets; i++) {
      let best: Enemy | null = null, bestD = 160;
      for (const e of this.enemies) {
        if (!e.alive || visited.has(e.id)) continue;
        const d = len(e.x - current.x, e.y - current.y);
        if (d < bestD) { bestD = d; best = e; }
      }
      if (!best) break;
      visited.add(best.id);
      this.pushFx("zap", current.x, current.y, best.x, best.y, 8);
      this.damageEnemy(best, dmg, "zap");
      current = best;
    }
  }

  // ---------- школы: периодика и ауры ----------

  private schoolEffects(): void {
    const p = this.player;
    // Radiance aura — горение всем в радиусе (каждые 15 тиков обновляем статус).
    const aura = this.upgradePower("rad_aura");
    if (aura > 0 && this.tick % 15 === 0) {
      const radius = 110 * (1 + 0.1 * this.upgradePower("rad_inferno"));
      for (const e of this.enemiesWithin(p.x, p.y, radius)) this.applyBurn(e, 8 * aura * this.burnMult(), 1);
    }
    // Radiance ring — кольцо огненных снарядов.
    const ring = this.upgradePower("rad_ring");
    if (ring > 0 && this.tick >= p.ringAt) {
      p.ringAt = this.tick + Math.floor(sec(3) / (1 + 0.15 * ring));
      for (let i = 0; i < DIRS.length; i += 2) {
        const [dx, dy] = DIRS[i];
        this.spawnProjectile(p.x, p.y, dx * 260, dy * 260, 8, 18 * ring * this.burnMult(), sec(1.4), 2, "fire", false);
      }
    }
    // Skadi shards — веер льда в сторону ближайшего.
    const shards = this.upgradePower("ska_shards");
    if (shards > 0 && this.tick >= p.shardsAt) {
      p.shardsAt = this.tick + Math.floor(sec(2.2) / (1 + 0.1 * shards));
      const target = this.nearestEnemy(p.x, p.y, 420);
      if (target) {
        const d = len(target.x - p.x, target.y - p.y) || 1;
        const ux = (target.x - p.x) / d, uy = (target.y - p.y) / d;
        const fan: [number, number][] = [[ux, uy], rotate(ux, uy, COS15, SIN15), rotate(ux, uy, COS15, -SIN15), rotate(ux, uy, COS30, SIN30), rotate(ux, uy, COS30, -SIN30)];
        for (const [fx, fy] of fan) this.spawnProjectile(p.x, p.y, fx * 340, fy * 340, 7, 14 * shards, sec(1.2), 1, "shard", false);
      }
    }
    // Skadi aura — поле замедления.
    const slowField = this.upgradePower("ska_aura");
    if (slowField > 0 && this.tick % 10 === 0) {
      for (const e of this.enemiesWithin(p.x, p.y, 120)) this.applyChill(e, Math.min(0.5, 0.15 * slowField), 0.4, false);
    }
    // Maelstrom static — разряд по случайному врагу.
    const stat = this.upgradePower("mae_static");
    if (stat > 0 && this.tick >= p.staticAt) {
      p.staticAt = this.tick + sec(1.6);
      const targets = 1 + Math.floor(stat / 2);
      const pool = this.enemiesWithin(p.x, p.y, 200);
      for (let i = 0; i < targets && pool.length > 0; i++) {
        const idx = this.rng.int(pool.length);
        const e = pool.splice(idx, 1)[0];
        this.pushFx("zap", p.x, p.y, e.x, e.y, 8);
        this.damageEnemy(e, 24 * stat * this.lightningMult(), "zap");
      }
    }
  }

  private burnMult(): number {
    return (1 + 0.25 * this.upgradePower("rad_inferno")) * (this.upgradePower("leg_rad_sun") > 0 ? 1.75 : 1);
  }

  private lightningMult(): number {
    return (1 + 0.2 * this.upgradePower("mae_mjollnir")) * (this.upgradePower("leg_mae_thunder") > 0 ? 1.5 : 1);
  }

  upgradePower(id: string): number {
    return this.player.upgrades[id]?.power ?? 0;
  }

  private talentPower(id: string): number {
    return this.player.talents.includes(id) ? 1 : 0;
  }

  // ---------- статусы и урон ----------

  private statusSec(seconds: number): number {
    return this.rank.resistStatus ? seconds * 0.7 : seconds;
  }

  private applyBurn(e: Enemy, dps: number, seconds: number): void {
    if (e.kind.unstoppable) return;
    e.burnDps = Math.max(e.burnDps * (e.burnUntil > this.tick ? 1 : 0), dps);
    e.burnUntil = Math.max(e.burnUntil, this.tick + sec(this.statusSec(seconds)));
  }

  private applyChill(e: Enemy, slow: number, seconds: number, stack = true): void {
    if (e.kind.unstoppable) return;
    e.chillSlow = Math.max(e.chillUntil > this.tick ? e.chillSlow : 0, slow);
    e.chillUntil = Math.max(e.chillUntil, this.tick + sec(this.statusSec(seconds)));
    if (!stack) return;
    const snap = this.upgradePower("ska_snap");
    if (snap > 0) {
      e.chillStacks++;
      if (e.chillStacks >= 3) { e.chillStacks = 0; e.freezeUntil = Math.max(e.freezeUntil, this.tick + sec(this.statusSec(0.8 + 0.3 * snap))); }
    }
  }

  /** Множитель фирменной пассивки от её пассивного слота (kind "signature"); без слота или на 0-м уровне — 1. */
  private sigScale(): number {
    for (const key of ABILITY_KEYS) {
      const ab = this.hero.abilities[key];
      if (ab.kind === "signature") { const lvl = this.player.abilities[key]; return lvl > 0 ? ab.value[lvl] : 1; }
    }
    return 1;
  }

  damageEnemy(e: Enemy, amount: number, fx: FxKind): void {
    if (!e.alive || amount <= 0) return;
    let dmg = amount;
    // Vampiric Spirit (Wraith King): доля урона автоатак возвращается здоровьем.
    const vamp = this.hero.signature;
    if (fx === "hit" && vamp?.kind === "vampiric") this.heal(amount * vamp.value * this.sigScale());
    // Corrosive Haze (Slardar): помеченная цель получает больше от всего.
    if (this.tick < e.ampUntil) dmg *= 1 + e.ampMult;
    // Backstab (Riki): автоатака по оглушённой/замороженной/замедленной цели — «в спину».
    if (fx === "hit" && vamp?.kind === "backstab" && (this.tick < e.stunUntil || this.tick < e.freezeUntil || this.tick < e.chillUntil)) dmg *= 1 + vamp.value * this.sigScale();
    // Presence of the Dark Lord (SF): враги рядом с героем получают больше урона.
    const pres = this.hero.abilities.e;
    if (pres.kind === "presence" && this.player.abilities.e > 0 && len(e.x - this.player.x, e.y - this.player.y) <= (pres.radius ?? 300)) dmg *= 1 + pres.value[this.player.abilities.e];
    const shatter = this.upgradePower("ska_shatter");
    if (shatter > 0) {
      if (this.tick < e.freezeUntil) dmg *= 1 + 0.4 * shatter;
      else if (this.tick < e.chillUntil) dmg *= 1 + 0.1 * shatter;
    }
    if (this.tick < e.freezeUntil && this.upgradePower("leg_ska_glacier") > 0) dmg *= 2; // Ледник: вмороженные получают двойной урон
    // Гибриды школ: Пар — горящий и охлаждённый; Сверхпроводник — молния по вмороженному; Плазма — молния поджигает.
    const steam = this.upgradePower("hyb_steam");
    if (steam > 0 && this.tick < e.burnUntil && this.tick < e.chillUntil) dmg *= 1 + 0.25 * steam;
    const cond = this.upgradePower("hyb_superconductor");
    if (cond > 0 && fx === "zap" && this.tick < e.freezeUntil) dmg *= 1 + 0.35 * cond;
    const plasma = this.upgradePower("hyb_plasma");
    if (plasma > 0 && fx === "zap" && this.tick >= e.burnUntil) this.applyBurn(e, 5 * plasma, 2);
    e.hp -= dmg;
    e.hitAt = this.tick;
    if (e.kind.reflect) this.damagePlayer(Math.min(ARCADE.tormentor.reflectCap, dmg * e.kind.reflect));
    if (fx === "hit" || fx === "crit" || (e.kind.elite || e.kind.boss) && this.tick % 4 === 0) this.pushFx(fx, e.x, e.y - e.kind.r, 0, 0, 26, Math.round(dmg));
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy): void {
    e.alive = false;
    const p = this.player;
    p.kills++;
    this.events.kills++;
    const sig = this.hero.signature;
    if (sig?.kind === "souls") p.stacks = Math.min(sig.cap ?? 36, p.stacks + (e.kind.elite || e.kind.boss ? 6 : 1));
    if (sig?.kind === "deathpact") p.hp = Math.min(p.stats.maxHp, p.hp + sig.value * this.sigScale() * (e.kind.elite || e.kind.boss ? 5 : 1));
    if (e.kind.elite || e.kind.boss || e.kind.structure) this.events.eliteKills++;
    this.pushFx("die", e.x, e.y, e.kind.r, KIND_INDEX[e.kind.id] ?? 0, e.kind.elite || e.kind.boss ? 22 : 14);
    p.gold += e.kind.gold + p.stats.goldPerKill;
    this.dropShard(e.x, e.y, e.kind.xp);
    const blast = this.upgradePower("rad_blast");
    if (blast > 0 && this.tick < e.burnUntil) {
      const dmg = 25 * blast * this.burnMult();
      for (const o of this.enemiesWithin(e.x, e.y, 60)) if (o !== e) this.damageEnemy(o, dmg, "burst");
      this.pushFx("burst", e.x, e.y, 60, 0, 14);
    }
    // Пул врагов переиспользует объекты: ссылку на босса снимаем сразу, иначе «Рошан жив» проверяет
    // уже кобольда в том же объекте и глушит спавн до конца забега (баг a0.2–a0.5, 2026-09-05).
    if (e === this.roshan) this.roshan = null;
    if (e === this.ancient) this.ancient = null;
    if (e.kind.boss) {
      this.roshanKilled = true;
      this.aegisDrop = { x: e.x, y: e.y };
      this.shake = 24;
      this.pushFx("nova", e.x, e.y, 220, 0, 40);
    }
    if (e.kind.structure) {
      this.shake = 30;
      this.pushFx("nova", e.x, e.y, 400, 0, 60);
      this.finish("victory");
    }
    // Экипировка: элита и боссы роняют всегда, обычные — редко; уникальные — с боссов.
    if (e.kind.boss && !this.aegisDropped) { this.aegisDropped = true; this.dropLoot(e.x, e.y, uniqueGear("aegis_of_the_immortal", this.nextUid(), this.lootTier())); }
    else if (e.kind.boss) this.dropLoot(e.x, e.y, this.rollLoot("exotic"));
    else if (e.kind.id === "tormentor") this.dropLoot(e.x, e.y, uniqueGear("tormentors_shard", this.nextUid(), this.lootTier()));
    else if (e.kind.structure) this.loot.push(uniqueGear("heart_of_the_ancient", this.nextUid(), 3));
    else if (e.kind.elite) this.dropLoot(e.x, e.y, this.rollLoot(this.rollRarity()));
    else if (this.rng.float() < ARCADE.loot.commonChance) this.dropLoot(e.x, e.y, this.rollLoot(this.rollRarity()));
    if (e.kind.id === "tormentor") {
      // Награда за Tormentor: щедрость без платы — 60 с двойного опыта.
      this.greedUntil = Math.max(this.greedUntil, this.tick + ARCADE.greed.duration);
      this.pushFx("nova", e.x, e.y, 160, 0, 30);
    }
  }

  private damagePlayer(amount: number, stun = 0, by?: EnemyKind): void {
    const p = this.player;
    this.events.hurtBy = by ? KIND_INDEX[by.id] ?? -1 : -1;
    if (this.tick < p.invulnUntil || (p.burstLeft > 0 && this.hero.abilities.r.kind === "omni")) return;
    const sig = this.hero.signature;
    if (sig?.kind === "blur" && this.rng.float() < Math.min(0.5, sig.value * this.sigScale())) return; // уклонение PA
    if (this.tick < p.evadeUntil && this.rng.float() < p.evadeChance) return; // Windrun / Skeleton Walk / Moonlight Shadow
    if (this.upgradePower("leg_bkb") > 0 && this.rng.float() < 0.3) return; // BKB: треть ударов мимо
    const armor = p.stats.armor + (this.tick < p.armorBuffUntil ? 25 : 0);
    const reduction = (0.06 * armor) / (1 + 0.06 * armor);
    p.hp -= amount * (1 - reduction);
    this.events.hurt++;
    if (sig?.kind === "quill" && this.tick >= p.sigUntil) {
      // Quill Spray Bristleback: залп иглами в ответ на урон, не чаще раза в 0.8 с (при 0.5 с бот брал 75–87% в разминке).
      p.sigUntil = this.tick + sec(0.8);
      for (const e of this.enemiesWithin(p.x, p.y, sig.radius ?? 130)) this.damageEnemy(e, sig.value * this.sigScale(), "burst");
      this.pushFx("nova", p.x, p.y, sig.radius ?? 130, 0, 8);
    }
    const helix = this.hero.abilities.e;
    if (helix.kind === "counter_helix" && p.abilities.e > 0 && this.rng.float() < 0.12 + 0.04 * p.abilities.e) {
      for (const e of this.enemiesWithin(p.x, p.y, helix.radius ?? 130)) this.damageEnemy(e, helix.value[p.abilities.e], "spin");
      this.pushFx("nova", p.x, p.y, helix.radius ?? 130, 0, 10);
    }
    if (stun > 0 && this.tick >= p.spinUntil && !p.stats.stunImmune) p.stunUntil = Math.max(p.stunUntil, this.tick + sec(stun));
    this.shake = Math.max(this.shake, 4);
  }

  private heal(amount: number): void {
    const p = this.player;
    const before = p.hp;
    p.hp = Math.min(p.stats.maxHp, p.hp + amount);
    if (p.hp - before >= 1) this.pushFx("heal", p.x, p.y - 30, 0, 0, 30, Math.round(p.hp - before));
  }

  private onLethal(): void {
    const p = this.player;
    if (p.aegis) {
      p.aegis = false;
      p.aegisUsed = true;
      this.revive(p.stats.maxHp);
      return;
    }
    // Reincarnation (Wraith King): пассивный ульт — встаёт сам раз в перезарядку с долей HP по уровню.
    const r = this.hero.abilities.r;
    if (r.kind === "reincarnation" && p.abilities.r > 0 && this.tick >= p.reincAt) {
      p.reincAt = this.tick + sec(r.cooldown);
      this.revive(p.stats.maxHp * r.value[p.abilities.r]);
      return;
    }
    p.hp = 0;
    this.finish("dead");
  }

  /** Подъём после смертельного урона (Aegis / Reincarnation): HP, неуязвимость, толчок и стан толпы вокруг. */
  private revive(hp: number): void {
    const p = this.player;
    {
      p.hp = Math.max(1, Math.min(p.stats.maxHp, hp));
      p.invulnUntil = this.tick + sec(ARCADE.player.reviveInvuln);
      for (const e of this.enemies) {
        if (!e.alive || e.kind.boss) continue;
        const d = len(e.x - p.x, e.y - p.y);
        if (d < ARCADE.player.revivePush) {
          const k = (ARCADE.player.revivePush - d) / (d || 1);
          e.x = clamp(e.x + (e.x - p.x) * k, 0, ARCADE.world.w);
          e.y = clamp(e.y + (e.y - p.y) * k, 0, ARCADE.world.h);
          e.stunUntil = this.tick + sec(1.2);
        }
      }
      this.shake = 20;
      this.pushFx("revive", p.x, p.y, 0, 0, 50);
    }
  }

  private finish(outcome: "dead" | "victory"): void {
    const p = this.player;
    this.over = {
      outcome, tick: this.tick, level: p.level, kills: p.kills, gold: p.gold, schools: [...p.schools],
      upgrades: Object.keys(p.upgrades), roshanKilled: this.roshanKilled, rank: this.rank.step, greedStacks: this.greedStacks, items: p.items.map((i) => i.id), hero: this.hero.id, act: this.act, neutral: p.neutral, loot: [...this.loot],
    };
  }

  private regenAndHazards(): void {
    const p = this.player;
    if (this.tick % 6 === 0 && p.hp < p.stats.maxHp) p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.regen * 0.1);
    if (this.shrine.alive && len(this.shrine.x - p.x, this.shrine.y - p.y) < 34) {
      this.shrine.alive = false;
      this.greedUntil = this.tick + ARCADE.greed.duration;
      this.greedStacks++;
      this.shake = 8;
      this.pushFx("nova", p.x, p.y, 120, 0, 24);
    }
    if (this.bounty.alive && len(this.bounty.x - p.x, this.bounty.y - p.y) < 34) {
      this.bounty.alive = false;
      p.gold += this.bounty.value;
      this.pushFx("heal", p.x, p.y - 30, 0, 0, 40, this.bounty.value);
    }
    if (this.shopkeeper.alive && !this.shopOpen && len(this.shopkeeper.x - p.x, this.shopkeeper.y - p.y) < 44) this.openShop();
    if (this.neutralToken.alive && !this.neutralOpen && len(this.neutralToken.x - p.x, this.neutralToken.y - p.y) < 36) this.openNeutral();
    if (this.chest.alive && !this.lootOpen && len(this.chest.x - p.x, this.chest.y - p.y) < 40) {
      this.chest.alive = false;
      this.lootOpen = this.rollLoot(this.rollRarity());
      this.pushFx("levelup", this.chest.x, this.chest.y, 0, 0, 24);
    }
    if (!this.lootOpen) {
      for (const g of this.groundLoot) {
        if (g.until > 0 && len(g.x - p.x, g.y - p.y) < 30) { g.until = -1; this.lootOpen = g.item; break; }
      }
    }
    if (this.aegisDrop && len(this.aegisDrop.x - p.x, this.aegisDrop.y - p.y) < 40) {
      p.aegis = true;
      this.aegisDrop = null;
      this.pushFx("levelup", p.x, p.y, 0, 0, 40);
    }
  }

  // ---------- враги ----------

  private spawnTick(): void {
    const p = this.player;
    const A = ARCADE.acts[this.act];
    // Рошан по расписанию акта; пока жив — тишина. Второй — сильнее (респавн).
    if (this.roshanIdx < this.roshanAt.length && this.tick === this.roshanAt[this.roshanIdx]) {
      const r = this.pit ? this.spawnEnemy(ENEMY_KINDS.roshan, ARCADE.pit.x, ARCADE.pit.y) : this.spawnEnemy(ENEMY_KINDS.roshan, ...this.ringPoint(420, 480));
      if (this.roshanIdx > 0) { r.hp *= ARCADE.secondRoshan.hpMult; r.maxHp *= ARCADE.secondRoshan.hpMult; r.dmg *= ARCADE.secondRoshan.dmgMult; }
      this.roshanIdx++;
      this.roshan = r;
      this.roshanSpawnedAt = this.tick;
      this.shake = 12;
      return;
    }
    // Акт 3: пока ты не в яме, лес живёт своей жизнью — Рошан ждёт тебя, спавн идёт.
    if (this.roshan?.alive && (!this.pit || this.playerInPit())) return;
    // Tormentor и Древний — не глушат обычный спавн.
    if (!this.tormentorSpawned && A.tormentorAt > 0 && this.tick >= A.tormentorAt) {
      this.tormentorSpawned = true;
      this.spawnEnemy(ENEMY_KINDS.tormentor, ...this.ringPoint(ARCADE.spawn.ringMin, ARCADE.spawn.ringMin + 40));
    }
    if (!this.ancient && A.ancientAt > 0 && this.tick >= A.ancientAt) {
      this.ancient = this.spawnEnemy(ENEMY_KINDS.ancient, ...this.ringPoint(520, 580));
      this.nextMegaAt = this.tick;
      this.shake = 16;
    }
    if (this.ancient?.alive && this.tick >= this.nextMegaAt) {
      this.nextMegaAt = this.tick + ARCADE.ancient.megaEvery;
      const late = A.ancientDeadline > 0 && this.tick >= A.ancientDeadline ? ARCADE.ancient.lateMult : 1;
      const size = ARCADE.ancient.megaSize * late;
      for (let i = 0; i < size; i++) {
        const m = this.spawnEnemy(ENEMY_KINDS.lane_creep, this.ancient.x + (this.rng.float() - 0.5) * 200, this.ancient.y + (this.rng.float() - 0.5) * 200);
        m.hp *= ARCADE.ancient.megaHpMult; m.maxHp *= ARCADE.ancient.megaHpMult;
      }
      if (late > 1) this.spawnEnemy(ENEMY_KINDS.siege_creep, this.ancient.x, this.ancient.y);
    }
    const min = this.minutes;
    const greedy = this.tick < this.greedUntil;
    const rate = (ARCADE.spawn.base + ARCADE.spawn.perMin * Math.min(min, ARCADE.spawn.kneeMin) + ARCADE.spawn.latePerMin * Math.max(0, min - ARCADE.spawn.kneeMin)) * (this.roshanKilled ? ARCADE.postRoshanRate : 1) * this.rank.spawnMult * (greedy ? ARCADE.greed.spawnMult : 1) * (this.ancient?.alive ? ARCADE.ancient.spawnMult : 1);
    this.spawnAcc += rate * DT;
    const pool = spawnPool(min, this.act);
    const alive = this.aliveEnemies();
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (alive >= ARCADE.spawn.cap) continue;
      this.spawnEnemy(weightedPick(this.rng, pool), ...this.ringPoint(ARCADE.spawn.ringMin, ARCADE.spawn.ringMax));
    }
    // Крип-волна: пачка с одной стороны, каждая пятая — с осадным.
    if (this.tick - this.lastWaveAt >= ARCADE.waves.every && this.tick > 0) {
      this.lastWaveAt = this.tick;
      const waveNo = Math.round(this.tick / ARCADE.waves.every);
      const [ox, oy] = this.ringPoint(ARCADE.spawn.ringMin, ARCADE.spawn.ringMin + 40);
      const size = Math.round((ARCADE.waves.size + Math.floor(min / 2)) * (this.rank.bigWaves ? 1.5 : 1));
      for (let i = 0; i < size; i++) this.spawnEnemy(ENEMY_KINDS.lane_creep, ox + (this.rng.float() - 0.5) * 120, oy + (this.rng.float() - 0.5) * 120);
      if (waveNo % (this.rank.siegeOften ? 3 : ARCADE.waves.siegeEvery) === 0) this.spawnEnemy(ENEMY_KINDS.siege_creep, ox, oy);
    }
    if (this.golemIdx < ARCADE.waves.golemAt.length && this.tick >= ARCADE.waves.golemAt[this.golemIdx]) {
      this.golemIdx++;
      this.spawnEnemy(ENEMY_KINDS.golem, ...this.ringPoint(ARCADE.spawn.ringMin, ARCADE.spawn.ringMin + 20));
      if (this.rank.doubleGolems) this.spawnEnemy(ENEMY_KINDS.golem, ...this.ringPoint(ARCADE.spawn.ringMin, ARCADE.spawn.ringMin + 20));
    }
    if (this.rank.trollPacks && this.tick >= this.nextTrollPackAt) {
      this.nextTrollPackAt = this.tick + sec(45);
      for (let i = 0; i < 8; i++) this.spawnEnemy(ENEMY_KINDS.hill_troll, ...this.ringPoint(ARCADE.spawn.ringMin, ARCADE.spawn.ringMin + 30));
    }
    // Руна щедрости: появляется недалеко, живёт ограниченно, следующая — по расписанию.
    if (this.tick >= this.nextShrineAt && !this.shrine.alive) {
      this.nextShrineAt = this.tick + ARCADE.greed.every;
      const [sx, sy] = this.pit ? this.riverPoint() : this.ringPoint(ARCADE.greed.distMin, ARCADE.greed.distMax);
      this.shrine = { alive: true, x: sx, y: sy, until: this.tick + ARCADE.greed.lifetime };
    }
    if (this.shrine.alive && this.tick >= this.shrine.until) this.shrine.alive = false;
    // Secret Shop: торговец в окна расписания.
    if (this.shopIdx < ARCADE.shop.at.length && this.tick >= ARCADE.shop.at[this.shopIdx]) {
      this.shopIdx++;
      const [sx, sy] = this.ringPoint(ARCADE.shop.distMin, ARCADE.shop.distMax);
      this.shopkeeper = { alive: true, x: sx, y: sy, until: this.tick + ARCADE.shop.lifetime, value: 0 };
    }
    if (this.shopkeeper.alive && this.tick >= this.shopkeeper.until) this.shopkeeper.alive = false;
    // Bounty-руна каждые 3 минуты.
    if (this.tick >= this.nextBountyAt) {
      this.nextBountyAt += ARCADE.bounty.every;
      const [bx, by] = this.pit ? this.riverPoint() : this.ringPoint(ARCADE.shop.distMin, ARCADE.shop.distMax);
      this.bounty = { alive: true, x: bx, y: by, until: this.tick + ARCADE.bounty.lifetime, value: Math.round(ARCADE.bounty.base + ARCADE.bounty.perMin * min) };
    }
    if (this.bounty.alive && this.tick >= this.bounty.until) this.bounty.alive = false;
    // Нейтральный токен по тирам-минутам.
    if (this.neutralIdx < NEUTRAL_TIER_AT_MIN.length && min >= NEUTRAL_TIER_AT_MIN[this.neutralIdx] && !this.neutralToken.alive) {
      this.neutralIdx++;
      const [nx, ny] = this.ringPoint(ARCADE.neutral.distMin, ARCADE.neutral.distMax);
      this.neutralToken = { alive: true, x: nx, y: ny, until: this.tick + ARCADE.neutral.lifetime, value: this.neutralIdx };
    }
    if (this.neutralToken.alive && this.tick >= this.neutralToken.until) this.neutralToken.alive = false;
    // Сундук с экипировкой.
    if (this.tick >= this.nextChestAt && !this.chest.alive) {
      this.nextChestAt = this.tick + ARCADE.loot.chestEvery;
      const [cx, cy] = this.ringPoint(ARCADE.loot.distMin, ARCADE.loot.distMax);
      this.chest = { alive: true, x: cx, y: cy, until: this.tick + ARCADE.loot.chestLifetime, value: 0 };
    }
    if (this.chest.alive && this.tick >= this.chest.until) this.chest.alive = false;
    for (const g of this.groundLoot) if (this.tick >= g.until) g.until = -1;
    if (this.groundLoot.length && this.tick % 60 === 0) this.groundLoot = this.groundLoot.filter((g) => g.until > 0);
    void p;
  }

  /** Акт 3: точка в русле реки недалеко от игрока по X (руны живут в реке, как в Dota). */
  private riverPoint(): [number, number] {
    const R = ARCADE.river;
    const x = clamp(this.player.x + (this.rng.float() * 2 - 1) * 500, 40, ARCADE.world.w - 40);
    const y = R.y + (this.rng.float() * 2 - 1) * (R.halfWidth - 30);
    return [x, y];
  }

  /** Точка на квадратном «кольце» вокруг игрока (без тригонометрии), в границах мира. */
  private ringPoint(rMin: number, rMax: number): [number, number] {
    const p = this.player;
    const r = rMin + this.rng.float() * (rMax - rMin);
    const side = this.rng.int(4);
    const t = (this.rng.float() * 2 - 1) * r;
    let x = p.x, y = p.y;
    if (side === 0) { x += r; y += t; } else if (side === 1) { x -= r; y += t; } else if (side === 2) { x += t; y += r; } else { x += t; y -= r; }
    // Уперлись в край мира — зеркалим на другую сторону игрока, чтобы враг не появился в кадре.
    if (x < 8 || x > ARCADE.world.w - 8) x = p.x - (x - p.x);
    if (y < 8 || y > ARCADE.world.h - 8) y = p.y - (y - p.y);
    return this.obstacles.resolve(clamp(x, 8, ARCADE.world.w - 8), clamp(y, 8, ARCADE.world.h - 8), 24);
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number): Enemy {
    const min = this.minutes;
    const greed = 1 + ARCADE.greed.powerPerStack * this.greedStacks;
    const early = Math.min(min, ARCADE.spawn.kneeMin), late = Math.max(0, min - ARCADE.spawn.kneeMin);
    // Множитель акта — только лесу: боссы и Древний одинаковы во всех актах, иначе акт 3 = Рошан ×1.3.
    const actHp = kind.boss || kind.structure ? 1 : ARCADE.acts[this.act].hpMult ?? 1;
    const hpMult = (kind.boss || kind.structure ? 1 : 1 + ARCADE.spawn.hpPerMin * early + ARCADE.spawn.lateHpPerMin * late) * this.rank.hpMult * greed * actHp;
    const dmgMult = (kind.boss || kind.structure ? 1 : 1 + ARCADE.spawn.dmgPerMin * early + ARCADE.spawn.lateDmgPerMin * late) * this.rank.dmgMult * greed;
    let e = this.enemies.find((o) => !o.alive);
    if (!e) { e = emptyEnemy(kind); this.enemies.push(e); }
    Object.assign(e, emptyEnemy(kind), { id: this.nextEnemyId++, alive: true, x, y, hp: kind.hp * hpMult, maxHp: kind.hp * hpMult, dmg: kind.dmg * dmgMult });
    return e;
  }

  private rebuildGrid(): void {
    this.grid.clear();
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const key = cellKey(e.x, e.y);
      const cell = this.grid.get(key);
      if (cell) cell.push(e); else this.grid.set(key, [e]);
    }
  }

  /** Rupture: урон за пройденный путь (value за 100 px), пока метка жива. */
  private tickRupture(): void {
    for (const e of this.enemies) {
      if (!e.alive || this.tick >= e.ruptureUntil) continue;
      const d = len(e.x - e.lastX, e.y - e.lastY);
      if (d > 0.5 && d < 200) this.damageEnemy(e, e.ruptureDps * d / 100, "burst");
      e.lastX = e.x; e.lastY = e.y;
    }
  }

  /** Потиковые пассивки героя: Berserker's Blood (Huskar) — скорость атаки от потерянного HP через механику frenzy;
   *  Thirst (Bloodseeker) — ускорение, пока рядом есть враг с малым HP. */
  private heroPassives(): void {
    const p = this.player;
    for (const key of ABILITY_KEYS) {
      const ab = this.hero.abilities[key];
      const lvl = p.abilities[key];
      if (ab.kind === "berserk_blood" && lvl > 0) {
        const missing = 1 - Math.max(0, Math.min(1, p.hp / p.stats.maxHp));
        if (missing > 0.05 && this.tick >= p.frenzyUntil - 2) { p.frenzyUntil = this.tick + 2; p.frenzyMult = ab.value[lvl] * missing; }
      }
    }
    const sig = this.hero.signature;
    if (sig?.kind === "thirst" && this.tick % 10 === 0) {
      const r = sig.radius ?? 600;
      for (const e of this.enemies) {
        if (!e.alive || e.hp > e.maxHp * sig.value * this.sigScale()) continue;
        if (len(e.x - p.x, e.y - p.y) <= r) { p.hasteUntil = Math.max(p.hasteUntil, this.tick + 12); break; }
      }
    }
  }

  private moveEnemies(): void {
    const p = this.player;
    const B = ARCADE.boss;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const frozen = this.tick < e.freezeUntil || this.tick < e.stunUntil;
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = len(dx, dy) || 1;
      e.contactCd = Math.max(0, e.contactCd - 1);
      e.shotCd = Math.max(0, e.shotCd - 1);
      // Горение тикает независимо от движения.
      if (this.tick < e.burnUntil && this.tick % 12 === 0) this.damageEnemy(e, e.burnDps * 0.2, "burst");
      if (!e.alive) continue;
      if (e.kind.boss) { this.moveBoss(e, dx, dy, d, frozen); continue; }
      if (e.kind.structure) {
        const shot = e.kind.ranged;
        if (shot && d < shot.range && e.shotCd === 0) {
          e.shotCd = sec(shot.every);
          this.spawnProjectile(e.x, e.y, dx / d * shot.speed, dy / d * shot.speed, 10, e.dmg, sec(2.4), 0, "siege", true);
        }
        continue;
      }
      if (frozen && !e.kind.unstoppable) continue;
      let speed = e.kind.speed * this.rank.speedMult * (ARCADE.acts[this.act].speedMult ?? 1);
      if (this.tick < e.chillUntil) speed *= 1 - e.chillSlow;
      const ranged = e.kind.ranged;
      if (ranged && d < ranged.range) {
        if (e.shotCd === 0) {
          e.shotCd = sec(ranged.every);
          this.spawnProjectile(e.x, e.y, dx / d * ranged.speed, dy / d * ranged.speed, 9, e.dmg, sec(2.2), 0, "siege", true);
        }
        if (d < ranged.range * 0.6) continue;
      }
      // Мягкое расталкивание с соседями по клетке — толпа не схлопывается в точку.
      let sx = 0, sy = 0;
      const cell = this.grid.get(cellKey(e.x, e.y));
      if (cell) {
        for (const o of cell) {
          if (o === e) continue;
          const ox = e.x - o.x, oy = e.y - o.y;
          const od = len(ox, oy);
          const minD = e.kind.r + o.kind.r;
          if (od > 0 && od < minD) { sx += ox / od * (minD - od); sy += oy / od * (minD - od); }
        }
      }
      const ex0 = e.x, ey0 = e.y;
      e.x += (dx / d * speed) * DT + sx * 0.5;
      e.y += (dy / d * speed) * DT + sy * 0.5;
      if (!e.kind.boss && !e.kind.structure && !e.kind.unstoppable) {
        [e.x, e.y] = this.obstacles.resolve(e.x, e.y, e.kind.r * 0.8);
        // Застрял за деревом — обойти по касательной (иначе толпа копится за стволами и не доходит).
        if (len(e.x - ex0, e.y - ey0) < speed * DT * 0.4) {
          const [mx, my] = this.obstacles.steer(ex0, ey0, dx / d, dy / d, e.kind.r * 0.8, 28);
          e.x = ex0 + mx * speed * DT; e.y = ey0 + my * speed * DT;
          [e.x, e.y] = this.obstacles.resolve(e.x, e.y, e.kind.r * 0.8);
        }
      }
      // Контакт с игроком.
      if (d < e.kind.r + ARCADE.player.r + 2 && e.contactCd === 0) {
        e.contactCd = sec(ARCADE.player.contactEvery);
        this.damagePlayer(e.dmg, 0, e.kind);
      }
    }
    void B;
  }

  private moveBoss(e: Enemy, dx: number, dy: number, d: number, frozen: boolean): void {
    const B = ARCADE.boss;
    e.slamCd = Math.max(0, e.slamCd - 1);
    const enraged = this.tick - this.roshanSpawnedAt >= B.enrageAfter;
    if (e.slamT > 0) {
      e.slamT--;
      if (e.slamT === 0) {
        const p = this.player;
        if (len(p.x - e.slamX, p.y - e.slamY) <= B.slamRadius + ARCADE.player.r) this.damagePlayer(B.slamDmg * (enraged ? 3 : 1), B.slamStun, e.kind);
        this.shake = Math.max(this.shake, 10);
        this.pushFx("nova", e.slamX, e.slamY, B.slamRadius, 0, 16);
        e.slamCd = B.slamCooldown;
      }
      return;
    }
    // Восстановление после удара: босс стоит, контактом не бьёт — окно для мили.
    if (e.slamCd > B.slamCooldown - B.slamRecovery) return;
    if (frozen) return;
    // Акт 3: Рошан не выходит из ямы — снаружи он идёт домой и лечится.
    if (this.pit) {
      const P = ARCADE.pit;
      const home = len(e.x - P.x, e.y - P.y);
      if (len(this.player.x - P.x, this.player.y - P.y) > P.leash) {
        if (home > 8) { e.x += (P.x - e.x) / home * e.kind.speed * DT; e.y += (P.y - e.y) / home * e.kind.speed * DT; }
        if (this.tick % 60 === 0) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * P.regenPerSec);
        return;
      }
    }
    if (d <= B.slamRange + ARCADE.player.r && e.slamCd === 0) {
      e.slamT = B.slamTelegraph;
      e.slamX = this.player.x;
      e.slamY = this.player.y;
      return;
    }
    let speed = (d > B.chaseFrom ? B.chaseSpeed : e.kind.speed) * (enraged ? 1.6 : 1);
    if (this.tick < e.chillUntil) speed *= 1 - e.chillSlow * 0.5;
    e.x += dx / d * speed * DT;
    e.y += dy / d * speed * DT;
    if (d < e.kind.r + ARCADE.player.r + 2 && e.contactCd === 0) {
      e.contactCd = sec(B.contactEvery);
      this.damagePlayer(e.dmg * (enraged ? 3 : 1), 0, e.kind);
    }
  }

  // ---------- снаряды и шарды ----------

  private spawnProjectile(x: number, y: number, vx: number, vy: number, r: number, dmg: number, ttl: number, pierce: number, kind: Projectile["kind"], fromEnemy: boolean, attack = false): void {
    let pr = this.projectiles.find((o) => !o.alive);
    if (!pr) { pr = { alive: false, x: 0, y: 0, vx: 0, vy: 0, r: 0, dmg: 0, ttl: 0, pierce: 0, hits: [], kind: "fire", fromEnemy: false, attack: false }; this.projectiles.push(pr); }
    pr.alive = true; pr.x = x; pr.y = y; pr.vx = vx; pr.vy = vy; pr.r = r; pr.dmg = dmg; pr.ttl = ttl; pr.pierce = pierce; pr.hits.length = 0; pr.kind = kind; pr.fromEnemy = fromEnemy; pr.attack = attack;
  }

  private moveProjectiles(): void {
    const p = this.player;
    for (const pr of this.projectiles) {
      if (!pr.alive) continue;
      pr.x += pr.vx * DT;
      pr.y += pr.vy * DT;
      pr.ttl--;
      if (pr.ttl <= 0 || pr.x < 0 || pr.y < 0 || pr.x > ARCADE.world.w || pr.y > ARCADE.world.h) { pr.alive = false; continue; }
      if (pr.fromEnemy) {
        if (len(pr.x - p.x, pr.y - p.y) < pr.r + ARCADE.player.r) { this.damagePlayer(pr.dmg); pr.alive = false; }
        continue;
      }
      const cx = Math.floor(pr.x / GRID), cy = Math.floor(pr.y / GRID);
      for (let gx = cx - 1; gx <= cx + 1 && pr.alive; gx++) {
        for (let gy = cy - 1; gy <= cy + 1 && pr.alive; gy++) {
          const cell = this.grid.get(gx * 100000 + gy);
          if (!cell) continue;
          for (const e of cell) {
            if (!e.alive || pr.hits.includes(e.id)) continue;
            if (len(e.x - pr.x, e.y - pr.y) > e.kind.r + pr.r) continue;
            pr.hits.push(e.id);
            if (pr.attack) this.onAttackHit(e);
            else this.damageEnemy(e, pr.dmg, pr.kind === "zap" ? "zap" : "burst");
            if (pr.kind === "fire") this.applyBurn(e, pr.dmg * 0.4, 2);
            if (pr.kind === "shard") this.applyChill(e, 0.3, 2);
            if (pr.pierce <= 0) { pr.alive = false; break; }
            pr.pierce--;
          }
        }
      }
    }
  }

  private dropShard(x: number, y: number, xp: number): void {
    let free: Shard | null = null;
    let alive = 0;
    for (const s of this.shards) { if (s.alive) alive++; else if (!free) free = s; }
    if (alive >= ARCADE.xp.shardCap) {
      // Переполнение: вливаем опыт в ближайший живой шард — ничего не теряется.
      let best: Shard | null = null, bestD = Infinity;
      for (const s of this.shards) { if (!s.alive) continue; const d = len(s.x - x, s.y - y); if (d < bestD) { bestD = d; best = s; } }
      if (best) best.xp += xp;
      return;
    }
    if (!free) { free = { alive: false, x: 0, y: 0, xp: 0 }; this.shards.push(free); }
    free.alive = true; free.x = x; free.y = y; free.xp = xp;
  }

  /** Состав питомцев по рангам апгрейдов: волков 1 + Стая, медведь и ястреб по одному. Новые появляются у героя. */
  private syncPets(): void {
    const p = this.player;
    const want: Record<PetKind, number> = {
      hawk: (p.upgrades.beast_hawk?.rank ?? 0) > 0 ? 1 : 0,
      wolf: (p.upgrades.beast_wolf?.rank ?? 0) > 0 ? 1 + (p.upgrades.beast_pack?.rank ?? 0) : 0,
      bear: (p.upgrades.beast_bear?.rank ?? 0) > 0 ? 1 : 0,
    };
    for (const kind of Object.keys(want) as PetKind[]) {
      let have = this.pets.filter((q) => q.kind === kind).length;
      while (have < want[kind]) { this.pets.push({ kind, x: p.x + (this.rng.float() - 0.5) * 60, y: p.y + 40 + this.rng.float() * 20, cd: 0, facingX: 1, facingY: 0, hitAt: -999, inReach: false }); have++; }
    }
  }

  private petPower(): number {
    return 1 + 0.35 * (this.player.upgrades.beast_roar?.rank ?? 0);
  }

  private tickPets(): void {
    if (this.pets.length === 0) return;
    const p = this.player;
    for (let i = 0; i < this.pets.length; i++) {
      const pet = this.pets[i];
      const def = PETS[pet.kind];
      const rank = this.player.upgrades[pet.kind === "hawk" ? "beast_hawk" : pet.kind === "wolf" ? "beast_wolf" : "beast_bear"]?.rank ?? 1;
      pet.cd = Math.max(0, pet.cd - 1);
      // Цель: ближайший враг в радиусе поиска; иначе — держаться рядом с героем (каждый со своим смещением).
      const target = def.seek > 0 ? this.nearestEnemy(pet.x, pet.y, def.seek) : null;
      let tx: number, ty: number;
      if (target) { tx = target.x; ty = target.y; }
      else { const ang = (i * 2.4) % 6.283; tx = p.x + Math.cos(ang) * def.leash; ty = p.y + Math.sin(ang) * def.leash; }
      const dx = tx - pet.x, dy = ty - pet.y, d = len(dx, dy) || 1;
      const stop = target ? def.reach * 0.8 + target.kind.r : 8;
      const far = len(pet.x - p.x, pet.y - p.y);
      // Слишком далеко от героя — телепорт за спину (как Spirit Bear на привязи).
      if (far > 520) { pet.x = p.x - p.facingX * 30; pet.y = p.y - p.facingY * 30; continue; }
      if (d > stop) {
        const sp = def.speed * (far > 300 ? 1.6 : 1) * DT;
        pet.x += dx / d * Math.min(sp, d - stop); pet.y += dy / d * Math.min(sp, d - stop);
        pet.facingX = dx / d; pet.facingY = dy / d;
      }
      if (pet.kind !== "hawk") [pet.x, pet.y] = this.obstacles.resolve(pet.x, pet.y, def.r);
      // Удар. Перезарядка — восстановление после удара, а не таймер погони: дойдя до новой цели, готовый питомец бьёт
      // сразу, а с недоигранной перезарядкой — не позже чем через 0.2 с (фидбэк владельца 2026-09-06: волк/медведь бежали
      // рядом с жертвой 2–3 с и только потом кусали). Нижняя граница между двумя ударами — половина `every`, чтобы прыжки
      // по толпе не удваивали DPS.
      const inReach = !!target && len(target.x - pet.x, target.y - pet.y) <= def.reach + target.kind.r;
      if (inReach && !pet.inReach) pet.cd = Math.min(pet.cd, Math.max(PET_REARM, sec(def.every) / 2 - (this.tick - pet.hitAt)));
      pet.inReach = inReach;
      if (target && inReach && pet.cd === 0) {
        pet.cd = sec(def.every);
        pet.hitAt = this.tick;
        let dmg = def.dmg * rank * this.petPower();
        const hunt = this.upgradePower("hyb_wild_hunt");
        if (hunt > 0 && (this.tick < target.chillUntil || this.tick < target.stunUntil)) dmg *= 1 + 0.3 * hunt; // Дикая охота
        this.damageEnemy(target, dmg, "hit");
        if (def.slow) this.applyChill(target, def.slow, 1, false);
        if (def.stun && !target.kind.unstoppable && this.rng.float() < def.stun) target.stunUntil = Math.max(target.stunUntil, this.tick + sec(0.3));
      }
      // Ястреб: собирает шарды вокруг себя (радиус растёт с рангом).
      if (def.collect) {
        const rr = def.collect + 30 * (rank - 1);
        for (const sh of this.shards) {
          if (!sh.alive) continue;
          const sd = len(sh.x - pet.x, sh.y - pet.y);
          if (sd < rr) { const ddx = pet.x - sh.x, ddy = pet.y - sh.y; sh.x += ddx / (sd || 1) * ARCADE.xp.magnetSpeed * 1.5 * DT; sh.y += ddy / (sd || 1) * ARCADE.xp.magnetSpeed * 1.5 * DT; if (sd < 14) { sh.alive = false; this.events.pickups++; this.gainXp(sh.xp); } }
        }
      }
    }
  }

  private collectShards(): void {
    const p = this.player;
    const pick = p.stats.pickup;
    for (const s of this.shards) {
      if (!s.alive) continue;
      const dx = p.x - s.x, dy = p.y - s.y;
      const d = len(dx, dy);
      if (d > pick) continue;
      if (d < 14) { s.alive = false; this.events.pickups++; this.gainXp(s.xp); continue; }
      s.x += dx / d * ARCADE.xp.magnetSpeed * DT;
      s.y += dy / d * ARCADE.xp.magnetSpeed * DT;
    }
  }

  private gainXp(raw: number): void {
    const p = this.player;
    let xp = raw;
    if (this.tick < this.greedUntil) xp *= ARCADE.greed.xpMult;
    if (this.rank.lessXp) xp *= 0.8;
    xp *= 1 + p.stats.xpMult;
    p.xp += xp;
    if (p.xp >= p.xpNext && !this.pending) {
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = xpToNext(p.level);
      this.pushFx("levelup", p.x, p.y, 0, 0, 40);
      this.pending = this.rollOffers();
      if (this.pending.length === 0) this.pending = null;
    }
  }

  // ---------- Secret Shop ----------

  private openShop(): void {
    this.shopOpen = true;
    this.shopRerolls = 0;
    this.shopOffers = this.rollShopOffers();
  }

  private rollShopOffers(): ShopOffer[] {
    const offers: ShopOffer[] = [];
    const pool = [...ARCADE_ITEMS];
    for (let i = 0; i < ARCADE.shop.offers && pool.length > 0; i++) {
      const def = pool.splice(this.rng.int(pool.length), 1)[0];
      const rarity = this.rollRarity();
      offers.push({ id: def.id, rarity, price: Math.round(def.price * ITEM_PRICE_MULT[rarity]) });
    }
    return offers;
  }

  shopRerollPrice(): number {
    return ARCADE.shop.rerollBase + ARCADE.shop.rerollStep * this.shopRerolls;
  }

  private shopAction(act: number): void {
    const p = this.player;
    if (act >= 1 && act <= 3) {
      const offer = this.shopOffers[act - 1];
      if (!offer || p.gold < offer.price || p.items.length >= ARCADE.shop.slots) return;
      p.gold -= offer.price;
      p.items.push({ id: offer.id, rarity: offer.rarity });
      this.shopOffers.splice(act - 1, 1);
      this.recomputeStats();
      this.pushFx("levelup", p.x, p.y, 0, 0, 30);
    } else if (act === 4) {
      const price = this.shopRerollPrice();
      if (p.gold < price) return;
      p.gold -= price;
      this.shopRerolls++;
      this.shopOffers = this.rollShopOffers();
    } else if (act === 5) {
      this.shopOpen = false;
      // Торговец уходит, чтобы игрок не открывал лавку заново каждым касанием.
      this.shopkeeper.alive = false;
    } else if (act >= SHOP_ACT.sellBase && act < SHOP_ACT.sellBase + ARCADE.shop.slots) {
      // Продажа: слот освобождается, половина цены возвращается — так можно поменять предмет, когда слоты полны.
      const idx = act - SHOP_ACT.sellBase;
      const owned = p.items[idx];
      if (!owned) return;
      p.gold += this.itemSellPrice(owned);
      p.items.splice(idx, 1);
      this.recomputeStats();
    }
  }

  itemSellPrice(owned: { id: string; rarity: Rarity }): number {
    const def = ARCADE_ITEM_BY_ID[owned.id];
    return def ? Math.round(def.price * ITEM_PRICE_MULT[owned.rarity] * 0.5) : 0;
  }

  // ---------- экипировка (добыча) ----------

  private nextUid(): string {
    return `${this.seed}:${this.tick}:${++this.lootSeq}`;
  }

  private lootTier(): 1 | 2 | 3 {
    return this.tick >= ARCADE.loot.tier3At ? 3 : this.tick >= ARCADE.loot.tier2At ? 2 : 1;
  }

  private rollLoot(rarity: Rarity): GearItem {
    return rollGear(this.rng, this.lootTier(), rarity, this.nextUid());
  }

  private dropLoot(x: number, y: number, item: GearItem): void {
    this.groundLoot.push({ x, y, item, until: this.tick + ARCADE.loot.lootLifetime });
  }

  /** Экран подбора: 1 — надеть (старое в сумку), 2 — в сумку, 5 — оставить. Сумка полна — «в сумку» не срабатывает. */
  private lootAction(act: number): void {
    const p = this.player;
    const item = this.lootOpen;
    if (!item) return;
    if (act === 1) {
      const old = p.gear[item.slot];
      p.gear[item.slot] = item;
      this.loot.push(item);
      // Снятое — в сумку (стартовое тоже: оно и так лежит в инвентаре, дубликата не будет — uid тот же).
      if (old && p.bag.length < ARCADE.loot.bagCap) p.bag.push(old);
      this.recomputeStats();
      this.pushFx("levelup", p.x, p.y, 0, 0, 30);
      this.lootOpen = null;
    } else if (act === 2) {
      if (p.bag.length >= ARCADE.loot.bagCap) return;
      p.bag.push(item);
      this.loot.push(item);
      this.lootOpen = null;
    } else if (act === 5) {
      this.lootOpen = null;
    }
  }

  // ---------- нейтральные предметы ----------

  private openNeutral(): void {
    const tier = this.neutralToken.value;
    const pool = neutralsOfTier(tier);
    const offers: NeutralDef[] = [];
    // Три предложения из шести на тир — в разных забегах выпадают разные (владелец 2026-09-06).
    while (offers.length < 3 && pool.length > 0) offers.push(pool.splice(this.rng.int(pool.length), 1)[0]);
    this.neutralToken.alive = false;
    this.neutralOffers = offers;
    this.neutralEnchants = offers.map(() => NEUTRAL_ENCHANTS[this.rng.int(NEUTRAL_ENCHANTS.length)].id);
    this.neutralOpen = true;
  }

  private neutralAction(act: number): void {
    const p = this.player;
    if (act >= 1 && act <= 3) {
      const def = this.neutralOffers[act - 1];
      if (!def) return;
      p.neutral = def.id;
      p.neutralEnchant = this.neutralEnchants[act - 1] ?? null;
      this.recomputeStats();
      this.pushFx("levelup", p.x, p.y, 0, 0, 30);
      this.neutralOpen = false;
    } else if (act === 5) {
      this.neutralOpen = false;
    }
  }

  // ---------- уровни: карточки ----------

  private rollOffers(): Offer[] {
    const p = this.player;
    const offers: Offer[] = [];
    const talents = TALENTS[p.level];
    if (talents) {
      offers.push({ kind: "talent", id: talents[0] }, { kind: "talent", id: talents[1] });
      const up = this.rollUpgradeOffer([]);
      if (up) offers.push(up);
      return offers;
    }
    const pool: Offer[] = [];
    const rAllowed = R_LEVELS[p.abilities.r] !== undefined && p.level >= R_LEVELS[p.abilities.r];
    if (rAllowed) offers.push({ kind: "ability", key: "r" });
    // Легендарный апгрейд: гарантированно на LEGENDARY_LEVELS, иначе с растущим шансом с 8-го уровня.
    const legs = LEGENDARY_UPGRADES.filter((u) => !p.upgrades[u.id] && (u.neutral || p.schools.includes(u.school)));
    if (legs.length > 0 && p.level >= 8 && (LEGENDARY_LEVELS.includes(p.level) || this.rng.float() < Math.min(0.22, 0.04 + 0.012 * this.minutes))) {
      offers.push({ kind: "upgrade", id: legs[this.rng.int(legs.length)].id, rarity: "arcana" });
    }
    for (const k of ["q", "w", "e"] as const) if (p.abilities[k] < 4) pool.push({ kind: "ability", key: k });
    while (offers.length < 3) {
      const wantUpgrade = pool.length === 0 || this.rng.float() < 0.55;
      if (wantUpgrade) {
        const up = this.rollUpgradeOffer(offers.map((o) => (o.kind === "upgrade" ? o.id : "")));
        if (up) { offers.push(up); continue; }
        if (pool.length === 0) break;
      }
      if (pool.length === 0) break;
      offers.push(pool.splice(this.rng.int(pool.length), 1)[0]);
    }
    return offers;
  }

  levelRerollPrice(): number {
    return ARCADE.levelup.rerollBase + ARCADE.levelup.rerollStep * this.levelRerolls;
  }

  /** Реролл офферов уровня за золото: тот же генератор, новые карты. */
  private rerollPending(): void {
    const p = this.player;
    const price = this.levelRerollPrice();
    if (!this.pending || p.gold < price) return;
    p.gold -= price;
    this.levelRerolls++;
    this.pending = this.rollOffers();
  }

  /** Изгнание: апгрейд уходит из пула до конца забега, карта заменяется новой; способности изгнать нельзя. */
  private banishPending(index: number): void {
    const offer = this.pending?.[index];
    if (!offer || !this.pending || offer.kind !== "upgrade" || this.banishesLeft <= 0) return;
    this.banished.add(offer.id);
    this.banishesLeft--;
    const rest = this.pending.filter((_, i) => i !== index);
    const fresh = this.rollUpgradeOffer(rest.map((o) => (o.kind === "upgrade" ? o.id : "")));
    this.pending = fresh ? [...rest.slice(0, index), fresh, ...rest.slice(index)] : rest;
  }

  private rollUpgradeOffer(exclude: string[]): Offer | null {
    const p = this.player;
    const schools: readonly SchoolId[] = p.schools.length >= 3 ? p.schools : SCHOOLS;
    const owned = (id: string) => (p.upgrades[id]?.rank ?? 0) > 0;
    const candidates = UPGRADES.filter((u) => !u.legendary && !this.banished.has(u.id) && schools.includes(u.school) && !exclude.includes(u.id) && (p.upgrades[u.id]?.rank ?? 0) < u.maxRank && (!u.requires || u.requires.some(owned)) && (!u.requiresSchools || u.requiresSchools.every((sc) => p.schools.includes(sc))));
    if (candidates.length === 0) return null;
    const def = candidates[this.rng.int(candidates.length)];
    return { kind: "upgrade", id: def.id, rarity: this.rollRarity() };
  }

  private rollRarity(): Rarity {
    const R = ARCADE.rarity;
    const t = Math.min(1, this.minutes / R.endMin);
    const w = R.start.map((s, i) => s + (R.end[i] - s) * t);
    const total = w[0] + w[1] + w[2] + w[3];
    let roll = this.rng.float() * total;
    const names: Rarity[] = ["standard", "refined", "exotic", "arcana"];
    for (let i = 0; i < 4; i++) { roll -= w[i]; if (roll <= 0) return names[i]; }
    return "standard";
  }

  private applyOffer(offer: Offer): void {
    const p = this.player;
    if (offer.kind === "ability") p.abilities[offer.key]++;
    else if (offer.kind === "talent") p.talents.push(offer.id);
    else {
      const def = UPGRADE_BY_ID[offer.id];
      const cur = p.upgrades[offer.id] ?? { rank: 0, power: 0 };
      p.upgrades[offer.id] = { rank: cur.rank + 1, power: def.legendary ? 1 : cur.power + ARCADE.rarity.mult[offer.rarity] };
      if (!def.neutral && !p.schools.includes(def.school)) p.schools.push(def.school);
      if (def.id === "leg_rad_phoenix") p.aegis = true; // Феникс: одно возрождение, как Aegis
    }
    this.pending = null;
    this.recomputeStats();
    this.syncPets();
    // Уровень мог набежать «через» (несколько шардов разом) — следующий выбор на следующем тике.
    if (p.xp >= p.xpNext) { const carry = p.xp; p.xp = 0; this.gainXp(carry); }
  }

  private recomputeStats(): void {
    const p = this.player;
    const s = baseStats();
    Object.assign(s, this.hero.base);
    const over = this.upgradePower("mae_overcharge");
    let attackSpeed = 0.12 * over, moveSpeed = 0.04 * over;
    // Пассивки героя.
    for (const key of ABILITY_KEYS) {
      const ab = this.hero.abilities[key];
      const lvl = p.abilities[key];
      if (!ab.passive || lvl === 0) continue;
      switch (ab.kind) {
        case "crit": s.critChance += ab.value[lvl]; break;
        case "arcane_aura": s.cooldown += ab.value[lvl]; s.regen += lvl; break;
        case "take_aim": s.range += ab.value[lvl]; attackSpeed += 0.05 * lvl; break;
        case "armor_passive": s.armor += ab.value[lvl]; break;
        case "coup": s.critChance += ab.value[lvl]; s.critMult = Math.max(s.critMult, ab.count?.[lvl] ?? s.critMult); break;
        default: break;
      }
    }
    // Легендарные (T13.18).
    if (this.upgradePower("leg_heart") > 0) { s.maxHp *= 1.4; s.regen += 12; }
    if (this.upgradePower("leg_octarine") > 0) s.cooldown += 0.25;
    if (this.upgradePower("leg_daedalus") > 0) { s.critChance += 0.25; s.critMult += 0.7; }
    if (this.upgradePower("leg_satanic") > 0) s.lifesteal += 0.25;
    if (this.upgradePower("leg_mae_haste") > 0) { attackSpeed += 0.35; moveSpeed += 0.1; }
    if (p.talents.includes("t10_dmg")) s.damage += 20;
    if (p.talents.includes("t10_ms")) s.speed *= 1.08;
    if (p.talents.includes("t15_crit")) s.critChance += 0.15;
    if (p.talents.includes("t15_hp")) s.maxHp += 150;
    if (p.talents.includes("t20_armor")) s.armor += 6;
    if (p.talents.includes("t20_cd")) s.cooldown += 0.15;
    if (p.talents.includes("t25_regen")) s.regen += 12;
    const effects: { e: (typeof ARCADE_ITEMS)[number]["effect"]; m: number }[] = [];
    for (const owned of p.items) {
      const def = ARCADE_ITEM_BY_ID[owned.id];
      if (def) for (const fx of itemEffectsAt(def, owned.rarity)) effects.push({ e: fx.e, m: fx.m });
    }
    if (p.neutral && NEUTRAL_BY_ID[p.neutral]) {
      effects.push({ e: NEUTRAL_BY_ID[p.neutral].effect, m: 1 });
      const ench = p.neutralEnchant ? NEUTRAL_ENCHANT_BY_ID[p.neutralEnchant] : undefined;
      if (ench) effects.push({ e: ench.effect, m: NEUTRAL_BY_ID[p.neutral].tier });
    }
    for (const g of Object.values(p.gear)) effects.push({ e: gearEffect(g as GearItem), m: 1 });
    for (const { e, m } of effects) {
      if (e.regen) s.regen += e.regen * m;
      if (e.lifesteal) s.lifesteal += e.lifesteal * m;
      if (e.armor) s.armor += e.armor * (e.armor > 0 ? m : 1);
      if (e.attackSpeed) attackSpeed += e.attackSpeed * m;
      if (e.crit) s.critChance += e.crit * m;
      if (e.damage) s.damage += e.damage * m;
      if (e.moveSpeed) moveSpeed += e.moveSpeed * m;
      if (e.maxHp) s.maxHp += Math.round(e.maxHp * m);
      if (e.goldPerKill) s.goldPerKill += Math.round(e.goldPerKill * m);
      if (e.xpMult) s.xpMult += e.xpMult * m;
      if (e.stunImmune) s.stunImmune = true;
      if (e.cleave) s.cleave += Math.round(e.cleave * m);
      if (e.cooldown) s.cooldown += e.cooldown * m;
    }
    s.cooldown = Math.min(0.55, s.cooldown);
    s.attackInterval /= 1 + attackSpeed;
    s.speed *= 1 + moveSpeed;
    const ratio = p.stats ? p.hp / p.stats.maxHp : 1;
    p.stats = s;
    p.hp = Math.min(s.maxHp, Math.max(p.hp, ratio * s.maxHp));
  }

  // ---------- запросы ----------

  nearestEnemy(x: number, y: number, radius: number): Enemy | null {
    let best: Enemy | null = null, bestD = radius;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = len(e.x - x, e.y - y) - e.kind.r;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  enemiesWithin(x: number, y: number, radius: number): Enemy[] {
    const out: Enemy[] = [];
    for (const e of this.enemies) if (e.alive && len(e.x - x, e.y - y) <= radius + e.kind.r) out.push(e);
    return out;
  }

  countEnemiesWithin(x: number, y: number, radius: number): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive && len(e.x - x, e.y - y) <= radius + e.kind.r) n++;
    return n;
  }

  private pushFx(kind: FxKind, x: number, y: number, x2: number, y2: number, dur: number, value = 0): void {
    if (this.fx.length > 400) this.fx.splice(0, 100);
    this.fx.push({ kind, x, y, x2, y2, born: this.tick, dur, value });
  }

  private pruneFx(): void {
    if (this.tick % 30 !== 0) return;
    this.fx = this.fx.filter((f) => this.tick - f.born < f.dur);
  }

  /** Дайджест состояния для тестов детерминизма и реплея: тот же сид + лог ⇒ та же строка. */
  digest(): string {
    let h = 2166136261;
    const mix = (n: number) => {
      const v = Math.round(n * 1000) | 0;
      h ^= v & 0xffff; h = Math.imul(h, 16777619);
      h ^= v >>> 16; h = Math.imul(h, 16777619);
    };
    const p = this.player;
    mix(this.tick); mix(p.x); mix(p.y); mix(p.hp); mix(p.level); mix(p.xp); mix(p.gold); mix(p.kills); mix(this.greedStacks); mix(this.rank.step); mix(p.items.length); mix(p.neutral ? 1 : 0); mix(Object.keys(p.gear).length); mix(this.loot.length);
    for (const e of this.enemies) if (e.alive) { mix(e.x); mix(e.y); mix(e.hp); }
    for (const pr of this.projectiles) if (pr.alive) { mix(pr.x); mix(pr.y); }
    for (const s of this.shards) if (s.alive) { mix(s.x); mix(s.xp); }
    return (h >>> 0).toString(16);
  }

  /** Прогнать сим по input-логу на `untilSteps` вызовов step() (или до конца забега). */
  static replay(seed: string, log: readonly InputLogEntry[], untilSteps: number, options: ArcadeOptions = {}): ArcadeSim {
    const sim = new ArcadeSim(seed, options);
    let idx = 0;
    let input: ArcadeInput = { ...IDLE_INPUT };
    for (let s = 0; s < untilSteps && !sim.over; s++) {
      while (idx < log.length && log[idx][0] <= s) {
        const [, mx, my, cast, choose, act] = log[idx++];
        input = { mx, my, cast, choose, act: act ?? 0 };
      }
      sim.step(input);
    }
    return sim;
  }
}

// ---------- утилиты ----------

export function xpToNext(level: number): number {
  return Math.round(ARCADE.xp.base + ARCADE.xp.perLevel * level + ARCADE.xp.quad * level * level);
}

function baseStats(): PlayerStats {
  const P = ARCADE.player;
  return { maxHp: P.maxHp, regen: P.regen, armor: P.armor, speed: P.speed, damage: P.damage, attackInterval: P.attackInterval, range: P.range, critChance: P.critChance, critMult: P.critMult, pickup: P.pickup, lifesteal: 0, goldPerKill: 0, xpMult: 0, stunImmune: false, cleave: 0, cooldown: 0 };
}

function emptyEnemy(kind: EnemyKind): Enemy {
  return {
    id: 0, alive: false, kind, x: 0, y: 0, hp: 0, maxHp: 0, dmg: 0, contactCd: 0, shotCd: 0, burnUntil: 0, burnDps: 0,
    chillUntil: 0, chillSlow: 0, chillStacks: 0, freezeUntil: 0, stunUntil: 0, hitAt: -100, slamT: 0, slamX: 0, slamY: 0, slamCd: 0,
    ruptureUntil: 0, ruptureDps: 0, lastX: 0, lastY: 0, ampUntil: 0, ampMult: 0,
  };
}

function cellKey(x: number, y: number): number {
  return Math.floor(x / GRID) * 100000 + Math.floor(y / GRID);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function weightedPick(rng: Rng, pool: EnemyKind[]): EnemyKind {
  let total = 0;
  for (const k of pool) total += k.weight;
  let roll = rng.float() * total;
  for (const k of pool) { roll -= k.weight; if (roll <= 0) return k; }
  return pool[pool.length - 1];
}
