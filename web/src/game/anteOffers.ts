// Генерация офферов Буткемпа — выделена из anteEconomy.ts (T12.5, 2026-09-02): карточные
// награды, trade-in, рулетка reward/market. Детерминизм: `seed + campId + rerollN ⇒ те же офферы`.
import type { MutatorId } from "./dynastyMutators.ts";
import { Rng } from "./rng.ts";
import { ACT_LENGTH, marketCostFactor } from "./anteRun.ts";
import { EDITION, type CardEdition } from "./editions.ts";
import { TACTIC_IDS } from "./tactics.ts";
import { CAMP_ACTION_IDS } from "./campActions.ts";
import { ITEM_IDS, hasPowerEffect } from "./items.ts";
import { RARITIES, rarityRank, rollRarity, type Rarity } from "./rarity.ts";

/** Слагаемое Team OVR, на которое действует покупка. */
import { ECONOMY, type Offer, type Summand, type StatEffect } from "./anteEconomyTypes.ts";
import { stageGold } from "./anteCosts.ts";

const MARKET_SUMMANDS: readonly Summand[] = ["base", "heroSynergy", "chemistry"];

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
export function cardOffer(
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
  if (rng.float() < EDITION.dropChance) return { cardEdition: "charged" };
  // Tempered (LG4): ролл ТОЛЬКО при не выпавшем Charged и на СВОЁМ подпотоке — charged-исходы
  // существующих сидов не сдвигаются ни на один вызов Rng.
  const temperedRng = new Rng(`${seed}:camp-${campStageIndex}:edition-t`);
  return temperedRng.float() < EDITION.tempered.dropChance ? { cardEdition: "tempered" } : {};
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
  slotOffer = false,
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
  const offers: Offer[] = [
    { id: `rwd-${campStageIndex}-0`, kind: "gold", labelKey: "reward.gold", cost: 0, goldGain: gold },
    card
      ?? { id: `rwd-${campStageIndex}-1`, kind: "stat", labelKey: `reward.stat.${summand}`, cost: 0, effect: { summand, delta: cfg.delta } },
    utility,
  ];
  // Шестой слот (LG2): ЧЕТВЁРТАЯ карточка, а не подмена утилиты — обмен «слот за силу»
  // не должен отнимать обычный выбор награды. Детерминизм тривиален: без Rng.
  if (slotOffer) {
    offers.push({
      id: `rwd-${campStageIndex}-slot`,
      kind: "slot",
      labelKey: "reward.slot",
      cost: 0,
      effect: { summand: "base", delta: -ECONOMY.slotOffer.basePenalty },
    });
  }
  return offers;
}

/** Три market-оффера (по одному на слагаемое), качество/цена варьируются по rerollN — reroll
 *  осмыслен (гэмбл на лучшие офферы). Детерминизм по seed+campId+rerollN. */
export function marketOffers(seed: string, campStageIndex: number, rerollN: number, stakes: readonly MutatorId[] = []): Offer[] {
  const rng = new Rng(`${seed}:camp-${campStageIndex}:market-${rerollN}`);
  // Мутатор круга expensiveMarket (LG3) / стартовый Stake (T6.4) применяется на ГЕНЕРАЦИИ:
  // превью, покупка и сим обязаны читать одну цену. Rng не трогает — набор тот же, дороже ценник.
  const costFactor = marketCostFactor(seed, campStageIndex, undefined, stakes);
  return MARKET_SUMMANDS.map((summand) => {
    const cfg = ECONOMY.levers[summand];
    const bonus = rng.int(3); // 0..2 ступени качества
    const delta = cfg.delta + bonus * cfg.step;
    const cost = Math.round((cfg.cost + bonus * cfg.costStep) * costFactor);
    const effect: StatEffect = cfg.tradeoff
      ? { summand, delta, tradeoffSummand: cfg.tradeoff.summand, tradeoffDelta: cfg.tradeoff.delta }
      : { summand, delta };
    return { id: `mkt-${campStageIndex}-${rerollN}-${summand}`, kind: "stat", labelKey: `market.${summand}`, cost, effect };
  });
}
