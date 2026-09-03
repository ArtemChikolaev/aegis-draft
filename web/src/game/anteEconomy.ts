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
import type { MutatorId } from "./dynastyMutators.ts";
import { ACT_LENGTH, SEASON_ACTS } from "./anteRun.ts";
import { chargeCapForRarity, type CardEdition } from "./editions.ts";
import type { PlacementKey } from "./tournament.ts";
import { TACTIC_SLOTS, isTacticId } from "./tactics.ts";
import { CAMP_ACTION_SLOTS, campActionDef, isCampActionId } from "./campActions.ts";
import { evaluateItems, isItemId } from "./items.ts";
import { rollHeroRarity, upgradeCost } from "./heroRarity.ts";
import { nextRarity, rarityRank, type Rarity } from "./rarity.ts";

/** Слагаемое Team OVR, на которое действует покупка. */

// Разрез T12.5 (2026-09-02): типы/ECONOMY, cost-математика и генерация офферов живут в своих
// модулях; здесь — состояние Буткемпа (RunEconomy, CampView). Публичный API сохранён реэкспортом.
export {
  ECONOMY,
  cardSlotKind,
  type HeroSwapEffect,
  type Offer,
  type OfferKind,
  type PlayerSwapEffect,
  type RunEconomyState,
  type StatEffect,
  type Summand,
  type SummandModifiers,
  type SummandValues,
} from "./anteEconomyTypes.ts";
export {
  addModifiers,
  bossRerollCostFor,
  formUpgradeCost,
  interestFor,
  playerCost,
  playerOfferAffordable,
  prepCostFor,
  prizeBreakdown,
  prizeForStage,
  rerollCostFor,
  summandModifiers,
} from "./anteCosts.ts";
export { marketOffers, rewardOffers, tradeInRarity, tradeOffers, type BuildTiers } from "./anteOffers.ts";
import {
  ECONOMY,
  normalizeEconomyState,
  type Offer,
  
  type SummandModifiers,
  
  type StatEffect,
  type RunEconomyState,
  
  
  type OfferKind,
  cardSlotKind,
} from "./anteEconomyTypes.ts";
import {
  bossRerollCostFor, interestFor, 
  prepCostFor, prizeBreakdown, rerollCostFor, summandModifiers, 
} from "./anteCosts.ts";
import { cardOffer, marketOffers, rewardOffers, tradeInRarity, tradeOffers, type BuildTiers } from "./anteOffers.ts";

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
  /** Токены зачарования (LG6) и карты, на которые их можно потратить. */
  editionTokens: number;
  enchantableCards: string[];
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
    tacticSlots: TACTIC_SLOTS,
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
    this.state.editionTokens = this.editionTokens + ECONOMY.dynastyMilestone.editionTokens;
    return true;
  }

  get editionTokens(): number {
    return this.state.editionTokens ?? 0;
  }

  /** Карты, на которые можно потратить токен зачарования: экипированные пассивные без Edition. */
  enchantableCards(): string[] {
    return this.state.equippedTactics.filter((id) => this.state.cardEditions?.[id] == null);
  }

  /** Зачаровать карту токеном титула (LG6): выбранная Edition вешается на экипированную карту
   *  без Edition. Charged начинает с нуля зарядов (копит их дальше как обычная Charged);
   *  Tempered работает сразу. Снять или заменить Edition нельзя — как и у выпавшей. */
  enchantCard(cardId: string, edition: CardEdition): boolean {
    if (this.editionTokens <= 0) return false;
    if (!this.enchantableCards().includes(cardId)) return false;
    this.state.editionTokens = this.editionTokens - 1;
    this.state.cardEditions = { ...(this.state.cardEditions ?? {}), [cardId]: edition };
    if (edition === "charged" && this.state.cardCharges?.[cardId] == null) {
      this.state.cardCharges = { ...(this.state.cardCharges ?? {}), [cardId]: 0 };
    }
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
      this.buildTiers(), this.playbook,
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
      this.slotOfferAvailable(), this.playbook,
    );
  }

  /** Доступен ли оффер шестого слота (LG2): первый лагерь ПРЕДПОСЛЕДНЕГО акта (акт 4 при пяти),
   *  а в Династии — каждый лагерь, пока не взят. Слот один: взятый оффер (tacticSlots выше
   *  константы) больше не приходит. */
  private slotOfferAvailable(): boolean {
    if (this.campTacticSlots() > TACTIC_SLOTS) return false;
    const stage = this.state.campStageIndex;
    const penultimateActStart = ACT_LENGTH * (SEASON_ACTS - 2);
    return stage === penultimateActStart || stage >= ACT_LENGTH * SEASON_ACTS;
  }

  /** Число слотов тактик забега: поле состояния (LG2), константа — дефолт legacy-сейва. */
  private campTacticSlots(): number {
    return this.state.tacticSlots ?? TACTIC_SLOTS;
  }

  private currentMarketOffers(): Offer[] {
    return (this.state.preparedMarketOffers
      ?? marketOffers(this.seed, this.state.campStageIndex, this.state.marketRerolls, this.stakes))
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
    if (slot === "tactic") return this.state.equippedTactics.length < this.campTacticSlots();
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
    } else if (offer.kind === "slot") {
      // Шестой слот (LG2): не рост, а обмен — слот приходит вместе с перманентным минусом к
      // Base (applied-эффект, виден в разложении как любая покупка). Второго оффера не будет:
      // slotOfferAvailable гасит его по выросшему tacticSlots.
      if (this.campTacticSlots() > TACTIC_SLOTS) return false;
      if (offer.effect) this.apply(offer.effect);
      this.state.tacticSlots = TACTIC_SLOTS + ECONOMY.slotOffer.slots;
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
  /** Стартовые Stakes забега (T6.4/T6.4-2): транзиент, как unlimitedGold-источник — приходит
   *  из конфига на старте/resume, в сейв экономики не пишется (конфиг уже в SavedRun). Нужен
   *  стат-рынку: expensiveMarket в сезоне обязан дорожить и три stat-карты, не только рулетку. */
  private stakes: readonly MutatorId[] = [];

  setStakes(stakes: readonly MutatorId[]): void {
    this.stakes = stakes;
  }

  /** Playbook забега (T6.4-2) — тот же транзиент, что Stakes: приходит из RunConfig на старте и
   *  resume, в сейв экономики не пишется. Режет пул карточных наград и trade-in. */
  private playbook: readonly string[] | undefined = undefined;

  setPlaybook(playbook: readonly string[] | undefined): void {
    this.playbook = playbook;
  }

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
      this.seed, this.state.campStageIndex, this.state.ownedCards, this.state.tradeRerolls ?? 0, this.playbook,
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
      tacticSlots: this.campTacticSlots(),
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
      editionTokens: this.editionTokens,
      enchantableCards: this.enchantableCards(),
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

