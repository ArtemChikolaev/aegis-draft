// Arcade (PRD §5.15, BACKLOG M13) — типы чистого real-time сима. Никакого DOM/React: ядро
// тестируется в Node и крутится headless в `scripts/sim_arcade.ts`. Детерминизм — свойство
// контракта: `seed + input-лог` ⇒ тот же забег (см. sim.ts, правила в брифе §3.1).

/** Ввод за один тик. `mx/my` — направление движения в шестнадцатых (−16..16): квантование
 *  делает input-лог компактным и защищает от дрожания float между устройствами. `cast` —
 *  битовая маска ручного каста (1=Q, 2=W, 4=E, 8=R); `choose` — индекс карточки уровня, −1 = нет. */
export interface ArcadeInput {
  mx: number;
  my: number;
  cast: number;
  choose: number;
  /** Действие в магазине (T13.8): 0 — нет, 1..3 — купить слот, 4 — реролл, 5 — закрыть.
   *  Токен нейтралки использует те же коды: 1..2 — взять вариант, 5 — пропустить.
   *  Добыча (T13.14): 1 — надеть, 2 — в сумку, 5 — оставить на земле. */
  act: number;
}

/** Действия лавки/нейтралки/лута в `ArcadeInput.act`; 10..15 — продать предмет из слота (act − 10) за половину цены (владелец 2026-09-06: «нельзя поменять предмет»). */
export const SHOP_ACT = { none: 0, buy1: 1, buy2: 2, buy3: 3, reroll: 4, close: 5, sellBase: 10 } as const;
/** `act` = AUTOCAST_ACT + индекс умения (0=q…3=r) переключает автокаст этого умения, +4 — автоатаку. */
export const AUTOCAST_ACT = 40;
export const AUTOATTACK_ACT = AUTOCAST_ACT + 4;
/** Подобрать добычу рядом (сундук или предмет на земле). Раньше подбиралось само при касании —
 *  владелец 2026-09-07: «подходишь к предмету и нажимаешь кнопку, а не 100% автоматически». */
export const PICKUP_ACT = 61;
/** Открыть/закрыть экран сборки (экипировка, сумка, взятые умения) — мир стоит, как в лавке. */
export const BUILD_ACT = 62;
/** `act` = BAG_EQUIP_ACT + i — надеть предмет из сумки (снятое — в сумку); BAG_DROP_ACT + i — выбросить
 *  предмет из сумки на землю (лежит `lootLifetime`, можно подобрать обратно). Работают в экране сборки
 *  и в экране подбора (сумка полна — освободить место). */
export const BAG_EQUIP_ACT = 70;
export const BAG_DROP_ACT = 90;
/** Бит ручной атаки в `cast` (умения занимают 1|2|4|8). */
export const ATTACK_MASK = 16;

export const IDLE_INPUT: Readonly<ArcadeInput> = Object.freeze({ mx: 0, my: 0, cast: 0, choose: -1, act: 0 });

export function sameInput(a: ArcadeInput, b: ArcadeInput): boolean {
  return a.mx === b.mx && a.my === b.my && a.cast === b.cast && a.choose === b.choose && a.act === b.act;
}

/** Запись input-лога: ввод действует с вызова step() №`step` и до следующей записи. */
export type InputLogEntry = [step: number, mx: number, my: number, cast: number, choose: number, act: number];

export type EnemyKindId =
  | "kobold" | "kobold_foreman" | "hill_troll" | "satyr" | "ogre" | "centaur" | "wildwing"
  | "lane_creep" | "siege_creep" | "golem" | "roshan" | "tormentor" | "ancient"
  | "dark_troll" | "hellbear" | "corruption_totem" | "satyr_defiler" | "centaur_warden"
  | "troll_necromancer" | "bone_idol" | "skeleton_warrior";

