// Экономический слой Roguelite Run (T5.2, срезы 2–3). Чистый модуль ПОВЕРХ AnteRunEngine —
// движок ante-петли и турнир не трогаем (скилл game-state-architecture: экономика — часть
// stage-оркестрации, отдельным слоем, не вливать в RunEngine/TournamentEngine).
//
// Между этапами игрок попадает в Буткемп (Camp): за пройденный этап начисляются призовые
// (валюта = «золото»), затем Reward (выбор 1 из 3) и Market (3 рычага над слагаемыми
// Team OVR + reroll). Срез 2 хранит stat-дельты, срез 3 позволяет карточке нести payload
// конкретного player/hero swap; саму мутацию выполняет RunEngine, экономика только валидирует
// цену, списывает золото и фиксирует оффер. Сила сбрасывается с забегом.
//
// Детерминизм: `seed + campId + rerollN ⇒ те же офферы`. Числа — placeholder-конфиг ECONOMY
// в одном месте (кандидат в balanceConfigVersion, точная калибровка — §10.F, после T6.3).
// Редкость героев остаётся отдельным срезом 3b.
import { Rng } from "./rng.ts";
import { ACT_LENGTH, placementWorstRank } from "./anteRun.ts";
import { chargeCapForRarity, EDITION, type CardEdition } from "./editions.ts";
import type { PlacementKey } from "./tournament.ts";
import type { CandidateRef } from "./packs.ts";
import { TACTIC_IDS, TACTIC_SLOTS, isTacticId } from "./tactics.ts";
import { CAMP_ACTION_IDS, CAMP_ACTION_SLOTS, campActionDef, isCampActionId } from "./campActions.ts";
import { ITEM_IDS, evaluateItems, hasPowerEffect, isItemId } from "./items.ts";
import { rollHeroRarity, upgradeCost } from "./heroRarity.ts";
import { nextRarity, RARITIES, rarityRank, rollRarity, type Rarity } from "./rarity.ts";

/** Слагаемое Team OVR, на которое действует покупка. */
export type Summand = "base" | "heroSynergy" | "chemistry";

/** Эффект покупки: прибавка к слагаемому и опциональный trade-off по другому слагаемому. */
export interface StatEffect {
  summand: Summand;
  delta: number;
  tradeoffSummand?: Summand;
  tradeoffDelta?: number;
}

export interface SummandValues {
  base: number;
  heroSynergy: number;
  chemistry: number;
}

export interface PlayerSwapEffect {
  slotIndex: number;
  outgoingAccountId: number;
  incoming: CandidateRef;
}

export interface HeroSwapEffect {
  outgoingHeroId: number;
  incomingHeroId: number;
  /** Качество, с которым герой ПРИДЁТ (R4.1). Едет на самом оффере, поэтому цена, превью на
   *  карточке и результат покупки читают одно значение вместо трёх независимых роллов — именно
   *  расхождение этих роллов было багом первого забега. Legacy-офферы поля не имеют ⇒ common. */
  incomingRarity?: Rarity;
}

/** `reroll`/`quality` — награды-«токены» (R4.3): дают не силу и не деньги, а возможность искать
 *  и улучшать. Нужны, чтобы выбор награды был между РАЗНЫМИ видами пользы, а не между «мало
 *  золота» и «много золота» — вторая всегда доминировала первую, и выбора не было. */
export type OfferKind = "stat" | "gold" | "player" | "hero" | "tactic" | "item" | "action" | "reroll" | "quality";

/**
 * Какой слот займёт карточка этого вида; `null` — карточка слотов не занимает (золото, стат-рычаг).
 *
 * Единственное место, где живёт правило «предмет занимает ТОТ ЖЕ пассивный слот, что и тактика»
 * (PRD §5.10.1 запрещает второй инвентарь). Раньше правило существовало в двух копиях: в
 * `canTakeCard` — верной, и в JSX Буткемпа — забывшей про `item`. Копия в UI и дала `R13.1`: у
 * предмета не было бейджа слота, а при полных слотах кнопка оставалась активной и клик молча
 * проваливался. Чистая функция + тест делают этот класс ошибки невозможным: новый вид оффера
 * обязан быть разобран здесь, а не в каждом экране заново.
 */
export function cardSlotKind(kind: OfferKind): "tactic" | "action" | null {
  if (kind === "tactic" || kind === "item") return "tactic";
  if (kind === "action") return "action";
  return null;
}

/** Оффер награды/рынка. Единый контракт для Reward и Market — задел под карточки T6.1. */
export interface Offer {
  id: string;
  kind: OfferKind;
  /** Ключ i18n для подписи. */
  labelKey: string;
  /** Цена в золоте (0 для бесплатного выбора reward). */
  cost: number;
  /** Эффект (kind "stat"). */
  effect?: StatEffect;
  /** Прибавка золота (kind "gold", а также небольшая доплата к токен-наградам). */
  goldGain?: number;
  /** Сколько токенов выдаёт награда (kind "reroll" — бесплатные реролы рынка,
   *  kind "quality" — бесплатные улучшения качества героя). */
  tokens?: number;
  /** Конкретная перестройка ростера (slice 3). */
  playerSwap?: PlayerSwapEffect;
  heroSwap?: HeroSwapEffect;
  /** Карта не меняет героя, а поднимает тир УЖЕ активного (R14.8) — зеркало `cardUpgrade` у
   *  предметов. Ростер не трогается, career-связка «игрок×герой» сохраняется; цена — сумма шагов
   *  лестницы улучшения (`upgradePathCost`), то есть ровно столько же, сколько стоил бы грайнд
   *  того же пути в разделе Preparation. */
  heroUpgrade?: { heroId: number; targetRarity: Rarity };
  /** id карточки Tactics/Camp Action (kind "tactic"/"action", срез 4). */
  cardId?: string;
  /** Тир карточки-предмета (kind "item", R11.2). Едет на оффере по той же причине, что качество
   *  героя: превью, описание и то, что реально ляжет в слот, обязаны читать ОДНО значение. */
  cardRarity?: Rarity;
  /** Карточка не новая, а поднимает тир УЖЕ экипированного предмета (R14.3). Второго экземпляра и
   *  второго слота не появляется — это тот же ход, что `upgradeHeroRarity` у героев. */
  cardUpgrade?: boolean;
  /** Edition карточки (R13.5): выпадает на поздних актах отдельным роллом. Едет на оффере по той
   *  же причине, что cardRarity: превью и то, что реально ляжет в слот, читают ОДНО значение. */
  cardEdition?: CardEdition;
  /** Реальный scoreTeam breakdown и auto-assignment до/после структурной покупки. */
  preview?: {
    before: SummandValues;
    after: SummandValues;
    beforeAssignment?: Record<number, number>;
    afterAssignment?: Record<number, number>;
  };
}

/** Суммарные модификаторы по слагаемым от всех применённых покупок забега. */
export interface SummandModifiers {
  base: number;
  heroSynergy: number;
  chemistry: number;
}

