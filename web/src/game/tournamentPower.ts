// Tournament Power (R8.2) — отдельная величина силы забега поверх объективного счёта состава.
//
// ЗАЧЕМ ОТДЕЛЬНАЯ. `Team OVR = Base + Hero Synergy + Chemistry` — это читаемая оценка РОСТЕРА, и
// предметы её умножать не должны: иначе рейтинг игроков теряет смысл, а число раздувается так, что
// «85 OVR» перестаёт что-либо означать (PRD §5.9.3). Поэтому build-эффекты живут в своих слоях, а
// Team OVR остаётся тем же, что в Quick Draft.
//
// ПОРЯДОК ПРИМЕНЕНИЯ ФИКСИРОВАН и виден игроку:
//   rosterPower      = teamOvr + flat
//   teamMult         = (100 + additive) / 100
//   tournamentPower  = rosterPower × teamMult × Π xMult
//
// Сегодня источников слоёв НЕТ: предметы появляются в R8.3, а существующие покупки/тактики/редкость
// по-прежнему двигают слагаемые Team OVR. Это сознательно — здесь вводится контракт и место
// подключения, чтобы R8.3 не пришлось попутно переделывать композицию силы и шкалу ELO.
import { QUICK_DRAFT_FIELD } from "./tournament.ts";

/** Границы множителей (часть BALANCE_CONFIG_VERSION). Обычные X Mult держим в узкой полосе:
 *  за её пределами один предмет начинает решать забег, а порядок применения — переставать
 *  читаться. Глобальные `×2` допустимы только как редкий risk/reward и проходят через `xMultHard`. */
export const POWER_LIMITS = {
  xMultMin: 1.10,
  xMultMax: 1.50,
  /** Абсолютный потолок для редких risk/reward карт. */
  xMultHard: 2.0,
} as const;

export interface PowerLayers {
  /** Объективная оценка состава. Предметами НЕ умножается и НЕ переопределяется. */
  teamOvr: number;
  /** Плоские прибавки к силе ростера (полезны рано, не масштабируются). */
  flat: number;
  /** Аддитивный множитель в процентных пунктах: `teamMult = (100 + additive) / 100`. */
  additive: number;
  /** Мультипликативные множители — перемножаются между собой (сильны в собранном билде). */
  xMults: readonly number[];
}

export const EMPTY_POWER: PowerLayers = { teamOvr: 0, flat: 0, additive: 0, xMults: [] };

export function powerLayers(teamOvr: number, layers: Partial<Omit<PowerLayers, "teamOvr">> = {}): PowerLayers {
  return { teamOvr, flat: layers.flat ?? 0, additive: layers.additive ?? 0, xMults: layers.xMults ?? [] };
}

/** Сила ростера: объективный счёт + плоские прибавки. */
export function rosterPower(layers: PowerLayers): number {
  return layers.teamOvr + layers.flat;
}

/** Произведение X Mult'ов. Каждый клампится в `[1, xMultHard]`: множитель меньше 1 — это не
 *  «ослабление билда», а ошибка источника, и молча ронять силу он не должен. */
export function xMultProduct(layers: PowerLayers): number {
  return layers.xMults.reduce(
    (product, mult) => product * Math.min(POWER_LIMITS.xMultHard, Math.max(1, mult)),
    1,
  );
}

/** Итоговая сила, с которой состав выходит на турнир. */
export function tournamentPower(layers: PowerLayers): number {
  return rosterPower(layers) * ((100 + layers.additive) / 100) * xMultProduct(layers);
}

/** Разложение для UI: слои показываются раздельно, потому что игрок обязан видеть, ЧТО именно
 *  даёт итоговое число и в каком порядке это применяется. */
export interface PowerBreakdown {
  teamOvr: number;
  flat: number;
  additive: number;
  xMult: number;
  total: number;
  /** Ни один слой не активен ⇒ итог равен Team OVR, и разложение показывать не нужно. */
  trivial: boolean;
}

export function powerBreakdown(layers: PowerLayers): PowerBreakdown {
  const xMult = xMultProduct(layers);
  return {
    teamOvr: layers.teamOvr,
    flat: layers.flat,
    additive: layers.additive,
    xMult,
    total: tournamentPower(layers),
    trivial: layers.flat === 0 && layers.additive === 0 && xMult === 1,
  };
}

/**
 * Делитель ELO, масштабированный под шкалу состязания (R7.1 → R8.2).
 *
 * ELO-кривая аддитивна: она смотрит на РАЗНОСТЬ сил. Пока все числа лежат в диапазоне `76–99`,
 * делитель 22 даёт осмысленную дисперсию. Но `Tournament Power` умножает силу обеих сторон, и на
 * шкале порядка 180 разрыв в 40 очков означал бы вероятность победы ≈1 — турнир перестал бы быть
 * турниром и превратился в сравнение чисел.
 *
 * Поэтому делитель растёт пропорционально шкале: одинаковое ОТНОСИТЕЛЬНОЕ преимущество даёт
 * одинаковую вероятность на любой шкале.
 *
 * Шкалу задаёт ПОЛЕ (этап состязания), а не сила игрока. Это важно с двух сторон:
 *  - Quick Draft всегда даёт ровно 22 (`scale === QUICK_DRAFT_FIELD.mean`) ⇒ golden байт-в-байт;
 *  - преимущество игрока над полем не «разбавляется» — сильно превосходящая сборка обязана
 *    выигрывать, иначе награда за билд исчезает.
 * Нижняя граница `max(1, …)` не даёт сжать делитель на слабом раннем поле: сжатие сделало бы
 * ранние этапы детерминированными, чего не было до правки.
 */
export function eloDivisorForScale(baseDivisor: number, scale: number): number {
  return baseDivisor * Math.max(1, scale / QUICK_DRAFT_FIELD.mean);
}