export interface EnemyKind {
  id: EnemyKindId;
  hp: number;
  speed: number;
  /** Контактный урон за удар (каждые `contactEvery` секунд, пока касается). */
  dmg: number;
  r: number;
  xp: number;
  gold: number;
  elite?: boolean;
  boss?: boolean;
  /** Неподвижное строение (Древний): не ходит, стреляет; смерть = победа акта. */
  structure?: boolean;
  /** Доля полученного урона, возвращаемая игроку (Tormentor). */
  reflect?: number;
  /** Не берут статусы: горение, заморозка, стан, замедление. */
  unstoppable?: boolean;
  /** Тотем лагеря (T13.40): стоит на месте, не бьёт и не толкается; цель для ударов, смерть двигает лагерь к очищению. */
  totem?: boolean;
  /** Стреляет снарядом с дистанции (осадный крип). */
  ranged?: { range: number; every: number; speed: number };
  /** С какой минуты появляется в обычном спавне и вес в пуле. */
  fromMin: number;
  weight: number;
  /** Только в актах из списка (нет списка — во всех). */
  acts?: readonly string[];
  /** Цвет-роль для рендера (токен подбирается на стороне UI). */
  tone: "grunt" | "brute" | "swift" | "elite" | "boss" | "creep";
}

export type SchoolId = "radiance" | "skadi" | "maelstrom" | "beast" | "venom";

/** Питомец (школа «Зверинец») или призыв умения: позиция, цель, перезарядка удара; неуязвим, следует за героем. */
export interface Pet {
  kind: "hawk" | "wolf" | "bear" | "illusion" | "summon";
  x: number;
  y: number;
  cd: number;
  facingX: number;
  facingY: number;
  /** Тик последнего удара — для анимации. */
  hitAt: number;
  /** Был ли в радиусе удара на прошлом тике: вход в радиус укорачивает перезарядку до замаха (tickPets). */
  inReach: boolean;
  /** Иллюзия: тик исчезновения и урон удара (доля урона героя или значение умения). */
  until?: number;
  dmg?: number;
  /** Призыв умения (kind: "summon"): имя листа спрайтов и тела из content/pets.ts `SUMMONS`. */
  art?: string;
  /** Тотем: точка установки — он туда возвращается и не бежит за героем. */
  homeX?: number;
  homeY?: number;
}

/** Руны у реки, как в Dota (владелец 2026-09-07): двойной урон, щит, магия (короче перезарядки), иллюзии. */
export type RuneKind = "dd" | "shield" | "arcane" | "illusion";
export const RUNE_KINDS: readonly RuneKind[] = ["dd", "shield", "arcane", "illusion"];
export type UpgradeType = "attack" | "strike" | "cast" | "power" | "passive";
export type Rarity = "standard" | "refined" | "exotic" | "arcana";

export interface UpgradeDef {
  id: string;
  school: SchoolId;
  type: UpgradeType;
  maxRank: number;
  /** Гибрид школ (как «божественные» благословения DMD): нужны ВСЕ перечисленные школы в билде. */
  requiresSchools?: SchoolId[];
  /** Модификатор: предлагается, только если взят хотя бы один из перечисленных источников (владелец 2026-09-06: «предлагает +урон огня, когда огня ещё нет»). */
  requires?: string[];
  /** Легендарный апгрейд (DMD-подобный «мега-пассив», T13.18): один ранг, редкое предложение, своя иконка-предмет. */
  legendary?: boolean;
  /** Нейтральный легендарный — не привязан к школе (школу в билд не добавляет). */
  neutral?: boolean;
  art?: string;
}

export type AbilityKey = "q" | "w" | "e" | "r";

/** Карточка уровня. `ability` — очко в способность, `upgrade` — школа, `talent` — талант 10/15/20/25. */
export type Offer =
  | { kind: "ability"; key: AbilityKey }
  | { kind: "upgrade"; id: string; rarity: Rarity }
  | { kind: "talent"; id: string };