/** Сериализуемое состояние экономики (persist/resume). */
export interface RunEconomyState {
  gold: number;
  /** Применённые stat-эффекты (reward + market), источник модификаторов. */
  applied: StatEffect[];
  /** id купленных market-офферов (скрыть при ре-рендере/reroll). */
  consumed: string[];
  /** id выбранной reward-карты текущего Буткемпа, иначе null. */
  chosenRewardId: string | null;
  /** camp'ы, за которые уже начислены призовые (идемпотентность). */
  awardedCamps: number[];
  /** Индекс этапа, для которого открыт текущий Буткемп (сид офферов). */
  campStageIndex: number;
  /** Игрок сейчас в Буткемпе (маршрутизация resume). */
  inCamp: boolean;
  /** Счётчик reroll рынка текущего Буткемпа (сид офферов). */
  marketRerolls: number;
  /** Контекстные офферы среза 3 фиксируются в сейве: оставшиеся карты не меняются
   *  после первой покупки и воспроизводятся в точности при resume. */
  preparedMarketOffers?: Offer[];
  /** Все карточки, уже выданные забегу. Дубликаты не вводим (PRD §5.10.5), поэтому список
   *  только растёт: сброшенная тактика не выпадет повторно. */
  ownedCards: string[];
  /** Карточный reward-оффер, зафиксированный на открытии Буткемпа. Держим отдельно, иначе после
   *  взятия карты пул ownedCards растёт и оффер бы «мутировал» в другую карту под тем же id. */
  preparedRewardCard?: Offer | null;
  /** Экипированные пассивные Tactics (срез 4). Хранятся строками: карточка, выпавшая из
   *  набора между версиями, при resume молча отбрасывается, а не роняет забег. */
  equippedTactics: string[];
  /** Одноразовые Camp Actions в слотах, ещё не разыгранные. */
  heldActions: string[];
  /** Разыгранные Camp Actions: временный эффект живёт до следующего Буткемпа. */
  temporary: Array<{ effect: StatEffect; campId: number }>;
  /** Буткемпы, в которых сыграна разведка (раскрывает следующий этап). Карточка Scouting и
   *  покупка разведки за золото пишут в ОДИН список: для игры это одно и то же знание. */
  scoutedCamps: number[];
  /** Куплено усиленной подготовки в ТЕКУЩЕМ Буткемпе (T5.9). Цена геометрическая, поэтому счётчик
   *  и есть цена; сбрасывается на `openCamp` — синк живёт внутри лагеря, а не копится забегом. */
  prepPurchases: number;
  /** Сколько раз пере-роллено правило этапа: `stageIndex → число реролов`. Ключ строкой, потому что
   *  это JSON-сейв. Само правило остаётся чистой функцией от seed+stage+n (bossConditions). */
  bossRerolls: Record<string, number>;
  /** Титулы Династии, за которые уже выдана награда (T5.8). Список, а не счётчик: он же даёт
   *  идемпотентность — resume и повторный вход в лагерь не выдадут milestone второй раз. */
  dynastyMilestones: number[];
  /** Бесплатные рероллы рынка, накопленные разведкой. */
  freeMarketRerolls: number;
  /** Бесплатные замены игрока, накопленные stand-in. */
  freePlayerSwaps: number;
  /** Бесплатные улучшения качества героя (награда-токен, R4.3). */
  freeRarityUpgrades: number;
  /** Из чего сложилась последняя автоматическая выплата — чтобы Буткемп мог показать
   *  «призовые + проценты» раздельно, а не одно непрозрачное число. */
  lastPayout?: { prize: number; performance: number; interest: number };
  /** Тир взятых карточек-предметов (id → редкость, R11.2). Отдельная карта, а не поле внутри
   *  `equippedTactics`: слоты хранят строки, и превращать их в объекты значило бы переписывать
   *  формат сейва там, где новая ось прекрасно живёт зеркалом `heroRarity`. Записи нет ⇒ common. */
  cardRarity: Record<string, Rarity>;
  /** Trade-in (LG1): счётчик рероллов тройки офферов в ТЕКУЩЕМ Буткемпе; сбрасывается на
   *  openCamp — та же семантика, что у marketRerolls. */
  tradeRerolls: number;
  /** Edition карточки (R13.5): id → "charged". Вторая ось поверх качества, живёт тем же зеркалом,
   *  что cardRarity. Записи нет ⇒ обычная карта. */
  cardEditions: Record<string, CardEdition>;
  /** Заряды Charged-карт: id → 0..chargeCapOf(id) (потолок по тиру карты). Начисляются за пройденный этап с
   *  ВЫПОЛНЕННЫМ условием карты (accrueCharges), сгорают при поломке условия. */
  cardCharges: Record<string, number>;
  /** Редкость героев забега (heroId → тир), срез 3b. Стартовый драфт весь common (записей нет);
   *  re-pick роллит редкость, «улучшение» бампит тир. Хранится напрямую → resume без ре-ролла. */
  heroRarity: Record<string, Rarity>;
  /** Мета-гейт СЛУЧАЙНЫХ дропов повышенного качества: в первом-ever забеге всё, что приходит с
   *  рынка, — common. Ставится на старте из careerStore, персистится, чтобы не «включиться»
   *  посреди забега. */
  rarityDropsEnabled: boolean;
  /** Ручное улучшение качества в Буткемпе. Доступно **с первого забега**: это не лут, а осознанная
   *  трата золота, и именно она знакомит игрока с системой качества.
   *
   *  Раньше оба поведения глушил один флаг `rarityEnabled` — и первый забег оставался вообще без
   *  качества героев (баг PF-8). Legacy-сейвы читаются через `normalizeEconomyState`. */
  rarityUpgradesEnabled: boolean;
  /** Cheat Mode: золото бесконечно (R2.2). Хранится булевым флагом, а НЕ числовым `Infinity` —
   *  `JSON.stringify(Infinity) === "null"`, на этой грабле уже горели рероллы Easy.
   *  Обходит ровно одну вещь — проверку и списание золота. Бесплатные токены (реролл/свап),
   *  слоты карточек и структурная валидация работают как обычно: одно правило, один тест. */
  unlimitedGold: boolean;
}

/** Сейв мог быть записан до разделения флагов редкости (R3.1). Поднимаем legacy `rarityEnabled`
 *  в обе новые оси, чтобы уже идущий забег не менял правила на середине. Резкой миграции не
 *  требуется: `BALANCE_CONFIG_VERSION` всё равно инвалидирует несовместимый roguelite-resume,
 *  это лишь мягкий фолбэк на случай совместимой версии. */
function normalizeEconomyState(initial: RunEconomyState): RunEconomyState {
  const legacy = (initial as RunEconomyState & { rarityEnabled?: boolean }).rarityEnabled;
  if (legacy == null) return initial;
  return {
    ...initial,
    rarityDropsEnabled: initial.rarityDropsEnabled ?? legacy,
    rarityUpgradesEnabled: initial.rarityUpgradesEnabled ?? legacy,
  };
}

/** Баланс-коэффициенты (часть BALANCE_CONFIG_VERSION — правишь числа, бампай версию в balance.ts).
 *  Placeholder. Точная калибровка — отдельный balance spec (§10.F), инструмент — `npm run sim`.
 *  Ориентир: поле растёт ANTE_FIELD_STEP=3 очка/этап, покупка должна давать сопоставимый
 *  прирост Team OVR, чтобы усиливаться было обязательно, но одной покупки не хватало «на всё». */
export const ECONOMY = {
  /** Реролл рынка дорожает ВНУТРИ одного Буткемпа и сбрасывается в следующем (R4.2, принцип
   *  магазина Balatro): `2 → 3 → 4 → …`. Ограничивает принудительный поиск идеальной карты —
   *  раньше цена была плоской, и при накопленном золоте рынок можно было крутить бесконечно. */
  rerollCostBase: 2,
  rerollCostStep: 1,
  /** Доля стоимости текущей формы, засчитываемая при апгрейде той же личности (R5.3). */
  formTradeInRate: 0.6,
  formUpgradeMinCost: 1,
  /** Базовые призовые первого этапа; каждый следующий пройденный этап добавляет stageStep. */
  prizeBase: 3,
  prizeStageStep: 1,
  /** Максимальный бонус за результат внутри пройденного порога (первое место). */
  prizePerformanceMax: 3,
  /** Золотая reward-карта растёт вместе с этапом, но рынок сохраняет фиксированные цены.
   *  Раньше их было ДВЕ (`small`/`large`), и большая строго доминировала меньшую — выбор был
   *  фиктивным. Осталась одна, а конкурируют с ней содержательно другие награды (R4.3). */
  rewardGold: { base: 6, stageStep: 2 },
  /** Награда-«поиск»: бесплатные реролы рынка + небольшая доплата золотом. Ценность выросла
   *  вместе с дорожающим реролом (R4.2) — теперь это реальная альтернатива деньгам. */
  rewardReroll: { tokens: 2, gold: 2 },
  /** Награда-«качество»: бесплатные улучшения тира героя. */
  rewardQuality: { tokens: 1 },
  /** Шанс, что билд-карта Буткемпа окажется улучшением уже стоящего предмета, а не новой картой
   *  (R14.3) — при условии, что улучшать есть что. Отдельный шаг, а не лишняя запись в общем пуле:
   *  в пуле 43 карточки, и одна добавленная давала бы ~2% за лагерь, то есть ось роста, которой на
   *  практике не существует. Плейсхолдер до калибровки `npm run sim`. */
  cardUpgradeChance: 0.35,
  /** Проценты за накопление (R4.3): +1 золото за каждые `interestPerGold` на руках, но не больше
   *  `interestCap`. Начисляются автоматически вместе с призовыми и создают выбор «потратить
   *  сейчас против накопить». В Cheat Mode не начисляются: бесконечное золото их обессмысливает. */
  interestPerGold: 6,
  interestCap: 3,
  /** Trade-in карты билда (LG1, R12.6): цена обмена «карта слота → новая из невзятого пула с
   *  переносом тира −1». Смена оси должна стоить как рост, а не быть бесплатным перебором.
   *  Реролл тройки офферов — та же лестница, что у рынка (`rerollCostFor`), со своим счётчиком.
   *  Калибровка A/B 400 сидов --dynasty (2026-08-10): цена 4 давала synergy-build 78.5% против
   *  46.3% базы — прямой рычаг силы; цена 8 таксует ранний перебор (63.7%), сохраняя весь
   *  прирост «осмысленности» актов 3–5 (69/44/28% против 62/34/23% базы). */
  tradeInCost: 8,
  /** Размер тройки trade-in офферов. */
  tradePackSize: 3,
  /** Поздние синки (T5.9). Замер Династии показал не «тонкий рынок», а ПОЛНОЕ насыщение: игрок
   *  приходит в лагерь с ~900 золота, из 8.9 карт рынка плюс даёт 0.08, качество героев на
   *  максимуме в 100% лагерей, слоты карточек полны в 99%. Купить нечего ни за какие деньги,
   *  поэтому Буткемп на глубине — клик «дальше».
   *
   *  Общая форма синка: **расходуемый, повторяемый, с ГЕОМЕТРИЧЕСКИ растущей ценой**. Геометрия —
   *  не украшение, а несущее условие: доход растёт линейно по этапу, угроза акта — квадратично,
   *  поэтому линейный по цене синк рано или поздно либо не поглощает накопленное, либо превращает
   *  золото в бесконечный `+OVR` и ломает главную посылку Династии («штатный финал — Loss»).
   *  При цене `base · growth^n` накопленные деньги покупают лишь `log` от суммы: 900 золота — это
   *  пять подготовок (`20+40+80+160+320`), а не сорок пять. */
  prep: { delta: 1, summand: "base" as Summand, costBase: 20, costGrowth: 2 },
  bossReroll: { costBase: 12, costGrowth: 2 },
  /** Разведка за золото: то же раскрытие, что даёт карточка Scouting, но без карточки. Одна на
   *  лагерь (раскрывать уже раскрытое незачем), поэтому цена плоская — геометрии тут негде расти. */
  scoutPrice: 8,
  /** Milestone Династии (T5.8): что даёт взятый титул за пройденный акт ЗА пределами сезона.
   *  Династия не имеет терминальной победы, поэтому её единственная валюта смысла — растущий
   *  билд: титул платит тем, чего на этом этапе забега уже не купить рынком (готовое улучшение
   *  качества) плюс деньгами. Плейсхолдер, как остальная ECONOMY. */
  dynastyMilestone: { gold: 10, rarityUpgrades: 1 },
  /** Рычаги рынка по слагаемым. `step`/`costStep` — разброс качества при reroll. */
  levers: {
    base: { delta: 3, step: 1, cost: 5, costStep: 2, tradeoff: { summand: "chemistry" as Summand, delta: -1 } },
    heroSynergy: { delta: 2, step: 0.5, cost: 5, costStep: 2, tradeoff: undefined },
    chemistry: { delta: 2, step: 0.5, cost: 4, costStep: 2, tradeoff: undefined },
  },
} as const;

