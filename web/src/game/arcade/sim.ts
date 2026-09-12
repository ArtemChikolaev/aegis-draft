// Arcade — чистый детерминированный сим (PRD §5.15, BACKLOG T13.1).
//
// Контракт детерминизма: состояние — функция ТОЛЬКО от `seed` и последовательности `ArcadeInput`
// по тикам. Внутри нет Date/rAF/Math.random; дистанции — через sqrt (IEEE гарантирует округление),
// направления движения — из таблицы констант. `Math.sin/cos/atan2` остались в расстановке мест и
// раскладке орбит/веера снарядов: в одном движке они детерминированы, между движками могут
// расходиться в младших битах — реплеи гарантированы в пределах одного браузера. Один тик = 1/60 с (config.TICK_HZ).
//
// Сим не знает про рендер: `fx` — журнал визуальных событий с ttl, рендерер читает его и
// ничего в сим не пишет. Level-up останавливает мир (`pending`) до `input.choose`.
import { Rng } from "../rng.ts";
import { ObstacleGrid, generateMap } from "./mapgen.ts";
import { PETS, SUMMONS, type PetKind, type SummonBody } from "./content/pets.ts";
import { RUNE_KINDS, type Barrow, type Camp, type Contract, type ContractReward, type ContractTarget, type CurseId, type Den, type Ford, type Forge, type Grove, type Lair, type Outpost, type Pond, type RuneKind, type UpgradeType, type DmgSource } from "./types.ts";
import { DEV_FREE_SHOP, ARCADE, DT, TICK_HZ, sec } from "./config.ts";
import { ENEMY_KINDS, spawnPool } from "./content/enemies.ts";
import { TRAITS, applyTrait, isTraitId, type TraitDef } from "./content/traits.ts";
import { COMPOSITIONS, type ActProperty, type CompositionId, compositionFor, hasPlace, isCompositionId } from "./content/compositions.ts";
import { LEGENDARY_LEVELS, LEGENDARY_UPGRADES, SCHOOLS, TALENTS, UPGRADES, UPGRADE_BY_ID } from "./content/schools.ts";
import { rankOf, type RankRules } from "./content/ranks.ts";
import { ARCADE_ITEMS, ARCADE_ITEM_BY_ID, ITEM_FAMILIES, ITEM_PRICE_MULT, itemEffectsAt, type ShopOffer } from "./content/items.ts";
import { type FormDef, HEROES, type AbilityDef, type AbilityKind, type HeroDef, type HeroId } from "./content/heroes.ts";
import { NEUTRAL_BY_ID, NEUTRAL_ENCHANTS, NEUTRAL_ENCHANT_BY_ID, NEUTRAL_TIER_AT_MIN, neutralsOfTier, type NeutralDef } from "./content/neutrals.ts";
import { GEAR_SLOTS, gearEffect, reforgeGear, rollGear, temperGear, uniqueGear, type GearItem, type GearSlot } from "./content/gear.ts";
import { LEGACY_NONE, type LegacyBonus } from "./content/legacy.ts";
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
  type Caravan,
  type Invitation,
  type Rarity,
  type Rift,
  type RiftRuleId,
  RIFT_RULES,
  type SchoolId,
  type Shard,
  type Shrine,
  type Spot,
  ATTACK_MASK,
  AUTOATTACK_ACT,
  BAG_DROP_ACT,
  BAG_EQUIP_ACT,
  BUILD_ACT,
  PICKUP_ACT,
  AUTOCAST_ACT,
  SHOP_ACT,
  CONTRACT_OATH_ACT,
  POND_RITUAL_ACT,
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
/** Вид врага по цели контракта — для Клятвы охотника. */
const CONTRACT_KIND: Record<ContractTarget, string> = { defiler: "satyr_defiler", centaur: "centaur_warden", necro: "troll_necromancer", thunder: "thunder_golem", warden: "river_warden", stalker: "dire_stalker" };
const NEXT_RARITY: Record<Rarity, Rarity | null> = { standard: "refined", refined: "exotic", exotic: "arcana", arcana: null };
const GRID = 72;
/** Питомец подошёл к новой цели, а перезарядка ещё идёт: бьёт не позже чем через 0.2 с (тиков) — см. tickPets. */
const PET_REARM = 12;
/** Урон призыва умения в секунду на единицу `value` (см. spawnSummons). 4 — точный DPS прежней зоны
 *  (`value` каждые 15 тиков). Бегающему призыву дают меньше: он не простаивает у точки каста и делит
 *  урон между врагами — по `npm run sim:arcade --runs 120` на Broodmother/Lycan при 4.0 выходило
 *  ~+5 п.п. к «дошёл до Рошана», при 2.6 ~−6 п.п., 3.2 попадает в базу. Вкопанному тотему поправка не
 *  нужна: он стоит в той же точке и бьёт ту же ближайшую цель, что и прежняя зона, — ему 4. */
const SUMMON_DPS = 3.2;
const WARD_DPS = 4;

