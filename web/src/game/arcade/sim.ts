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
import { ARCADE, DT, TICK_HZ, sec } from "./config.ts";
import { ENEMY_KINDS, spawnPool } from "./content/enemies.ts";
import { SCHOOLS, TALENTS, UPGRADES, UPGRADE_BY_ID } from "./content/schools.ts";
import { rankOf, type RankRules } from "./content/ranks.ts";
import { ARCADE_ITEMS, ARCADE_ITEM_BY_ID, ITEM_PRICE_MULT, ITEM_RARITY_MULT, type ShopOffer } from "./content/items.ts";
import { HEROES, type AbilityDef, type HeroDef, type HeroId } from "./content/heroes.ts";
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
const R_LEVELS = [6, 12, 18];
const GRID = 72;

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
  shopRerolls = 0;
  private shopIdx = 0;
  private nextBountyAt = ARCADE.bounty.every;
  private nextShrineAt: number;
  private nextTrollPackAt: number;
  readonly act: ActId;
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
  fx: Fx[] = [];
  pending: Offer[] | null = null;
  over: ArcadeOutcome | null = null;
  roshan: Enemy | null = null;
  roshanKilled = false;
  aegisDrop: { x: number; y: number } | null = null;
  /** Камера/тряска — подсказки рендеру (не влияют на сим). */
  shake = 0;
  readonly events: ArcadeEventCounters = { hits: 0, crits: 0, casts: 0, ults: 0, hurt: 0, kills: 0, eliteKills: 0, pickups: 0 };
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
    this.act = options.act === "full" ? "full" : "short";
    this.rng = new Rng(`arcade:${seed}:r${this.rank.step}:${this.hero.id}:${this.act}`);
    this.roshanAt = ARCADE.acts[this.act].roshanAt.map((t, i) => (i === 0 && this.rank.earlyRoshan ? t - sec(60) : t));
    this.nextShrineAt = ARCADE.greed.firstAt;
    this.nextTrollPackAt = sec(45);
    const P = ARCADE.player;
    this.player = {
      x: ARCADE.world.w / 2, y: ARCADE.world.h / 2, hp: P.maxHp, level: 1, xp: 0, xpNext: xpToNext(1), gold: 0, kills: 0,
      facingX: 1, facingY: 0, attackCd: 0, stunUntil: 0, invulnUntil: 0, aegis: false, aegisUsed: false,
      abilities: { q: 0, w: 0, e: 0, r: 0 }, cooldowns: { q: 0, w: 0, e: 0, r: 0 },
      spinUntil: 0, wardUntil: 0, wardX: 0, wardY: 0, burstLeft: 0, burstNextAt: 0, fieldUntil: 0, zoneUntil: 0, zoneX: 0, zoneY: 0, armorBuffUntil: 0, hasteUntil: 0,
      schools: [], upgrades: {}, talents: [], items: [], stats: baseStats(), ringAt: 0, shardsAt: 0, staticAt: 0,
    };
    // Первое очко — сразу в Q: так первые 30 секунд не голые (в Dota первый уровень тоже с абилкой).
    this.player.abilities.q = 1;
    this.recomputeStats();
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
      return;
    }
    if (this.shopOpen) {
      this.shopAction(input.act);
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
    p.x = clamp(p.x + dx * speed * DT, ARCADE.player.r, ARCADE.world.w - ARCADE.player.r);
    p.y = clamp(p.y + dy * speed * DT, ARCADE.player.r, ARCADE.world.h - ARCADE.player.r);
  }

  private playerCombat(input: ArcadeInput): void {
    const p = this.player;
    const stunned = this.tick < p.stunUntil;
    // --- автоатака: мили — удар + клив, дальний бой — снаряд ---
    if (!stunned && p.attackCd === 0 && this.tick >= p.spinUntil && p.burstLeft === 0 && this.tick >= p.fieldUntil) {
      const target = this.nearestEnemy(p.x, p.y, p.stats.range);
      if (target) {
        p.attackCd = sec(p.stats.attackInterval);
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
      case "assassinate": return bossNear || this.eliteWithin(p.x, p.y, radius) !== null || near >= 6;
      case "culling_blade": return this.cullTarget(ab) !== null;
      case "omni": case "freezing_field": case "thundergod":
        return near >= A.ultEnemies || bossNear || (hpPct < A.ultHpPct && near >= 3);
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
      default: cast = false;
    }
    if (!cast) return;
    if (key === "r") this.events.ults++; else this.events.casts++;
    // Culling Blade после добивания уходит на короткую перезарядку (3 с), не на полную и не на ноль.
    if (ab.kind === "culling_blade" && p.cooldowns.r === -1) p.cooldowns.r = sec(1.5);
    else p.cooldowns[key] = sec(ab.cooldown * (1 - p.stats.cooldown));
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
    this.damageEnemy(e, dmg, kind);
    if (p.stats.lifesteal > 0) p.hp = Math.min(p.stats.maxHp, p.hp + dmg * p.stats.lifesteal);
    // Школы «Attack»: статусы с удара.
    const burn = this.upgradePower("rad_strike");
    if (burn > 0) this.applyBurn(e, 6 * burn * this.burnMult(), 3);
    const chill = this.upgradePower("ska_bite");
    if (chill > 0) this.applyChill(e, Math.min(0.6, 0.3 + 0.05 * chill), 2.5);
    const chain = this.upgradePower("mae_chain");
    if (chain > 0 && this.rng.float() < 0.25 + 0.08 * chain) this.chainLightning(e, 20 * chain * this.lightningMult(), 3 + Math.floor(this.upgradePower("mae_mjollnir") * 2));
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
    return 1 + 0.25 * this.upgradePower("rad_inferno");
  }

  private lightningMult(): number {
    return 1 + 0.2 * this.upgradePower("mae_mjollnir");
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

  damageEnemy(e: Enemy, amount: number, fx: FxKind): void {
    if (!e.alive || amount <= 0) return;
    let dmg = amount;
    const shatter = this.upgradePower("ska_shatter");
    if (shatter > 0) {
      if (this.tick < e.freezeUntil) dmg *= 1 + 0.4 * shatter;
      else if (this.tick < e.chillUntil) dmg *= 1 + 0.1 * shatter;
    }
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
    if (e.kind.elite || e.kind.boss || e.kind.structure) this.events.eliteKills++;
    this.pushFx("die", e.x, e.y, e.kind.r, 0, e.kind.elite || e.kind.boss ? 22 : 10);
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
    if (e.kind.id === "tormentor") {
      // Награда за Tormentor: щедрость без платы — 60 с двойного опыта.
      this.greedUntil = Math.max(this.greedUntil, this.tick + ARCADE.greed.duration);
      this.pushFx("nova", e.x, e.y, 160, 0, 30);
    }
  }

  private damagePlayer(amount: number, stun = 0): void {
    const p = this.player;
    if (this.tick < p.invulnUntil || (p.burstLeft > 0 && this.hero.abilities.r.kind === "omni")) return;
    const armor = p.stats.armor + (this.tick < p.armorBuffUntil ? 25 : 0);
    const reduction = (0.06 * armor) / (1 + 0.06 * armor);
    p.hp -= amount * (1 - reduction);
    this.events.hurt++;
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
      p.hp = p.stats.maxHp;
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
      return;
    }
    p.hp = 0;
    this.finish("dead");
  }

  private finish(outcome: "dead" | "victory"): void {
    const p = this.player;
    this.over = {
      outcome, tick: this.tick, level: p.level, kills: p.kills, gold: p.gold, schools: [...p.schools],
      upgrades: Object.keys(p.upgrades), roshanKilled: this.roshanKilled, rank: this.rank.step, greedStacks: this.greedStacks, items: p.items.map((i) => i.id), hero: this.hero.id, act: this.act,
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
      const r = this.spawnEnemy(ENEMY_KINDS.roshan, ...this.ringPoint(420, 480));
      if (this.roshanIdx > 0) { r.hp *= ARCADE.secondRoshan.hpMult; r.maxHp *= ARCADE.secondRoshan.hpMult; r.dmg *= ARCADE.secondRoshan.dmgMult; }
      this.roshanIdx++;
      this.roshan = r;
      this.roshanSpawnedAt = this.tick;
      this.shake = 12;
      return;
    }
    if (this.roshan?.alive) return;
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
    const pool = spawnPool(min);
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
      const [sx, sy] = this.ringPoint(ARCADE.greed.distMin, ARCADE.greed.distMax);
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
      const [bx, by] = this.ringPoint(ARCADE.shop.distMin, ARCADE.shop.distMax);
      this.bounty = { alive: true, x: bx, y: by, until: this.tick + ARCADE.bounty.lifetime, value: Math.round(ARCADE.bounty.base + ARCADE.bounty.perMin * min) };
    }
    if (this.bounty.alive && this.tick >= this.bounty.until) this.bounty.alive = false;
    void p;
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
    return [clamp(x, 8, ARCADE.world.w - 8), clamp(y, 8, ARCADE.world.h - 8)];
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number): Enemy {
    const min = this.minutes;
    const greed = 1 + ARCADE.greed.powerPerStack * this.greedStacks;
    const early = Math.min(min, ARCADE.spawn.kneeMin), late = Math.max(0, min - ARCADE.spawn.kneeMin);
    const hpMult = (kind.boss || kind.structure ? 1 : 1 + ARCADE.spawn.hpPerMin * early + ARCADE.spawn.lateHpPerMin * late) * this.rank.hpMult * greed;
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
      let speed = e.kind.speed * this.rank.speedMult;
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
      e.x += (dx / d * speed) * DT + sx * 0.5;
      e.y += (dy / d * speed) * DT + sy * 0.5;
      // Контакт с игроком.
      if (d < e.kind.r + ARCADE.player.r + 2 && e.contactCd === 0) {
        e.contactCd = sec(ARCADE.player.contactEvery);
        this.damagePlayer(e.dmg);
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
        if (len(p.x - e.slamX, p.y - e.slamY) <= B.slamRadius + ARCADE.player.r) this.damagePlayer(B.slamDmg * (enraged ? 3 : 1), B.slamStun);
        this.shake = Math.max(this.shake, 10);
        this.pushFx("nova", e.slamX, e.slamY, B.slamRadius, 0, 16);
        e.slamCd = B.slamCooldown;
      }
      return;
    }
    // Восстановление после удара: босс стоит, контактом не бьёт — окно для мили.
    if (e.slamCd > B.slamCooldown - B.slamRecovery) return;
    if (frozen) return;
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
      this.damagePlayer(e.dmg * (enraged ? 3 : 1));
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

  private rollUpgradeOffer(exclude: string[]): Offer | null {
    const p = this.player;
    const schools: readonly SchoolId[] = p.schools.length >= 3 ? p.schools : SCHOOLS;
    const candidates = UPGRADES.filter((u) => schools.includes(u.school) && !exclude.includes(u.id) && (p.upgrades[u.id]?.rank ?? 0) < u.maxRank);
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
      p.upgrades[offer.id] = { rank: cur.rank + 1, power: cur.power + ARCADE.rarity.mult[offer.rarity] };
      if (!p.schools.includes(def.school)) p.schools.push(def.school);
    }
    this.pending = null;
    this.recomputeStats();
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
        default: break;
      }
    }
    if (p.talents.includes("t10_dmg")) s.damage += 20;
    if (p.talents.includes("t10_ms")) s.speed *= 1.08;
    if (p.talents.includes("t15_crit")) s.critChance += 0.15;
    if (p.talents.includes("t15_hp")) s.maxHp += 150;
    if (p.talents.includes("t20_armor")) s.armor += 6;
    if (p.talents.includes("t20_cd")) s.cooldown += 0.15;
    if (p.talents.includes("t25_regen")) s.regen += 12;
    for (const owned of p.items) {
      const def = ARCADE_ITEM_BY_ID[owned.id];
      if (!def) continue;
      const m = ITEM_RARITY_MULT[owned.rarity];
      const e = def.effect;
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
    mix(this.tick); mix(p.x); mix(p.y); mix(p.hp); mix(p.level); mix(p.xp); mix(p.gold); mix(p.kills); mix(this.greedStacks); mix(this.rank.step); mix(p.items.length);
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