const MARKET_SUMMANDS: readonly Summand[] = ["base", "heroSynergy", "chemistry"];

/** Цена очередного реролла в ТЕКУЩЕМ Буткемпе. Чистая: UI и движок обязаны считать одинаково. */
export function rerollCostFor(rerollsInCamp: number): number {
  return ECONOMY.rerollCostBase + Math.max(0, Math.floor(rerollsInCamp)) * ECONOMY.rerollCostStep;
}

/** Цена n-й покупки повторяемого синка. Чистая: UI и движок обязаны считать одинаково — тот же
 *  контракт, что у `rerollCostFor`. Геометрия обрывает конвертацию накоплений в силу (см. ECONOMY.prep). */
function sinkCostFor(base: number, growth: number, purchases: number): number {
  return Math.round(base * growth ** Math.max(0, Math.floor(purchases)));
}

/** Цена очередной усиленной подготовки в ТЕКУЩЕМ Буткемпе. */
export function prepCostFor(purchases: number): number {
  return sinkCostFor(ECONOMY.prep.costBase, ECONOMY.prep.costGrowth, purchases);
}

/** Цена очередной смены правила этапа. Считается по реролам ЭТОГО этапа: правило одно на этап,
 *  и его перебор не должен дешеветь от того, что предыдущий босс был перекуплен пять этапов назад. */
export function bossRerollCostFor(rerolls: number): number {
  return sinkCostFor(ECONOMY.bossReroll.costBase, ECONOMY.bossReroll.costGrowth, rerolls);
}

/** Цена игрока в паке-рулетке растёт с его OVR: сильный дороже, слабый доступен рано (Balatro-
 *  ценообразование). Placeholder под balance spec (§10.F). */
export function playerCost(ovr: number): number {
  return Math.max(2, Math.round((ovr - 60) / 4));
}

/** Цена апгрейда ФОРМЫ той же личности (R5.3): за человека уже заплачено, поэтому старая форма
 *  идёт в зачёт. Без trade-in игрок платил бы полную цену второй раз за того же игрока, и апгрейд
 *  формы был бы всегда хуже покупки нового человека той же силы.
 *  Нижняя граница не даёт сделать сильный сайдгрейд бесплатным. */
export function formUpgradeCost(incomingOvr: number, currentOvr: number): number {
  const incoming = playerCost(incomingOvr);
  const credit = Math.floor(playerCost(currentOvr) * ECONOMY.formTradeInRate);
  return Math.max(ECONOMY.formUpgradeMinCost, incoming - credit);
}

/** Доступна ли покупка игрока: stand-in делает ОДНУ замену бесплатной, поэтому при наличии
 *  бесплатного свапа карта доступна независимо от цены. UI обязан считать так же, как движок
 *  (purchaseMarket), иначе дорогая карта остаётся заблокированной при живом бесплатном свапе. */
export function playerOfferAffordable(
  cost: number,
  gold: number,
  freePlayerSwaps: number,
  unlimitedGold = false,
): boolean {
  return unlimitedGold || freePlayerSwaps > 0 || cost <= gold;
}

/** Суммарные дельты по слагаемым от применённых stat-эффектов. Чистая — переиспользуется и в
 *  RunEconomy, и в UI (турнирный экран показывает effective OVR, совпадающий с полем). */
export function summandModifiers(applied: StatEffect[]): SummandModifiers {
  const mod: SummandModifiers = { base: 0, heroSynergy: 0, chemistry: 0 };
  for (const e of applied) {
    mod[e.summand] += e.delta;
    if (e.tradeoffSummand && e.tradeoffDelta) mod[e.tradeoffSummand] += e.tradeoffDelta;
  }
  return mod;
}

/** Сложить модификаторы разных слоёв (покупки экономики + условные Tactics). */
export function addModifiers(a: SummandModifiers, b: SummandModifiers): SummandModifiers {
  return {
    base: a.base + b.base,
    heroSynergy: a.heroSynergy + b.heroSynergy,
    chemistry: a.chemistry + b.chemistry,
  };
}

/** Индекс Camp — номер только что пройденного этапа, 1-based. Старые/битые нули трактуем как 1. */
function clearedStage(campStageIndex: number): number {
  return Math.max(1, Math.floor(campStageIndex));
}

function stageGold(base: number, stageStep: number, campStageIndex: number): number {
  return base + (clearedStage(campStageIndex) - 1) * stageStep;
}

/** Призовые = растущая база этапа + нормализованный бонус за overperformance.
 *  Нормализация важна: первое место даёт одинаковый максимум +3 и при top-10, и при top-3,
 *  поэтому широкий ранний порог не печатает в несколько раз больше золота, чем поздний.
 *
 *  Раздельно, а не одним числом: с R6.4 премия за место несёт продуктовую нагрузку — на финале
 *  4-го акта чемпионство перестало быть условием прохода и стало ровно этой премией. Награда,
 *  слитая с базой в одно «+7», игроком не читается, то есть её как будто нет. */
export function prizeBreakdown(
  placement: PlacementKey | null,
  target: number,
  campStageIndex: number,
): { base: number; performance: number } {
  const base = stageGold(ECONOMY.prizeBase, ECONOMY.prizeStageStep, campStageIndex);
  if (placement == null || target <= 1) return { base, performance: 0 };
  const rank = placementWorstRank(placement);
  if (rank >= target) return { base, performance: 0 };
  const progressToFirst = (target - rank) / (target - 1);
  return { base, performance: Math.round(progressToFirst * ECONOMY.prizePerformanceMax) };
}

/** Итоговые призовые этапа — сумма разбора. */
export function prizeForStage(
  placement: PlacementKey | null,
  target: number,
  campStageIndex: number,
): number {
  const { base, performance } = prizeBreakdown(placement, target, campStageIndex);
  return base + performance;
}

/** Проценты за удержанное золото. Чистая: UI показывает ровно то, что начислит движок. */
export function interestFor(gold: number, capBonus = 0): number {
  if (gold <= 0) return 0;
  return Math.min(ECONOMY.interestCap + capBonus, Math.floor(gold / ECONOMY.interestPerGold));
}

/** Что уже стоит в слотах билда и с каким качеством — нужно, чтобы понять, может ли предмет
 *  вернуться в пул наград улучшением себя же. */
export interface BuildTiers {
  /** Карточки, которые СЕЙЧАС занимают слоты. Именно экипированные, а не `ownedCards`: поднимать
   *  тир сброшенной карточки бессмысленно — обратно её уже не поставить. */
  equipped: readonly string[];
  cardRarity: Record<string, Rarity>;
  /** Edition экипированных карт — уже Charged второй раз не заряжается. */
  cardEditions?: Record<string, CardEdition>;
}

/** Ещё не полученная карточка Tactics/Camp Action, детерминированная по seed+campId.
 *  Возвращает null, когда игрок уже собрал весь набор — тогда третьим оффером остаётся
 *  прежний бесплатный stat-рычаг (срез 2), и Буткемп не выдаёт пустую карту. */