function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export class ArcadeSim {
  readonly seed: string;
  readonly rng: Rng;
  readonly rank: RankRules;
  readonly hero: HeroDef;
  /** Состав мест акта (T13.70): объявляется на подготовке, размещение — только из него. */
  readonly composition: CompositionId;
  /** Разбор забега (T13.74): источник текущего урона (ставится в начале тика и у каждого источника), суммы по источникам и по видам врагов. */
  private dmgSource: DmgSource = "other";
  private dealtBySource: Record<string, number> = {};
  private takenByKind: Record<string, number> = {};
  /** Слот умения по его виду (первый из q,w,e,r): набор героя неизменен весь забег, ищем один раз, а не каждый тик. */
  private readonly slot: Partial<Record<AbilityKind, AbilityKey>> = {};
  tick = 0;
  shrine: Shrine = { alive: false, x: 0, y: 0, until: 0 };
  greedUntil = 0;
  greedStacks = 0;
  shopkeeper: Spot = { alive: false, x: 0, y: 0, until: 0, value: 0 };
  bounty: Spot = { alive: false, x: 0, y: 0, until: 0, value: 0 };
  /** Руна (dd/shield/arcane/illusion): `value` не используется, вид — в `runeKind`. */
  rune: Spot = { alive: false, x: 0, y: 0, until: 0, value: 0 };
  runeKind: RuneKind = "dd";
  /** Открытый магазин останавливает мир, как выбор карточки. */
  shopOpen = false;
  shopOffers: ShopOffer[] = [];
  /** Подарок каравана (T13.71): один товар лавки каравана бесплатно или +1 редкость своему предмету; сгорает с уходом торговца. */
  caravanGift = false;
  /** «Долг силы» (T13.75): одна карта в долг за акт. */
  debtOfferTaken = false;
  /** Осада леса (T13.78): следующий патруль и до какого тика волна ослаблена после гибели знаменосца. */
  private nextPatrolAt = 0;
  siegeWeakUntil = 0;
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
  /** Добыча в шаге от героя: сундук или предмет на земле. Подбирается по PICKUP_ACT, не касанием
   *  (владелец 2026-09-07). HUD показывает по этому полю подсказку «подобрать». */
  nearLoot: { kind: "chest" | "ground"; item: GearItem | null } | null = null;
  /** Экран сборки (экипировка, сумка, взятые умения): открыт по BUILD_ACT, мир стоит. */
  buildOpen = false;
  /** Заражённый лагерь (T13.40): один на акт, стоит на карте по seed до конца забега. */
  camp: Camp | null = null;
  /** Сатир-Осквернитель лагеря (T13.41); ссылка снимается при смерти (пул врагов переиспользует объекты). */
  defiler: Enemy | null = null;
  /** Аванпост (T13.42): один на акт, по seed, на другой стороне от лагеря. */
  outpost: Outpost | null = null;
  /** Роща и Кентавр-Страж (T13.45); ссылка снимается при смерти (пул врагов переиспользует объекты). */
  grove: Grove | null = null;
  centaur: Enemy | null = null;
  private centaurSlain = false;
  /** Контракт охоты (T13.50): предложение (два варианта, мир стоит) и принятый контракт. */
  contractOpen = false;
  contractOffers: { target: ContractTarget; reward: ContractReward }[] = [];
  contract: Contract | null = null;
  private contractOffered = false;
  /** Курган и Тролль-Некромант (T13.46); ссылка снимается при смерти. */
  barrow: Barrow | null = null;
  necromancer: Enemy | null = null;
  private necromancerSlain = false;
  /** Убийства по видам за забег (T13.56): бестиарий в Штабе. */
  readonly killsByKind: Record<string, number> = {};
  /** Позиция героя на прошлом тике — скорость для метки засады (T13.55): стоящий получает метку под ноги. */
  private prevPx = 0;
  private prevPy = 0;
  /** Логово и Охотник Dire (T13.55, только Dire); ссылка снимается при смерти. */
  den: Den | null = null;
  stalker: Enemy | null = null;
  private stalkerSlain = false;
  /** Брод и Страж переправы (T13.54, только River); ссылка снимается при смерти. */
  ford: Ford | null = null;
  warden: Enemy | null = null;
  private wardenSlain = false;
  /** Логово и Гром-голем (T13.53); ссылка снимается при смерти. */
  lair: Lair | null = null;
  thunder: Enemy | null = null;
  private thunderSlain = false;
  /** Древняя кузня (T13.52): одно использование; выбор надетого предмета и действия, мир стоит. */
  forge: Forge | null = null;
  forgeOpen = false;
  nearForge = false;
  /** Разлом (T13.58): место, окно выбора правила, «рядом», тики стоящих часов акта и передышка после выхода. */
  rift: Rift | null = null;
  riftOpen = false;
  nearRift = false;
  /** Сколько тиков мира прошло в разломе — на столько часы акта (`actTick`) отстают от `tick`. */
  pausedTicks = 0;
  /** До этого тика обычный спавн и волны молчат (передышка после разлома). */
  respiteUntil = 0;
  /** Караван лавочника (T13.59). */
  caravan: Caravan | null = null;
  /** Стартовая особенность (T13.62): множители базы с плюсом и минусом. */
  readonly trait: TraitDef | null;
  /** Выбранный в кузне слот (индекс GEAR_SLOTS) или −1. */
  forgeSlot = -1;
  /** Лотосовый пруд (T13.43): одно использование; открытый выбор ставит мир на паузу, как лавка. */
  pond: Pond | null = null;
  pondOpen = false;
  nearPond = false;
  /** Открытая добыча — из проклятого сундука: принять = взять порчу (какую — решено при вскрытии, показано до кнопки). */
  lootCursed = false;
  lootCurse: CurseId = "withering";
  private cursesTaken = 0;
  private lastCurse: CurseId | null = null;
  /** Кровавая охота (T13.51): чемпион-охотник; преследует героя, пока жив; ссылка снимается при смерти. */
  hunter: Enemy | null = null;
  private chestNo = 0;
  /** Чей сейчас `pending`: уровень или награда лагеря (у награды нет реролла, заголовок другой). */
  pendingSource: "level" | "camp" = "level";
  /** Очередь отдельных выдач (T13.68): каждая награда места/чемпиона/контракта — свой экран выбора, не альтернативы в одном. */
  private rewardQueue: Offer[][] = [];
  /** Всё подобранное за забег — в инвентарь по итогу. */
  loot: GearItem[] = [];
  private nextChestAt = ARCADE.loot.chestFirstAt;
  private lootSeq = 0;
  private aegisDropped = false;
  shopRerolls = 0;
  private shopIdx = 0;
  private nextBountyAt = ARCADE.bounty.every;
  private nextRuneAt = ARCADE.rune.first;
  private nextShrineAt: number;
  private nextTrollPackAt: number;
  readonly act: ActId;
  /** Наследие Aegis (T13.44): снимок множителей на старте; в реплей входит, дейлик — LEGACY_NONE. */
  readonly legacy: LegacyBonus;
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
  readonly events: ArcadeEventCounters = { hits: 0, crits: 0, casts: 0, ults: 0, hurt: 0, kills: 0, eliteKills: 0, pickups: 0, castQ: 0, castW: 0, castE: 0, castR: 0, hurtBy: -1, camps: 0, outposts: 0, contracts: 0, ambushes: 0, rifts: 0, caravans: 0 };
  private nextEnemyId = 1;
  private spawnAcc = 0;
  private lastWaveAt = 0;
  private golemIdx = 0;
  private lastInput: ArcadeInput = { ...IDLE_INPUT };
  private grid = new Map<number, Enemy[]>();
  private gridUsed: number[] = [];
  /** Счётчик вызовов step(): ключ input-лога. Тик не годится — он стоит, пока висит выбор карточки. */
  steps = 0;
  /** Input-лог (записывается всегда: он дешёвый и нужен реплею/шарингу). */
  readonly log: InputLogEntry[] = [];

  constructor(seed: string, options: ArcadeOptions = {}) {
    this.seed = seed;
    this.rank = rankOf(options.rank ?? 0);
    this.hero = HEROES[(options.hero as HeroId) in HEROES ? (options.hero as HeroId) : "juggernaut"];
    for (const k of ABILITY_KEYS) this.slot[this.hero.abilities[k].kind] ??= k;
    this.act = options.act === "full" || options.act === "dire" || options.act === "river" ? options.act : "short";
    this.trait = isTraitId(options.trait) ? TRAITS[options.trait] : null;
    this.composition = isCompositionId(options.composition) ? options.composition : compositionFor(seed, this.act);
    const L = options.legacy;
    this.legacy = L && [L.hp, L.damage, L.pickup].every((v) => typeof v === "number" && v >= 1 && v <= 2) ? { hp: L.hp, damage: L.damage, pickup: L.pickup } : LEGACY_NONE;
    this.obstacles = new ObstacleGrid(generateMap(seed, this.act).obstacles);
    this.rng = new Rng(`arcade:${seed}:r${this.rank.step}:${this.hero.id}:${this.act}`);
    this.roshanAt = ARCADE.acts[this.act].roshanAt.map((t, i) => (i === 0 && this.rank.earlyRoshan ? t - sec(60) : t));
    this.nextShrineAt = ARCADE.greed.firstAt;
    this.nextTrollPackAt = sec(45);
    const P = ARCADE.player;
    this.player = {
      x: ARCADE.world.w / 2, y: ARCADE.world.h / 2, hp: P.maxHp, level: 1, xp: 0, xpNext: xpToNext(1), gold: 0, kills: 0,
      facingX: 1, facingY: 0, aimX: 1, aimY: 0, aimUntil: 0, attackCd: 0, attackCdMax: 0, stunUntil: 0, invulnUntil: 0, aegis: false, aegisUsed: false,
      abilities: { q: 0, w: 0, e: 0, r: 0 }, cooldowns: { q: 0, w: 0, e: 0, r: 0 },
      autoCast: { q: true, w: true, e: true, r: true }, autoAttack: true,
      spinUntil: 0, spiritsUntil: 0, tetherUntil: 0, tetherPet: -1, wardUntil: 0, wardX: 0, wardY: 0, burstLeft: 0, burstNextAt: 0, fieldUntil: 0, zoneUntil: 0, zoneX: 0, zoneY: 0, armorBuffUntil: 0, hasteUntil: 0, ddUntil: 0, shieldHp: 0, shieldUntil: 0, arcaneUntil: 0, stacks: 0, stackTarget: -1, sigUntil: 0, lotusUntil: 0, reincAt: 0, formUntil: 0, sigArmed: false, rageUntil: 0, rageMult: 0, frenzyUntil: 0, frenzyMult: 0, evadeUntil: 0, evadeChance: 0, drainUntil: 0, drainTarget: -1,
      schools: [], upgrades: {}, talents: [], items: [], neutral: null, neutralEnchant: null, curse: null, debtLeft: 0, ritualKind: null, ritualUntil: 0, gear: {}, bag: [], stats: baseStats(), ringAt: 0, shardsAt: 0, staticAt: 0, cloudAt: 0, fangsAt: 0,
    };
    // Первое очко — сразу в Q: так первые 30 секунд не голые (в Dota первый уровень тоже с абилкой).
    this.player.abilities.q = 1;
    for (const g of options.gear ?? []) this.player.gear[g.slot] = g;
    // Уникальный Aegis of the Immortal: одно воскрешение уже на старте.
    if (Object.values(this.player.gear).some((g) => g.unique === "aegis_of_the_immortal")) this.player.aegis = true;
    this.recomputeStats();
    // Места — только из композиции; порядок размещения прежний (каждое следующее учитывает уже стоящие).
    const has = (p: Parameters<typeof hasPlace>[1]) => hasPlace(this.composition, p);
    this.camp = has("camp") ? this.placeCamp(seed) : null;
    this.outpost = has("outpost") ? this.placeOutpost(seed) : null;
    this.pond = has("pond") ? this.placePond(seed) : null;
    this.grove = has("grove") ? this.placeGrove(seed) : null;
    this.barrow = has("barrow") ? this.placeBarrow(seed) : null;
    this.forge = has("forge") ? this.placeForge(seed) : null;
    this.rift = has("rift") ? this.placeRift(seed) : null;
    this.caravan = has("caravan") ? this.placeCaravan(seed) : null;
    this.lair = has("lair") ? this.placeLair(seed) : null;
    if (this.pit) this.ford = this.placeFord(seed);
    if (this.night) this.den = this.placeDen(seed);
  }

  private placeDen(seed: string): Den {
    const S = ARCADE.stalker;
    const others: { x: number; y: number }[] = [];
    for (const o of [this.camp, this.outpost, this.pond, this.grove, this.barrow, this.forge, this.lair]) if (o) others.push({ x: o.x, y: o.y });
    const [x, y] = this.pickSpot(new Rng(`den:${seed}:${this.act}`), S.distMin, S.distMax, 120, S.minFromOthers, others, 30);
    this.stalker = this.spawnEnemy(ENEMY_KINDS.dire_stalker, x, y);
    return { x, y, engaged: false, markX: 0, markY: 0, markUntil: 0, exposedUntil: 0, nextAt: 0 };
  }

  playerAtDen(): boolean {
    return !!this.den && !!this.stalker?.alive && this.den.engaged;
  }

  /** Охотник скрыт: не цель, не берёт урон, не рисуется — только метка засады предупреждает. */
  stalkerHidden(): boolean {
    const d = this.den;
    return !!d && !!this.stalker?.alive && this.stalker !== this.hunter && this.tick >= d.exposedUntil;
  }

  private updateDenEngage(): void { this.updateEngage(this.den, this.stalker?.alive === true, ARCADE.stalker.huntRadius, ARCADE.stalker.leash); }

  /** Охотник Dire: скрыт → метка на будущей позиции героя → прыжок и удар → открыт и уязвим → снова скрыт. */
  private moveStalker(e: Enemy, dx: number, dy: number, d: number): void {
    const S = ARCADE.stalker, den = this.den;
    if (!den) return;
    this.capControl(e, S.ccCap, S.ccResist);
    const p = this.player;
    const hunting = e === this.hunter;
    if (!hunting && !this.playerAtDen()) {
      // Ушёл из охотничьих угодий: охотник возвращается в логово и лечится, метка снята.
      const home = len(e.x - den.x, e.y - den.y);
      this.returnHome(e, den.x, den.y, home, S.regenPerSec);
      den.markUntil = 0; den.exposedUntil = 0;
      return;
    }
    if (den.markUntil > 0) {
      if (this.tick >= den.markUntil) {
        // Прыжок: появляется у метки и бьёт всё в её радиусе.
        e.x = den.markX; e.y = den.markY;
        if (len(p.x - den.markX, p.y - den.markY) <= S.strikeRadius + ARCADE.player.r) this.damagePlayer(e.dmg / e.kind.dmg * S.strikeDmg, S.strikeStun, e.kind);
        this.pushFx("slash", den.markX - 30, den.markY - 30, den.markX + 30, den.markY + 30, 10);
        this.shake = Math.max(this.shake, 8);
        den.markUntil = 0;
        den.exposedUntil = this.tick + sec(S.exposedSec);
        den.nextAt = den.exposedUntil + Math.round(S.every * 0.4);
      }
      return;
    }
    if (this.tick < e.stunUntil || this.tick < e.freezeUntil) return;
    if (this.tick < den.exposedUntil || hunting) {
      // Открыт: медленно преследует, бьёт контактом — окно наказания.
      const speed = S.chaseSpeed * (hunting ? ARCADE.curse.bloodhunt.speedMult : 1) * (this.tick < e.chillUntil ? 1 - e.chillSlow * 0.5 : 1);
      e.x += dx / d * speed * DT; e.y += dy / d * speed * DT;
      [e.x, e.y] = this.obstacles.resolve(e.x, e.y, e.kind.r * 0.8);
      this.contactDamage(e, d);
      if (hunting) return;
    }
    if (this.tick >= den.exposedUntil && this.tick >= den.nextAt) {
      // Метка там, куда герой придёт через leadSec с текущей скоростью; стоящий на месте получает метку под ноги.
      const vx = (p.x - this.prevPx) * TICK_HZ, vy = (p.y - this.prevPy) * TICK_HZ;
      den.markX = clamp(p.x + vx * S.leadSec, 20, ARCADE.world.w - 20); den.markY = clamp(p.y + vy * S.leadSec, 20, ARCADE.world.h - 20);
      den.markUntil = this.tick + S.telegraph;
      this.events.ambushes++;
      // Пока скрыт — отсиживается в стороне от героя, чтобы не мешать и не выдавать себя.
      const a = this.rng.float() * Math.PI * 2;
      e.x = clamp(p.x + Math.cos(a) * 320, 20, ARCADE.world.w - 20); e.y = clamp(p.y + Math.sin(a) * 320, 20, ARCADE.world.h - 20);
    }
  }

  /** Брод в русле на fordDx от ямы, сторона по seed; стоит в воде — препятствий там нет (карта чистит русло). */
  private placeFord(seed: string): Ford {
    const Wd = ARCADE.warden;
    const rng = new Rng(`ford:${seed}:${this.act}`);
    const side = rng.float() < 0.5 ? -1 : 1;
    const x = clamp(ARCADE.pit.x + side * (Wd.fordDx[0] + rng.float() * (Wd.fordDx[1] - Wd.fordDx[0])), 120, ARCADE.world.w - 120);
    const y = ARCADE.river.y;
    this.warden = this.spawnEnemy(ENEMY_KINDS.river_warden, x, y);
    return { x, y, engaged: false, shieldUntil: 0, openUntil: 0, nextWaveAt: 0, waves: [], waveHitAt: 0 };
  }

  playerAtFord(): boolean {
    return !!this.ford && !!this.warden?.alive && this.ford.engaged;
  }

  /** Страж под щитом: урона не берёт (фаза видна кольцом). */
  wardenShielded(): boolean {
    return !!this.ford && !!this.warden?.alive && this.tick < this.ford.shieldUntil;
  }

  private updateFordEngage(): void { this.updateEngage(this.ford, this.warden?.alive === true, ARCADE.warden.wakeRadius, ARCADE.warden.engageRadius); }

  /** Страж переправы: щит/открыт по фазам, волны через русло с островком, держит дистанцию в воде. */
  private moveWarden(e: Enemy, dx: number, dy: number, d: number): void {
    const Wd = ARCADE.warden, f = this.ford;
    if (!f) return;
    this.capControl(e, Wd.ccCap, Wd.ccResist);
    const p = this.player, R = ARCADE.river;
    const hunting = e === this.hunter;
    // Волны идут независимо от движения стража.
    for (const w of f.waves) {
      w.x += w.dir * Wd.waveSpeed * DT; w.left -= Wd.waveSpeed * DT;
      if (this.tick >= f.waveHitAt && Math.abs(p.x - w.x) <= Wd.waveW / 2 + ARCADE.player.r && Math.abs(p.y - R.y) <= R.halfWidth && Math.abs(p.y - w.gapY) > Wd.gapH / 2) {
        f.waveHitAt = this.tick + Wd.waveHitEvery;
        this.damagePlayer(e.dmg / e.kind.dmg * Wd.waveDmg, 0, e.kind);
      }
    }
    f.waves = f.waves.filter((w) => w.left > 0);
    if (this.tick < e.stunUntil || this.tick < e.freezeUntil) return;
    const home = len(e.x - f.x, e.y - f.y);
    if (!hunting && (!this.playerAtFord() || home > Wd.leash)) {
      this.returnHome(e, f.x, f.y, home, Wd.regenPerSec);
      f.shieldUntil = 0; f.openUntil = 0;
      return;
    }
    // Фазы: щит → открыт → щит…; первая фаза — щит.
    if (this.tick === f.shieldUntil) f.openUntil = this.tick + sec(Wd.openSec); // щит спал — окно
    else if (this.tick >= f.openUntil && this.tick >= f.shieldUntil) f.shieldUntil = this.tick + sec(Wd.shieldSec); // окно кончилось — щит
    if (this.tick >= f.nextWaveAt) {
      f.nextWaveAt = this.tick + Wd.waveEvery;
      const dir: 1 | -1 = this.rng.float() < 0.5 ? -1 : 1;
      f.waves.push({ x: e.x - dir * Wd.waveLen / 2, dir, gapY: R.y + (this.rng.float() * 2 - 1) * (R.halfWidth - Wd.gapH / 2), left: Wd.waveLen });
    }
    let speed = e.kind.speed * (hunting ? ARCADE.curse.bloodhunt.speedMult : 1);
    if (this.tick < e.chillUntil) speed *= 1 - e.chillSlow * 0.5;
    if (d < Wd.keepMin && (hunting || home < Wd.leash - 20)) { e.x -= dx / d * speed * DT; e.y -= dy / d * speed * DT; }
    else if (d > Wd.keepMax) { e.x += dx / d * speed * DT; e.y += dy / d * speed * DT; }
    if (!hunting) e.y = clamp(e.y, R.y - R.halfWidth + 20, R.y + R.halfWidth - 20); // не выходит из воды
    this.contactDamage(e, d);
  }

  /** Логово по seed: кольцо от старта, подальше от остальных мест, свободный центр. */
  private placeLair(seed: string): Lair {
    const T = ARCADE.thunder;
    const others: { x: number; y: number }[] = [];
    for (const o of [this.camp, this.outpost, this.pond, this.grove, this.barrow, this.forge]) if (o) others.push({ x: o.x, y: o.y });
    const [x, y] = this.pickSpot(new Rng(`lair:${seed}:${this.act}`), T.distMin, T.distMax, 120, T.minFromOthers, others, 44);
    this.thunder = this.spawnEnemy(ENEMY_KINDS.thunder_golem, x, y);
    return { x, y, engaged: false, zones: [], telegraphUntil: 0, activeUntil: 0, nextAt: 0, chainHitAt: 0 };
  }

  playerAtLair(): boolean {
    return !!this.lair && !!this.thunder?.alive && this.lair.engaged;
  }

  private updateLairEngage(): void { this.updateEngage(this.lair, this.thunder?.alive === true, ARCADE.thunder.wakeRadius, ARCADE.thunder.engageRadius); }

  /** Гром-голем: медленная погоня, раз в `every` — три заряженные зоны вокруг героя с безопасной четвёртой стороной, затем удар и цепь. */
  private moveThunder(e: Enemy, dx: number, dy: number, d: number): void {
    const T = ARCADE.thunder, l = this.lair;
    if (!l) return;
    this.capControl(e, T.ccCap, T.ccResist);
    const p = this.player;
    const hunting = e === this.hunter;
    // Фазы паттерна идут независимо от движения.
    if (l.zones.length > 0) {
      if (this.tick === l.telegraphUntil) {
        for (const z of l.zones) if (len(p.x - z.x, p.y - z.y) <= T.zoneRadius + ARCADE.player.r) { this.damagePlayer(e.dmg / e.kind.dmg * T.strikeDmg, 0.2, e.kind); break; }
        for (const z of l.zones) this.pushFx("zap", z.x, z.y - 140, z.x, z.y, 10);
        this.shake = Math.max(this.shake, 8);
      }
      if (this.tick > l.telegraphUntil && this.tick < l.activeUntil && this.tick >= l.chainHitAt) {
        // Цепь между соседними зонами: попал на отрезок — урон.
        for (let i = 0; i + 1 < l.zones.length; i++) {
          const a = l.zones[i], b = l.zones[i + 1];
          const vx = b.x - a.x, vy = b.y - a.y, wx = p.x - a.x, wy = p.y - a.y;
          const t = Math.max(0, Math.min(1, (vx * wx + vy * wy) / ((vx * vx + vy * vy) || 1)));
          if (len(p.x - (a.x + vx * t), p.y - (a.y + vy * t)) <= T.chainWidth / 2 + ARCADE.player.r) { l.chainHitAt = this.tick + T.chainHitEvery; this.damagePlayer(e.dmg / e.kind.dmg * T.chainDmg, 0, e.kind); break; }
        }
      }
      if (this.tick >= l.activeUntil) l.zones = [];
    }
    if (this.tick < e.stunUntil || this.tick < e.freezeUntil) return;
    const home = len(e.x - l.x, e.y - l.y);
    if (!hunting && (!this.playerAtLair() || home > T.leash)) {
      this.returnHome(e, l.x, l.y, home, T.regenPerSec);
      return;
    }
    if (l.zones.length === 0 && this.tick >= l.nextAt && d <= 360) {
      // Три зоны из четырёх сторон вокруг героя; пропущенная сторона — безопасный сектор, и она случайна.
      const sides: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      sides.splice(this.rng.int(4), 1);
      l.zones = sides.map(([sx, sy]) => ({ x: clamp(p.x + sx * T.zoneDist, 20, ARCADE.world.w - 20), y: clamp(p.y + sy * T.zoneDist, 20, ARCADE.world.h - 20) }));
      l.telegraphUntil = this.tick + T.telegraph; l.activeUntil = l.telegraphUntil + T.active; l.chainHitAt = 0;
      l.nextAt = l.activeUntil + T.every;
    }
    let speed = (d > T.chaseFrom ? T.chaseSpeed : e.kind.speed) * (hunting ? ARCADE.curse.bloodhunt.speedMult : 1);
    if (this.tick < e.chillUntil) speed *= 1 - e.chillSlow * 0.5;
    e.x += dx / d * speed * DT; e.y += dy / d * speed * DT;
    [e.x, e.y] = this.obstacles.resolve(e.x, e.y, e.kind.r * 0.8);
    this.contactDamage(e, d);
  }

  /** Кузня по seed: кольцо от старта, подальше от остальных мест, не в реке/яме, не в дереве. */
  private placeForge(seed: string): Forge {
    const F = ARCADE.forge;
    const others: { x: number; y: number }[] = [];
    for (const o of [this.camp, this.outpost, this.pond, this.grove, this.barrow]) if (o) others.push({ x: o.x, y: o.y });
    const [x, y] = this.pickSpot(new Rng(`forge:${seed}:${this.act}`), F.distMin, F.distMax, 80, F.minFromOthers, others, 36);
    return { x, y, used: false };
  }

  // ---------- разлом (T13.58) ----------

  private placeRift(seed: string): Rift {
    const R = ARCADE.rift;
    const rng = new Rng(`rift:${seed}:${this.act}`);
    const others: { x: number; y: number }[] = [];
    for (const o of [this.camp, this.outpost, this.pond, this.grove, this.barrow, this.forge]) if (o) others.push({ x: o.x, y: o.y });
    const [x, y] = this.pickSpot(rng, R.distMin, R.distMax, 80, R.minFromOthers, others, 36);
    // Два правила из четырёх — по seed, чтобы выбор был частью сида, а не текущего состояния.
    const pool = [...RIFT_RULES];
    const a = pool.splice(rng.int(pool.length), 1)[0];
    const b = pool.splice(rng.int(pool.length), 1)[0];
    return { x, y, offered: [a, b], rule: null, state: "idle", endsAt: 0, nextWaveAt: 0, kills: 0, won: false };
  }

  /** Разлом открыт: по расписанию акта и ещё не пройден/не провален. */
  riftReady(): boolean {
    return !!this.rift && this.rift.state === "idle" && this.actTick >= ARCADE.rift.fromTick[this.act];
  }

  riftActive(): boolean {
    return this.rift?.state === "active";
  }

  /** Сколько тиков испытания осталось (0 вне разлома). */
  riftLeft(): number {
    return this.rift?.state === "active" ? Math.max(0, this.rift.endsAt - this.tick) : 0;
  }

  private riftRule(): RiftRuleId | null {
    return this.rift?.state === "active" ? this.rift.rule : null;
  }

  riftSpeedMult(): number {
    return this.riftRule() === "surge" ? ARCADE.rift.rules.surge.speedMult : 1;
  }

  riftTakenMult(): number {
    return this.riftRule() === "brittle" ? ARCADE.rift.rules.brittle.takenMult : 1;
  }

  riftAttackMult(): number {
    return this.riftRule() === "silence" ? ARCADE.rift.rules.silence.attackMult : 1;
  }

  riftSilenced(): boolean {
    return this.riftRule() === "silence";
  }

  /** Множитель обзора «Мглы» для рендера (1 — обычный обзор). */
  riftVisionMult(): number {
    return this.riftRule() === "gloom" ? ARCADE.rift.rules.gloom.visionMult : 1;
  }

  private riftAction(act: number): void {
    const rift = this.rift;
    if (!rift || rift.state !== "idle") { this.riftOpen = false; return; }
    if (act === SHOP_ACT.close) { this.riftOpen = false; return; }
    if (act === 1 || act === 2) this.enterRift(rift.offered[act - 1]);
  }

  /** Рядовые враги втягиваются в разлом без награды: боссы, тотемы, строения и чемпионы остаются. */
  private riftPurge(): void {
    const special = new Set<Enemy | null>([this.roshan, this.ancient, this.defiler, this.centaur, this.necromancer, this.thunder, this.warden, this.stalker, this.hunter]);
    for (const e of this.enemies) {
      if (!e.alive || e.kind.boss || e.kind.structure || e.kind.totem || e.kind.id === "tormentor" || special.has(e)) continue;
      e.alive = false;
    }
  }

  private enterRift(rule: RiftRuleId): void {
    const rift = this.rift;
    if (!rift || rift.state !== "idle") return;
    rift.state = "active"; rift.rule = rule; rift.endsAt = this.tick + ARCADE.rift.duration; rift.nextWaveAt = this.tick + sec(1); rift.kills = 0;
    this.riftOpen = false;
    this.riftPurge();
    this.events.rifts++;
    this.pushFx("levelup", rift.x, rift.y, 0, 0, 30);
    this.shake = Math.max(this.shake, 10);
  }

  private endRift(won: boolean): void {
    const rift = this.rift;
    if (!rift || rift.state !== "active") return;
    rift.state = "done"; rift.won = won;
    this.riftPurge();
    this.respiteUntil = this.tick + ARCADE.rift.respite;
    this.pushFx("nova", rift.x, rift.y, ARCADE.rift.arena, 0, 12);
    if (!won) return;
    const up = this.rollUpgradeOffer([]);
    if (up && up.kind === "upgrade") {
      this.queueReward([{ kind: "upgrade", id: up.id, rarity: ARCADE.rift.rewardRarity }]);
    } else this.gainGold(Math.round(ARCADE.bounty.base + ARCADE.bounty.perMin * this.minutes));
  }

  /** Испытание: выход за арену — провал; время вышло — награда; между ними разлом зовёт лес из текущего пула. */
  private tickRift(): void {
    const rift = this.rift, R = ARCADE.rift, p = this.player;
    if (!rift || rift.state !== "active") return;
    if (len(p.x - rift.x, p.y - rift.y) > R.arena + ARCADE.player.r) { this.endRift(false); return; }
    if (this.tick >= rift.endsAt) { this.endRift(true); return; }
    const rule = rift.rule!, rules = R.rules;
    const min = this.minutes;
    const rate = (ARCADE.spawn.base + ARCADE.spawn.perMin * Math.min(min, ARCADE.spawn.kneeMin) + ARCADE.spawn.latePerMin * Math.max(0, min - ARCADE.spawn.kneeMin)) * this.rank.spawnMult * R.spawnMult * (rule === "surge" ? rules.surge.spawnMult : 1);
    this.spawnAcc += rate * DT;
    const pool = spawnPool(min, this.act);
    const alive = this.aliveEnemies();
    let n = 0;
    while (this.spawnAcc >= 1) { this.spawnAcc -= 1; if (alive + n < R.cap) n++; }
    if (this.tick >= rift.nextWaveAt) { rift.nextWaveAt = this.tick + R.waveEvery; n += R.waveSize; }
    for (let i = 0; i < n; i++) {
      const e = this.spawnEnemy(weightedPick(this.rng, pool), ...this.ringPoint(ARCADE.spawn.ringMin, ARCADE.spawn.ringMax));
      if (rule === "brittle") { e.hp *= rules.brittle.hpMult; e.maxHp *= rules.brittle.hpMult; }
      if (rule === "gloom") e.dmg *= rules.gloom.dmgMult;
    }
  }

  // ---------- приглашения у края экрана (T13.60) ----------

  /** Что показывать маркерами у края: угрозы и выбранные цели — всегда; необязательные места — по приоритету,
   *  не больше `ARCADE.invitations.max`, пока обзор с аванпоста не открыл всё. Приоритет: срочное (караван ждёт,
   *  торговец уходит) → пруд при порче → базовые цели (лагерь, аванпост) → разлом → кузня. */
  invitations(): Invitation[] {
    const out: Invitation[] = [];
    const captured = this.outpost?.captured === true;
    if (this.hunter?.alive) out.push({ kind: "hunter", x: this.hunter.x, y: this.hunter.y, label: "☠", committed: true });
    const ch = this.contractHome();
    if (ch) out.push({ kind: "contract", x: ch.x, y: ch.y, label: "!", committed: true });
    const camp = this.camp, o = this.outpost;
    if (camp && !camp.cleared && camp.engaged) out.push({ kind: "camp", x: camp.x, y: camp.y, label: String(this.totemsAlive()), committed: true });
    if (o && !o.captured && o.progress > 0) out.push({ kind: "outpost", x: o.x, y: o.y, label: `${Math.floor((o.progress / o.need) * 100)}%`, committed: true });
    const cv = this.caravan;
    if (cv && cv.state === "moving") out.push({ kind: "caravan", x: cv.x, y: cv.y, label: "$", committed: true });
    const optional: Invitation[] = [];
    if (cv && cv.state === "waiting") optional.push({ kind: "caravan", x: cv.x, y: cv.y, label: "$", committed: false });
    if (this.shopkeeper.alive) optional.push({ kind: "shop", x: this.shopkeeper.x, y: this.shopkeeper.y, label: "$", committed: false });
    if (this.pond && !this.pond.used && this.player.curse) optional.push({ kind: "pond", x: this.pond.x, y: this.pond.y, label: "✚", committed: false });
    if (camp && !camp.cleared && !camp.engaged) optional.push({ kind: "camp", x: camp.x, y: camp.y, label: String(this.totemsAlive()), committed: false });
    if (o && !o.captured && o.progress === 0) optional.push({ kind: "outpost", x: o.x, y: o.y, label: "", committed: false });
    if (this.riftReady()) optional.push({ kind: "rift", x: this.rift!.x, y: this.rift!.y, label: "◇", committed: false });
    if (this.forgeReady()) optional.push({ kind: "forge", x: this.forge!.x, y: this.forge!.y, label: "⚒", committed: false });
    if (captured) {
      if (this.lair && this.thunder?.alive) optional.push({ kind: "lair", x: this.lair.x, y: this.lair.y, label: "", committed: false });
      if (this.ford && this.warden?.alive) optional.push({ kind: "ford", x: this.ford.x, y: this.ford.y, label: "", committed: false });
      if (this.den && this.stalker?.alive) optional.push({ kind: "den", x: this.den.x, y: this.den.y, label: "", committed: false });
      if (this.grove && this.centaur?.alive) optional.push({ kind: "grove", x: this.grove.x, y: this.grove.y, label: "", committed: false });
      if (this.barrow && this.necromancer?.alive) optional.push({ kind: "barrow", x: this.barrow.x, y: this.barrow.y, label: String(this.idolsAlive()), committed: false });
      if (this.pond && !this.pond.used && !this.player.curse) optional.push({ kind: "pond", x: this.pond.x, y: this.pond.y, label: "", committed: false });
      if (this.bounty.alive) optional.push({ kind: "bounty", x: this.bounty.x, y: this.bounty.y, label: "$", committed: false });
      if (this.rune.alive) optional.push({ kind: "rune", x: this.rune.x, y: this.rune.y, label: "", committed: false });
      if (this.chest.alive) optional.push({ kind: "chest", x: this.chest.x, y: this.chest.y, label: "", committed: false });
      if (this.neutralToken.alive) optional.push({ kind: "token", x: this.neutralToken.x, y: this.neutralToken.y, label: `T${this.neutralToken.value}`, committed: false });
      if (this.shrine.alive) optional.push({ kind: "shrine", x: this.shrine.x, y: this.shrine.y, label: "", committed: false });
      return [...out, ...optional];
    }
    return [...out, ...optional.slice(0, ARCADE.invitations.max)];
  }

  // ---------- караван лавочника (T13.59) ----------

  private placeCaravan(seed: string): Caravan {
    const C = ARCADE.caravan, W = ARCADE.world;
    const rng = new Rng(`caravan:${seed}:${this.act}`);
    const others: { x: number; y: number }[] = [];
    for (const o of [this.camp, this.outpost, this.pond, this.grove, this.barrow, this.forge, this.rift]) if (o) others.push({ x: o.x, y: o.y });
    const [sx, sy] = this.pickSpot(rng, C.distMin, C.distMax, 100, C.minFromOthers, others, 30);
    // Цель — по прямой на `length`; из 12 направлений берём то, где середина и конец дальше всего от других мест и в мире.
    let best: [number, number] = [sx, sy], bestScore = -Infinity;
    for (let i = 0; i < 12; i++) {
      const a = rng.float() * Math.PI * 2;
      const ex = clamp(sx + Math.cos(a) * C.length, 100, W.w - 100), ey = clamp(sy + Math.sin(a) * C.length, 100, W.h - 100);
      if (this.pit && Math.abs(ey - ARCADE.river.y) < ARCADE.river.halfWidth + 60) continue;
      const mx = (sx + ex) / 2, my = (sy + ey) / 2;
      const nearest = others.reduce((m, o) => Math.min(m, len(ex - o.x, ey - o.y), len(mx - o.x, my - o.y)), Infinity);
      const score = Math.min(nearest, len(ex - sx, ey - sy) * 2);
      if (score > bestScore) { bestScore = score; best = [ex, ey]; }
    }
    const [ex, ey] = this.obstacles.resolve(best[0], best[1], 30);
    return { sx, sy, ex, ey, x: sx, y: sy, state: "hidden", leaveAt: 0, nextRaidAt: 0, raids: 0, family: ITEM_FAMILIES[rng.int(ITEM_FAMILIES.length)] };
  }

  /** Герой сопровождает: рядом с повозкой. */
  playerEscorting(): boolean {
    const c = this.caravan;
    return !!c && (c.state === "waiting" || c.state === "moving") && len(this.player.x - c.x, this.player.y - c.y) <= ARCADE.caravan.escortRadius;
  }

  /** Доля пути каравана 0..1. */
  caravanProgress(): number {
    const c = this.caravan;
    if (!c) return 0;
    const total = len(c.ex - c.sx, c.ey - c.sy) || 1;
    return c.state === "arrived" ? 1 : clamp(1 - len(c.ex - c.x, c.ey - c.y) / total, 0, 1);
  }

  private tickCaravan(): void {
    const c = this.caravan, C = ARCADE.caravan;
    if (!c || c.state === "arrived" || c.state === "gone") return;
    if (c.state === "hidden") {
      if (this.actTick < C.at[this.act]) return;
      c.state = "waiting"; c.leaveAt = this.tick + C.window;
      return;
    }
    if (this.tick >= c.leaveAt) { c.state = "gone"; return; }
    if (!this.playerEscorting()) { c.state = "waiting"; return; }
    c.state = "moving";
    const d = len(c.ex - c.x, c.ey - c.y);
    const stepLen = C.speed * DT;
    if (d <= stepLen) {
      c.x = c.ex; c.y = c.ey; c.state = "arrived";
      // Доехал — лавка на месте цели (обычный торговец: касание открывает, закрытие убирает).
      this.shopkeeper = { alive: true, x: c.ex, y: c.ey, until: this.tick + ARCADE.shop.lifetime, value: 1 }; // value 1 — лавка каравана, со скидкой
      this.caravanGift = true;
      this.events.caravans++;
      this.pushFx("levelup", c.ex, c.ey, 0, 0, 30);
      return;
    }
    c.x += (c.ex - c.x) / d * stepLen; c.y += (c.ey - c.y) / d * stepLen;
    // Налёт: пока повозка едет, лес выходит на дорогу вокруг неё.
    if (this.tick >= c.nextRaidAt) {
      c.nextRaidAt = this.tick + C.raidEvery;
      c.raids++;
      const pool = spawnPool(this.minutes, this.act);
      for (let i = 0; i < C.raidSize; i++) {
        const a = this.rng.float() * Math.PI * 2, r = C.raidRingMin + this.rng.float() * (C.raidRingMax - C.raidRingMin);
        const [x, y] = this.obstacles.resolve(clamp(c.x + Math.cos(a) * r, 8, ARCADE.world.w - 8), clamp(c.y + Math.sin(a) * r, 8, ARCADE.world.h - 8), 24);
        this.spawnEnemy(weightedPick(this.rng, pool), x, y);
      }
    }
  }

  /** Кузня готова: остыла по расписанию акта и ещё не использована. */
  forgeReady(): boolean {
    return !!this.forge && !this.forge.used && this.actTick >= ARCADE.forge.fromTick[this.act];
  }

  forgePrice(kind: "temper" | "reforge" | "sacrifice"): number {
    const c = ARCADE.forge[kind];
    // «Торговый путь»: караван привёз материалы — кузня вдвое дешевле после его прибытия.
    const mult = this.actProperty() === "caravan_forge" && this.caravan?.state === "arrived" ? 0.5 : 1;
    return Math.round((c.base + c.perMin * this.minutes) * mult);
  }

  /** Кузня: 10+i — выбрать надетый предмет слота i; 1 — закалить, 2 — перековать, 3 — переплавить в другой слот; 5 — уйти. */
  private forgeAction(act: number): void {
    const p = this.player, forge = this.forge;
    if (!forge) { this.forgeOpen = false; return; }
    if (act === 5) { this.forgeOpen = false; return; }
    if (act >= 10 && act < 10 + GEAR_SLOTS.length) { this.forgeSlot = p.gear[GEAR_SLOTS[act - 10]] ? act - 10 : -1; return; }
    if (this.forgeSlot < 0) return;
    const slot = GEAR_SLOTS[this.forgeSlot];
    const item = p.gear[slot] as GearItem | undefined;
    if (!item) { this.forgeSlot = -1; return; }
    const kind = act === 1 ? "temper" : act === 2 ? "reforge" : act === 3 ? "sacrifice" : null;
    if (!kind) return;
    const price = DEV_FREE_SHOP ? 0 : this.forgePrice(kind);
    if (p.gold < price) return;
    let next: GearItem;
    let targetSlot: GearSlot = slot;
    if (kind === "temper") next = temperGear(item);
    else if (kind === "reforge") next = reforgeGear(this.rng, item);
    else {
      // Переплавить: предмет становится вещью другого слота той же редкости и тира — сначала пустого, иначе случайного другого.
      const empty = GEAR_SLOTS.filter((s) => s !== slot && !p.gear[s]);
      const pool = empty.length ? empty : GEAR_SLOTS.filter((s) => s !== slot);
      targetSlot = pool[this.rng.int(pool.length)];
      next = { ...rollGear(this.rng, item.tier, item.rarity, this.nextUid(), targetSlot), forged: true };
      delete p.gear[slot];
      const old = p.gear[targetSlot] as GearItem | undefined;
      if (old && p.bag.length < ARCADE.loot.bagCap) p.bag.push(old);
    }
    p.gold -= price;
    p.gear[targetSlot] = next;
    // В «подобранное за забег» кладём результат: стартовые вещи стор сводит по uid, новые — по списку добычи.
    this.loot = this.loot.filter((l) => l.uid !== item.uid && l.uid !== next.uid);
    this.loot.push(next);
    forge.used = true;
    this.forgeOpen = false;
    this.forgeSlot = -1;
    this.recomputeStats();
    this.pushFx("levelup", p.x, p.y, 0, 0, 30);
    this.shake = Math.max(this.shake, 6);
  }

  /** Курган по seed: кольцо от старта, подальше от остальных мест, центр и два места идолов свободны. */
  private placeBarrow(seed: string): Barrow {
    const N = ARCADE.necro;
    const rng = new Rng(`barrow:${seed}:${this.act}`);
    const others: { x: number; y: number }[] = [];
    for (const o of [this.camp, this.outpost, this.pond, this.grove]) if (o) others.push({ x: o.x, y: o.y });
    const [x, y] = this.pickSpot(rng, N.distMin, N.distMax, 120, N.minFromOthers, others, 40);
    for (let i = 0; i < N.idols; i++) { const [ix, iy] = this.obstacles.resolve(x + (i === 0 ? -N.idolRing : N.idolRing), y + 30, 22); this.spawnEnemy(ENEMY_KINDS.bone_idol, ix, iy); }
    this.necromancer = this.spawnEnemy(ENEMY_KINDS.troll_necromancer, x, y - 20);
    return { x, y, engaged: false, idolsDown: 0, nextRaiseAt: 0 };
  }

  playerAtBarrow(): boolean {
    return !!this.barrow && !!this.necromancer?.alive && this.barrow.engaged;
  }

  idolsAlive(): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive && e.kind.id === "bone_idol") n++;
    return n;
  }

  private updateBarrowEngage(): void { this.updateEngage(this.barrow, this.necromancer?.alive === true, ARCADE.necro.wakeRadius, ARCADE.necro.engageRadius); }

  /** Живые цели для контракта (T13.50): Сатир лагеря (пока лагерь не очищен), Кентавр, Некромант. */
  private contractTargets(): ContractTarget[] {
    const out: ContractTarget[] = [];
    if (this.camp && !this.camp.cleared && this.defiler?.alive) out.push("defiler");
    if (this.centaur?.alive) out.push("centaur");
    if (this.necromancer?.alive) out.push("necro");
    if (this.thunder?.alive) out.push("thunder");
    if (this.warden?.alive) out.push("warden");
    if (this.stalker?.alive) out.push("stalker");
    return out;
  }

  /** Дом цели контракта — для маркера у края экрана. */
  contractHome(): { x: number; y: number } | null {
    const c = this.contract;
    if (!c || c.done) return null;
    if (c.target === "defiler") return this.camp && !this.camp.cleared ? this.camp : null;
    if (c.target === "centaur") return this.centaur?.alive && this.grove ? this.grove : null;
    if (c.target === "thunder") return this.thunder?.alive && this.lair ? this.lair : null;
    if (c.target === "warden") return this.warden?.alive && this.ford ? this.ford : null;
    if (c.target === "stalker") return this.stalker?.alive && this.den ? this.den : null;
    return this.necromancer?.alive && this.barrow ? this.barrow : null;
  }

  private tickContractOffer(): void {
    if (this.contractOffered || this.actTick < ARCADE.contract.at[this.act]) return;
    this.contractOffered = true;
    const pool = this.contractTargets();
    if (pool.length < 2) return;
    const rewards: ContractReward[] = ["weapon", "armor", "school"];
    const a = pool.splice(this.rng.int(pool.length), 1)[0], b = pool[this.rng.int(pool.length)];
    const ra = rewards.splice(this.rng.int(rewards.length), 1)[0], rb = rewards[this.rng.int(rewards.length)];
    this.contractOffers = [{ target: a, reward: ra }, { target: b, reward: rb }];
    this.contractOpen = true;
  }

  private contractAction(act: number): void {
    // 1–2 — цель, 6–7 — та же цель с Клятвой охотника (T13.72).
    const oath = act > CONTRACT_OATH_ACT && act <= CONTRACT_OATH_ACT + 2;
    const idx = oath ? act - CONTRACT_OATH_ACT : act;
    if (idx === 1 || idx === 2) {
      const o = this.contractOffers[idx - 1];
      if (o) this.contract = { target: o.target, reward: o.reward, done: false, oath };
      this.contractOpen = false;
    } else if (act === 5) this.contractOpen = false;
  }

  /** Множитель Клятвы охотника к урону по врагу: цель контракта — больше, обычная толпа — меньше, остальным — 1. */
  private oathMult(e: Enemy): number {
    const c = this.contract;
    if (!c?.oath || c.done) return 1;
    if (e.kind.id === CONTRACT_KIND[c.target]) return ARCADE.contract.oath.targetMult;
    return e.kind.elite || e.kind.boss || e.kind.structure ? 1 : ARCADE.contract.oath.trashMult;
  }

  /** Цель контракта убита: награда сверх обычной — оружие/броня exotic у ног или карта школы exotic. */
  private completeContract(target: ContractTarget, x: number, y: number): void {
    const c = this.contract;
    if (!c || c.done || c.target !== target) return;
    c.done = true;
    this.events.contracts++;
    // Клятва выполнена: +1 ранг самому прокачанному из Q/W/E, у которого есть запас, — усиление до конца акта.
    if (c.oath) {
      const p = this.player;
      let best: "q" | "w" | "e" | null = null;
      for (const k of ["q", "w", "e"] as const) if (p.abilities[k] < 4 && (best === null || p.abilities[k] > p.abilities[best])) best = k;
      if (best) { p.abilities[best]++; this.recomputeStats(); }
    }
    this.pushFx("levelup", this.player.x, this.player.y, 0, 0, 30);
    if (c.reward === "weapon") this.dropLoot(x, y - 20, rollGear(this.rng, this.lootTier(), "exotic", this.nextUid(), "weapon"));
    else if (c.reward === "armor") { this.dropLoot(x - 20, y - 20, rollGear(this.rng, this.lootTier(), "exotic", this.nextUid(), "armor")); this.dropLoot(x + 20, y - 20, rollGear(this.rng, this.lootTier(), "exotic", this.nextUid(), "helm")); }
    else {
      const up = this.rollUpgradeOffer([]);
      if (up && up.kind === "upgrade") this.queueReward([{ kind: "upgrade", id: up.id, rarity: "exotic" }]);
    }
  }

  /** Подъём павших (T13.46): пока герой у кургана и стоит хоть один идол — скелеты у случайного идола, с потолком живых. */
  private tickBarrowRaise(): void {
    const b = this.barrow, N = ARCADE.necro;
    if (!b || !this.playerAtBarrow() || this.tick < b.nextRaiseAt) return;
    const idols = this.enemies.filter((e) => e.alive && e.kind.id === "bone_idol");
    if (idols.length === 0) return;
    b.nextRaiseAt = this.tick + N.raiseEvery;
    let risen = 0;
    for (const e of this.enemies) if (e.alive && e.kind.id === "skeleton_warrior") risen++;
    const n = Math.min(N.raiseBase + idols.length, Math.max(0, N.maxRisen - risen));
    const idol = idols[this.rng.int(idols.length)];
    for (let i = 0; i < n; i++) {
      const a = this.rng.float() * Math.PI * 2, d = 24 + this.rng.float() * 40;
      const [sx, sy] = this.obstacles.resolve(clamp(idol.x + Math.cos(a) * d, 8, ARCADE.world.w - 8), clamp(idol.y + Math.sin(a) * d, 8, ARCADE.world.h - 8), 12);
      this.spawnEnemy(ENEMY_KINDS.skeleton_warrior, sx, sy);
    }
    this.pushFx("nova", idol.x, idol.y, 60, 0, 14);
  }

  /** Тролль-Некромант: держит дистанцию и стреляет; спит и лечится дома вне контакта; поводок; контроль ограничен. */
  private moveNecromancer(e: Enemy, dx: number, dy: number, d: number): void {
    const N = ARCADE.necro, b = this.barrow;
    if (!b) return;
    this.capControl(e, N.ccCap, N.ccResist);
    e.shotCd = Math.max(0, e.shotCd - 1);
    if (this.tick < e.stunUntil || this.tick < e.freezeUntil) return;
    const home = len(e.x - b.x, e.y - b.y);
    const hunting = e === this.hunter;
    if (!hunting && (!this.playerAtBarrow() || home > N.leash)) {
      this.returnHome(e, b.x, b.y, home, N.regenPerSec);
      return;
    }
    let speed = e.kind.speed;
    if (this.tick < e.chillUntil) speed *= 1 - e.chillSlow * 0.5;
    // Кайт: ближе keepMin — отходит от героя (но не дальше поводка), дальше keepMax — подходит.
    if (d < N.keepMin && (hunting || home < N.leash - 20)) { e.x -= dx / d * speed * DT; e.y -= dy / d * speed * DT; }
    else if (d > N.keepMax) { e.x += dx / d * speed * DT; e.y += dy / d * speed * DT; }
    [e.x, e.y] = this.obstacles.resolve(e.x, e.y, e.kind.r * 0.8);
    if (d < N.shot.range && e.shotCd === 0) {
      e.shotCd = sec(N.shot.every);
      this.spawnProjectile(e.x, e.y, dx / d * N.shot.speed, dy / d * N.shot.speed, 10, e.dmg * N.shot.dmgMult, sec(2.2), 0, "siege", true);
    }
    this.contactDamage(e, d);
  }

  /** Роща по seed: кольцо от старта, подальше от лагеря/аванпоста/пруда; из 40 проб берём место с наибольшим числом камней рядом —
   *  без камня рывок нечем прервать. */
  private placeGrove(seed: string): Grove {
    const C = ARCADE.centaur;
    const rng = new Rng(`grove:${seed}:${this.act}`);
    const W = ARCADE.world, cx0 = W.w / 2, cy0 = W.h / 2;
    const rocksNear = (x: number, y: number) => { let n = 0; for (const o of this.obstacles.obstacles) if (o.kind === "rock" && len(o.x - x, o.y - y) < 240) n++; return n; };
    let best: Grove | null = null;
    for (let i = 0; i < 40; i++) {
      const a = rng.float() * Math.PI * 2, d = C.distMin + rng.float() * (C.distMax - C.distMin);
      const x = clamp(cx0 + Math.cos(a) * d, 120, W.w - 120), y = clamp(cy0 + Math.sin(a) * d, 120, W.h - 120);
      if (this.pit && (Math.abs(y - ARCADE.river.y) < ARCADE.river.halfWidth + 80 || len(x - ARCADE.pit.x, y - ARCADE.pit.y) < ARCADE.pit.leash + 80)) continue;
      if ((this.camp && len(x - this.camp.x, y - this.camp.y) < C.minFromOthers) || (this.outpost && len(x - this.outpost.x, y - this.outpost.y) < C.minFromOthers) || (this.pond && len(x - this.pond.x, y - this.pond.y) < C.minFromOthers)) continue;
      if (this.obstacles.blocked(x, y, 40)) continue;
      const g: Grove = { x, y, engaged: false, rocks: rocksNear(x, y) };
      if (!best || g.rocks > best.rocks) best = g;
      if (best.rocks >= 3) break;
    }
    if (!best) { const [x, y] = this.obstacles.resolve(cx0 + C.distMin, cy0, 40); best = { x, y, engaged: false, rocks: rocksNear(x, y) }; }
    this.centaur = this.spawnEnemy(ENEMY_KINDS.centaur_warden, best.x, best.y);
    return best;
  }

  playerAtGrove(): boolean {
    return !!this.grove && !!this.centaur?.alive && this.grove.engaged;
  }

  /** Спящий чемпион (T13.45): не цель для ударов, умений, снарядов и толпы, урона не берёт — мимо него можно пройти.
   *  Будится только входом в рощу (wakeRadius): автоатака по «ближайшему» иначе будила его случайно и ломала кайт (бот 23→13%). */
  isDormant(e: Enemy): boolean {
    if (e === this.hunter) return false;
    if (e.kind.id === "centaur_warden") return !!this.grove && !this.grove.engaged;
    if (e.kind.id === "troll_necromancer" || e.kind.id === "bone_idol") return !!this.barrow && !this.barrow.engaged && !!this.necromancer?.alive;
    if (e.kind.id === "thunder_golem") return !!this.lair && !this.lair.engaged;
    if (e.kind.id === "river_warden") return !!this.ford && !this.ford.engaged;
    if (e.kind.id === "dire_stalker") return this.stalkerHidden();
    return false;
  }

  private updateGroveEngage(): void { this.updateEngage(this.grove, this.centaur?.alive === true, ARCADE.centaur.wakeRadius, ARCADE.centaur.engageRadius); }

  /** Контроль чемпиона: не дольше cap, после — resist иммунитета к повторному (Сатир и Кентавр). */
  private capControl(e: Enemy, cap: number, resist: number): void {
    if (this.tick < e.ccResistUntil) { e.stunUntil = 0; e.freezeUntil = 0; return; }
    const until = this.tick + cap;
    if (e.stunUntil > until) e.stunUntil = until;
    if (e.freezeUntil > until) e.freezeUntil = until;
    const end = Math.max(e.stunUntil, e.freezeUntil);
    if (end > this.tick) e.ccResistUntil = end + resist;
  }

  private moveCentaurEntry(e: Enemy, dx: number, dy: number, d: number): void {
    // Контроль ограничен в любом состоянии, кроме самого рывка (он короче окна).
    if (e.chargeLeft <= 0) this.capControl(e, ARCADE.centaur.ccCap, ARCADE.centaur.ccResist);
    // Телеграф рывка тикает здесь: на нуле — старт рывка (chargeLeft = −1 отличает его от телеграфа удара).
    if (e.chargeLeft === -1 && e.slamT > 0) {
      e.slamT--;
      if (e.slamT === 0) { e.chargeLeft = ARCADE.centaur.chargeLen; e.chargeHit = false; this.pushFx("slash", e.x, e.y, e.x + e.chargeDx * 60, e.y + e.chargeDy * 60, 10); }
      return;
    }
    this.moveCentaur(e, dx, dy, d);
  }

  /**
   * Кентавр-Страж рощи (T13.45): спит дома, пока рощу не разбудили; в бою — телеграф рывка на позицию героя, рывок по
   * прямой: попал — урон, врезался в камень — сам оглушён (окно ×1.5 урона), добежал — широкий удар с телеграфом.
   * Пауза после каждого паттерна; поводок; контроль ограничен.
   */
  private moveCentaur(e: Enemy, dx: number, dy: number, d: number): void {
    const C = ARCADE.centaur, g = this.grove;
    if (!g) return;
    e.slamCd = Math.max(0, e.slamCd - 1);
    const p = this.player;
    const stunned = this.tick < e.stunUntil || this.tick < e.freezeUntil;
    if (e.chargeLeft > 0) {
      const stepLen = Math.min(e.chargeLeft, C.chargeSpeed * DT);
      e.x += e.chargeDx * stepLen; e.y += e.chargeDy * stepLen; e.chargeLeft -= stepLen;
      if (!e.chargeHit && len(p.x - e.x, p.y - e.y) <= C.chargeHitRadius + ARCADE.player.r) {
        e.chargeHit = true;
        this.damagePlayer(e.dmg / e.kind.dmg * C.chargeDmg, 0, e.kind);
        this.shake = Math.max(this.shake, 8);
      }
      for (const o of this.obstacles.near(e.x, e.y)) {
        if (o.kind !== "rock" || len(o.x - e.x, o.y - e.y) > o.r + e.kind.r * 0.7) continue;
        // Врезался: отскок от камня, оглушение, окно наказания.
        e.chargeLeft = 0;
        const bx = e.x - o.x, by = e.y - o.y, bl = len(bx, by) || 1;
        e.x = o.x + bx / bl * (o.r + e.kind.r); e.y = o.y + by / bl * (o.r + e.kind.r);
        e.stunUntil = Math.max(e.stunUntil, this.tick + C.rockStun);
        e.ccResistUntil = e.stunUntil + C.ccResist;
        e.slamCd = C.chargeCooldown;
        this.shake = Math.max(this.shake, 10);
        this.pushFx("burst", e.x, e.y, 60, 0, 16);
        return;
      }
      if (e.chargeLeft <= 0) { e.slamT = C.slamTelegraph; e.slamX = e.x; e.slamY = e.y; e.chargeLeft = 0; }
      e.x = clamp(e.x, 8, ARCADE.world.w - 8); e.y = clamp(e.y, 8, ARCADE.world.h - 8);
      return;
    }
    if (e.slamT > 0) {
      e.slamT--;
      if (e.slamT === 0) {
        if (len(p.x - e.slamX, p.y - e.slamY) <= C.slamRadius + ARCADE.player.r) this.damagePlayer(e.dmg / e.kind.dmg * C.slamDmg, 0.3, e.kind);
        this.shake = Math.max(this.shake, 8);
        this.pushFx("nova", e.slamX, e.slamY, C.slamRadius, 0, 16);
        e.slamCd = C.chargeCooldown;
      }
      return;
    }
    if (stunned) return;
    if (e.slamCd > C.chargeCooldown - C.recovery) return;
    const home = len(e.x - g.x, e.y - g.y);
    const hunting = e === this.hunter;
    if (!hunting && (!this.playerAtGrove() || home > C.leash)) {
      this.returnHome(e, g.x, g.y, home, C.regenPerSec);
      return;
    }
    if (e.slamCd === 0 && d <= C.chargeRange + ARCADE.player.r && d > e.kind.r + ARCADE.player.r + 6) {
      e.slamT = C.chargeTelegraph; e.slamX = p.x; e.slamY = p.y;
      e.chargeDx = dx / d; e.chargeDy = dy / d;
      e.chargeLeft = -1;
      return;
    }
    let speed = e.kind.speed * (hunting ? ARCADE.curse.bloodhunt.speedMult : 1);
    if (this.tick < e.chillUntil) speed *= 1 - e.chillSlow * 0.5;
    e.x += dx / d * speed * DT; e.y += dy / d * speed * DT;
    [e.x, e.y] = this.obstacles.resolve(e.x, e.y, e.kind.r * 0.8);
    if (d < e.kind.r + ARCADE.player.r + 2 && e.contactCd === 0) {
      e.contactCd = sec(ARCADE.boss.contactEvery);
      this.damagePlayer(e.dmg, 0, e.kind);
    }
  }

  /** Пруд по seed: кольцо от старта, не ближе minFromOthers к лагерю и аванпосту, не в реке/яме, не в дереве. */
  private placePond(seed: string): Pond {
    const P = ARCADE.pond;
    const others: { x: number; y: number }[] = [];
    for (const o of [this.camp, this.outpost]) if (o) others.push({ x: o.x, y: o.y });
    const [x, y] = this.pickSpot(new Rng(`pond:${seed}:${this.act}`), P.distMin, P.distMax, 80, P.minFromOthers, others, 36);
    return { x, y, used: false };
  }

  /** Порча принята (T13.43): по кнопке, после показанного условия. */
  private applyCurse(id: CurseId): void {
    const p = this.player;
    p.curse = id;
    this.lastCurse = id;
    this.cursesTaken++;
    if (id === "debt") p.debtLeft = Math.round(ARCADE.curse.debt.base + ARCADE.curse.debt.perMin * this.minutes);
    if (id === "bloodhunt") {
      // Ближайший живой чемпион (Кентавр/Некромант) покидает дом: его зона разбужена и не отпускает.
      const cands = [this.centaur, this.necromancer, this.thunder, this.warden, this.stalker].filter((e): e is Enemy => !!e?.alive);
      cands.sort((a, b) => len(a.x - p.x, a.y - p.y) - len(b.x - p.x, b.y - p.y));
      this.hunter = cands[0] ?? null;
      if (this.hunter === this.centaur && this.grove) this.grove.engaged = true;
      if (this.hunter === this.necromancer && this.barrow) this.barrow.engaged = true;
      if (this.hunter === this.thunder && this.lair) this.lair.engaged = true;
      if (this.hunter === this.warden && this.ford) this.ford.engaged = true;
      if (this.hunter === this.stalker && this.den) { this.den.engaged = true; this.den.markUntil = 0; }
      if (!this.hunter) { p.curse = "withering"; this.lastCurse = "withering"; }
    }
    this.pushFx("burst", p.x, p.y, 60, 0, 20);
  }

  /** Снять порчу (пруд): охотник возвращается домой, долг прощён. */
  private liftCurse(): void {
    const p = this.player;
    p.curse = null; p.debtLeft = 0; this.hunter = null;
  }

  /** Доход героя проходит через долг (T13.51): доля уходит лавочнику, пока долг не погашен; погасил — порча снята. */
  private gainGold(amount: number): void {
    const p = this.player;
    if (amount <= 0) return;
    amount = Math.round(amount * this.ritualMult("debt"));
    if (p.curse === "debt" && p.debtLeft > 0) {
      const pay = Math.min(p.debtLeft, Math.ceil(amount * ARCADE.curse.debt.share));
      p.debtLeft -= pay; amount -= pay;
      if (p.debtLeft <= 0) { this.liftCurse(); this.pushFx("levelup", p.x, p.y, 0, 0, 24); }
    }
    p.gold += amount;
  }

  /** Какая порча ждёт в проклятом сундуке: Кровавая охота — только при живом чемпионе и без контракта («свободный слот большой угрозы»). */
  private rollCurse(): CurseId {
    const pool: CurseId[] = ["withering", "debt"];
    if ((this.centaur?.alive || this.necromancer?.alive || this.thunder?.alive || this.warden?.alive || this.stalker?.alive) && !(this.contract && !this.contract.done)) pool.push("bloodhunt");
    return pool[this.rng.int(pool.length)];
  }

  /** Выбор у пруда: 1 — лечение, 2 — снять порчу, 5 — уйти (пруд остаётся). Лечение не режется Увяданием: пруд и есть очищение. */
  private pondAction(act: number): void {
    const p = this.player, pond = this.pond;
    if (!pond) { this.pondOpen = false; return; }
    if (act === 1) {
      const before = p.hp;
      p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * this.pondHealFrac());
      this.pushFx("heal", p.x, p.y - 30, 0, 0, 30, Math.round(p.hp - before));
      pond.used = true; this.pondOpen = false;
    } else if (act === 2) {
      if (!p.curse || this.pondTainted()) return;
      this.liftCurse();
      this.pushFx("revive", p.x, p.y, 0, 0, 30);
      pond.used = true; this.pondOpen = false;
    } else if (act === POND_RITUAL_ACT) {
      // Ритуал очищения: порча снята и на время становится свойством билда. Пруд одноразовый — зациклить нельзя.
      if (!p.curse || this.pondTainted()) return;
      const kind = p.curse;
      this.liftCurse();
      p.ritualKind = kind; p.ritualUntil = this.tick + sec(ARCADE.build.ritual.seconds);
      this.pushFx("revive", p.x, p.y, 0, 0, 30);
      pond.used = true; this.pondOpen = false;
    } else if (act === 5) this.pondOpen = false;
  }

  private rarityUp(r: Rarity): Rarity {
    const order: Rarity[] = ["standard", "refined", "exotic", "arcana"];
    return order[Math.min(order.length - 1, order.indexOf(r) + ARCADE.curse.lootRarityUp)];
  }

  /**
   * Точка места по seed (T13.53): пробы на кольце от старта; годная — не в реке/яме, не ближе `minFromOthers` к другим местам,
   * не в дереве. Ни одна не годится — берём пробу с наибольшим расстоянием до других мест, а не последнюю попавшуюся
   * (так логово Гром-голема встало в 53 px от лагеря).
   */
  private pickSpot(rng: Rng, distMin: number, distMax: number, margin: number, minFromOthers: number, others: readonly { x: number; y: number }[], blockR: number, tries = 40): [number, number] {
    const W = ARCADE.world, cx0 = W.w / 2, cy0 = W.h / 2;
    let best: [number, number] | null = null, bestScore = -Infinity;
    for (let i = 0; i < tries; i++) {
      const a = rng.float() * Math.PI * 2, d = distMin + rng.float() * (distMax - distMin);
      const x = clamp(cx0 + Math.cos(a) * d, margin, W.w - margin), y = clamp(cy0 + Math.sin(a) * d, margin, W.h - margin);
      if (this.pit && (Math.abs(y - ARCADE.river.y) < ARCADE.river.halfWidth + 80 || len(x - ARCADE.pit.x, y - ARCADE.pit.y) < ARCADE.pit.leash + 80)) continue;
      if (this.obstacles.blocked(x, y, blockR)) continue;
      const nearest = others.reduce((m, o) => Math.min(m, len(x - o.x, y - o.y)), Infinity);
      if (nearest >= minFromOthers) return this.obstacles.resolve(x, y, blockR);
      if (nearest > bestScore) { bestScore = nearest; best = [x, y]; }
    }
    return this.obstacles.resolve(...(best ?? [cx0 + distMin, cy0]), blockR);
  }

  /** Аванпост по seed: кольцо от старта, подальше от лагеря (разные направления = выбор маршрута), не в реке/яме, не в дереве. */
  private placeOutpost(seed: string): Outpost {
    const O = ARCADE.outpost;
    const [x, y] = this.pickSpot(new Rng(`outpost:${seed}:${this.act}`), O.distMin, O.distMax, O.radius + 60, O.minFromCamp, this.camp ? [this.camp] : [], 40);
    return { x, y, progress: 0, need: sec(O.captureSec), captured: false };
  }

  /** Герой в зоне аванпоста (захват идёт). */
  playerAtOutpost(): boolean {
    return !!this.outpost && len(this.player.x - this.outpost.x, this.player.y - this.outpost.y) <= ARCADE.outpost.radius;
  }

  /** Захват: копится только рядом, пауза снаружи без сброса; захвачен — золото, обзор и маркеры до конца акта. */
  private tickOutpost(): void {
    const o = this.outpost;
    if (!o || o.captured || !this.playerAtOutpost()) return;
    o.progress++;
    if (o.progress < o.need) return;
    o.captured = true;
    this.events.outposts++;
    this.gainGold(Math.round((ARCADE.bounty.base + ARCADE.bounty.perMin * this.minutes) * ARCADE.outpost.goldMult));
    this.shake = Math.max(this.shake, 10);
    this.pushFx("nova", o.x, o.y, ARCADE.outpost.radius + 60, 0, 40);
    this.pushFx("levelup", this.player.x, this.player.y, 0, 0, 30);
  }

  /** Множитель ночного обзора: захваченный аванпост расширяет круг (рендер читает). */
  visionMult(): number {
    return this.outpost?.captured ? ARCADE.outpost.nightVisionMult : 1;
  }

  /**
   * Лагерь по seed: отдельный Rng (как у карты), чтобы не сдвигать поток забега. Точка на кольце вокруг старта,
   * не в реке/яме, центр и три места тотемов свободны от деревьев/камней — иначе тотем не достать мили-героем.
   * Не нашли за 24 попытки — берём последнюю, вытолкнув из препятствий.
   */
  private placeCamp(seed: string): Camp {
    const C = ARCADE.camp;
    const rng = new Rng(`camp:${seed}:${this.act}`);
    const W = ARCADE.world, cx0 = W.w / 2, cy0 = W.h / 2;
    let x = cx0 + C.distMin, y = cy0;
    for (let i = 0; i < 24; i++) {
      const a = rng.float() * Math.PI * 2, d = C.distMin + rng.float() * (C.distMax - C.distMin);
      x = clamp(cx0 + Math.cos(a) * d, C.radius + 60, W.w - C.radius - 60);
      y = clamp(cy0 + Math.sin(a) * d, C.radius + 60, W.h - C.radius - 60);
      if (this.pit && (Math.abs(y - ARCADE.river.y) < ARCADE.river.halfWidth + C.radius || len(x - ARCADE.pit.x, y - ARCADE.pit.y) < ARCADE.pit.leash + C.radius)) continue;
      if (this.obstacles.blocked(x, y, 40)) continue;
      let free = true;
      for (let t = 0; t < C.totems; t++) { const [tx, ty] = this.totemPoint(x, y, t); if (this.obstacles.blocked(tx, ty, 30)) { free = false; break; } }
      if (free) break;
    }
    [x, y] = this.obstacles.resolve(x, y, 40);
    const camp: Camp = { x, y, totems: C.totems, destroyed: 0, cleared: false, engaged: false, nextGuardAt: 0, line: null, nextLineAt: 0, lineHitAt: 0 };
    for (let t = 0; t < C.totems; t++) { const [tx, ty] = this.obstacles.resolve(...this.totemPoint(x, y, t), 24); this.spawnEnemy(ENEMY_KINDS.corruption_totem, tx, ty); }
    this.defiler = this.spawnEnemy(ENEMY_KINDS.satyr_defiler, x, y);
    return camp;
  }

  private totemPoint(cx: number, cy: number, i: number): [number, number] {
    const a = -Math.PI / 2 + (i / ARCADE.camp.totems) * Math.PI * 2;
    return [cx + Math.cos(a) * ARCADE.camp.totemRing, cy + Math.sin(a) * ARCADE.camp.totemRing];
  }

  /** Живые тотемы лагеря (для HUD/рендера). */
  totemsAlive(): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive && e.kind.id === "corruption_totem") n++;
    return n;
  }

  /** Лагерь разбужен героем: охрана прибывает, Сатир гонит, HUD показывает счёт тотемов. Обновляется в spawnTick и при ударе по лагерю. */
  playerAtCamp(): boolean {
    return !!this.camp && !this.camp.cleared && this.camp.engaged;
  }

  /** Гистерезис агро: будим во внутреннем кольце, отпускаем за внешним (как нейтральный лагерь Dota). */
  private updateCampEngage(): void { this.updateEngage(this.camp, this.camp?.cleared === false, ARCADE.camp.wakeRadius, ARCADE.camp.engageRadius); }

  /** Гистерезис «место разбужено»: вход ближе `wake`, выход дальше `leash`; пока чемпион мёртв (или лагерь очищен) — не трогаем. */
  private updateEngage(place: { x: number; y: number; engaged: boolean } | null, active: boolean, wake: number, leash: number): void {
    if (!place || !active) return;
    const d = len(this.player.x - place.x, this.player.y - place.y);
    if (!place.engaged && d <= wake) place.engaged = true;
    else if (place.engaged && d > leash) place.engaged = false;
  }

  /** Чемпион идёт домой (`home` — уже посчитанная дистанция до дома) и раз в секунду лечится долей максимума. */
  private returnHome(e: Enemy, hx: number, hy: number, home: number, regenPerSec: number, regen = true): void {
    if (home > 8) { e.x += (hx - e.x) / home * e.kind.speed * DT; e.y += (hy - e.y) / home * e.kind.speed * DT; }
    if (regen && this.tick % 60 === 0) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * regenPerSec);
  }

  /** Контактный урон чемпиона: вплотную к герою, раз в `boss.contactEvery`. */
  private contactDamage(e: Enemy, d: number): void {
    if (d < e.kind.r + ARCADE.player.r + 2 && e.contactCd === 0) { e.contactCd = sec(ARCADE.boss.contactEvery); this.damagePlayer(e.dmg, 0, e.kind); }
  }

  // ---------- прилив (T13.61) ----------

  /** Фаза прилива по часам акта (чистая функция — состояние не нужно). Вне River всегда отлив. */
  tidePhase(): { phase: "low" | "warn" | "high"; left: number } {
    const T = ARCADE.tide;
    if (!this.pit || this.actTick < T.firstAt) return { phase: "low", left: this.pit ? T.firstAt - this.actTick : 0 };
    const low = sec(T.lowSec), warn = sec(T.warnSec), high = sec(T.highSec), period = low + warn + high;
    // Цикл начинается с подъёма: первый прилив тоже телеграфирован.
    const t = (this.actTick - T.firstAt) % period;
    if (t < warn) return { phase: "warn", left: warn - t };
    if (t < warn + high) return { phase: "high", left: warn + high - t };
    return { phase: "low", left: period - t };
  }

  /** Текущая полуширина русла: в прилив шире. */
  riverHalfWidth(): number {
    return ARCADE.river.halfWidth * (this.tidePhase().phase === "high" ? ARCADE.tide.halfWidthMult : 1);
  }

  /** Точка в течении: в прилив, в воде, не на полосе брода и не в яме. */
  inCurrent(x: number, y: number): boolean {
    if (!this.pit || this.tidePhase().phase !== "high") return false;
    if (Math.abs(y - ARCADE.river.y) >= this.riverHalfWidth()) return false;
    if (this.ford && Math.abs(x - this.ford.x) < ARCADE.tide.safeHalfW) return false;
    return len(x - ARCADE.pit.x, y - ARCADE.pit.y) > ARCADE.pit.radius;
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

  /** Часы акта: расписание (Рошан, волны, лавка, финал), сложность и цены идут по ним; в разломе они стоят (T13.58). */
  get actTick(): number {
    return this.tick - this.pausedTicks;
  }

  get seconds(): number {
    return this.actTick / TICK_HZ;
  }

  get minutes(): number {
    return this.actTick / TICK_HZ / 60;
  }

  aliveEnemies(): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive) n++;
    return n;
  }

  /** Один тик. Пока висит выбор уровня или забег окончен — мир стоит. */
  step(input: ArcadeInput): void {
    if (this.over) return;
    this.dmgSource = "other";
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
    if (this.pondOpen) {
      this.pondAction(input.act);
      return;
    }
    if (this.contractOpen) {
      this.contractAction(input.act);
      return;
    }
    if (this.forgeOpen) {
      this.forgeAction(input.act);
      return;
    }
    if (this.riftOpen) {
      this.riftAction(input.act);
      return;
    }
    if (this.buildOpen) {
      this.buildAction(input.act);
      return;
    }
    if (input.act === BUILD_ACT) {
      this.buildOpen = true;
      return;
    }
    const p = this.player;
    if (input.act === PICKUP_ACT) this.pickupNear();
    if (input.act >= AUTOCAST_ACT && input.act < AUTOCAST_ACT + ABILITY_KEYS.length) {
      const key = ABILITY_KEYS[input.act - AUTOCAST_ACT];
      p.autoCast[key] = !p.autoCast[key];
    } else if (input.act === AUTOATTACK_ACT) {
      p.autoAttack = !p.autoAttack;
    }
    this.tick++;
    this.shake = Math.max(0, this.shake - 1);
    this.tickCooldowns();
    this.prevPx = p.x; this.prevPy = p.y;
    this.movePlayer(input);
    // В разломе (T13.58) мир снаружи стоит вместе с часами акта: спавн ведёт сам разлом.
    if (this.rift?.state === "active") { this.pausedTicks++; this.tickRift(); } else { this.spawnTick(); this.tickCaravan(); }
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
    this.tickOutpost();
    this.pruneFx();
    if (p.hp <= 0) this.onLethal();
    const A = ARCADE.acts[this.act];
    if (A.endAt > 0 && this.actTick >= A.endAt && this.roshanKilled && !this.over) this.finish("victory");
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
    if (this.inCurrent(p.x, p.y)) speed *= 1 - ARCADE.tide.slow; // прилив: медленнее, но управление своё
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

  /** Io Tether: ближайший свой юнит в радиусе умения (индекс в `pets`), −1 — некого связывать. */
  tetherTarget(ab: AbilityDef): number {
    const p = this.player;
    let best = -1, bd = ab.radius ?? 420;
    this.pets.forEach((pet, i) => { const d = len(pet.x - p.x, pet.y - p.y); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  /** Io Spirits: позиции шаров на орбите (медленный оборот — `ARCADE.io.orbitSec` на круг). */
  spiritOrbs(): [number, number][] {
    const p = this.player;
    const key = this.slot.spirits;
    if (!key || this.tick >= p.spiritsUntil) return [];
    const ab = this.hero.abilities[key];
    const n = ab.count?.[p.abilities[key]] ?? 5, r = ab.radius ?? 130;
    const base = (this.tick / TICK_HZ / ARCADE.io.orbitSec) * Math.PI * 2;
    const out: [number, number][] = [];
    for (let i = 0; i < n; i++) { const a = base + (i / n) * Math.PI * 2; out.push([p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.8]); }
    return out;
  }

  /** Форма активна? В ней могут отличаться тип атаки и дальность (Metamorphosis, Elder Dragon Form, True Form). */
  formNow(): FormDef | null {
    if (this.tick >= this.player.formUntil) return null;
    for (const key of ABILITY_KEYS) {
      const ab = this.hero.abilities[key];
      if (ab.form) return ab.form; // metamorphosis и «форма поверх бафа» (Chemical Rage: мечи наголо, тип атаки тот же)
    }
    return null;
  }

  /** Тип атаки с учётом формы. */
  rangedNow(): boolean {
    return this.formNow()?.ranged ?? this.hero.ranged;
  }

  /** Дальность автоатаки с учётом формы: форма задаёт свою, а предметы и апгрейды по-прежнему прибавляют. */
  attackRange(): number {
    const form = this.formNow();
    const base = this.hero.base.range ?? ARCADE.player.range;
    return form ? Math.max(60, this.player.stats.range + (form.range - base)) : this.player.stats.range;
  }

  private playerCombat(input: ArcadeInput): void {
    const p = this.player;
    const stunned = this.tick < p.stunUntil;
    // --- автоатака: мили — удар + клив, дальний бой — снаряд ---
    const wantsAttack = p.autoAttack || (input.cast & ATTACK_MASK) !== 0;
    if (wantsAttack && !stunned && p.attackCd === 0 && this.tick >= p.spinUntil && p.burstLeft === 0 && this.tick >= p.fieldUntil) {
      const target = this.focusTotem() ?? this.nearestEnemy(p.x, p.y, this.attackRange());
      if (target) {
        // Спрайт разворачивается к цели на время удара, ноги продолжают бежать куда жмут (см. renderer).
        { const ax = target.x - p.x, ay = target.y - p.y, al = len(ax, ay) || 1; p.aimX = ax / al; p.aimY = ay / al; p.aimUntil = this.tick + sec(0.45); }
        {
          let k = 1;
          if (this.hero.signature?.kind === "fiery_soul" && this.tick < p.sigUntil) k *= 1 - Math.min(0.6, this.hero.signature.value * this.sigScale());
          if (this.tick < p.frenzyUntil) k *= 1 - p.frenzyMult;
          p.attackCd = sec(p.stats.attackInterval * Math.max(0.25, k));
          p.attackCdMax = p.attackCd; // Alchemist в ярости (владелец 2026-09-12): рендер считал прогресс удара от базового интервала и застывал на последнем кадре
        }
        if (this.rangedNow()) {
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
    // --- способности: ручной каст или авто-каст по виду (в разломе «Безмолвие» их нет, T13.58) ---
    if (!stunned && !this.riftSilenced()) {
      const masks: Record<AbilityKey, number> = { q: 1, w: 2, e: 4, r: 8 };
      for (const key of ABILITY_KEYS) {
        const ab = this.hero.abilities[key];
        if (ab.passive || p.abilities[key] === 0 || p.cooldowns[key] > 0) continue;
        if ((input.cast & masks[key]) !== 0 || (p.autoCast[key] && this.wantsCast(ab))) this.castAbility(key, ab);
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
      case "tether": return hpPct < 0.7 && this.tetherTarget(ab) >= 0;
      case "spirits": return near >= 2 || bossNear;
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
      case "armor_buff": case "frenzy": case "haste": case "rage": case "death_pact": case "damage_ward": case "metamorphosis":
        return near >= A.aoeEnemies || bossNear || (hpPct < 0.5 && near >= 1);
      case "mass_freeze": case "requiem": case "ravage":
        return near >= A.ultEnemies || bossNear || (hpPct < A.ultHpPct && near >= 3);
      case "life_drain": return bossNear || this.eliteWithin(p.x, p.y, radius) !== null || (hpPct < 0.6 && near >= 2);
      default: return false;
    }
  }

  private castAbility(key: AbilityKey, ab: AbilityDef): void {
    this.dmgSource = key;
    const p = this.player;
    const lvl = p.abilities[key];
    const ult = this.talentPower("t25_ult") ? 1.5 : 1;
    const value = ab.value[lvl] * (key === "r" ? ult : 1);
    const radius = ab.radius ?? 150;
    let cast = true;
    switch (ab.kind) {
      case "tether": {
        // Только когда рядом свой юнит (иллюзия, призыв, питомец): без него каст не проходит и перезарядка не тратится.
        const idx = this.tetherTarget(ab);
        if (idx < 0) { cast = false; break; }
        p.tetherPet = idx; p.tetherUntil = this.tick + sec(ab.duration ?? 8);
        p.hasteUntil = Math.max(p.hasteUntil, p.tetherUntil);
        this.pushFx("levelup", p.x, p.y, 0, 0, 12);
        break;
      }
      case "spirits":
        p.spiritsUntil = this.tick + sec(ab.duration ?? 12);
        break;
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
        for (const e of this.enemiesWithin(center.x, center.y, radius)) { this.damageEnemy(e, value, "burst"); this.applyChill(e, 0.5, ab.duration ?? 3); if (ab.poison) this.applyPoison(e, value * ab.poison); }
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
            if (ab.poison) this.applyPoison(e, value * ab.poison);
          }
          this.pushFx("nova", cx, cy, radius, 0, 12);
        }
        break;
      }
      case "armor_buff":
        p.armorBuffUntil = this.tick + sec(ab.duration ?? 5);
        this.pushFx("heal", p.x, p.y - 30, 0, 0, 14);
        break;
      case "metamorphosis":
        // Смена формы: модель, тип атаки и дальность меняются на время действия (renderer читает formUntil).
        p.formUntil = this.tick + sec(ab.duration ?? 10);
        p.rageUntil = p.formUntil; p.rageMult = value;
        this.pushFx("levelup", p.x, p.y, 0, 0, 24);
        this.shake = 12;
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
        // Alchemist (владелец 2026-09-12): в Chemical Rage он достаёт мечи — лист `<hero>@meta` на время бафа, бой не меняется.
        if (ab.form) p.formUntil = p.frenzyUntil;
        break;
      case "haste":
        p.hasteUntil = this.tick + sec(ab.duration ?? 5);
        p.evadeUntil = p.hasteUntil; p.evadeChance = value;
        break;
      case "damage_ward":
        if (ab.summon?.art === "illusion") {
          // Иллюзии — не тотем на полу, а копии героя, которые бегут за ним и бьют вокруг (владелец
          // 2026-09-07: Terrorblade, Naga, Phantom Lancer, Chaos Knight); урон удара — значение умения.
          this.spawnIllusions(ab.summon.count ?? 1, ab.duration ?? 10, value);
          break;
        }
        if (ab.summon && SUMMONS[ab.summon.art]) {
          // Призыв существа — тоже сущность сима, а не картинка над зоной урона (владелец 2026-09-08:
          // «паучки бруды стоят на месте и жгут круг; любой суммон бегает за хозяином и бьёт»).
          this.spawnSummons(ab, value);
          break;
        }
        // Умения без модели призыва (Macropyre, Chakram) остаются зоной урона в точке каста.
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
        // `value` у mass_freeze — урон в момент каста, и он не обязателен: Chronosphere, Global Silence,
        // Stone Gaze и Song of the Siren стоят с нулём и остаются чистым контролем. Ненулевой урон
        // нужен ультам, которые в Dota бьют (Winter's Curse) — раньше число в таблице просто молчало.
        for (const e of this.enemiesWithin(p.x, p.y, radius)) {
          if (!e.kind.unstoppable) e.freezeUntil = Math.max(e.freezeUntil, this.tick + sec(this.statusSec(e.kind.boss ? 1.5 : ab.duration ?? 3.5)));
          if (value > 0) this.damageEnemy(e, value, "burst");
        }
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
        if (ab.poison) this.applyPoison(target, value * ab.poison);
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
    else p.cooldowns[key] = sec(ab.cooldown * (1 - p.stats.cooldown) * (key === "r" && this.upgradePower("leg_refresher") > 0 ? 0.5 : 1) * (this.tick < p.arcaneUntil ? 1 - ARCADE.rune.arcane.cooldown : 1));
    // Multicast (Ogre Magi): с шансом умение срабатывает ещё раз на следующем тике (перезарядка сбрасывается до 1 тика).
    if (sig?.kind === "multicast" && key !== "r" && ab.cooldown > 0 && this.rng.float() < Math.min(0.6, sig.value * this.sigScale())) { p.cooldowns[key] = 1; this.pushFx("levelup", p.x, p.y, 0, 0, 12); }
    if (key === "q" || key === "r") this.thunderclap();
    this.staticField();
  }

  /** Тик активных эффектов: вихрь, тотем, серии ударов (Omnislash/Freezing Field), зона Shrapnel. */
  private tickActiveAbilities(): void {
    const p = this.player;
    const H = this.hero.abilities;
    // Слот ищем по виду умения, а не по букве: Rolling Thunder у Pangolier и Raptor Dance у Kez —
    // это `spin` в R, Hand of God у Chen и Cold Embrace у Winter Wyvern — `ward` в R и E. Каст ставил
    // spinUntil/wardUntil, а тик проверял H.q/H.w и молчал: одиннадцать умений не делали ничего.
    const spinKey = this.slot.spin;
    if (spinKey && this.tick < p.spinUntil && this.tick % 6 === 0) {
      this.dmgSource = spinKey;
      const sp = H[spinKey];
      const dps = sp.value[p.abilities[spinKey]];
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (len(e.x - p.x, e.y - p.y) <= (sp.radius ?? 104) + e.kind.r) this.damageEnemy(e, dps * 0.1, "spin");
      }
    }
    // Io: духи по орбите бьют тех, в кого врезались (контакт, шаг проверки 6 тиков), автоатака не блокируется.
    const spKey = this.slot.spirits;
    if (spKey && this.tick < p.spiritsUntil && this.tick % 6 === 0) {
      this.dmgSource = spKey;
      const ab = H[spKey], dps = ab.value[p.abilities[spKey]];
      for (const [ox, oy] of this.spiritOrbs()) for (const e of this.enemies) {
        if (!e.alive || this.isDormant(e)) continue;
        if (len(e.x - ox, e.y - oy) <= ARCADE.io.orbR + e.kind.r) this.damageEnemy(e, dps * 0.1, "burst");
      }
    }
    // Io: связь с юнитом — лечение, пока он в радиусе; юнит пропал или ушёл — связь рвётся.
    const teKey = this.slot.tether;
    if (teKey && this.tick < p.tetherUntil) {
      const pet = this.pets[p.tetherPet];
      const ab = H[teKey];
      if (!pet || len(pet.x - p.x, pet.y - p.y) > (ab.radius ?? 420)) { p.tetherUntil = this.tick; p.tetherPet = -1; }
      else if (this.tick % 30 === 0) this.heal(ab.value[p.abilities[teKey]] * 0.5);
    }
    const healKey = this.slot.ward;
    if (healKey && this.tick < p.wardUntil) {
      const hw = H[healKey];
      const d = len(p.x - p.wardX, p.y - p.wardY);
      if (d > 40) { p.wardX += (p.x - p.wardX) / d * 120 * DT; p.wardY += (p.y - p.wardY) / d * 120 * DT; }
      // `value` у лечащего тотема живёт в двух единицах, и обе осмысленны: доля максимума HP
      // (Healing Ward у Juggernaut 0.028–0.046, Nature's Attendants, Hand of God) и плоское
      // число HP (Purification, Shadow Wave, Cold Embrace — 10–32). Раньше формула умножала
      // на максимум всегда: плоская тридцатка лечила тридцать максимумов за тик, и герой с
      // таким умением не умирал вовсе (Witch Doctor, Warlock, Undying — у них `ward` в W и
      // это работало и до правки слотов).
      const v = hw.value[p.abilities[healKey]];
      if (this.tick % 30 === 0 && len(p.x - p.wardX, p.y - p.wardY) <= (hw.radius ?? 170)) this.heal(v < 1 ? p.stats.maxHp * v * 0.5 : v);
    }
    if (p.burstLeft > 0 && this.tick >= p.burstNextAt) {
      const ult = this.talentPower("t25_ult") ? 1.5 : 1;
      const omniKey = this.slot.omni;
      const fieldKey = this.slot.freezing_field;
      this.dmgSource = omniKey ?? fieldKey ?? "other";
      if (omniKey) {
        const ob = H[omniKey];
        const candidates = this.enemiesWithin(p.x, p.y, ob.radius ?? 230);
        if (candidates.length === 0) p.burstLeft = 0;
        else {
          const target = candidates[this.rng.int(candidates.length)];
          this.damageEnemy(target, ob.value[p.abilities[omniKey]] * ult, "slash");
          this.pushFx("slash", p.x, p.y, target.x, target.y, 12);
          p.burstLeft--;
          p.burstNextAt = this.tick + Math.max(3, Math.floor(sec(ob.duration ?? 1.5) / (ob.count?.[p.abilities[omniKey]] ?? 5)));
        }
      } else if (fieldKey) {
        const fb = H[fieldKey];
        const radius = fb.radius ?? 270;
        const ex = p.x + (this.rng.float() * 2 - 1) * radius, ey = p.y + (this.rng.float() * 2 - 1) * radius;
        for (const e of this.enemiesWithin(ex, ey, 80)) this.damageEnemy(e, fb.value[p.abilities[fieldKey]] * ult, "burst");
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
    // Зона урона без модели призыва (Macropyre, Chakram): бьёт ближайшего врага в радиусе. Умения с
    // моделью призыва сюда не попадают — у них урон наносят сами призывы (tickPets).
    const dwKey = ABILITY_KEYS.find((k) => H[k].kind === "damage_ward" && !H[k].summon);
    if (dwKey && this.tick < p.wardUntil && this.tick % 15 === 0) {
      this.dmgSource = dwKey;
      const t = this.nearestEnemy(p.wardX, p.wardY, H[dwKey].radius ?? 200);
      if (t) { this.damageEnemy(t, H[dwKey].value[p.abilities[dwKey]], "zap"); this.pushFx("zap", p.wardX, p.wardY - 30, t.x, t.y, 6); }
    }
    // Static Remnant (Storm): мина взрывается, когда враг подошёл. Слот — любой (Doom: Scorched Earth в W).
    const remKey = this.slot.remnant;
    if (remKey && this.tick < p.zoneUntil) {
      this.dmgSource = remKey;
      const r = H[remKey].radius ?? 130;
      if (this.countEnemiesWithin(p.zoneX, p.zoneY, r * 0.55) > 0) {
        for (const e of this.enemiesWithin(p.zoneX, p.zoneY, r)) this.damageEnemy(e, H[remKey].value[p.abilities[remKey]], "zap");
        this.pushFx("nova", p.zoneX, p.zoneY, r, 0, 12);
        p.zoneUntil = 0;
      }
    }
    // Diabolic Edict (Leshrac) / Eye of the Storm (Razor R) / Haunt (Spectre R): случайные разряды по врагам вокруг героя.
    // Раньше проверялся только слот W — ульт Razor молчал (2026-09-06).
    const edKey = this.slot.edict;
    if (edKey && this.tick < p.zoneUntil && this.tick % 8 === 0) {
      this.dmgSource = edKey;
      const around = this.enemiesWithin(p.x, p.y, H[edKey].radius ?? 260);
      if (around.length > 0) { const e = around[this.rng.int(around.length)]; this.damageEnemy(e, H[edKey].value[p.abilities[edKey]], "burst"); this.pushFx("burst", e.x, e.y, 24, 0, 8); }
    }
    // Life Drain / Mana Drain: канал по цели с лечением.
    if (this.tick < p.drainUntil && this.tick % 6 === 0) {
      const key = this.slot.life_drain;
      if (key) this.dmgSource = key;
      const t = key ? this.enemies.find((e) => e.alive && e.id === p.drainTarget) : undefined;
      if (!key || !t || len(t.x - p.x, t.y - p.y) > (H[key].radius ?? 300) + 120) p.drainUntil = 0;
      else {
        const dmg = H[key].value[p.abilities[key]] * 0.1 * (key === "r" && this.talentPower("t25_ult") ? 1.5 : 1);
        this.damageEnemy(t, dmg, "burst");
        this.heal(dmg);
        if (this.tick % 12 === 0) this.pushFx("zap", t.x, t.y, p.x, p.y, 6);
      }
    }
    const shrapKey = this.slot.shrapnel;
    if (shrapKey && this.tick < p.zoneUntil && this.tick % 12 === 0) {
      this.dmgSource = shrapKey;
      const sb = H[shrapKey];
      const radius = sb.radius ?? 180;
      for (const e of this.enemiesWithin(p.zoneX, p.zoneY, radius)) { this.damageEnemy(e, sb.value[p.abilities[shrapKey]] * 0.2, "burst"); this.applyChill(e, 0.3, 0.4, false); }
    }
  }

  /** Zeus Static Field: любой каст снимает долю текущего HP всем вокруг (у босса — ограниченно). */
  private staticField(): void {
    const key = this.slot.static_field;
    if (!key) return;
    this.dmgSource = key;
    const ab = this.hero.abilities[key];
    const lvl = this.player.abilities[key];
    if (lvl === 0) return;
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
    this.dmgSource = "school";
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
    this.dmgSource = "attack";
    const p = this.player;
    let dmg = p.stats.damage * scale * (this.tick < p.ddUntil ? ARCADE.rune.dd.mult : 1) * this.riftAttackMult();
    let kind: FxKind = "hit";
    if (this.rng.float() < p.stats.critChance) { dmg *= p.stats.critMult; kind = "crit"; }
    this.events.hits++;
    const headKey = this.slot.headshot;
    if (headKey && p.abilities[headKey] > 0 && this.rng.float() < 0.3) { dmg += this.hero.abilities[headKey].value[p.abilities[headKey]]; e.stunUntil = Math.max(e.stunUntil, this.tick + sec(0.25)); kind = "crit"; }
    // Фирменные пассивки (T13.15): души SF, ярость Ursa, меткость Drow, Time Lock Void — до удара; Cleave и Overload — после.
    const sig = this.hero.signature;
    const sc = this.sigScale();
    if (sig?.kind === "souls") dmg += p.stacks * sig.value * sc;
    else if (sig?.kind === "swipes") {
      if (p.stackTarget === e.id) p.stacks = Math.min(sig.cap ?? 12, p.stacks + 1); else { p.stacks = 1; p.stackTarget = e.id; }
      dmg += p.stacks * sig.value * sc;
    } else if (sig?.kind === "marksmanship") {
      // Пассивная прибавка за дистанцию, не крит: не красим в крит, иначе Drow «критует» каждым выстрелом (владелец 2026-09-12).
      if (len(e.x - p.x, e.y - p.y) >= (sig.radius ?? 220)) dmg *= 1 + sig.value * sc;
    } else if (sig?.kind === "timelock" && this.rng.float() < Math.min(0.5, sig.value * sc)) {
      dmg += 20 * sc; e.stunUntil = Math.max(e.stunUntil, this.tick + sec(sig.duration ?? 0.5)); kind = "crit";
    } else if (sig?.kind === "crit" && this.rng.float() < Math.min(0.6, sig.value * sc)) {
      dmg *= sig.cap ?? 2; kind = "crit"; // Blade Dance: шанс на усиленный удар
    }
    // Пассивки собственных китов на удар: Searing Arrows, Mana Break, Frost Arrows; ярость (God's Strength/Enrage/Warpath/Death Pact).
    for (const key of ABILITY_KEYS) {
      const ab = this.hero.abilities[key];
      const lvl = p.abilities[key];
      if (!ab.passive || lvl === 0) continue;
      if (ab.kind === "searing") { dmg += ab.value[lvl]; this.applyBurn(e, ab.value[lvl] * 0.5, 2); }
      else if (ab.kind === "venom") { dmg += ab.value[lvl]; this.applyPoison(e, ab.value[lvl] * 0.5); } // один стак = прежнее горение Poison Attack, дальше — сильнее
      else if (ab.kind === "mana_break") { dmg += ab.value[lvl]; this.applyChill(e, 0.25, 0.6, false); }
      else if (ab.kind === "frost_arrows") this.applyChill(e, ab.value[lvl], 2, false);
    }
    if (this.tick < p.rageUntil) dmg *= 1 + p.rageMult;
    // Счётчик критов считаем здесь, а не сразу после шанса из статов: усиленным ударом делают и
    // фирменные пассивки (Blade Dance, Меткость, Time Lock), а раньше они в счётчик не попадали.
    if (kind === "crit") this.events.crits++;
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
    const sting = this.upgradePower("ven_sting");
    if (sting > 0) this.applyPoison(e, 4 * sting);
    const chain = this.upgradePower("mae_chain");
    if (chain > 0 && this.rng.float() < 0.25 + 0.08 * chain) this.chainLightning(e, 20 * chain * this.lightningMult(), 3 + Math.floor(this.upgradePower("mae_mjollnir") * 2) + (this.upgradePower("leg_mae_thunder") > 0 ? 4 : 0) + Math.floor(this.upgradePower("hyb_superconductor") * 2));
  }

  private chainLightning(from: Enemy, dmg: number, targets: number): void {
    this.dmgSource = "school";
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
    this.dmgSource = "school";
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
    // Venom cloud — облако яда на ближайшей группе: стак всем внутри (T13.47).
    const cloud = this.upgradePower("ven_cloud");
    if (cloud > 0 && this.tick >= p.cloudAt) {
      p.cloudAt = this.tick + Math.floor(sec(2.4) / (1 + 0.1 * cloud));
      const center = this.nearestEnemy(p.x, p.y, 300);
      if (center) {
        for (const e of this.enemiesWithin(center.x, center.y, 90)) this.applyPoison(e, 5 * cloud);
        this.pushFx("nova", center.x, center.y, 90, 0, 14);
      }
    }
    // Venom fangs — стак ближайшему по таймеру: запасной источник для медленных героев.
    const fangs = this.upgradePower("ven_fangs");
    if (fangs > 0 && this.tick >= p.fangsAt) {
      p.fangsAt = this.tick + sec(1.5);
      const target = this.nearestEnemy(p.x, p.y, 260);
      if (target) { this.applyPoison(target, 4 * fangs); this.pushFx("zap", p.x, p.y, target.x, target.y, 6); }
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
    // Яд + холод (T13.47): охлаждение продлевает жизнь стаков.
    const frost = this.upgradePower("hyb_venom_frost");
    if (frost > 0 && this.tick < e.poisonUntil) e.poisonUntil += sec(0.6 * frost);
    e.chillSlow = Math.max(e.chillUntil > this.tick ? e.chillSlow : 0, slow);
    e.chillUntil = Math.max(e.chillUntil, this.tick + sec(this.statusSec(seconds)));
    if (!stack) return;
    const snap = this.upgradePower("ska_snap");
    if (snap > 0) {
      e.chillStacks++;
      if (e.chillStacks >= 3) { e.chillStacks = 0; e.freezeUntil = Math.max(e.freezeUntil, this.tick + sec(this.statusSec(0.8 + 0.3 * snap))); }
    }
  }

  /**
   * Яд (T13.39): отдельный статус, не горение. Стак добавляется до потолка, таймер общий и обновляется каждым
   * попаданием; dps стака — сильнейший из активных источников. Истёкший яд теряет все стаки.
   */
  applyPoison(e: Enemy, dpsPerStack: number, seconds = ARCADE.poison.seconds): void {
    this.dmgSource = "dot";
    if (e.kind.unstoppable || dpsPerStack <= 0 || !e.alive) return;
    const active = e.poisonUntil > this.tick;
    // Полный стек и ещё один стак (T13.47): Дистилляция тратит стаки на взрыв; яд+огонь — ограниченный взрыв.
    if (active && e.poisonStacks >= ARCADE.poison.maxStacks) {
      const fire = this.upgradePower("hyb_venom_fire");
      if (fire > 0 && this.tick < e.burnUntil) { this.damageEnemy(e, 30 * fire, "burst"); for (const o of this.enemiesWithin(e.x, e.y, 60)) if (o !== e) this.damageEnemy(o, 15 * fire, "burst"); this.pushFx("burst", e.x, e.y, 60, 0, 12); }
      if (this.upgradePower("leg_ven_distill") > 0) {
        const dmg = e.poisonDps * e.poisonStacks * this.venomMult() * 6;
        e.poisonStacks = 0; e.poisonUntil = 0; e.poisonDps = 0;
        this.damageEnemy(e, dmg, "burst");
        for (const o of this.enemiesWithin(e.x, e.y, 70)) if (o !== e && o.alive) this.damageEnemy(o, dmg * 0.5, "burst");
        this.pushFx("nova", e.x, e.y, 70, 0, 14);
        return;
      }
      if (!e.alive) return;
    }
    e.poisonStacks = Math.min(ARCADE.poison.maxStacks, (active ? e.poisonStacks : 0) + 1);
    e.poisonDps = Math.max(active ? e.poisonDps : 0, dpsPerStack);
    const extra = 0.5 * this.upgradePower("ven_virulence") + (this.upgradePower("leg_ven_pandemic") > 0 ? 2 : 0);
    e.poisonUntil = Math.max(e.poisonUntil, this.tick + sec(this.statusSec(seconds + extra)));
  }

  /** Множитель урона яда от Вирулентности (как burnMult у огня). */
  private venomMult(): number {
    return 1 + 0.25 * this.upgradePower("ven_virulence");
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
    // Наследие: весь исходящий урон (удары, умения, DoT, питомцы) — ровно один раз, здесь.
    let dmg = amount * this.legacy.damage * this.oathMult(e) * this.ritualMult("bloodhunt");
    // Vampiric Spirit (Wraith King): доля урона автоатак возвращается здоровьем.
    const vamp = this.hero.signature;
    if (fx === "hit" && vamp?.kind === "vampiric") this.heal(amount * vamp.value * this.sigScale());
    // Кровавик (легендарка): лечит с урона умениями — то есть со всего, кроме автоатак и критов.
    if (fx !== "hit" && fx !== "crit" && this.upgradePower("leg_bloodstone") > 0) this.heal(amount * 0.1);
    // Corrosive Haze (Slardar): помеченная цель получает больше от всего.
    if (this.tick < e.ampUntil) dmg *= 1 + e.ampMult;
    // Backstab (Riki): автоатака по оглушённой/замороженной/замедленной цели — «в спину».
    if (fx === "hit" && vamp?.kind === "backstab" && (this.tick < e.stunUntil || this.tick < e.freezeUntil || this.tick < e.chillUntil)) dmg *= 1 + vamp.value * this.sigScale();
    // Presence of the Dark Lord (SF): враги рядом с героем получают больше урона.
    const presKey = this.slot.presence;
    if (presKey && this.player.abilities[presKey] > 0 && len(e.x - this.player.x, e.y - this.player.y) <= (this.hero.abilities[presKey].radius ?? 300)) dmg *= 1 + this.hero.abilities[presKey].value[this.player.abilities[presKey]];
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
    // Осквернитель под щитом тотемов: с тремя живыми берёт четверть урона, без тотемов — весь (T13.41).
    if (e.kind.id === "satyr_defiler" && this.camp) dmg *= Math.max(0, 1 - ARCADE.defiler.shieldPerTotem * this.totemsAlive());
    // Кентавр, оглушённый камнем, берёт больше (T13.45); спящий — не берёт ничего.
    if (e.kind.id === "centaur_warden") { if (this.isDormant(e)) return; if (this.tick < e.stunUntil) dmg *= ARCADE.centaur.stunnedDmgMult; }
    // Некромант и идолы: спящие неуязвимы; без идолов некромант открыт (T13.46).
    if (e.kind.id === "thunder_golem" && this.isDormant(e)) return;
    if (e.kind.id === "river_warden" && (this.isDormant(e) || this.wardenShielded())) return; // щит: не пробивать, ждать окна
    if (e.kind.id === "dire_stalker" && this.isDormant(e)) return;
    if (e.kind.id === "troll_necromancer" || e.kind.id === "bone_idol") { if (this.isDormant(e)) return; if (e.kind.id === "troll_necromancer" && this.idolsAlive() === 0) dmg *= ARCADE.necro.exposedDmgMult; }
    // Удар по тотему или Сатиру будит лагерь даже издалека (дальнобойный герой не остаётся безнаказанным).
    if ((e.kind.totem || e.kind.id === "satyr_defiler") && this.camp && !this.camp.cleared) this.camp.engaged = true;
    this.dealtBySource[this.dmgSource] = (this.dealtBySource[this.dmgSource] ?? 0) + Math.min(dmg, Math.max(0, e.hp));
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
    if (this.rift?.state === "active") this.rift.kills++;
    this.events.kills++;
    this.killsByKind[e.kind.id] = (this.killsByKind[e.kind.id] ?? 0) + 1;
    if (e.kind.id === "standard_bearer") {
      // Знаменосец пал: местная волна слабеет, охрана деморализована и без вожака.
      this.siegeWeakUntil = this.tick + sec(ARCADE.siege.weakSec);
      for (const o of this.enemies) if (o.alive && o.leader === e.id) { o.leader = 0; o.ampUntil = this.tick + sec(ARCADE.siege.escortAmpSec); o.ampMult = Math.max(o.ampMult, ARCADE.siege.escortAmp); }
      this.pushFx("nova", e.x, e.y, 120, 0, 20);
    }
    const sig = this.hero.signature;
    if (sig?.kind === "souls") p.stacks = Math.min(sig.cap ?? 36, p.stacks + (e.kind.elite || e.kind.boss ? 6 : 1));
    if (sig?.kind === "deathpact") p.hp = Math.min(p.stats.maxHp, p.hp + sig.value * this.sigScale() * (e.kind.elite || e.kind.boss ? 5 : 1));
    if (sig?.kind === "growth") {
      // Flesh Heap: убийства наращивают запас здоровья до потолка; прибавка идёт и в текущее hp,
      // иначе герой с полным hp получает только пустую полоску.
      const add = sig.value * this.sigScale() * (e.kind.elite || e.kind.boss ? 5 : 1);
      const room = (sig.cap ?? 400) - p.stacks;
      if (room > 0) { const gain = Math.min(add, room); p.stacks += gain; p.stats.maxHp += gain; p.hp += gain; }
    }
    if (e.kind.elite || e.kind.boss || e.kind.structure) this.events.eliteKills++;
    this.pushFx("die", e.x, e.y, e.kind.r, KIND_INDEX[e.kind.id] ?? 0, e.kind.elite || e.kind.boss ? 22 : 14);
    if (e.kind.id === "bone_idol" && this.barrow) { this.barrow.idolsDown++; this.pushFx("burst", e.x, e.y, 60, 0, 18); }
    else if (e.kind.totem && this.camp && !this.camp.cleared) {
      this.camp.destroyed++;
      this.pushFx("burst", e.x, e.y, 70, 0, 18);
      this.tryClearCamp();
    }
    if (e === this.hunter) { this.hunter = null; if (this.player.curse === "bloodhunt") { this.liftCurse(); this.pushFx("levelup", this.player.x, this.player.y, 0, 0, 24); } }
    if (e === this.necromancer) {
      this.necromancer = null; this.necromancerSlain = true;
      this.shake = Math.max(this.shake, 12);
      this.pushFx("nova", e.x, e.y, 150, 0, 24);
      // Скелеты без хозяина рассыпаются.
      for (const s of this.enemies) if (s.alive && s.kind.id === "skeleton_warrior") { s.alive = false; this.pushFx("die", s.x, s.y, s.kind.r, KIND_INDEX[s.kind.id] ?? 0, 14); }
      this.openBarrowReward();
      this.completeContract("necro", e.x, e.y); // после награды самого чемпиона: карта контракта встаёт в очередь
    }
    if (e === this.stalker) {
      // Награда Охотника: выбор крит/защита — карта типа attack и карта passive/power exotic.
      this.stalker = null; this.stalkerSlain = true;
      if (this.den) { this.den.markUntil = 0; this.den.exposedUntil = 0; }
      this.shake = Math.max(this.shake, 12);
      this.pushFx("nova", e.x, e.y, 150, 0, 24);
      const offers: Offer[] = [];
      const a = this.rollUpgradeOffer([], undefined, "attack"), b = this.rollUpgradeOffer(a && a.kind === "upgrade" ? [a.id] : [], undefined, "passive") ?? this.rollUpgradeOffer(a && a.kind === "upgrade" ? [a.id] : [], undefined, "power");
      for (const o of [a, b]) if (o && o.kind === "upgrade") offers.push({ kind: "upgrade", id: o.id, rarity: "exotic" });
      if (offers.length) this.queueReward(offers);
      this.completeContract("stalker", e.x, e.y);
    }
    if (e === this.warden) {
      // Награда Стража переправы — руническая: DD, щит и магия на runeSec с, плюс амулет exotic.
      this.warden = null; this.wardenSlain = true;
      if (this.ford) this.ford.waves = [];
      this.shake = Math.max(this.shake, 12);
      this.pushFx("nova", e.x, e.y, 150, 0, 24);
      const p = this.player, until = this.tick + sec(ARCADE.warden.runeSec);
      p.ddUntil = Math.max(p.ddUntil, until); p.arcaneUntil = Math.max(p.arcaneUntil, until);
      p.shieldHp = Math.max(p.shieldHp, Math.round(p.stats.maxHp * ARCADE.rune.shield.frac)); p.shieldUntil = Math.max(p.shieldUntil, until);
      this.dropLoot(e.x, e.y + 20, rollGear(this.rng, this.lootTier(), "exotic", this.nextUid(), "amulet"));
      this.completeContract("warden", e.x, e.y);
    }
    if (e === this.thunder) {
      // Награда Гром-голема: «гибрид молнии» — Сверхпроводник/Плазма exotic, если их школы уже в билде, иначе карта Maelstrom exotic.
      this.thunder = null; this.thunderSlain = true;
      if (this.lair) this.lair.zones = [];
      this.shake = Math.max(this.shake, 12);
      this.pushFx("nova", e.x, e.y, 150, 0, 24);
      const hy = ["hyb_superconductor", "hyb_plasma"].filter((id) => { const def = UPGRADE_BY_ID[id]; return def.requiresSchools!.every((sc) => this.player.schools.includes(sc)) && (this.player.upgrades[id]?.rank ?? 0) < (this.player.upgrades[id]?.cap ?? def.maxRank); });
      const offers: Offer[] = [];
      if (hy.length) for (const id of hy) offers.push({ kind: "upgrade", id, rarity: "exotic" });
      else { const up = this.rollUpgradeOffer([], "maelstrom") ?? this.rollUpgradeOffer([]); if (up && up.kind === "upgrade") offers.push({ kind: "upgrade", id: up.id, rarity: "exotic" }); }
      if (offers.length) this.queueReward(offers);
      this.completeContract("thunder", e.x, e.y);
    }
    if (e === this.centaur) {
      // Награда Стража: защитная и мобильная экипировка на выбор — два exotic-предмета у ног (броня и сапоги).
      this.centaur = null; this.centaurSlain = true;
      this.completeContract("centaur", e.x, e.y);
      this.shake = Math.max(this.shake, 12);
      this.pushFx("nova", e.x, e.y, 150, 0, 24);
      this.dropLoot(e.x - 26, e.y + 10, rollGear(this.rng, this.lootTier(), "exotic", this.nextUid(), "armor"));
      this.dropLoot(e.x + 26, e.y + 10, rollGear(this.rng, this.lootTier(), "exotic", this.nextUid(), "boots"));
    }
    if (e === this.defiler) { this.defiler = null; this.shake = Math.max(this.shake, 12); this.pushFx("nova", e.x, e.y, 150, 0, 24); this.tryClearCamp(); }
    // Распространение яда при смерти (T13.47): часть стаков соседям; Пандемия — все стаки всем рядом. Только на смерти,
    // и applyPoison сам никого не убивает → рекурсии нет.
    if (this.tick < e.poisonUntil && e.poisonStacks > 0) {
      const spread = this.upgradePower("ven_spread"), pandemic = this.upgradePower("leg_ven_pandemic") > 0;
      if (spread > 0 || pandemic) {
        const rankSpread = this.player.upgrades["ven_spread"]?.rank ?? 0;
        const stacks = pandemic ? e.poisonStacks : Math.min(e.poisonStacks, 1 + rankSpread);
        const radius = pandemic ? 160 : 90, limit = pandemic ? 99 : 2 + rankSpread;
        const near = this.enemiesWithin(e.x, e.y, radius).filter((o) => o !== e && o.alive).sort((a, b) => len(a.x - e.x, a.y - e.y) - len(b.x - e.x, b.y - e.y)).slice(0, limit);
        for (const o of near) for (let i = 0; i < stacks; i++) this.applyPoison(o, e.poisonDps);
        if (near.length) this.pushFx("nova", e.x, e.y, radius, 0, 10);
      }
    }
    // Горящий враг оставляет после себя дым и угольки (T13.22): пламя не должно обрываться на смерти.
    if (this.tick < e.burnUntil) this.pushFx("ash", e.x, e.y, e.kind.r, 0, 44);
    this.gainGold(e.kind.gold + p.stats.goldPerKill);
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
    else if (e.kind.boss) {
      // Второй и следующие боссы роняют уникальное из партии 2 — иначе Рапира, Манта и Кольцо
      // великана недостижимы: первый босс всегда отдаёт Аегис, а остальные роняли обычный exotic.
      const pool = ["divine_rapier", "manta_of_illusions", "giants_ring"] as const;
      this.dropLoot(e.x, e.y, uniqueGear(pool[this.rng.int(pool.length)], this.nextUid(), this.lootTier()));
    }
    else if (e.kind.id === "tormentor") this.dropLoot(e.x, e.y, uniqueGear("tormentors_shard", this.nextUid(), this.lootTier()));
    else if (e.kind.structure) this.loot.push(uniqueGear("heart_of_the_ancient", this.nextUid(), 3));
    else if (e.kind.elite && e.kind.id !== "centaur_warden" && e.kind.id !== "river_warden") this.dropLoot(e.x, e.y, this.rollLoot(this.rollRarity())); // у Стражей своя награда
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
    if (this.tick < p.invulnUntil || (p.burstLeft > 0 && this.slot.omni !== undefined)) return;
    const byId = by?.id ?? "projectile";
    this.takenByKind[byId] = (this.takenByKind[byId] ?? 0) + amount;
    const sig = this.hero.signature;
    if (sig?.kind === "blur" && this.rng.float() < Math.min(0.5, sig.value * this.sigScale())) return; // уклонение PA
    if (this.tick < p.evadeUntil && this.rng.float() < p.evadeChance) return; // Windrun / Skeleton Walk / Moonlight Shadow
    if (this.upgradePower("leg_bkb") > 0 && this.rng.float() < 0.3) return; // BKB: треть ударов мимо
    if (this.upgradePower("leg_butterfly") > 0 && this.rng.float() < 0.25) return; // Бабочка: четверть ударов мимо
    const armor = p.stats.armor + (this.tick < p.armorBuffUntil ? 25 : 0);
    const reduction = (0.06 * armor) / (1 + 0.06 * armor);
    // Kraken Shell: плоское снижение поверх брони, но удар всегда проходит хотя бы на 1 — иначе
    // мелкие враги перестают быть угрозой совсем и забег превращается в прогулку.
    const flat = sig?.kind === "tough" ? sig.value * this.sigScale() : 0;
    let taken = Math.max(1, amount * this.riftTakenMult() * (1 - reduction) - flat);
    // Руна щита: запас принимает урон первым, пока не кончится он или срок.
    if (this.tick < p.shieldUntil && p.shieldHp > 0) { const ab = Math.min(p.shieldHp, taken); p.shieldHp -= ab; taken -= ab; if (taken <= 0) return; }
    p.hp -= taken;
    this.events.hurt++;
    if (sig?.kind === "quill" && this.tick >= p.sigUntil) {
      // Quill Spray Bristleback: залп иглами в ответ на урон, не чаще раза в 0.8 с (при 0.5 с бот брал 75–87% в разминке).
      p.sigUntil = this.tick + sec(0.8);
      for (const e of this.enemiesWithin(p.x, p.y, sig.radius ?? 130)) this.damageEnemy(e, sig.value * this.sigScale(), "burst");
      this.pushFx("nova", p.x, p.y, sig.radius ?? 130, 0, 8);
    }
    if (this.upgradePower("leg_lotus") > 0 && this.tick >= p.lotusUntil) {
      // Лотос: полученный урон возвращается по всем вокруг. Ограничение по времени — иначе в толпе
      // герой отражает каждый тик и убивает волну, ничего не делая.
      p.lotusUntil = this.tick + sec(0.5);
      for (const e of this.enemiesWithin(p.x, p.y, 150)) this.damageEnemy(e, amount * 0.6, "burst");
      this.pushFx("nova", p.x, p.y, 150, 0, 8);
    }
    const helixKey = this.slot.counter_helix;
    const helix = helixKey ? this.hero.abilities[helixKey] : null;
    if (helix && helixKey && p.abilities[helixKey] > 0 && this.rng.float() < 0.12 + 0.04 * p.abilities[helixKey]) {
      for (const e of this.enemiesWithin(p.x, p.y, helix.radius ?? 130)) this.damageEnemy(e, helix.value[p.abilities[helixKey]], "spin");
      this.pushFx("nova", p.x, p.y, helix.radius ?? 130, 0, 10);
    }
    if (stun > 0 && this.tick >= p.spinUntil && !p.stats.stunImmune) p.stunUntil = Math.max(p.stunUntil, this.tick + sec(stun));
    this.shake = Math.max(this.shake, 4);
  }

  private heal(amount: number): void {
    const p = this.player;
    const before = p.hp;
    if (p.curse === "withering") amount *= ARCADE.curse.withering.healMult;
    amount *= this.ritualMult("withering");
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
    const reincKey = this.slot.reincarnation;
    if (reincKey && p.abilities[reincKey] > 0 && this.tick >= p.reincAt) {
      const r = this.hero.abilities[reincKey];
      p.reincAt = this.tick + sec(r.cooldown);
      this.revive(p.stats.maxHp * r.value[p.abilities[reincKey]]);
      return;
    }
    p.hp = 0;
    this.finish("dead");
  }

  /** Подъём после смертельного урона (Aegis / Reincarnation): HP, неуязвимость, толчок и стан толпы вокруг. */
  private revive(hp: number): void {
    const p = this.player;
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

  private finish(outcome: "dead" | "victory"): void {
    const p = this.player;
    this.over = {
      outcome, tick: this.actTick, level: p.level, kills: p.kills, gold: p.gold, schools: [...p.schools],
      upgrades: Object.keys(p.upgrades), roshanKilled: this.roshanKilled, rank: this.rank.step, greedStacks: this.greedStacks, items: p.items.map((i) => i.id), hero: this.hero.id, act: this.act, neutral: p.neutral, loot: [...this.loot],
      campsCleared: this.camp?.cleared ? 1 : 0,
      outpostCaptured: this.outpost?.captured ?? false,
      cursesTaken: this.cursesTaken, cursed: p.curse !== null,
      centaurSlain: this.centaurSlain, necromancerSlain: this.necromancerSlain, revived: p.aegisUsed,
      contractDone: this.contract?.done ?? false, lastCurse: this.lastCurse, forged: this.forge?.used ?? false, thunderSlain: this.thunderSlain, wardenSlain: this.wardenSlain, stalkerSlain: this.stalkerSlain, killsByKind: { ...this.killsByKind },
      riftDone: this.rift?.won ?? false, riftRule: this.rift?.won ? this.rift.rule : null, caravanDone: this.caravan?.state === "arrived", trait: this.trait?.id ?? null,
      killer: outcome === "dead" ? KIND_BY_INDEX[this.events.hurtBy] ?? null : null, dealtBySource: { ...this.dealtBySource }, takenByKind: { ...this.takenByKind },
      composition: this.composition, oathDone: (this.contract?.done && this.contract.oath) === true,
    };
  }

  private regenAndHazards(): void {
    const p = this.player;
    if (this.tick % 6 === 0 && p.hp < p.stats.maxHp) p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.regen * 0.1 * (p.curse === "withering" ? ARCADE.curse.withering.healMult : 1) * this.ritualMult("withering"));
    if (this.shrine.alive && len(this.shrine.x - p.x, this.shrine.y - p.y) < 34) {
      this.shrine.alive = false;
      this.greedUntil = this.tick + ARCADE.greed.duration;
      this.greedStacks++;
      this.shake = 8;
      this.pushFx("nova", p.x, p.y, 120, 0, 24);
    }
    if (this.bounty.alive && len(this.bounty.x - p.x, this.bounty.y - p.y) < 34) {
      this.bounty.alive = false;
      this.gainGold(this.bounty.value);
      this.pushFx("heal", p.x, p.y - 30, 0, 0, 40, this.bounty.value);
    }
    if (this.rune.alive && len(this.rune.x - p.x, this.rune.y - p.y) < 34) { this.rune.alive = false; this.applyRune(this.runeKind); }
    if (this.shopkeeper.alive && !this.shopOpen && len(this.shopkeeper.x - p.x, this.shopkeeper.y - p.y) < 44) this.openShop();
    if (this.neutralToken.alive && !this.neutralOpen && len(this.neutralToken.x - p.x, this.neutralToken.y - p.y) < 36) this.openNeutral();
    // Добыча не подбирается касанием — только помечается как «рядом» (PICKUP_ACT → pickupNear).
    this.nearLoot = null;
    this.nearPond = !!this.pond && !this.pond.used && len(this.pond.x - p.x, this.pond.y - p.y) < ARCADE.pond.radius;
    this.nearForge = !!this.forge && !this.forge.used && len(this.forge.x - p.x, this.forge.y - p.y) < ARCADE.forge.radius;
    this.nearRift = !!this.rift && this.rift.state === "idle" && len(this.rift.x - p.x, this.rift.y - p.y) < ARCADE.rift.radius;
    if (this.chest.alive && len(this.chest.x - p.x, this.chest.y - p.y) < 44) this.nearLoot = { kind: "chest", item: null };
    else {
      let best: { x: number; y: number; item: GearItem; until: number } | null = null, bd = 34;
      for (const g of this.groundLoot) {
        if (g.until <= 0) continue;
        const d = len(g.x - p.x, g.y - p.y);
        if (d < bd) { bd = d; best = g; }
      }
      if (best) this.nearLoot = { kind: "ground", item: best.item };
    }
    if (this.aegisDrop && len(this.aegisDrop.x - p.x, this.aegisDrop.y - p.y) < 40) {
      p.aegis = true;
      this.aegisDrop = null;
      this.pushFx("levelup", p.x, p.y, 0, 0, 40);
    }
  }

  // ---------- враги ----------

  private spawnTick(): void {
    const A = ARCADE.acts[this.act];
    // Рошан по расписанию акта; пока жив — тишина. Второй — сильнее (респавн).
    if (this.roshanIdx < this.roshanAt.length && this.actTick === this.roshanAt[this.roshanIdx]) {
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
    // Заражённый лагерь (T13.40): пока герой внутри и тотемы стоят, порча зовёт охрану; каждый снесённый тотем
    // злит оставшихся — охраны больше, она крепче и приходит чаще. Ушёл — охрана перестаёт прибывать.
    this.tickContractOffer();
    this.updateCampEngage();
    this.updateGroveEngage();
    this.updateBarrowEngage();
    this.updateLairEngage();
    this.updateFordEngage();
    this.updateDenEngage();
    this.tickBarrowRaise();
    const camp = this.camp;
    // Охрану зовут тотемы: снесены все — остаётся дуэль с Сатиром (2026-09-11: с охраной 5×каждые 4 с после третьего
    // тотема бот убегал из лагеря и Сатир оставался на 100% в 10 забегах из 10 со всеми снесёнными тотемами).
    if (camp && !camp.cleared && this.totemsAlive() > 0 && this.playerAtCamp() && this.tick >= camp.nextGuardAt) {
      const C = ARCADE.camp;
      camp.nextGuardAt = this.tick + Math.round(C.guardEvery / (1 + 0.25 * camp.destroyed));
      const n = C.guardBase + C.guardPerDestroyed * camp.destroyed;
      const heavy = this.act === "dire" || this.act === "river";
      for (let i = 0; i < n; i++) {
        const kind = heavy && i % 2 === 1 ? ENEMY_KINDS.hellbear : ENEMY_KINDS.satyr;
        const a = this.rng.float() * Math.PI * 2, d = C.guardRingMin + this.rng.float() * (C.guardRingMax - C.guardRingMin);
        const [gx, gy] = this.obstacles.resolve(clamp(camp.x + Math.cos(a) * d, 8, ARCADE.world.w - 8), clamp(camp.y + Math.sin(a) * d, 8, ARCADE.world.h - 8), 24);
        const g = this.spawnEnemy(kind, gx, gy);
        const mult = 1 + C.guardHpPerDestroyed * camp.destroyed;
        g.hp *= mult; g.maxHp *= mult;
      }
    }
    this.tickCampLine();
    // Tormentor и Древний — не глушат обычный спавн.
    if (!this.tormentorSpawned && A.tormentorAt > 0 && this.actTick >= A.tormentorAt) {
      this.tormentorSpawned = true;
      this.spawnEnemy(ENEMY_KINDS.tormentor, ...this.ringPoint(ARCADE.spawn.ringMin, ARCADE.spawn.ringMin + 40));
    }
    if (!this.ancient && A.ancientAt > 0 && this.actTick >= A.ancientAt) {
      this.ancient = this.spawnEnemy(ENEMY_KINDS.ancient, ...this.ringPoint(520, 580));
      this.nextMegaAt = this.tick;
      this.shake = 16;
    }
    if (this.ancient?.alive && this.tick >= this.nextMegaAt) {
      this.nextMegaAt = this.tick + ARCADE.ancient.megaEvery;
      const late = A.ancientDeadline > 0 && this.actTick >= A.ancientDeadline ? ARCADE.ancient.lateMult : 1;
      const size = ARCADE.ancient.megaSize * late;
      for (let i = 0; i < size; i++) {
        const m = this.spawnEnemy(ENEMY_KINDS.lane_creep, this.ancient.x + (this.rng.float() - 0.5) * 200, this.ancient.y + (this.rng.float() - 0.5) * 200);
        m.hp *= ARCADE.ancient.megaHpMult; m.maxHp *= ARCADE.ancient.megaHpMult;
      }
      if (late > 1) this.spawnEnemy(ENEMY_KINDS.siege_creep, this.ancient.x, this.ancient.y);
    }
    // Передышка после разлома (T13.58): обычный лес и волны молчат, расписание боссов выше — нет.
    if (this.tick < this.respiteUntil) return;
    const min = this.minutes;
    const greedy = this.tick < this.greedUntil;
    if (this.actProperty() === "siege") this.tickPatrols();
    const rate = this.siegeMult() * (ARCADE.spawn.base + ARCADE.spawn.perMin * Math.min(min, ARCADE.spawn.kneeMin) + ARCADE.spawn.latePerMin * Math.max(0, min - ARCADE.spawn.kneeMin)) * (this.roshanKilled ? ARCADE.postRoshanRate : 1) * this.rank.spawnMult * (greedy ? ARCADE.greed.spawnMult : 1) * (this.ancient?.alive ? ARCADE.ancient.spawnMult : 1);
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
      const size = Math.round((ARCADE.waves.size + Math.floor(min / 2)) * (this.rank.bigWaves ? 1.5 : 1) * this.siegeMult());
      for (let i = 0; i < size; i++) this.spawnEnemy(ENEMY_KINDS.lane_creep, ox + (this.rng.float() - 0.5) * 120, oy + (this.rng.float() - 0.5) * 120);
      if (waveNo % (this.rank.siegeOften ? 3 : ARCADE.waves.siegeEvery) === 0) this.spawnEnemy(ENEMY_KINDS.siege_creep, ox, oy);
    }
    if (this.golemIdx < ARCADE.waves.golemAt.length && this.actTick >= ARCADE.waves.golemAt[this.golemIdx]) {
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
    // Руны: раз в две минуты, вид — по сиду, у реки (акт с рекой) или на кольце вокруг героя.
    if (this.tick >= this.nextRuneAt) {
      this.nextRuneAt += ARCADE.rune.every;
      const [rx, ry] = this.pit ? this.riverPoint() : this.ringPoint(ARCADE.shop.distMin, ARCADE.shop.distMax);
      this.runeKind = RUNE_KINDS[this.rng.int(RUNE_KINDS.length)];
      this.rune = { alive: true, x: rx, y: ry, until: this.tick + ARCADE.rune.lifetime, value: 0 };
    }
    if (this.rune.alive && this.tick >= this.rune.until) this.rune.alive = false;
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
      // Проклятый сундук (T13.43): не первый, с шансом, и только пока пруд не использован — иначе порчу нечем снять.
      const cursed = this.chestNo++ > 0 && !!this.pond && !this.pond.used && !this.player.curse && this.rng.float() < ARCADE.curse.chestChance;
      this.chest = { alive: true, x: cx, y: cy, until: this.tick + ARCADE.loot.chestLifetime, value: cursed ? 1 : 0 };
    }
    if (this.chest.alive && this.tick >= this.chest.until) this.chest.alive = false;
    for (const g of this.groundLoot) if (this.tick >= g.until) g.until = -1;
    if (this.groundLoot.length && this.tick % 60 === 0) this.groundLoot = this.groundLoot.filter((g) => g.until > 0);
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
    resetEnemy(e, kind);
    e.id = this.nextEnemyId++; e.alive = true; e.x = x; e.y = y;
    e.hp = kind.hp * hpMult; e.maxHp = kind.hp * hpMult; e.dmg = kind.dmg * dmgMult;
    return e;
  }

  private rebuildGrid(): void {
    // Ячейки живут между тиками: обнуляем длину занятых, а не пересоздаём массивы (порядок обхода Map нигде не читается).
    for (const key of this.gridUsed) { const cell = this.grid.get(key); if (cell) cell.length = 0; }
    this.gridUsed.length = 0;
    for (const e of this.enemies) {
      if (!e.alive || this.isDormant(e)) continue;
      const key = cellKey(e.x, e.y);
      let cell = this.grid.get(key);
      if (!cell) { cell = []; this.grid.set(key, cell); }
      if (cell.length === 0) this.gridUsed.push(key);
      cell.push(e);
    }
  }

  /** Rupture: урон за пройденный путь (value за 100 px), пока метка жива. */
  private tickRupture(): void {
    this.dmgSource = "dot";
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
    this.dmgSource = "school";
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
    if (sig?.kind === "aura_burn" && this.tick % 30 === 0) {
      // Heartstopper Aura: тик раз в полсекунды по всем в радиусе, без зависимости от ударов.
      for (const e of this.enemiesWithin(p.x, p.y, sig.radius ?? 150)) this.damageEnemy(e, sig.value * this.sigScale(), "burst");
    }
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
      // Яд тикает так же независимо; урон растёт со стаками (T13.39).
      if (this.tick < e.poisonUntil && this.tick % ARCADE.poison.tickEvery === 0) this.damageEnemy(e, e.poisonDps * e.poisonStacks * ARCADE.poison.tickShare * this.venomMult(), "burst");
      if (!e.alive) continue;
      if (e.kind.totem) continue; // тотем стоит, не бьёт и не толкается
      if (e.kind.id === "satyr_defiler") { this.moveDefiler(e, dx, dy, d); continue; }
      if (e.kind.id === "centaur_warden") { this.moveCentaurEntry(e, dx, dy, d); continue; }
      if (e.kind.id === "troll_necromancer") { this.moveNecromancer(e, dx, dy, d); continue; }
      if (e.kind.id === "thunder_golem") { this.moveThunder(e, dx, dy, d); continue; }
      if (e.kind.id === "river_warden") { this.moveWarden(e, dx, dy, d); continue; }
      if (e.kind.id === "dire_stalker") { this.moveStalker(e, dx, dy, d); continue; }
      if (e.kind.id === "standard_bearer") { this.moveBearer(e, d, frozen); continue; }
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
      let speed = e.kind.speed * this.rank.speedMult * (ARCADE.acts[this.act].speedMult ?? 1) * this.riftSpeedMult();
      if (this.tick < e.chillUntil) speed *= 1 - e.chillSlow;
      if (!e.kind.unstoppable && !e.kind.boss && this.inCurrent(e.x, e.y)) speed *= 1 - ARCADE.tide.slow;
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
      // Охрана патруля (T13.78): пока герой дальше `aggro`, держится у знаменосца; он погиб — обычная толпа.
      let tx = dx / d, ty = dy / d;
      if (e.leader > 0 && d > ARCADE.siege.aggro) {
        const lead = this.enemies.find((o) => o.alive && o.id === e.leader);
        if (!lead) e.leader = 0;
        else {
          const lx = lead.x - e.x, ly = lead.y - e.y, ld = len(lx, ly);
          if (ld < ARCADE.siege.leash) { tx = 0; ty = 0; } else { tx = lx / ld; ty = ly / ld; }
        }
      }
      const ex0 = e.x, ey0 = e.y;
      e.x += (tx * speed) * DT + sx * 0.5;
      e.y += (ty * speed) * DT + sy * 0.5;
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
        this.returnHome(e, P.x, P.y, home, P.regenPerSec);
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
    this.dmgSource = "proj";
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
    // Псарня (легендарка): по зверю сверх каждого уже взятого вида — она не даёт зверя с нуля.
    const kennel = this.upgradePower("leg_beast_kennel") > 0 ? 1 : 0;
    // Иллюзии сюда не входят: они живут по таймеру (spawnIllusions/expirePets), а не по апгрейду.
    const want: Partial<Record<PetKind, number>> = {
      hawk: (p.upgrades.beast_hawk?.rank ?? 0) > 0 ? 1 + kennel : 0,
      wolf: (p.upgrades.beast_wolf?.rank ?? 0) > 0 ? 1 + (p.upgrades.beast_pack?.rank ?? 0) + kennel : 0,
      bear: (p.upgrades.beast_bear?.rank ?? 0) > 0 ? 1 + kennel : 0,
    };
    for (const kind of Object.keys(want) as PetKind[]) {
      let have = this.pets.filter((q) => q.kind === kind).length;
      while (have < (want[kind] ?? 0)) { this.pets.push({ kind, x: p.x + (this.rng.float() - 0.5) * 60, y: p.y + 40 + this.rng.float() * 20, cd: 0, facingX: 1, facingY: 0, hitAt: -999, inReach: false }); have++; }
    }
  }

  /** Руна подобрана: эффект по виду (ARCADE.rune). */
  private applyRune(kind: RuneKind): void {
    const p = this.player;
    const R = ARCADE.rune;
    if (kind === "dd") p.ddUntil = this.tick + sec(R.dd.seconds);
    else if (kind === "shield") { p.shieldHp = Math.round(p.stats.maxHp * R.shield.frac); p.shieldUntil = this.tick + sec(R.shield.seconds); }
    else if (kind === "arcane") p.arcaneUntil = this.tick + sec(R.arcane.seconds);
    else this.spawnIllusions(R.illusion.count, R.illusion.seconds, p.stats.damage * R.illusion.dmgFrac);
    this.pushFx("levelup", p.x, p.y, 0, 0, 30);
  }

  /**
   * Призыв умения: `count` существ на `duration` секунд. Прежняя зона била `value` каждые 15 тиков
   * (= 4·value в секунду) по ОДНОМУ ближайшему врагу у точки каста, поэтому урон за удар считается
   * от того же `value`: `SUMMON_DPS·value·every/count`. Балансовые числа умений в content/heroes.ts
   * не трогаем — они по-прежнему «сила умения», а не «урон одного паучка».
   */
  private spawnSummons(ab: AbilityDef, value: number): void {
    const art = ab.summon?.art;
    const body = art ? SUMMONS[art] : undefined;
    if (!art || !body) return;
    const p = this.player;
    const count = ab.summon?.count ?? 1;
    const dmg = ((body.stationary ? WARD_DPS : SUMMON_DPS) * value * body.every) / count;
    const until = this.tick + sec(ab.duration ?? 10);
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + Math.PI * 0.75;
      const off = body.stationary ? 26 : 34;
      const x = p.x + Math.cos(ang) * off, y = p.y + Math.sin(ang) * off * 0.6;
      this.pets.push({
        kind: "summon", art, x, y, cd: 0, facingX: p.facingX || 1, facingY: p.facingY,
        hitAt: -999, inReach: false, until, dmg,
        ...(body.stationary ? { homeX: x, homeY: y } : {}),
      });
    }
  }

  /** Иллюзии героя: `count` копий на `seconds` секунд с уроном `dmg` за удар. Появляются за спиной героя. */
  private spawnIllusions(count: number, seconds: number, dmg: number): void {
    const p = this.player;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + Math.PI * 0.5;
      this.pets.push({ kind: "illusion", x: p.x + Math.cos(ang) * 36, y: p.y + Math.sin(ang) * 24, cd: 0, facingX: p.facingX || 1, facingY: p.facingY, hitAt: -999, inReach: false, until: this.tick + sec(seconds), dmg });
    }
  }

  /** Иллюзии живут по таймеру; остальные питомцы — пока стоит апгрейд. */
  private expirePets(): void {
    if (this.pets.length === 0) return;
    let w = 0;
    for (const pet of this.pets) if (pet.until === undefined || this.tick < pet.until) this.pets[w++] = pet;
    this.pets.length = w;
  }

  private petPower(): number {
    return (1 + 0.35 * (this.player.upgrades.beast_roar?.rank ?? 0)) * (this.upgradePower("leg_beast_alpha") > 0 ? 2 : 1);
  }

  private tickPets(): void {
    this.dmgSource = "pets";
    this.expirePets();
    if (this.pets.length === 0) return;
    const p = this.player;
    const ranged = this.rangedNow();
    for (let i = 0; i < this.pets.length; i++) {
      const pet = this.pets[i];
      const base = PETS[pet.kind];
      const body: SummonBody | undefined = pet.kind === "summon" ? SUMMONS[pet.art ?? ""] : undefined;
      // Иллюзия повторяет героя: его скорость, период удара и дальность (в Метаморфозе Terrorblade — дальний бой).
      const def = pet.kind === "illusion"
        ? { ...base, speed: p.stats.speed * 1.05, every: p.stats.attackInterval, reach: ranged ? Math.max(60, this.attackRange() - 20) : 34 }
        : body ? { ...base, ...body }
        : base;
      const rank = pet.kind === "illusion" || pet.kind === "summon" ? 1
        : this.player.upgrades[pet.kind === "hawk" ? "beast_hawk" : pet.kind === "wolf" ? "beast_wolf" : "beast_bear"]?.rank ?? 1;
      pet.cd = Math.max(0, pet.cd - 1);
      // Цель: ближайший враг в радиусе поиска; иначе — держаться рядом с героем (каждый со своим смещением).
      const target = def.seek > 0 ? this.nearestEnemy(pet.x, pet.y, def.seek) : null;
      // Тотем (Nether/Plague/Death/Serpent Ward, Psionic Trap, Tombstone) вкопан в землю, как в Dota:
      // не бежит за героем, только поворачивается к цели.
      const rooted = !!body?.stationary;
      if (rooted) {
        pet.x = pet.homeX ?? pet.x; pet.y = pet.homeY ?? pet.y;
        if (target) { const ddx = target.x - pet.x, ddy = target.y - pet.y, dd = len(ddx, ddy) || 1; pet.facingX = ddx / dd; pet.facingY = ddy / dd; }
      } else {
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
      }
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
        if (pet.kind === "illusion") {
          const idmg = (pet.dmg ?? 0) * (this.tick < p.ddUntil ? ARCADE.rune.dd.mult : 1);
          if (ranged) {
            const dd = len(target.x - pet.x, target.y - pet.y) || 1;
            this.spawnProjectile(pet.x, pet.y, (target.x - pet.x) / dd * 560, (target.y - pet.y) / dd * 560, 6, idmg, sec(1.2), 0, "arrow", false);
          } else {
            this.damageEnemy(target, idmg, "hit");
            this.pushFx("slash", pet.x, pet.y, target.x, target.y, 10);
          }
          continue;
        }
        if (pet.kind === "summon") {
          const sdmg = pet.dmg ?? 0;
          if (body?.stationary) {
            // Тотем бьёт мгновенно, как прежняя зона: снаряд с земли не догоняет бегущую цель, и
            // Shadow Shaman терял 12 п.п. «дошёл до Рошана» (замер 2026-09-08).
            this.damageEnemy(target, sdmg, "zap");
            this.pushFx("zap", pet.x, pet.y - 20, target.x, target.y, 6);
          } else if (body?.ranged) {
            const dd = len(target.x - pet.x, target.y - pet.y) || 1;
            this.spawnProjectile(pet.x, pet.y, (target.x - pet.x) / dd * 520, (target.y - pet.y) / dd * 520, 6, sdmg, sec(1.2), 0, "zap", false);
          } else {
            this.damageEnemy(target, sdmg, "hit");
            this.pushFx("slash", pet.x, pet.y, target.x, target.y, 10);
          }
          continue;
        }
        let dmg = def.dmg * rank * this.petPower();
        const hunt = this.upgradePower("hyb_wild_hunt");
        if (hunt > 0 && (this.tick < target.chillUntil || this.tick < target.stunUntil)) dmg *= 1 + 0.3 * hunt; // Дикая охота
        this.damageEnemy(target, dmg, "hit");
        const venomPets = this.upgradePower("hyb_venom_beast");
        if (venomPets > 0) this.applyPoison(target, 3 * venomPets); // Яд + Зверинец: питомцы переносят яд
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

  /** `carried` — остаток опыта после уровня, множители к нему уже применены. Иначе каждый уровень «через» умножал
   *  остаток заново, и при большом запасе опыт рос экспоненциально (бот 2026-09-11: уровень 1224, xp 1e24). */
  private gainXp(raw: number, carried = false): void {
    const p = this.player;
    let xp = raw;
    if (!carried) {
      if (this.tick < this.greedUntil) xp *= ARCADE.greed.xpMult;
      if (this.rank.lessXp) xp *= 0.8;
      xp *= 1 + p.stats.xpMult;
    }
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

  /** Множитель цен текущей лавки: у торговца каравана (T13.59, `shopkeeper.value === 1`) — скидка. */
  shopPriceMult(): number {
    return this.shopkeeper.alive && this.shopkeeper.value === 1 ? ARCADE.caravan.discount : 1;
  }

  private rollShopOffers(): ShopOffer[] {
    const offers: ShopOffer[] = [];
    const mult = this.shopPriceMult();
    // Лавка каравана торгует объявленным семейством: сопровождение — выбор под билд, а не лотерея.
    const family = this.shopkeeper.value === 1 ? this.caravan?.family : undefined;
    const pool = ARCADE_ITEMS.filter((d) => !family || d.family === family);
    for (let i = 0; i < ARCADE.shop.offers && pool.length > 0; i++) {
      const def = pool.splice(this.rng.int(pool.length), 1)[0];
      const rarity = this.rollRarity();
      offers.push({ id: def.id, rarity, price: DEV_FREE_SHOP ? 0 : Math.round(def.price * ITEM_PRICE_MULT[rarity] * mult) });
    }
    return offers;
  }

  shopRerollPrice(): number {
    return Math.round((ARCADE.shop.rerollBase + ARCADE.shop.rerollStep * this.shopRerolls) * this.shopPriceMult());
  }

  private shopAction(act: number): void {
    const p = this.player;
    if (act >= 1 && act <= 3) {
      const offer = this.shopOffers[act - 1];
      const price = this.shopBuyPrice(act - 1);
      if (!offer || p.gold < price || p.items.length >= ARCADE.shop.slots) return;
      if (this.caravanGiftAvailable()) this.caravanGift = false;
      p.gold -= price;
      p.items.push({ id: offer.id, rarity: offer.rarity });
      this.shopOffers.splice(act - 1, 1);
      this.recomputeStats();
      this.pushFx("levelup", p.x, p.y, 0, 0, 30);
    } else if (act === SHOP_ACT.debt) {
      // «Долг силы»: карта школы exotic сейчас, взамен порча долга — половина дохода лавочнику, пока не выплачен.
      if (!this.debtOfferAvailable()) return;
      const up = this.rollUpgradeOffer([]);
      if (!up || up.kind !== "upgrade") return;
      this.debtOfferTaken = true;
      this.applyCurse("debt");
      this.shopOpen = false;
      this.shopkeeper.alive = false;
      this.queueReward([{ kind: "upgrade", id: up.id, rarity: ARCADE.build.debtRarity }]);
    } else if (act === 4) {
      const price = DEV_FREE_SHOP ? 0 : this.shopRerollPrice();
      if (p.gold < price) return;
      p.gold -= price;
      this.shopRerolls++;
      this.shopOffers = this.rollShopOffers();
    } else if (act === 5) {
      this.shopOpen = false;
      // Торговец уходит, чтобы игрок не открывал лавку заново каждым касанием.
      this.shopkeeper.alive = false;
    } else if (act >= SHOP_ACT.upgradeBase && act < SHOP_ACT.upgradeBase + ARCADE.shop.slots) {
      // Подарок каравана вместо товара: поднять редкость своего предмета на ступень.
      const owned = p.items[act - SHOP_ACT.upgradeBase];
      const next = owned ? NEXT_RARITY[owned.rarity] : null;
      if (!owned || !next || !this.caravanGiftAvailable()) return;
      owned.rarity = next;
      this.caravanGift = false;
      this.recomputeStats();
      this.pushFx("levelup", p.x, p.y, 0, 0, 30);
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

  /** Осада леса (T13.78): множитель спавна леса и волн — ослаблены после гибели знаменосца. */
  siegeMult(): number {
    return this.tick < this.siegeWeakUntil ? ARCADE.siege.weakMult : 1;
  }

  /** Патрули: знаменосец с охраной из пула минуты, по расписанию, не больше `maxBearers` живых. */
  private tickPatrols(): void {
    const C = ARCADE.siege;
    if (this.nextPatrolAt === 0) this.nextPatrolAt = C.firstAt;
    if (this.actTick < this.nextPatrolAt) return;
    this.nextPatrolAt = this.actTick + C.every;
    let bearers = 0;
    for (const e of this.enemies) if (e.alive && e.kind.id === "standard_bearer") bearers++;
    if (bearers >= C.maxBearers) return;
    const [x, y] = this.ringPoint(ARCADE.spawn.ringMin, ARCADE.spawn.ringMin + 40);
    const bearer = this.spawnEnemy(ENEMY_KINDS.standard_bearer, x, y);
    this.pickWaypoint(bearer);
    const pool = spawnPool(this.minutes, this.act);
    for (let i = 0; i < C.escorts; i++) {
      const a = this.rng.float() * Math.PI * 2, r = 30 + this.rng.float() * 40;
      const esc = this.spawnEnemy(weightedPick(this.rng, pool), clamp(x + Math.cos(a) * r, 8, ARCADE.world.w - 8), clamp(y + Math.sin(a) * r, 8, ARCADE.world.h - 8));
      esc.leader = bearer.id;
    }
  }

  /** Следующая точка маршрута знаменосца — одно из мест карты (по тропам между ними), кроме той, где он стоит. */
  private pickWaypoint(e: Enemy): void {
    const spots: { x: number; y: number }[] = [];
    for (const o of [this.camp, this.outpost, this.pond, this.grove, this.lair, this.forge]) if (o && len(o.x - e.x, o.y - e.y) > 120) spots.push(o);
    const t = spots.length ? spots[this.rng.int(spots.length)] : { x: ARCADE.world.w / 2, y: ARCADE.world.h / 2 };
    e.wpX = t.x; e.wpY = t.y;
  }

  /** Знаменосец идёт по маршруту и не гонится за героем; коснулся — бьёт. */
  private moveBearer(e: Enemy, d: number, frozen: boolean): void {
    if (frozen) return;
    const wx = e.wpX - e.x, wy = e.wpY - e.y, wd = len(wx, wy);
    if (wd < 30) { this.pickWaypoint(e); return; }
    let speed = e.kind.speed * this.rank.speedMult * (ARCADE.acts[this.act].speedMult ?? 1);
    if (this.tick < e.chillUntil) speed *= 1 - e.chillSlow;
    const ex0 = e.x, ey0 = e.y;
    e.x += wx / wd * speed * DT; e.y += wy / wd * speed * DT;
    [e.x, e.y] = this.obstacles.resolve(e.x, e.y, e.kind.r * 0.8);
    if (len(e.x - ex0, e.y - ey0) < speed * DT * 0.4) {
      const [mx, my] = this.obstacles.steer(ex0, ey0, wx / wd, wy / wd, e.kind.r * 0.8, 28);
      e.x = ex0 + mx * speed * DT; e.y = ey0 + my * speed * DT;
      [e.x, e.y] = this.obstacles.resolve(e.x, e.y, e.kind.r * 0.8);
    }
    this.contactDamage(e, d);
  }

  /** Свойство акта (T13.73) — из композиции; у разминки/Dire/River его нет. */
  actProperty(): ActProperty | null {
    return COMPOSITIONS[this.composition].property ?? null;
  }

  /** «Заражённый водоём»: пока стоит лагерь порчи, пруд лечит вдвое слабее и не смывает порчу. */
  pondTainted(): boolean {
    return this.actProperty() === "tainted_pond" && !!this.camp && !this.camp.cleared;
  }

  pondHealFrac(): number {
    return ARCADE.pond.healFrac * (this.pondTainted() ? 0.5 : 1);
  }

  /** «Долг силы» доступен: лавка открыта, порчи нет, за акт ещё не брали. */
  debtOfferAvailable(): boolean {
    return this.shopOpen && !this.debtOfferTaken && this.player.curse === null;
  }

  /** Сумма долга, если взять карту сейчас (та же формула, что у порчи). */
  debtOfferAmount(): number {
    return Math.round(ARCADE.curse.debt.base + ARCADE.curse.debt.perMin * this.minutes);
  }

  /** Ритуал очищения действует (T13.75). */
  ritualActive(): boolean {
    return this.player.ritualKind !== null && this.tick < this.player.ritualUntil;
  }

  private ritualMult(kind: CurseId): number {
    return this.ritualActive() && this.player.ritualKind === kind ? (kind === "withering" ? ARCADE.build.ritual.healMult : kind === "debt" ? ARCADE.build.ritual.goldMult : ARCADE.build.ritual.dmgMult) : 1;
  }

  /** Подарок каравана ещё не использован и открыта именно его лавка. */
  caravanGiftAvailable(): boolean {
    return this.shopOpen && this.shopkeeper.value === 1 && this.caravanGift;
  }

  /** Цена товара i с учётом подарка каравана (первый товар — бесплатно). */
  shopBuyPrice(i: number): number {
    const offer = this.shopOffers[i];
    if (!offer) return 0;
    return this.caravanGiftAvailable() ? 0 : offer.price;
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
    return this.actTick >= ARCADE.loot.tier3At ? 3 : this.actTick >= ARCADE.loot.tier2At ? 2 : 1;
  }

  private rollLoot(rarity: Rarity): GearItem {
    return rollGear(this.rng, this.lootTier(), rarity, this.nextUid());
  }

  private dropLoot(x: number, y: number, item: GearItem): void {
    this.groundLoot.push({ x, y, item, until: this.tick + ARCADE.loot.lootLifetime });
  }

  /** Подобрать то, что рядом (PICKUP_ACT): сундук вскрывается и даёт предмет, предмет с земли открывает экран подбора. */
  private pickupNear(): void {
    const near = this.nearLoot;
    if (this.lootOpen) return;
    if (!near) {
      // Кнопка подбора у пруда/кузни открывает выбор (добыча рядом важнее — она в приоритете).
      if (this.nearPond && this.pond && !this.pond.used) this.pondOpen = true;
      else if (this.nearForge && this.forgeReady()) { this.forgeOpen = true; this.forgeSlot = -1; }
      else if (this.nearRift && this.riftReady()) this.riftOpen = true;
      return;
    }
    if (near.kind === "chest") {
      if (!this.chest.alive) return;
      this.chest.alive = false;
      const cursed = this.chest.value === 1;
      this.lootCursed = cursed;
      if (cursed) this.lootCurse = this.rollCurse();
      this.lootOpen = this.rollLoot(cursed ? this.rarityUp(this.rollRarity()) : this.rollRarity());
      this.pushFx("levelup", this.chest.x, this.chest.y, 0, 0, 24);
    } else {
      const g = this.groundLoot.find((x) => x.item === near.item && x.until > 0);
      if (!g) return;
      g.until = -1;
      this.lootOpen = g.item;
    }
    this.nearLoot = null;
  }

  /** Выбросить предмет из сумки на землю к ногам: лежит `lootLifetime`, можно подобрать обратно.
   *  Из списка «подобранное за забег» уходит — в инвентарь по итогу выброшенное не попадает. */
  private dropFromBag(i: number): boolean {
    const p = this.player;
    if (i < 0 || i >= p.bag.length) return false;
    const [item] = p.bag.splice(i, 1) as GearItem[];
    this.loot = this.loot.filter((x) => x.uid !== item.uid);
    // Раскладываем вокруг героя, чтобы несколько выброшенных не легли в одну точку.
    const a = (this.lootSeq++ % 8) * Math.PI / 4;
    this.dropLoot(p.x + Math.round(Math.cos(a) * 36), p.y + Math.round(Math.sin(a) * 36), item);
    return true;
  }

  /** Надеть предмет из сумки: снятое — на его место в сумке. */
  private equipFromBag(i: number): boolean {
    const p = this.player;
    if (i < 0 || i >= p.bag.length) return false;
    const item = p.bag[i] as GearItem;
    const old = p.gear[item.slot];
    p.gear[item.slot] = item;
    if (old) p.bag[i] = old; else p.bag.splice(i, 1);
    this.recomputeStats();
    this.pushFx("levelup", p.x, p.y, 0, 0, 30);
    return true;
  }

  /** Экран сборки: BUILD_ACT — закрыть, BAG_EQUIP_ACT+i — надеть из сумки, BAG_DROP_ACT+i — выбросить. */
  private buildAction(act: number): void {
    if (act === BUILD_ACT || act === 5) { this.buildOpen = false; return; }
    if (act >= BAG_EQUIP_ACT && act < BAG_EQUIP_ACT + ARCADE.loot.bagCap) this.equipFromBag(act - BAG_EQUIP_ACT);
    else if (act >= BAG_DROP_ACT && act < BAG_DROP_ACT + ARCADE.loot.bagCap) this.dropFromBag(act - BAG_DROP_ACT);
  }

  /** Экран подбора: 1 — надеть (старое в сумку), 2 — в сумку, 5 — оставить (предмет ложится обратно на землю),
   *  BAG_DROP_ACT+i — выбросить из сумки, чтобы освободить место. Сумка полна — «в сумку» не срабатывает. */
  private lootAction(act: number): void {
    const p = this.player;
    const item = this.lootOpen;
    if (!item) return;
    if (act >= BAG_DROP_ACT && act < BAG_DROP_ACT + ARCADE.loot.bagCap) { this.dropFromBag(act - BAG_DROP_ACT); return; }
    // Проклятый сундук: взять предмет (надеть или в сумку) = принять порчу; оставить у ног — без порчи, и предмет
    // на земле уже чистый (порча — цена вскрытия, а не сам предмет).
    if ((act === 1 || (act === 2 && p.bag.length < ARCADE.loot.bagCap)) && this.lootCursed) this.applyCurse(this.lootCurse);
    if (act === 1 || act === 2 || act === 5) this.lootCursed = false;
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
      // «Оставить» — предмет остаётся лежать у ног, а не исчезает (владелец 2026-09-07: «могу только выйти,
      // и он просто удалится»). Подобрать можно снова, пока не истёк срок.
      this.dropLoot(p.x, p.y, item);
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

  /** Лагерь очищен, когда снесены все тотемы И убит Осквернитель (T13.41) — в любом порядке. */
  private tryClearCamp(): void {
    if (!this.camp || this.camp.cleared || this.camp.destroyed < this.camp.totems || this.defiler?.alive) return;
    this.clearCamp();
  }

  /** Полоса порчи между двумя живыми тотемами (T13.41): пока герой в лагере, Осквернитель жив и тотемов ≥ 2. */
  private tickCampLine(): void {
    const camp = this.camp;
    if (!camp || camp.cleared) return;
    const D = ARCADE.defiler;
    const p = this.player;
    if (camp.line && this.tick >= camp.line.activeUntil) camp.line = null;
    if (camp.line) {
      const L = camp.line;
      if (this.tick >= L.telegraphUntil && this.tick >= camp.lineHitAt) {
        // Расстояние от героя до отрезка тотем–тотем.
        const vx = L.bx - L.ax, vy = L.by - L.ay, wx = p.x - L.ax, wy = p.y - L.ay;
        const t = Math.max(0, Math.min(1, (vx * wx + vy * wy) / ((vx * vx + vy * vy) || 1)));
        if (len(p.x - (L.ax + vx * t), p.y - (L.ay + vy * t)) <= D.lineWidth / 2 + ARCADE.player.r) {
          camp.lineHitAt = this.tick + D.lineHitEvery;
          this.damagePlayer((this.defiler?.dmg ?? ENEMY_KINDS.satyr_defiler.dmg) * D.lineDmgMult, 0, ENEMY_KINDS.satyr_defiler);
        }
      }
      return;
    }
    if (!this.defiler?.alive || !this.playerAtCamp() || this.tick < camp.nextLineAt) return;
    const alive = this.enemies.filter((e) => e.alive && e.kind.id === "corruption_totem");
    if (alive.length < 2) return;
    const a = alive.splice(this.rng.int(alive.length), 1)[0];
    const b = alive[this.rng.int(alive.length)];
    camp.line = { ax: a.x, ay: a.y, bx: b.x, by: b.y, telegraphUntil: this.tick + D.lineTelegraph, activeUntil: this.tick + D.lineTelegraph + D.lineActive };
    camp.nextLineAt = camp.line.activeUntil + D.lineEvery;
  }

  /**
   * Осквернитель: спит дома, пока герой вне лагеря, и лечится; в лагере гонит героя (быстрее, если тот далеко),
   * бьёт «порывом» по телеграфу и стоит после него — окно для мили. За поводком возвращается домой. Контроль
   * держится не дольше ccCap, потом ccResist иммунитета: не выключаем контроль, но не даём заперманентить.
   */
  private moveDefiler(e: Enemy, dx: number, dy: number, d: number): void {
    const D = ARCADE.defiler, camp = this.camp;
    if (!camp) return;
    e.slamCd = Math.max(0, e.slamCd - 1);
    this.capControl(e, D.ccCap, D.ccResist);
    const frozen = this.tick < e.freezeUntil || this.tick < e.stunUntil;
    const p = this.player;
    if (e.slamT > 0) {
      e.slamT--;
      if (e.slamT === 0) {
        if (len(p.x - e.slamX, p.y - e.slamY) <= D.galeRadius + ARCADE.player.r) this.damagePlayer(D.galeDmg * (e.dmg / e.kind.dmg), D.galeStun, e.kind);
        this.shake = Math.max(this.shake, 8);
        this.pushFx("nova", e.slamX, e.slamY, D.galeRadius, 0, 16);
        e.slamCd = D.galeCooldown;
      }
      return;
    }
    if (e.slamCd > D.galeCooldown - D.galeRecovery) return;
    if (frozen) return;
    const home = len(e.x - camp.x, e.y - camp.y);
    // Сон / поводок: герой вне лагеря или сатир ушёл слишком далеко — домой и лечиться.
    if (!this.playerAtCamp() || home > ARCADE.camp.radius + D.leash) {
      // Лечится только когда лагерь отпущен (герой за engageRadius): кайт охраны у кромки лагеря больше не сбрасывает
      // Сатира в полный HP — с этим бот после сноса всех тотемов оставлял его на 100% в 10 из 10 забегов (2026-09-11).
      this.returnHome(e, camp.x, camp.y, home, D.regenPerSec, !camp.engaged);
      return;
    }
    if (d <= D.galeRange + ARCADE.player.r && e.slamCd === 0) { e.slamT = D.galeTelegraph; e.slamX = p.x; e.slamY = p.y; return; }
    let speed = d > D.chaseFrom ? D.chaseSpeed : e.kind.speed;
    if (this.tick < e.chillUntil) speed *= 1 - e.chillSlow * 0.5;
    e.x += dx / d * speed * DT;
    e.y += dy / d * speed * DT;
    [e.x, e.y] = this.obstacles.resolve(e.x, e.y, e.kind.r * 0.8);
    if (d < e.kind.r + ARCADE.player.r + 2 && e.contactCd === 0) {
      e.contactCd = sec(ARCADE.boss.contactEvery);
      this.damagePlayer(e.dmg, 0, e.kind);
    }
  }

  /** Награда Некроманта (T13.46): три exotic-карты школы «Зверинец» — «улучшение Beast»; если школа недоступна, обычные exotic. */
  private openBarrowReward(): void {
    const offers: Offer[] = [];
    for (let i = 0; i < 3; i++) {
      const up = this.rollUpgradeOffer(offers.map((o) => (o.kind === "upgrade" ? o.id : "")), "beast") ?? this.rollUpgradeOffer(offers.map((o) => (o.kind === "upgrade" ? o.id : "")));
      if (!up || up.kind !== "upgrade") break;
      offers.push({ kind: "upgrade", id: up.id, rarity: "exotic" });
    }
    for (const k of ["q", "w", "e"] as const) if (offers.length < 3 && this.player.abilities[k] < 4) offers.push({ kind: "ability", key: k });
    if (offers.length === 0) return;
    this.queueReward(offers);
  }

  /** Лагерь очищен: три карты апгрейдов гарантированной редкости (мир стоит, как на уровне); реролла нет. */
  private clearCamp(): void {
    if (!this.camp) return;
    this.camp.cleared = true;
    // «Заражённый водоём»: лагерь снесён — пруд чист и готов снова, даже если уже пили заражённую воду.
    if (this.actProperty() === "tainted_pond" && this.pond) this.pond.used = false;
    this.events.camps++;
    this.shake = Math.max(this.shake, 14);
    this.pushFx("nova", this.camp.x, this.camp.y, ARCADE.camp.radius + 40, 0, 36);
    const offers: Offer[] = [];
    for (let i = 0; i < 3; i++) {
      const up = this.rollUpgradeOffer(offers.map((o) => (o.kind === "upgrade" ? o.id : "")));
      if (!up || up.kind !== "upgrade") break;
      offers.push({ kind: "upgrade", id: up.id, rarity: ARCADE.camp.rewardRarity });
    }
    // Пул школ исчерпан (все на потолке) — предлагаем очки способностей, чтобы награда не пропала.
    for (const k of ["q", "w", "e"] as const) if (offers.length < 3 && this.player.abilities[k] < 4) offers.push({ kind: "ability", key: k });
    if (offers.length === 0) { this.completeContract("defiler", this.camp.x, this.camp.y); return; }
    this.queueReward(offers);
    this.completeContract("defiler", this.camp.x, this.camp.y);
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
    const price = DEV_FREE_SHOP ? 0 : this.levelRerollPrice();
    if (!this.pending || p.gold < price || this.pendingSource === "camp") return;
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

  private rollUpgradeOffer(exclude: string[], only?: SchoolId, type?: UpgradeType): Offer | null {
    const p = this.player;
    let schools: readonly SchoolId[] = p.schools.length >= 3 ? p.schools : SCHOOLS;
    if (only) { if (!schools.includes(only)) return null; schools = [only]; }
    const owned = (id: string) => (p.upgrades[id]?.rank ?? 0) > 0;
    const candidates = UPGRADES.filter((u) => !u.legendary && !this.banished.has(u.id) && schools.includes(u.school) && !exclude.includes(u.id) && (!type || u.type === type) && (p.upgrades[u.id]?.rank ?? 0) < (p.upgrades[u.id]?.cap ?? u.maxRank) && (!u.requires || u.requires.some(owned)) && (!u.requiresSchools || u.requiresSchools.every((sc) => p.schools.includes(sc))));
    if (candidates.length === 0) return null;
    const def = candidates[this.rng.int(candidates.length)];
    return { kind: "upgrade", id: def.id, rarity: this.rollRarity() };
  }

  private rollRarity(): Rarity {
    const R = ARCADE.rarity;
    const t = Math.min(1, this.minutes / R.endMin);
    // Без временных массивов: вызывается на каждый дроп, оффер лавки и карточку уровня.
    const w0 = R.start[0] + (R.end[0] - R.start[0]) * t, w1 = R.start[1] + (R.end[1] - R.start[1]) * t;
    const w2 = R.start[2] + (R.end[2] - R.start[2]) * t, w3 = R.start[3] + (R.end[3] - R.start[3]) * t;
    let roll = this.rng.float() * (w0 + w1 + w2 + w3);
    roll -= w0; if (roll <= 0) return "standard";
    roll -= w1; if (roll <= 0) return "refined";
    roll -= w2; if (roll <= 0) return "exotic";
    roll -= w3; if (roll <= 0) return "arcana";
    return "standard";
  }

  /** Награда места/чемпиона/контракта: `pending` один; если выбор уже висит — выдача встаёт в очередь целиком
   *  и покажется отдельным экраном после текущего. Раньше выдачи затирали друг друга, потом склеивались в один
   *  выбор (три карточки чемпиона + карта контракта = «выбери одну из четырёх», аудит 2026-09-12). */
  private queueReward(offers: Offer[]): void {
    if (this.pending) this.rewardQueue.push(offers);
    else { this.pending = offers; this.pendingSource = "camp"; }
  }

  private applyOffer(offer: Offer): void {
    const p = this.player;
    if (offer.kind === "ability") p.abilities[offer.key]++;
    else if (offer.kind === "talent") p.talents.push(offer.id);
    else {
      const def = UPGRADE_BY_ID[offer.id];
      const cur = p.upgrades[offer.id] ?? { rank: 0, power: 0, cap: def.maxRank };
      // Редкость поднимает потолок рангов, а не только силу ранга: экзотический вариант даёт +1
      // ступень сверх `maxRank`, арканный +2. Потолок только растёт — взял редкий вариант однажды,
      // дальше можно докачивать и обычными.
      // Легендарки берутся один раз (maxRank 1) и всегда приходят с редкостью arcana — надбавка их
      // не касается, иначе одна легендарка бралась бы трижды.
      const cap = def.legendary ? def.maxRank : Math.max(cur.cap, def.maxRank + (ARCADE.rarity.rankBonus[offer.rarity] ?? 0));
      p.upgrades[offer.id] = { rank: cur.rank + 1, power: def.legendary ? 1 : cur.power + ARCADE.rarity.mult[offer.rarity], cap };
      if (!def.neutral && !p.schools.includes(def.school)) p.schools.push(def.school);
      if (def.id === "leg_rad_phoenix") p.aegis = true; // Феникс: одно возрождение, как Aegis
    }
    this.pending = null;
    this.pendingSource = "level";
    const nextReward = this.rewardQueue.shift();
    if (nextReward) { this.pending = nextReward; this.pendingSource = "camp"; }
    this.recomputeStats();
    this.syncPets();
    // Уровень мог набежать «через» (несколько шардов разом) — следующий выбор на следующем тике.
    if (p.xp >= p.xpNext) { const carry = p.xp; p.xp = 0; this.gainXp(carry, true); }
  }

  private recomputeStats(): void {
    const p = this.player;
    const s = baseStats();
    Object.assign(s, this.hero.base);
    applyTrait(s, this.trait); // особенность — поверх базы героя, до пассивок/апгрейдов/экипировки
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
    if (this.upgradePower("leg_butterfly") > 0) { attackSpeed += 0.2; moveSpeed += 0.06; }
    if (this.upgradePower("leg_moonshard") > 0) attackSpeed += 0.55;
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
    // Наследие Aegis: к итоговым HP и радиусу сбора, один раз (урон — в damageEnemy).
    s.maxHp = Math.round(s.maxHp * this.legacy.hp);
    s.pickup *= this.legacy.pickup;
    const ratio = p.stats ? p.hp / p.stats.maxHp : 1;
    p.stats = s;
    p.hp = Math.min(s.maxHp, Math.max(p.hp, ratio * s.maxHp));
  }

  // ---------- запросы ----------

  /** Цель места приоритетнее толпы (2026-09-11, стоимость лагеря на Herald): пока лагерь/курган разбужен, автоатака
   *  бьёт ближайший тотем/идол в дальности удара, а не ближайшего охранника. Иначе тотемы (210 HP) умирали только от
   *  AoE и вплотную: бот 24 забега — тотемов 0/3 в 14 из 24, Сатир ни разу не задет, лагерь = смерть от обычного леса. */
  focusTotem(): Enemy | null {
    const p = this.player;
    const campOn = !!this.camp && !this.camp.cleared && this.camp.engaged;
    // Тотемов не осталось — цель лагеря сам Сатир (иначе автоатака уходит в охрану, а он уходит домой).
    if (campOn && this.totemsAlive() === 0 && this.defiler?.alive && !this.isDormant(this.defiler) && len(this.defiler.x - p.x, this.defiler.y - p.y) - this.defiler.kind.r < this.attackRange()) return this.defiler;
    const barrowOn = !!this.barrow && this.barrow.engaged && !!this.necromancer?.alive;
    if (!campOn && !barrowOn) return null;
    const range = this.attackRange();
    let best: Enemy | null = null, bestD = range;
    for (const e of this.enemies) {
      if (!e.alive || !e.kind.totem || this.isDormant(e)) continue;
      if (e.kind.id === "corruption_totem" && !campOn) continue;
      if (e.kind.id === "bone_idol" && !barrowOn) continue;
      const d = len(e.x - p.x, e.y - p.y) - e.kind.r;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  nearestEnemy(x: number, y: number, radius: number): Enemy | null {
    let best: Enemy | null = null, bestD = radius;
    for (const e of this.enemies) {
      if (!e.alive || this.isDormant(e)) continue;
      const d = len(e.x - x, e.y - y) - e.kind.r;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  enemiesWithin(x: number, y: number, radius: number): Enemy[] {
    const out: Enemy[] = [];
    for (const e of this.enemies) if (e.alive && !this.isDormant(e) && len(e.x - x, e.y - y) <= radius + e.kind.r) out.push(e);
    return out;
  }

  countEnemiesWithin(x: number, y: number, radius: number): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive && !this.isDormant(e) && len(e.x - x, e.y - y) <= radius + e.kind.r) n++;
    return n;
  }

  private pushFx(kind: FxKind, x: number, y: number, x2: number, y2: number, dur: number, value = 0): void {
    if (this.fx.length > 400) this.fx.splice(0, 100);
    this.fx.push({ kind, x, y, x2, y2, born: this.tick, dur, value });
  }

  private pruneFx(): void {
    if (this.tick % 30 !== 0) return;
    // Уплотнение на месте (как expirePets): без нового массива каждые полсекунды.
    let n = 0;
    for (const f of this.fx) if (this.tick - f.born < f.dur) this.fx[n++] = f;
    this.fx.length = n;
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
    mix(this.tick); mix(p.x); mix(p.y); mix(p.hp); mix(p.level); mix(p.xp); mix(p.gold); mix(p.kills); mix(this.greedStacks); mix(this.rank.step); mix(p.items.length); mix(p.neutral ? 1 : 0); mix(Object.keys(p.gear).length); mix(this.loot.length); mix(this.camp?.destroyed ?? 0); mix(this.camp?.line ? this.camp.line.activeUntil : 0); mix(this.outpost?.progress ?? 0); mix(this.pond?.used ? 1 : 0); mix(p.curse ? 1 : 0); mix(this.centaur?.chargeLeft ?? 0); mix(this.barrow?.idolsDown ?? 0); mix(this.contract ? (this.contract.done ? 2 : 1) : 0); mix(p.debtLeft); mix(this.forge?.used ? 1 : 0); mix(this.lair?.zones.length ?? 0); mix(this.ford?.waves.length ?? 0); mix(this.den?.markUntil ?? 0);
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
    ruptureUntil: 0, ruptureDps: 0, lastX: 0, lastY: 0, ampUntil: 0, ampMult: 0, ccResistUntil: 0, chargeDx: 0, chargeDy: 0, chargeLeft: 0, chargeHit: false, poisonUntil: 0, poisonStacks: 0, poisonDps: 0, leader: 0, wpX: 0, wpY: 0,
  };
}

/** Переиспользование слота пула: те же нули, что в `emptyEnemy`, без двух временных объектов на каждый спавн. */
function resetEnemy(e: Enemy, kind: EnemyKind): void {
  e.kind = kind; e.contactCd = 0; e.shotCd = 0; e.burnUntil = 0; e.burnDps = 0;
  e.chillUntil = 0; e.chillSlow = 0; e.chillStacks = 0; e.freezeUntil = 0; e.stunUntil = 0; e.hitAt = -100; e.slamT = 0; e.slamX = 0; e.slamY = 0; e.slamCd = 0;
  e.ruptureUntil = 0; e.ruptureDps = 0; e.lastX = 0; e.lastY = 0; e.ampUntil = 0; e.ampMult = 0; e.ccResistUntil = 0; e.chargeDx = 0; e.chargeDy = 0; e.chargeLeft = 0; e.chargeHit = false; e.poisonUntil = 0; e.poisonStacks = 0; e.poisonDps = 0; e.leader = 0; e.wpX = 0; e.wpY = 0;
}

function cellKey(x: number, y: number): number {
  return Math.floor(x / GRID) * 100000 + Math.floor(y / GRID);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function weightedPick(rng: Rng, pool: readonly EnemyKind[]): EnemyKind {
  let total = 0;
  for (const k of pool) total += k.weight;
  let roll = rng.float() * total;
  for (const k of pool) { roll -= k.weight; if (roll <= 0) return k; }
  return pool[pool.length - 1];
}
