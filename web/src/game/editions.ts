// Editions (R13.5) — ВТОРАЯ ось карточек билда, отвечающая на потолок билда (R12.6): качество —
// конечная шкала величины, Edition меняет ПОВЕДЕНИЕ карточки. Первая и пока единственная —
// `Charged`: карта копит заряды за пройденные этапы с ВЫПОЛНЕННЫМ условием и усиливает свой
// эффект, а поломка условия сжигает заряды. Контролируемый рост с конечным потолком (решение
// 2026-08-09: +20%/заряд), растёт вместе с билдом, наказывает поломку условия.
//
// Потолок зарядов растёт с ТИРОМ предмета (решение 2026-08-10): standard 2 → arcana 5
// (+40…+100%). Качество получает смысл после потолка величины — апгрейд тира заряженной карты
// поднимает её ёмкость на месте, накопленные заряды сохраняются. Тактики тира не имеют —
// фиксированный средний потолок. Клампит НАЧИСЛЕНИЕ (accrueCharges): в сейве заряды никогда не
// превышают потолок карты, поэтому множитель остаётся простой функцией от числа зарядов.
//
// Визуальная ось (R13): редкость владеет ЦВЕТОМ рамки, Edition — бейджем/материалом. Не рамкой.
import { rarityRank, type Rarity } from "./rarity.ts";

export type CardEdition = "charged" | "tempered";

/** Числа Editions (часть BALANCE_CONFIG_VERSION — правишь, бампай версию в balance.ts).
 *  Placeholder до калибровки симулятором (R10). */
export const EDITION = {
  /** Потолок зарядов предмета по рангу тира (standard→arcana) и фикс для тактик (тира нет). */
  chargeCaps: { item: [2, 3, 4, 5] as readonly number[], tactic: 3 },
  /** Усиление эффекта карты за один заряд (доля). */
  chargeBonus: 0.2,
  /** Шанс, что карточная награда придёт Charged (отдельный Rng-поток, см. cardOffer). */
  dropChance: 0.3,
  /** С какого акта Editions появляются в дропе: поздняя ось роста, а не ранняя удача. */
  minAct: 3,
  /** Tempered (LG4, решение 2026-08-11) — вторая Edition, ЗАЩИТНАЯ ось: пока карта экипирована и
   *  её условие РАБОТАЕТ (та же семантика активности, что у зарядов, — activeCardIds), штраф
   *  босса этапа умножается на penaltyFactor за каждую активную Tempered-карту (мультипликативный
   *  стак). Отличие от BKB/Linkens: те — предметы и занимают слот, Edition — свойство уже
   *  стоящей карты. Прямой ответ на «смерть под боссом» и мутатор uncappedBoss (LG3).
   *  Ролл — ПОДПОТОК `:edition-t`, только если карта не выпала Charged: charged-исходы
   *  существующих сидов не сдвигаются. */
  tempered: {
    /** Шанс Tempered при НЕ выпавшем Charged (условная вероятность второго ролла). */
    dropChance: 0.25,
    /** Множитель штрафа босса за одну активную Tempered-карту. */
    penaltyFactor: 0.7,
  },
} as const;

/** Абсолютный максимум зарядов — страховочный кламп множителя. */
export const MAX_CHARGE_CAP = Math.max(...EDITION.chargeCaps.item, EDITION.chargeCaps.tactic);

/** Потолок зарядов карты: у предмета — по тиру, у тактики (rarity = null) — фикс. */
export function chargeCapForRarity(rarity: Rarity | null): number {
  if (rarity == null) return EDITION.chargeCaps.tactic;
  return EDITION.chargeCaps.item[rarityRank(rarity)] ?? EDITION.chargeCaps.tactic;
}

/** Множитель эффекта карты при данном числе зарядов. Пер-картный потолок применён при
 *  начислении (accrueCharges); здесь только страховочный кламп. */
export function chargeFactor(charges: number): number {
  return 1 + EDITION.chargeBonus * Math.max(0, Math.min(MAX_CHARGE_CAP, charges));
}

/** Множитель штрафа босса от активных Tempered-карт: penaltyFactor^n, 1 при нуле. */
export function temperedPenaltyFactor(activeTempered: number): number {
  return EDITION.tempered.penaltyFactor ** Math.max(0, activeTempered);
}