function cardOffer(
  seed: string,
  campStageIndex: number,
  owned: readonly string[],
  rarityDrops = false,
  build: BuildTiers = { equipped: [], cardRarity: {} },
): Offer | null {
  const rollFor = (id: string) => rollRarity(seed, `card-${id}`, campStageIndex);
  // Предмет, который уже стоит в слоте, возвращается в пул — но ТОЛЬКО строго более высоким тиром
  // (R14.3). Без этого ранний standard навсегда закрывал доступ к arcana той же карты: `owned`
  // отсеивал id целиком, хотя у предметов, в отличие от тактик и действий, есть ось качества.
  // Дубликата не появляется (PRD §5.10.5) — взятие поднимает тир на месте.
  const upgradable = rarityDrops
    ? ITEM_IDS.filter((id) => (
      build.equipped.includes(id)
        && rarityRank(rollFor(id)) > rarityRank(build.cardRarity[id] ?? "common")
    ))
    : [];
  // «Charged для уже взятой карты» (решение 2026-08-10): с акта 3+ оффер улучшения может прийти
  // заряжающим. Отдельный подпоток `:upgrade-edition` — существующие потоки не сдвигаются; при
  // проходе ролла в пул улучшений добавляются и МАКСИРОВАННЫЕ power-карты (у arcana это
  // единственный оставшийся путь роста — чистый edition-оффер «та же карта становится Charged»).
  const chargeRoll = campStageIndex >= ACT_LENGTH * (EDITION.minAct - 1)
    && new Rng(`${seed}:camp-${campStageIndex}:upgrade-edition`).float() < EDITION.dropChance;
  const chargeable = chargeRoll
    ? ITEM_IDS.filter((id) => (
      build.equipped.includes(id)
        && hasPowerEffect(id)
        && build.cardEditions?.[id] !== "charged"
    ))
    : [];
  // «Улучшение или новая карта» решается ОТДЕЛЬНЫМ роллом на своём потоке. Так у шанса есть
  // настраиваемое число, а поток свежих карт (`:card`) остаётся тем же, что до R14.3 — сид без
  // улучшаемых предметов выдаёт ровно прежние награды.
  const upgradeRng = new Rng(`${seed}:camp-${campStageIndex}:card-upgrade`);
  const upgradePool = [...new Set([...upgradable, ...chargeable])];
  if (upgradePool.length > 0 && upgradeRng.float() < ECONOMY.cardUpgradeChance) {
    const id = upgradeRng.pick(upgradePool);
    const tierUp = upgradable.includes(id);
    return {
      id: `rwd-${campStageIndex}-1`,
      kind: "item",
      labelKey: `item.${id}`,
      cost: 0,
      cardId: id,
      // Без роста тира оффер несёт ТЕКУЩИЙ тир карты: честный вид (arcana остаётся arcana),
      // а строгая проверка «выше текущего» в chooseReward его тиром не применит.
      cardRarity: tierUp ? rollFor(id) : (build.cardRarity[id] ?? "common"),
      cardUpgrade: true,
      ...(chargeable.includes(id) ? { cardEdition: "charged" as const } : {}),
    };
  }
  const pool = [
    ...TACTIC_IDS.filter((id) => !owned.includes(id)).map((id) => ({ kind: "tactic" as const, id })),
    // Предметы (R8.3) — такие же пассивные карточки и занимают ТЕ ЖЕ слоты, что тактики:
    // второй инвентарь рядом с Tactics PRD §5.10.1 запрещает.
    ...ITEM_IDS.filter((id) => !owned.includes(id)).map((id) => ({ kind: "item" as const, id })),
    ...CAMP_ACTION_IDS.filter((id) => !owned.includes(id)).map((id) => ({ kind: "action" as const, id })),
  ];
  if (pool.length === 0) return null;
  const rng = new Rng(`${seed}:camp-${campStageIndex}:card`);
  const card = rng.pick(pool);
  return {
    // Слот 1 — билд-карта (слот 0 = золото, слот 2 = утилита). До R4.3 карта стояла в слоте 2,
    // где теперь утилита; несовместимые сейвы отсекает bump BALANCE_CONFIG_VERSION.
    id: `rwd-${campStageIndex}-1`,
    kind: card.kind,
    labelKey: `${card.kind}.${card.id}`,
    cost: 0,
    cardId: card.id,
    // Тир — только у предметов (R11.2) и под тем же мета-гейтом, что дропы качества у героев:
    // первый забег знакомится с базовой картой, а не с масштабированной.
    ...(card.kind === "item" && rarityDrops
      ? { cardRarity: rollFor(card.id) }
      : {}),
    ...rollCardEdition(seed, campStageIndex, card.kind, card.id),
  };
}

/** Тройка trade-in офферов (LG1): невзятые ПАССИВНЫЕ карты — тактики и предметы, без Camp
 *  Actions (обмен меняет карту пассивного слота, одноразовые действия в нём не живут).
 *  Детерминизм по seed+camp+serial; ОТДЕЛЬНЫЙ Rng-поток `:trade` — существующие раздачи
 *  (`:card`, `:market`, `:edition`) не сдвигаются, seed-coupled тесты целы. */
export function tradeOffers(
  seed: string,
  campStageIndex: number,
  owned: readonly string[],
  serial: number,
): string[] {
  const pool = [
    ...TACTIC_IDS.filter((id) => !owned.includes(id)),
    ...ITEM_IDS.filter((id) => !owned.includes(id)),
  ];
  const rng = new Rng(`${seed}:camp-${campStageIndex}:trade-${serial}`);
  return rng.shuffle(pool).slice(0, ECONOMY.tradePackSize);
}

/** Тир входящей карты при trade-in: «перенос −1» с полом common. Тактики тира не имеют —
 *  отдают common (и получают common-эквивалент, если входит предмет): прогресс оси качества
 *  конвертируется со скидкой, а не бесплатно и не в ноль. */
export function tradeInRarity(outgoing: Rarity): Rarity {
  return RARITIES[Math.max(0, rarityRank(outgoing) - 1)];
}

/** Ролл Edition карточной награды (R13.5). ОТДЕЛЬНЫЙ Rng-поток: поток `:card` остаётся прежним,
 *  и сид без Edition-дропа выдаёт ровно те же награды, что до фичи (тот же приём, что у
 *  `card-upgrade` в R14.3 — иначе поехали бы все seed-coupled тесты и голден-раздачи).
 *  Гейт: поздние акты (EDITION.minAct), только карты с силовым эффектом — тактики и
 *  power-предметы; у economy/boss-карт заряду нечего усиливать. Мета-гейта первого забега нет:
 *  до третьего акта первый забег почти не доживает, а лишний гейт — лишнее правило. */
function rollCardEdition(
  seed: string,
  campStageIndex: number,
  kind: "tactic" | "item" | "action",
  cardId: string,
): { cardEdition?: CardEdition } {
  if (campStageIndex < ACT_LENGTH * (EDITION.minAct - 1)) return {};
  const eligible = kind === "tactic" || (kind === "item" && hasPowerEffect(cardId));
  if (!eligible) return {};
  const rng = new Rng(`${seed}:camp-${campStageIndex}:edition`);
  return rng.float() < EDITION.dropChance ? { cardEdition: "charged" } : {};
}

/** Три reward-оффера Буткемпа (детерминированы по seed+campId): мелкое золото, крупное золото
 *  и карточка билда. Выбор 1 из 3 (решение 2026-07-23): деньги сейчас против силы билда.
 *  `preparedCard` (если задан) — зафиксированная на openCamp карточка; иначе выводится из `owned`. */
export function rewardOffers(
  seed: string,
  campStageIndex: number,
  owned: readonly string[] = [],
  preparedCard?: Offer | null,
  qualityAvailable = true,
  rarityDrops = false,
  build?: BuildTiers,
): Offer[] {
  const rng = new Rng(`${seed}:camp-${campStageIndex}:reward`);
  const summand = rng.pick(MARKET_SUMMANDS);
  const cfg = ECONOMY.levers[summand];
  const card = preparedCard !== undefined
    ? preparedCard
    : cardOffer(seed, campStageIndex, owned, rarityDrops, build);
  const gold = stageGold(ECONOMY.rewardGold.base, ECONOMY.rewardGold.stageStep, campStageIndex);
  // Третий слот — утилита: поиск (реролы) либо качество. Выбор детерминирован по seed+camp,
  // чтобы Буткемп не «мутировал» между рендерами, и уважает мета-гейт улучшений.
  const utility: Offer = qualityAvailable && rng.int(2) === 0
    ? {
      id: `rwd-${campStageIndex}-2`,
      kind: "quality",
      labelKey: "reward.quality",
      cost: 0,
      tokens: ECONOMY.rewardQuality.tokens,
    }
    : {
      id: `rwd-${campStageIndex}-2`,
      kind: "reroll",
      labelKey: "reward.reroll",
      cost: 0,
      tokens: ECONOMY.rewardReroll.tokens,
      goldGain: ECONOMY.rewardReroll.gold,
    };
  return [
    { id: `rwd-${campStageIndex}-0`, kind: "gold", labelKey: "reward.gold", cost: 0, goldGain: gold },
    card
      ?? { id: `rwd-${campStageIndex}-1`, kind: "stat", labelKey: `reward.stat.${summand}`, cost: 0, effect: { summand, delta: cfg.delta } },
    utility,
  ];
}

/** Три market-оффера (по одному на слагаемое), качество/цена варьируются по rerollN — reroll
 *  осмыслен (гэмбл на лучшие офферы). Детерминизм по seed+campId+rerollN. */