export interface Enemy {
  id: number;
  alive: boolean;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dmg: number;
  contactCd: number;
  shotCd: number;
  burnUntil: number;
  burnDps: number;
  chillUntil: number;
  chillSlow: number;
  chillStacks: number;
  freezeUntil: number;
  stunUntil: number;
  hitAt: number;
  /** Босс: обратный отсчёт телеграфа удара (тики) и позиция удара. */
  slamT: number;
  slamX: number;
  slamY: number;
  slamCd: number;
  /** Rupture (Bloodseeker): до какого тика и сколько урона за 100 px пройденного пути; lastX/lastY — позиция на прошлом тике. */
  ruptureUntil: number;
  ruptureDps: number;
  lastX: number;
  lastY: number;
  /** Corrosive Haze (Slardar): до какого тика цель получает на ampMult больше урона. */
  ampUntil: number;
  ampMult: number;
  /** Осквернитель (T13.41): после окна контроля — иммунитет к повторному до этого тика. */
  ccResistUntil: number;
  /** Кентавр (T13.45): рывок — направление и оставшийся путь (−1 = телеграф рывка идёт); попал ли уже в героя. */
  chargeDx: number;
  chargeDy: number;
  chargeLeft: number;
  chargeHit: boolean;
  /** Яд (T13.39): стаки с общим таймером; урон за тик = poisonDps × стаки × tickShare (ARCADE.poison). */
  poisonUntil: number;
  poisonStacks: number;
  poisonDps: number;
}

export interface Projectile {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  ttl: number;
  pierce: number;
  hits: number[];
  kind: "fire" | "shard" | "siege" | "zap" | "arrow";
  fromEnemy: boolean;
  /** Снаряд автоатаки: попадание идёт через onAttackHit (криты, статусы школ, вампиризм). */
  attack: boolean;
}

/** Руна щедрости (T13.7): взял — 60 с двойного спавна и опыта ценой постоянного усиления врагов. */
export interface Shrine {
  alive: boolean;
  x: number;
  y: number;
  /** Тик исчезновения, если не взяли. */
  until: number;
}

/** Точка на карте с таймером жизни: торговец Secret Shop, bounty-руна. */
export interface Spot {
  alive: boolean;
  x: number;
  y: number;
  until: number;
  value: number;
}

/** Структурный тип предмета экипировки (полный — content/gear.ts GearItem). */
export interface GearLike {
  uid: string;
  base: string;
  slot: string;
  rarity: Rarity;
  tier: 1 | 2 | 3;
  affixes: { stat: string; value: number }[];
  unique?: string;
}

export interface ArcadeOptions {
  /** Ступень лестницы сложности 0..39 (content/ranks.ts). */
  rank?: number;
  /** Герой (content/heroes.ts); по умолчанию Juggernaut. */
  hero?: string;
  /** Акт: `short` — разминка до 9:00 (срез 0), `full` — 20 минут до Древнего. */
  act?: ActId;
  /** Надетая экипировка на старте (из инвентаря между забегами); дейлик — без неё. */
  gear?: GearLike[];
  /** Снимок «Наследия Aegis» (T13.44): множители hp/damage/pickup; дейлик и старые реплеи — без него. */
  legacy?: { hp: number; damage: number; pickup: number };
}

/** `dire` — акт 2: ночь (обзор ограничен) и лес Dire (враги крепче и быстрее). `river` — акт 3: река с рунами
 *  и яма Рошана в центре карты (босс привязан к яме, спавн не глушится, пока ты снаружи). */
export type ActId = "short" | "full" | "dire" | "river";

export interface Shard {
  alive: boolean;
  x: number;
  y: number;
  xp: number;
}

export type FxKind = "hit" | "crit" | "slash" | "nova" | "zap" | "burst" | "heal" | "revive" | "levelup" | "spin" | "die" | "ash";

/** Монотонные счётчики событий для звука и juice на стороне экрана: дельта между кадрами —
 *  «что случилось», без подписки на сим и без влияния на детерминизм. */
export interface ArcadeEventCounters {
  hits: number;
  crits: number;
  casts: number;
  ults: number;
  hurt: number;
  kills: number;
  eliteKills: number;
  pickups: number;
  /** Касты по кнопкам (звук умения героя) и вид последнего врага, ударившего героя (индекс KIND_INDEX, −1 — снаряд/неизвестно). */
  castQ: number;
  castW: number;
  castE: number;
  castR: number;
  hurtBy: number;
  /** Очищенные лагеря (T13.40) — звук и juice награды. */
  camps: number;
  /** Захваченные аванпосты (T13.42). */
  outposts: number;
}