export function marketOffers(seed: string, campStageIndex: number, rerollN: number): Offer[] {
  const rng = new Rng(`${seed}:camp-${campStageIndex}:market-${rerollN}`);
  return MARKET_SUMMANDS.map((summand) => {
    const cfg = ECONOMY.levers[summand];
    const bonus = rng.int(3); // 0..2 ступени качества
    const delta = cfg.delta + bonus * cfg.step;
    const cost = cfg.cost + bonus * cfg.costStep;
    const effect: StatEffect = cfg.tradeoff
      ? { summand, delta, tradeoffSummand: cfg.tradeoff.summand, tradeoffDelta: cfg.tradeoff.delta }
      : { summand, delta };
    return { id: `mkt-${campStageIndex}-${rerollN}-${summand}`, kind: "stat", labelKey: `market.${summand}`, cost, effect };
  });
}

/** Готовый снимок Буткемпа для рендера (UI не держит движок — читает этот вид). */
export interface CampView {
  gold: number;
  rewardChosen: boolean;
  chosenRewardId: string | null;
  rewardOffers: Offer[];
  marketOffers: Offer[];
  /** Модификаторы ЭКОНОМИКИ (покупки + временные действия). Вклад условных Tactics считается
   *  отдельно в game/tactics.ts и складывается вызывающим — он зависит от текущего ростера. */
  modifiers: SummandModifiers;
  rerollCost: number;
  canReroll: boolean;
  /** Экипированные пассивные Tactics и одноразовые Camp Actions в слотах (срез 4). */
  equippedTactics: string[];
  heldActions: string[];
  tacticSlots: number;
  actionSlots: number;
  /** Временные эффекты, действующие на следующий этап (разыгранные Camp Actions). */
  temporary: StatEffect[];
  /** В этом Буткемпе сыграна разведка — следующий этап раскрыт. */
  scouted: boolean;
  /** Поздние синки (T5.9): цена очередной покупки и хватает ли на неё золота. Считает движок —
   *  UI не имеет права показать цену, отличную от списываемой (тот же контракт, что у reroll). */
  prepCost: number;
  prepBought: number;
  canBuyPrep: boolean;
  prepDelta: number;
  bossRerollCost: number;
  canRerollBoss: boolean;
  scoutCost: number;
  canBuyScouting: boolean;
  freeMarketRerolls: number;
  freePlayerSwaps: number;
  /** Бесплатные улучшения качества героя (награда-токен). */
  freeRarityUpgrades: number;
  /** Разбор последней автоматической выплаты: база, премия за место и проценты раздельно. */
  lastPayout?: { prize: number; performance: number; interest: number };
  /** В ЭТОМ Буткемпе взят титул Династии (T5.8) — лагерь его празднует. Номер титула знает
   *  ante-состояние (`titles`), поэтому здесь только факт. */
  dynastyMilestone: boolean;
  /** Случайные повышенные качества могут выпадать (мета-гейт пройден). */
  rarityDropsEnabled: boolean;
  /** Доступно ручное улучшение качества в Буткемпе. Бейджи тира при этом показываются всегда:
   *  даже пока дропы закрыты гейтом, игрок качает героев руками и должен видеть результат. */
  rarityUpgradesEnabled: boolean;
  /** Cheat Mode: UI показывает `∞` вместо числа и не блокирует покупки по цене. */
  unlimitedGold: boolean;
  /** heroId → тир для рендера бейджей/улучшений (срез 3b). */
  heroRarity: Record<string, Rarity>;
  /** id карточки → тир для рендера бейджей и масштабированных описаний (R11.2). */
  cardRarity: Record<string, Rarity>;
  /** Trade-in (LG1): тройка офферов, цена обмена и реролла. Цены считает движок — UI не имеет
   *  права показать цену, отличную от списываемой (тот же контракт, что у reroll/prep). */
  tradeOffers: string[];
  tradeCost: number;
  tradeRerollCost: number;
  canRerollTrade: boolean;
  /** id карточки → Edition (R13.5) — бейдж и правило на карточке. */
  cardEditions: Record<string, CardEdition>;
  /** id карточки → заряды Charged — пипсы на карточке и множитель в разборе. */
  cardCharges: Record<string, number>;
  /** Индекс этапа текущего Буткемпа — для превью редкости входящих на re-pick героев. */
  campStageIndex: number;
  /** Номер раздачи рынка: растёт на каждый реролл, обнуляется на входе в лагерь. Нужен ровно тем
   *  же, чем `packSerial` в драфте, — внешним ключом раздачи (`ui/Dealt`): CSS-анимация играет
   *  только при монтировании узла, и без смены ключа перероленные карточки просто подменялись бы
   *  на месте, визуально неотличимо от «ничего не произошло». */
  marketSerial: number;
}

function emptyState(): RunEconomyState {
  return {
    gold: 0,
    applied: [],
    consumed: [],
    chosenRewardId: null,
    awardedCamps: [],
    campStageIndex: 0,
    inCamp: false,
    marketRerolls: 0,
    preparedMarketOffers: undefined,
    ownedCards: [],
    equippedTactics: [],
    heldActions: [],
    temporary: [],
    scoutedCamps: [],
    dynastyMilestones: [],
    prepPurchases: 0,
    bossRerolls: {},
    freeMarketRerolls: 0,
    freePlayerSwaps: 0,
    freeRarityUpgrades: 0,
    heroRarity: {},
    cardRarity: {},
    cardEditions: {},
    cardCharges: {},
    tradeRerolls: 0,
    rarityDropsEnabled: false,
    rarityUpgradesEnabled: true,
    unlimitedGold: false,
  };
}

/** Чистое состояние экономики забега. Без UI, без импортов из ui/state. */
export class RunEconomy {
  private state: RunEconomyState;

  constructor(private readonly seed: string, initial?: RunEconomyState) {
    this.state = initial ? { ...emptyState(), ...normalizeEconomyState(initial) } : emptyState();
  }

  /** Клон состояния для persist/рендера. */
  get snapshot(): RunEconomyState {
    return {
      ...this.state,
      applied: this.state.applied.map((e) => ({ ...e })),
      consumed: [...this.state.consumed],
      awardedCamps: [...this.state.awardedCamps],
      preparedMarketOffers: this.state.preparedMarketOffers?.map(cloneOffer),
      ownedCards: [...this.state.ownedCards],
      preparedRewardCard: this.state.preparedRewardCard ? cloneOffer(this.state.preparedRewardCard) : this.state.preparedRewardCard,
      equippedTactics: [...this.state.equippedTactics],
      heldActions: [...this.state.heldActions],
      temporary: this.state.temporary.map((t) => ({ effect: { ...t.effect }, campId: t.campId })),
      scoutedCamps: [...this.state.scoutedCamps],
      dynastyMilestones: [...this.state.dynastyMilestones],
      bossRerolls: { ...(this.state.bossRerolls ?? {}) },
      heroRarity: { ...this.state.heroRarity },
      cardRarity: { ...(this.state.cardRarity ?? {}) },
      cardEditions: { ...(this.state.cardEditions ?? {}) },
      cardCharges: { ...(this.state.cardCharges ?? {}) },
    };
  }

  get gold(): number {
    return this.state.gold;
  }

  /** Экипированные пассивные карточки (Tactics и Items — они делят слоты). Имя поля осталось
   *  прежним намеренно: это же поле лежит в сейве, и переименование стоило бы миграции ради нуля. */
  get equippedTactics(): string[] {
    return [...this.state.equippedTactics];
  }

  /** Экономические эффекты экипированных предметов. Они безусловны (не зависят от ростера),
   *  поэтому экономика вычисляет их сама и не тянет за собой знание о составе. */
  private itemEconomy() {
    return evaluateItems(this.state.equippedTactics, {
      activeHeroes: [],
      cardRarity: this.state.cardRarity ?? {},
      // Экономические слои зарядом не растут (R13.5), но контекст честный — единый вход.
      cardCharges: this.state.cardCharges ?? {},
    });
  }

  /** Временные эффекты разыгранных Camp Actions: действуют на один следующий этап. */
  private temporaryEffects(): StatEffect[] {
    return this.state.temporary.map((t) => t.effect);
  }

  /** Суммарные дельты по слагаемым от покупок забега и временных Camp Actions.
   *  Условные Tactics сюда НЕ входят: они зависят от ростера и считаются в game/tactics.ts. */
  modifiers(): SummandModifiers {
    return summandModifiers([...this.state.applied, ...this.temporaryEffects()]);
  }

  /** Итоговая прибавка к Team OVR (сумма всех модификаторов слагаемых). */
  totalModifier(): number {
    const m = this.modifiers();
    return m.base + m.heroSynergy + m.chemistry;
  }

  /** Начислить призовые за пройденный этап. Идемпотентно на camp (защита от двойного эффекта). */
  awardStageClear(campStageIndex: number, placement: PlacementKey | null, target: number): void {
    if (this.state.awardedCamps.includes(campStageIndex)) return;
    const { base, performance } = prizeBreakdown(placement, target, campStageIndex);
    // Проценты считаем с баланса, ДОнесённого до этого Буткемпа: так «накопить» — осознанное
    // решение, а не побочный эффект. В Cheat Mode бессмысленны (золото и так бесконечно).
    const items = this.itemEconomy();
    const interest = this.state.unlimitedGold
      ? 0
      : interestFor(this.state.gold, items.interestCapBonus);
    // Доход предметов идёт в ту же базу: для игрока это одна автоматическая выплата. Премия за
    // место остаётся отдельной строкой — её платит его результат, а не владение карточками.
    const prizeWithItems = Math.max(0, base + items.goldPerCamp);
    this.state.gold += prizeWithItems + performance + interest;
    this.state.lastPayout = { prize: prizeWithItems, performance, interest };
    this.state.awardedCamps.push(campStageIndex);
  }

  /** Титул Династии за пройденный акт (T5.8). Идемпотентно по лагерю: список выданных титулов
   *  живёт в сейве, поэтому ни resume, ни повторный вход в лагерь награду не удвоят.
   *
   *  Платит тем, чего на этом этапе забега уже не купить: готовым улучшением качества (рынок к
   *  Династии предлагает в основном равное, а не лучшее) плюс деньгами. */
  awardDynastyTitle(campStageIndex: number): boolean {
    if (this.state.dynastyMilestones.includes(campStageIndex)) return false;
    this.state.dynastyMilestones.push(campStageIndex);
    this.state.gold += ECONOMY.dynastyMilestone.gold;
    this.state.freeRarityUpgrades += ECONOMY.dynastyMilestone.rarityUpgrades;
    return true;
  }

  /** Сколько раз пере-роллено правило конкретного этапа. Нужна снаружи: сам босс — чистая функция
   *  от seed+stage+n, и это `n` живёт здесь. */
  bossRerollsFor(stageIndex: number): number {
    return this.state.bossRerolls?.[String(stageIndex)] ?? 0;
  }

  /** Цена очередной подготовки / смены правила / разведки в текущем Буткемпе. */
  prepCost(): number {
    return prepCostFor(this.state.prepPurchases ?? 0);
  }

  bossRerollCost(): number {
    return bossRerollCostFor(this.bossRerollsFor(this.state.campStageIndex));
  }

  /** Усиленная подготовка: временный эффект на ОДИН следующий этап, по той же механике, что и
   *  разыгранные Camp Actions (`temporary` сгорает на следующем openCamp). Расходуемая по замыслу:
   *  синк обязан конвертировать золото в прохождение этапа, а не в постоянный прирост — иначе
   *  поздние деньги начали бы обгонять ускоряющуюся угрозу, и Династия перестала бы кончаться. */
  buyPrep(): boolean {
    if (!this.state.inCamp) return false;
    const cost = this.prepCost();
    if (!this.affordable(cost)) return false;
    this.spend(cost);
    this.state.prepPurchases = (this.state.prepPurchases ?? 0) + 1;
    this.state.temporary.push({
      effect: { summand: ECONOMY.prep.summand, delta: ECONOMY.prep.delta },
      campId: this.state.campStageIndex,
    });
    return true;
  }

  /** Сменить правило предстоящего этапа. Экономика хранит только счётчик — какое правило выпадет,
   *  решает `bossForStage(seed, stage, n)`; знание о боссах сюда не протекает. */
  rerollBoss(): boolean {
    if (!this.state.inCamp) return false;
    const cost = this.bossRerollCost();
    if (!this.affordable(cost)) return false;
    this.spend(cost);
    const key = String(this.state.campStageIndex);
    this.state.bossRerolls = {
      ...(this.state.bossRerolls ?? {}),
      [key]: this.bossRerollsFor(this.state.campStageIndex) + 1,
    };
    return true;
  }

  /** Купить разведку за золото. Тот же список `scoutedCamps`, что и у карточки Scouting, но БЕЗ
   *  бесплатного реролла: карточка — награда, а это трата, и платить обеим одинаково значило бы
   *  обесценить карточку. Повторная покупка в том же лагере невозможна — раскрывать нечего. */
  buyScouting(): boolean {
    if (!this.state.inCamp) return false;
    if (this.state.scoutedCamps.includes(this.state.campStageIndex)) return false;
    if (!this.affordable(ECONOMY.scoutPrice)) return false;
    this.spend(ECONOMY.scoutPrice);
    this.state.scoutedCamps.push(this.state.campStageIndex);
    return true;
  }

  /** Открыть Буткемп для этапа `campStageIndex` (офферы деривуются от него).
   *  Здесь же сгорают временные Camp Actions: они куплены под ОДИН прошедший этап. */
  openCamp(campStageIndex: number): void {
    this.state.campStageIndex = campStageIndex;
    this.state.inCamp = true;
    this.state.chosenRewardId = null;
    this.state.marketRerolls = 0;
    this.state.tradeRerolls = 0;
    // Синк живёт внутри лагеря: цена подготовки снова начинается с базовой, как у реролла рынка.
    this.state.prepPurchases = 0;
    this.state.preparedMarketOffers = undefined;
    this.state.temporary = this.state.temporary.filter((t) => t.campId >= campStageIndex);
    // Фиксируем карточный оффер по составу владения на момент открытия — до любых взятий этого
    // Буткемпа, чтобы карта не переезжала на другую после выбора.
    this.state.preparedRewardCard = cardOffer(
      this.seed, campStageIndex, this.state.ownedCards, this.state.rarityDropsEnabled,
      this.buildTiers(),
    );
    // Бесплатные реролы от предметов — свойство Буткемпа, а не накопление: иначе неиспользованные
    // копились бы забегом и обесценивали дорожающий реролл.
    this.state.freeMarketRerolls += this.itemEconomy().freeRerolls;
  }

  /** Выйти из Буткемпа (переход к следующему этапу). */
  leaveCamp(): void {
    this.state.inCamp = false;
  }

  /** Слепок билда для пула наград: что стоит в слотах, с каким качеством и Edition. */
  private buildTiers(): BuildTiers {
    return {
      equipped: this.state.equippedTactics,
      cardRarity: this.state.cardRarity ?? {},
      cardEditions: this.state.cardEditions ?? {},
    };
  }

  private currentRewardOffers(): Offer[] {
    // preparedRewardCard зафиксирован на openCamp; legacy-сейв без него выводит карту из ownedCards.
    const prepared = "preparedRewardCard" in this.state ? this.state.preparedRewardCard : undefined;
    return rewardOffers(
      this.seed, this.state.campStageIndex, this.state.ownedCards, prepared,
      this.state.rarityUpgradesEnabled, this.state.rarityDropsEnabled, this.buildTiers(),
    );
  }

  private currentMarketOffers(): Offer[] {
    return (this.state.preparedMarketOffers
      ?? marketOffers(this.seed, this.state.campStageIndex, this.state.marketRerolls))
      .filter((o) => !this.state.consumed.includes(o.id));
  }

  /** Зафиксировать контекстные офферы, рассчитанные от текущего реального ростера. */
  prepareMarketOffers(offers: Offer[]): void {
    if (this.state.preparedMarketOffers) return;
    this.state.preparedMarketOffers = offers.map(cloneOffer);
  }

  /** Сохранить те же структурные карты, но обновить их breakdown после другого swap. */
  replacePreparedMarketOffers(offers: Offer[]): void {
    this.state.preparedMarketOffers = offers.map(cloneOffer);
  }

  /** Сбросить зафиксированные офферы, чтобы рынок пересобрался (цена/размер паков зависят от
   *  тактик). Не тратит реролл: набор тот же по seed, меняются только их trade-off'ы. */
  invalidateMarketOffers(): void {
    this.state.preparedMarketOffers = undefined;
  }

  private apply(effect: StatEffect): void {
    this.state.applied.push({ ...effect });
  }

  /** Есть ли свободный слот под карточку этого типа. UI объясняет отказ до клика. */
  canTakeCard(kind: OfferKind): boolean {
    const slot = cardSlotKind(kind);
    if (slot === "tactic") return this.state.equippedTactics.length < TACTIC_SLOTS;
    if (slot === "action") return this.state.heldActions.length < CAMP_ACTION_SLOTS;
    return true;
  }