/** Роща Кентавра-Стража (T13.45): дом чемпиона по seed; `engaged` — разбужен, `rocks` — камней рядом (для рывка в камень). */
export interface Grove { x: number; y: number; engaged: boolean; rocks: number }

/** Курган Тролля-Некроманта (T13.46): дом чемпиона по seed; `engaged` — разбужен; `idolsDown` — снесено идолов; `nextRaiseAt` — следующий подъём. */
export interface Barrow { x: number; y: number; engaged: boolean; idolsDown: number; nextRaiseAt: number }

/** Лотосовый пруд (T13.43): одно использование на забег — лечение или снятие порчи. */
export interface Pond { x: number; y: number; used: boolean }

/** Порчи забега (T13.43). `withering` — лечение и регенерация ослаблены до снятия у пруда. */
export type CurseId = "withering";

/** Аванпост (T13.42): точка захвата по seed; прогресс в тиках копится только рядом и не сбрасывается. */
export interface Outpost {
  x: number;
  y: number;
  progress: number;
  need: number;
  captured: boolean;
}

/** Заражённый лагерь (T13.40): позиция по seed, счёт снесённых тотемов, состояние очищения. */
export interface Camp {
  x: number;
  y: number;
  totems: number;
  destroyed: number;
  cleared: boolean;
  /** Лагерь разбужен (T13.41): герой вошёл во внутреннее кольцо или ударил тотем/Сатира; отпускает за engageRadius.
   *  Без этого кайтящий герой будил лагерь с 460 px и влетал в Сатира на первой минуте (бот: победы 27→15%). */
  engaged: boolean;
  /** Тик следующей охраны, пока герой в лагере. */
  nextGuardAt: number;
  /** Полоса порчи между двумя тотемами (T13.41): телеграф до `telegraphUntil`, бьёт до `activeUntil`. */
  line: { ax: number; ay: number; bx: number; by: number; telegraphUntil: number; activeUntil: number } | null;
  nextLineAt: number;
  lineHitAt: number;
}

export interface Fx {
  kind: FxKind;
  x: number;
  y: number;
  x2: number;
  y2: number;
  born: number;
  dur: number;
  value: number;
}

export interface PlayerStats {
  maxHp: number;
  regen: number;
  armor: number;
  speed: number;
  damage: number;
  attackInterval: number;
  range: number;
  critChance: number;
  critMult: number;
  pickup: number;
  lifesteal: number;
  goldPerKill: number;
  xpMult: number;
  stunImmune: boolean;
  cleave: number;
  cooldown: number;
}