  /** Выбрать одну reward-карту (бесплатно, один раз за Буткемп). Возвращает успех.
   *  Карточка без свободного слота не берётся: сначала сбрось лишнюю (золотые офферы остаются
   *  доступны, поэтому запереть выбор нечем). */
  chooseReward(offerId: string): boolean {
    if (this.state.chosenRewardId != null) return false;
    const offer = this.currentRewardOffers().find((o) => o.id === offerId);
    if (!offer) return false;
    if (offer.kind === "gold" && offer.goldGain) this.state.gold += offer.goldGain;
    else if (offer.kind === "reroll") {
      this.state.freeMarketRerolls += offer.tokens ?? 0;
      this.state.gold += offer.goldGain ?? 0;
    } else if (offer.kind === "quality") {
      this.state.freeRarityUpgrades += offer.tokens ?? 0;
    } else if (offer.kind === "stat" && offer.effect) this.apply(offer.effect);
    else if (offer.kind === "tactic" || offer.kind === "item" || offer.kind === "action") {
      const cardId = offer.cardId;
      if (!cardId) return false;
      // Улучшение уже стоящей карточки (R14.3): слот не занимается второй раз, `ownedCards` не
      // растёт — поднимается тир на месте. Поэтому и `canTakeCard` здесь не при чём: при полных
      // слотах эта награда обязана оставаться доступной.
      if (offer.cardUpgrade) {
        if (offer.kind !== "item" || !isItemId(cardId)) return false;
        if (!offer.cardRarity || !this.state.equippedTactics.includes(cardId)) return false;
        // Оффер обязан нести хотя бы одну ось роста: тир выше текущего и/или Charged для ещё не
        // заряженной карты (решение 2026-08-10 — у arcana это чистый edition-оффер).
        const tierUp = rarityRank(offer.cardRarity) > rarityRank(this.state.cardRarity?.[cardId] ?? "common");
        const chargeUp = offer.cardEdition != null
          && (this.state.cardEditions?.[cardId] ?? null) !== offer.cardEdition;
        if (!tierUp && !chargeUp) return false;
        if (tierUp) {
          this.state.cardRarity = { ...(this.state.cardRarity ?? {}), [cardId]: offer.cardRarity };
        }
        if (chargeUp && offer.cardEdition) {
          this.state.cardEditions = { ...(this.state.cardEditions ?? {}), [cardId]: offer.cardEdition };
        }
        this.state.chosenRewardId = offerId;
        return true;
      }
      if (!this.canTakeCard(offer.kind)) return false;
      const valid = offer.kind === "tactic" ? isTacticId(cardId)
        : offer.kind === "item" ? isItemId(cardId)
        : isCampActionId(cardId);
      if (!valid) return false;
      this.state.ownedCards.push(cardId);
      // Тир фиксируем ИЗ ОФФЕРА, а не роллим заново: карточка уже показала игроку свои числа,
      // и второй ролл был бы вторым источником правды (та же грабля, что у героев в R4.1).
      if (offer.cardRarity && offer.cardRarity !== "common") {
        this.state.cardRarity = { ...(this.state.cardRarity ?? {}), [cardId]: offer.cardRarity };
      }
      // Edition — тоже из оффера (R13.5): заряды начинаются с нуля и копятся этапами.
      if (offer.cardEdition) {
        this.state.cardEditions = { ...(this.state.cardEditions ?? {}), [cardId]: offer.cardEdition };
      }
      if (offer.kind === "action") this.state.heldActions.push(cardId);
      else this.state.equippedTactics.push(cardId);
    }
    this.state.chosenRewardId = offerId;
    return true;
  }

  /** Снять пассивную тактику, освободив слот. Бесплатно и обратимо только новой картой:
   *  повторно она не выпадет (ownedCards), поэтому сброс — осознанное решение. */
  discardTactic(tacticId: string): boolean {
    const at = this.state.equippedTactics.indexOf(tacticId);
    if (at === -1) return false;
    this.state.equippedTactics.splice(at, 1);
    // Карта ушла — её Edition и заряды не должны «ждать» несуществующего возвращения.
    if (this.state.cardEditions?.[tacticId]) {
      const { [tacticId]: _edition, ...editions } = this.state.cardEditions;
      const { [tacticId]: _charges, ...charges } = this.state.cardCharges ?? {};
      this.state.cardEditions = editions;
      this.state.cardCharges = charges;
    }
    return true;
  }

  /** Выбросить неразыгранное действие, освободив слот. */
  discardAction(actionId: string): boolean {
    const at = this.state.heldActions.indexOf(actionId);
    if (at === -1) return false;
    this.state.heldActions.splice(at, 1);
    return true;
  }

  /** Разыграть одноразовое Camp Action. Статовые дают ВРЕМЕННЫЙ эффект (сгорит на следующем
   *  Буткемпе), утилитарные — разведку или бесплатную замену. Только внутри Буткемпа. */
  playCampAction(actionId: string): boolean {
    if (!this.state.inCamp) return false;
    const at = this.state.heldActions.indexOf(actionId);
    if (at === -1) return false;
    const def = campActionDef(actionId);
    if (!def) return false;
    this.state.heldActions.splice(at, 1);
    if (def.effect) {
      this.state.temporary.push({ effect: { ...def.effect }, campId: this.state.campStageIndex });
    }
    if (def.utility === "scouting") {
      this.state.scoutedCamps.push(this.state.campStageIndex);
      this.state.freeMarketRerolls += 1;
    }
    if (def.utility === "freePlayerSwap") this.state.freePlayerSwaps += 1;
    return true;
  }

  /** Купить market-оффер: списать золото (без ухода в минус), применить эффект. */
  buyMarket(offerId: string): boolean {
    return this.purchaseMarket(offerId) != null;
  }

  /** Купить оффер и вернуть его payload оркестратору, который применит roster/hero swap.
   *  Накопленный stand-in делает одну замену игрока бесплатной. */
  purchaseMarket(offerId: string): Offer | null {
    const offer = this.currentMarketOffers().find((o) => o.id === offerId);
    if (!offer || offer.kind === "gold") return null;
    if (offer.kind === "stat" && !offer.effect) return null;
    if (offer.kind === "player" && !offer.playerSwap) return null;
    if (offer.kind === "hero" && !offer.heroSwap && !offer.heroUpgrade) return null;
    // Улучшение качества своего героя (R14.8) уважает тот же мета-гейт, что и грайнд в Preparation:
    // иначе рынок стал бы обходным путём к редкости в первом забеге.
    if (offer.heroUpgrade && !this.state.rarityUpgradesEnabled) return null;
    const free = offer.kind === "player" && this.state.freePlayerSwaps > 0;
    const price = free ? 0 : offer.cost;
    if (!this.affordable(price)) return null;
    if (free) this.state.freePlayerSwaps -= 1;
    this.spend(price);
    if (offer.kind === "stat" && offer.effect) this.apply(offer.effect);
    // Тир поднимается ЗДЕСЬ, а не в сторе: ростер не меняется, поэтому оркестратору нечего
    // применять — вся правка состояния экономики принадлежит экономике.
    if (offer.heroUpgrade) {
      this.state.heroRarity[String(offer.heroUpgrade.heroId)] = offer.heroUpgrade.targetRarity;
    }
    this.state.consumed.push(offerId);
    return cloneOffer(offer);
  }

  /** Реролл рынка: сначала тратим бесплатный от разведки, иначе списываем цену (без минуса). */
  rerollMarket(): boolean {
    const free = this.state.freeMarketRerolls > 0;
    const cost = rerollCostFor(this.state.marketRerolls);
    if (!free && !this.affordable(cost)) return false;
    if (free) this.state.freeMarketRerolls -= 1;
    else this.spend(cost);
    this.state.marketRerolls += 1;
    this.state.preparedMarketOffers = undefined;
    return true;
  }

  /** Настроить оси редкости для этого забега (ставится на старте из careerStore).
   *  `drops` — мета-гейт случайных повышенных качеств; `upgrades` — ручная прокачка в Буткемпе. */
  setRarityFlags(flags: { drops: boolean; upgrades: boolean }): void {
    this.state.rarityDropsEnabled = flags.drops;
    this.state.rarityUpgradesEnabled = flags.upgrades;
  }

  /** Включить бесконечное золото на этот забег (ставится на старте из RunConfig.cheatMode). */
  setUnlimitedGold(enabled: boolean): void {
    this.state.unlimitedGold = enabled;
  }

  get unlimitedGold(): boolean {
    return this.state.unlimitedGold;
  }

  /** Хватает ли золота. Единственная точка, где Cheat Mode вмешивается в экономику. */
  private affordable(price: number): boolean {
    return this.state.unlimitedGold || price <= this.state.gold;
  }

  /** Списать цену. В Cheat Mode баланс не двигается — UI и без того показывает `∞`. */
  private spend(price: number): void {
    if (!this.state.unlimitedGold) this.state.gold -= price;
  }

  get rarityDropsEnabled(): boolean {
    return this.state.rarityDropsEnabled;
  }

  get rarityUpgradesEnabled(): boolean {
    return this.state.rarityUpgradesEnabled;
  }

  /** Карта редкости активных/резервных героев (heroId → тир). Common не хранится (default). */
  get heroRarity(): Record<string, Rarity> {
    return { ...this.state.heroRarity };
  }

  /** Карта тиров взятых карточек (id → тир). Legacy-сейв поля не имеет ⇒ всё common. */
  get cardRarity(): Record<string, Rarity> {
    return { ...(this.state.cardRarity ?? {}) };
  }

  /** Edition взятых карточек (R13.5). Legacy-сейв поля не имеет ⇒ обычные карты. */
  get cardEditions(): Record<string, CardEdition> {
    return { ...(this.state.cardEditions ?? {}) };
  }

  /** Заряды Charged-карт (id → 0..cap). */
  get cardCharges(): Record<string, number> {
    return { ...(this.state.cardCharges ?? {}) };
  }

  /** Текущая тройка trade-in офферов (LG1) — детерминирована по лагерю и счётчику рероллов. */
  currentTradeOffers(): string[] {
    return tradeOffers(
      this.seed, this.state.campStageIndex, this.state.ownedCards, this.state.tradeRerolls ?? 0,
    );
  }

  /** Реролл тройки trade-in офферов — та же лестница цены, что у рынка, свой счётчик. */
  rerollTrade(): boolean {
    const cost = rerollCostFor(this.state.tradeRerolls ?? 0);
    if (!this.affordable(cost)) return false;
    this.spend(cost);
    this.state.tradeRerolls = (this.state.tradeRerolls ?? 0) + 1;
    return true;
  }

  /** Trade-in (LG1): обменять экипированную карту слота на карту из текущей тройки офферов.
   *  Тир переносится «−1» (пол common), Edition и заряды НЕ переносятся и стираются — Charged
   *  принадлежит конкретной карте, иначе обмен стал бы фармом зарядов. Старая карта остаётся в
   *  `ownedCards` навсегда (повторно не выпадет) — сброс оси, а не её дубликат. */
  tradeCard(outgoingId: string, incomingId: string): boolean {
    if (!this.state.inCamp) return false;
    const at = this.state.equippedTactics.indexOf(outgoingId);
    if (at === -1) return false;
    if (!this.currentTradeOffers().includes(incomingId)) return false;
    if (this.state.ownedCards.includes(incomingId)) return false;
    if (!this.affordable(ECONOMY.tradeInCost)) return false;
    const incomingIsItem = isItemId(incomingId);
    if (!incomingIsItem && !isTacticId(incomingId)) return false;
    this.spend(ECONOMY.tradeInCost);
    // Тир уходящей: у предмета — его запись, у тактики — common (тира нет).
    const outgoingRarity: Rarity = isItemId(outgoingId)
      ? this.state.cardRarity?.[outgoingId] ?? "common"
      : "common";
    this.state.equippedTactics[at] = incomingId;
    this.state.ownedCards.push(incomingId);
    // Чистим следы уходящей карты: тир, Edition, заряды — карта ушла навсегда.
    const { [outgoingId]: _rarity, ...restRarity } = this.state.cardRarity ?? {};
    this.state.cardRarity = restRarity;
    if (this.state.cardEditions?.[outgoingId]) {
      const { [outgoingId]: _edition, ...editions } = this.state.cardEditions;
      const { [outgoingId]: _charges, ...charges } = this.state.cardCharges ?? {};
      this.state.cardEditions = editions;
      this.state.cardCharges = charges;
    }
    const incomingRarity = tradeInRarity(outgoingRarity);
    if (incomingIsItem && incomingRarity !== "common") {
      this.state.cardRarity = { ...this.state.cardRarity, [incomingId]: incomingRarity };
    }
    return true;
  }

  /** Начислить заряды за ПРОЙДЕННЫЙ этап (R13.5): Charged-карта с выполненным условием получает
   *  +1 (до потолка), со сломанным — сгорает в ноль. Кто «активен», решает вызывающий из тех же
   *  sources, что и боевой расчёт (activeCardIds в runStrength) — экономика ростера не знает.
   *  Идемпотентность даёт точка вызова: openCampAfterStage/sim зовут её один раз на этап. */
  accrueCharges(activeCardIds: ReadonlySet<string>): void {
    const editions = this.state.cardEditions ?? {};
    const next: Record<string, number> = {};
    for (const id of this.state.equippedTactics) {
      if (editions[id] !== "charged") continue;
      const current = this.state.cardCharges?.[id] ?? 0;
      next[id] = activeCardIds.has(id) ? Math.min(this.chargeCapOf(id), current + 1) : 0;
    }
    this.state.cardCharges = next;
  }

  /** Потолок зарядов карты билда: предмет — по текущему тиру (апгрейд тира поднимает потолок
   *  на месте, заряды сохраняются), тактика — фикс без тира. */
  chargeCapOf(cardId: string): number {
    return chargeCapForRarity(isItemId(cardId) ? this.state.cardRarity?.[cardId] ?? "common" : null);
  }

  rarityOf(heroId: number): Rarity {
    return this.state.heroRarity[String(heroId)] ?? "common";
  }

  /** Ролл редкости входящему на re-pick герою по этапу. Вне мета-гейта — always common (no-op).
   *  Детерминизм: тот же (seed, heroId, stage) ⇒ та же редкость, что и в превью. */
  rollHeroRarity(heroId: number, stageIndex: number): Rarity {
    if (!this.state.rarityDropsEnabled) return "common";
    const rarity = rollHeroRarity(this.seed, heroId, stageIndex);
    if (rarity === "common") delete this.state.heroRarity[String(heroId)];
    else this.state.heroRarity[String(heroId)] = rarity;
    return rarity;
  }

  /** Стоимость поднять героя на следующий тир (учёт золота проверяет вызывающий). */
  rarityUpgradeCost(heroId: number): number | null {
    if (!this.state.rarityUpgradesEnabled) return null;
    return upgradeCost(this.rarityOf(heroId));
  }

  /** Улучшить героя на один тир за золото (без ухода в минус). Реролл того же героя его НЕ качает —
   *  поднять качество можно только здесь (PRD §5.9.2). Возвращает успех. */
  upgradeHeroRarity(heroId: number): boolean {
    if (!this.state.rarityUpgradesEnabled) return false;
    const current = this.rarityOf(heroId);
    const target = nextRarity(current);
    const cost = upgradeCost(current);
    if (!target || cost == null) return false;
    // Токен от reward-карты делает одно улучшение бесплатным — как stand-in для замены игрока.
    const free = this.state.freeRarityUpgrades > 0;
    if (!free && !this.affordable(cost)) return false;
    if (free) this.state.freeRarityUpgrades -= 1;
    else this.spend(cost);
    this.state.heroRarity[String(heroId)] = target;
    return true;
  }

  /** Снимок Буткемпа для UI. */
  campView(): CampView {
    return {
      gold: this.state.gold,
      rewardChosen: this.state.chosenRewardId != null,
      chosenRewardId: this.state.chosenRewardId,
      rewardOffers: this.currentRewardOffers(),
      marketOffers: this.currentMarketOffers(),
      modifiers: this.modifiers(),
      rerollCost: rerollCostFor(this.state.marketRerolls),
      canReroll: this.state.freeMarketRerolls > 0 || this.affordable(rerollCostFor(this.state.marketRerolls)),
      equippedTactics: [...this.state.equippedTactics],
      heldActions: [...this.state.heldActions],
      tacticSlots: TACTIC_SLOTS,
      actionSlots: CAMP_ACTION_SLOTS,
      temporary: this.temporaryEffects().map((effect) => ({ ...effect })),
      scouted: this.state.scoutedCamps.includes(this.state.campStageIndex),
      prepCost: this.prepCost(),
      prepBought: this.state.prepPurchases ?? 0,
      canBuyPrep: this.affordable(this.prepCost()),
      prepDelta: ECONOMY.prep.delta,
      bossRerollCost: this.bossRerollCost(),
      canRerollBoss: this.affordable(this.bossRerollCost()),
      scoutCost: ECONOMY.scoutPrice,
      canBuyScouting: !this.state.scoutedCamps.includes(this.state.campStageIndex)
        && this.affordable(ECONOMY.scoutPrice),
      dynastyMilestone: this.state.dynastyMilestones.includes(this.state.campStageIndex),
      freeMarketRerolls: this.state.freeMarketRerolls,
      freePlayerSwaps: this.state.freePlayerSwaps,
      freeRarityUpgrades: this.state.freeRarityUpgrades,
      lastPayout: this.state.lastPayout,
      rarityDropsEnabled: this.state.rarityDropsEnabled,
      rarityUpgradesEnabled: this.state.rarityUpgradesEnabled,
      unlimitedGold: this.state.unlimitedGold,
      heroRarity: { ...this.state.heroRarity },
      cardRarity: { ...(this.state.cardRarity ?? {}) },
      cardEditions: { ...(this.state.cardEditions ?? {}) },
      cardCharges: { ...(this.state.cardCharges ?? {}) },
      tradeOffers: this.currentTradeOffers(),
      tradeCost: ECONOMY.tradeInCost,
      tradeRerollCost: rerollCostFor(this.state.tradeRerolls ?? 0),
      canRerollTrade: this.affordable(rerollCostFor(this.state.tradeRerolls ?? 0)),
      campStageIndex: this.state.campStageIndex,
      marketSerial: this.state.marketRerolls,
    };
  }
}

function cloneOffer(offer: Offer): Offer {
  return {
    ...offer,
    effect: offer.effect ? { ...offer.effect } : undefined,
    playerSwap: offer.playerSwap
      ? { ...offer.playerSwap, incoming: { ...offer.playerSwap.incoming } }
      : undefined,
    heroSwap: offer.heroSwap ? { ...offer.heroSwap } : undefined,
    heroUpgrade: offer.heroUpgrade ? { ...offer.heroUpgrade } : undefined,
    cardId: offer.cardId,
    preview: offer.preview
      ? {
        before: { ...offer.preview.before },
        after: { ...offer.preview.after },
        beforeAssignment: offer.preview.beforeAssignment
          ? { ...offer.preview.beforeAssignment }
          : undefined,
        afterAssignment: offer.preview.afterAssignment
          ? { ...offer.preview.afterAssignment }
          : undefined,
      }
      : undefined,
  };
}