export interface Player {
  x: number;
  y: number;
  hp: number;
  level: number;
  xp: number;
  xpNext: number;
  gold: number;
  kills: number;
  facingX: number;
  facingY: number;
  /** Направление последней атаки и до какого тика спрайт смотрит туда (владелец 2026-09-06: «стреляет вперёд, снаряд летит назад»). */
  aimX: number;
  aimY: number;
  aimUntil: number;
  attackCd: number;
  stunUntil: number;
  invulnUntil: number;
  aegis: boolean;
  aegisUsed: boolean;
  abilities: Record<AbilityKey, number>;
  cooldowns: Record<AbilityKey, number>;
  /** Автокаст по умениям (владелец 2026-09-06: «умения не должны нажиматься сами, пока не включишь»).
   *  В симе по умолчанию включён — так гоняются бот калибровки и старые реплеи; экран выключает его
   *  на старте забега через `act` (см. AUTOCAST_ACT), поэтому состояние всегда попадает в input-лог. */
  autoCast: Record<AbilityKey, boolean>;
  /** Автоатака: выключена — герой бьёт только по команде (бит ATTACK_MASK во вводе). */
  autoAttack: boolean;
  /** Активные эффекты способностей (общие для видов): вихрь/поле до тика, тотем, серия ударов, зона, бафы. */
  spinUntil: number;
  wardUntil: number;
  wardX: number;
  wardY: number;
  burstLeft: number;
  burstNextAt: number;
  fieldUntil: number;
  zoneUntil: number;
  zoneX: number;
  zoneY: number;
  armorBuffUntil: number;
  /** Фирменная пассивка (heroes.ts signature): стаки (души/ярость), цель серии, таймер/взвод эффекта. */
  stacks: number;
  stackTarget: number;
  sigUntil: number;
  /** Легендарка «Лотос»: до какого тика отражение урона на перезарядке. */
  lotusUntil: number;
  /** Reincarnation (Wraith King): тик, с которого пассивка снова готова. */
  reincAt: number;
  /** Смена формы (Metamorphosis, Elder Dragon Form, True Form): до какого тика герой в альтернативной форме.
   *  В форме меняются модель (лист `<hero>@meta`), тип атаки и дальность — см. AbilityDef.form. */
  formUntil: number;
  sigArmed: boolean;
  /** Бафы собственных китов: ярость (×урон), исступление (скорость атаки), уклонение, вытягивание жизни. */
  rageUntil: number;
  rageMult: number;
  frenzyUntil: number;
  frenzyMult: number;
  evadeUntil: number;
  evadeChance: number;
  drainUntil: number;
  drainTarget: number;
  hasteUntil: number;
  /** Руны: двойной урон до тика, щит (запас и срок), магия (короче перезарядки) до тика. */
  ddUntil: number;
  shieldHp: number;
  shieldUntil: number;
  arcaneUntil: number;
  /** Школы в порядке взятия (макс. 3) и суммарная «сила» апгрейда (ранги × множитель редкости). */
  schools: SchoolId[];
  /** `cap` — потолок рангов у этого апгрейда: базовый `maxRank` плюс надбавка за редкость,
   *  с которой его брали (см. `ARCADE.rarity.rankBonus`). Растёт, если попался вариант реже. */
  upgrades: Record<string, { rank: number; power: number; cap: number }>;
  talents: string[];
  /** Инвентарь Secret Shop — до 6 слотов, как в Dota. */
  items: { id: string; rarity: Rarity }[];
  /** Нейтральный слот (один): id из content/neutrals.ts или null. */
  neutral: string | null;
  /** Зачарование надетой нейтралки (content/neutrals.ts NEUTRAL_ENCHANTS) или null. */
  neutralEnchant: string | null;
  /** Активная порча забега (T13.43); null — чист. */
  curse: CurseId | null;
  /** Экипировка (T13.14): надетое по слотам и сумка забега. Типы — content/gear.ts (без импорта: цикл). */
  gear: Record<string, GearLike>;
  bag: GearLike[];
  stats: PlayerStats;
  /** Таймеры периодических эффектов школ (тик следующего срабатывания). */
  ringAt: number;
  shardsAt: number;
  staticAt: number;
  /** Таймеры школы Venom (T13.47): облако и клыки. */
  cloudAt: number;
  fangsAt: number;
}

export interface ArcadeOutcome {
  outcome: "dead" | "victory";
  tick: number;
  level: number;
  kills: number;
  gold: number;
  schools: SchoolId[];
  upgrades: string[];
  roshanKilled: boolean;
  rank: number;
  greedStacks: number;
  items: string[];
  hero: string;
  act: ActId;
  neutral: string | null;
  /** Добыча забега: всё подобранное (надетое новое + сумка) — уходит в инвентарь. */
  loot: GearLike[];
  /** Очищенные лагеря порчи (T13.40). */
  campsCleared: number;
  /** Аванпост захвачен (T13.42). */
  outpostCaptured: boolean;
  /** Принятых порч за забег и осталась ли порча к концу (T13.43). */
  cursesTaken: number;
  cursed: boolean;
  /** Кентавр-Страж рощи убит (T13.45). */
  centaurSlain: boolean;
  /** Тролль-Некромант убит (T13.46). */
  necromancerSlain: boolean;
}
