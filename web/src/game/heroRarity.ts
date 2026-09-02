// Редкость героев Roguelite Run (срез 3b, PRD §5.9.2). Чистый слой ПОВЕРХ score.ts, как tactics/
// bosses: формула Team OVR не меняется (ratingModelVersion цел, golden цел, Quick Draft чист) —
// редкость даёт ДОБАВОЧНЫЙ вклад к слагаемым как отдельный модификатор, не переписывая scoreTeam.
//
// Канал бафа — Hero Synergy (свойство героя): выше редкость → больше вклад назначенного героя; у
// immortal сверх того маленький +OVR игроку (Base). Скоуп только Roguelite Run.
//
// Источник — ЛУТ с рынка (решение playtest 2026-07-24): стартовый драфт весь common, hero re-pick
// на рынке роллит редкость по этапу (поздние этапы — шанс mythic/immortal), «улучшение» поднимает
// тир текущего героя. Первый забег игрока весь common (мета-гейт по careerStore).
import { nextRarity, RARITIES, rarityRank, rollRarity, type Rarity } from "./rarity.ts";
import type { SummandModifiers } from "./anteEconomy.ts";

/** Баланс-коэффициенты редкости (часть BALANCE_CONFIG_VERSION — правишь числа, бампай в balance.ts).
 *  Placeholder, калибровка — `npm run sim`. Immortal редок, поэтому его пакет заметно сильнее. */
export const RARITY = {
  /** Бонус к Hero Synergy за одного назначенного героя этой редкости. */
  heroSynergyBonus: { common: 0, unique: 0.6, mythic: 1.4, immortal: 2.4 } as Record<Rarity, number>,
  /** Сверх Hero Synergy: immortal даёт маленький +OVR игроку (Base). */
  immortalBaseBonus: 1,
  /** Цена «улучшения» — стоимость ДОСТИЖЕНИЯ тира (бамп на один шаг вверх).
   *
   *  Считается ОТ СИЛЫ ШАГА, а не «на глаз». Прирост вклада в Team OVR: `unique +0.6`,
   *  `mythic +0.8`, `immortal +2.0` (у immortal сверх Hero Synergy есть ещё `immortalBaseBonus`).
   *  При старых `3/5/8` цена за единицу силы шла `5.0 → 6.25 → 4.0`: последний, самый сильный шаг
   *  выходил САМЫМ дешёвым, и апгрейд до immortal доминировал любую другую трату золота.
   *  Теперь `5.0 → 6.25 → 7.0` — дороже за очко на верхних тирах, как и должно быть. */
  upgradeCost: { unique: 3, mythic: 5, immortal: 14 } as Record<Exclude<Rarity, "common">, number>,
  /** Базовая цена hero re-pick по качеству входящего героя (R4.1).
   *
   *  **Не зависит от номера этапа** (PRD §5.9.3): один и тот же товар того же качества стоит
   *  одинаково на этапе 2 и на этапе 22. Этап влияет на ВЕРОЯТНОСТЬ качества, доход и boss
   *  pressure — но не на базовую формулу цены. Раньше hero-оффер брал цену generic-рычага Hero
   *  Synergy, и common стоил столько же, сколько immortal.
   *
   *  ПОЧЕМУ СНЯТ старый инвариант «купить готовый тир = вырастить его из common» (R11.3). Он
   *  приравнивал два пути по золоту, молча предполагая, что смена героя ничего не стоит. А она
   *  стоит: апгрейд усиливает героя, уже стоящего в составе и оптимально назначенного, тогда как
   *  re-pick пересобирает matching и теряет career-связку «игрок×герой». Плюс стартовая пятёрка
   *  досталась бесплатно, поэтому реальная цена грайнда шла от нуля, а не от `heroPrice("common")`.
   *
   *  Новый инвариант (закреплён тестом): `heroPrice(тир) < heroPrice("common") + Σ upgradeCost` —
   *  купить готовое ДЕШЕВЛЕ, чем вырастить, потому что покупка несёт риск смены героя, а грайнд
   *  гарантирован. Игрок платит премию именно за гарантию (`6<7`, `10<12`, `20<26`). */
  heroPrice: { common: 4, unique: 6, mythic: 10, immortal: 20 } as Record<Rarity, number>,
} as const;

/** Базовая цена входящего героя этого качества. */
export function heroPrice(rarity: Rarity): number {
  return RARITY.heroPrice[rarity];
}

/** Цена поднять героя из `from` в следующий тир; null если уже immortal. `nextRarity` никогда не
 *  возвращает common (это первый тир), поэтому target всегда есть в таблице цен. */
export function upgradeCost(from: Rarity): number | null {
  const target = nextRarity(from);
  return target && target !== "common" ? RARITY.upgradeCost[target] : null;
}

/** Цена пути `from → to` — сумма шагов лестницы; null, если `to` не выше `from`.
 *
 *  Рыночная карта «твой герой, но качеством выше» (R14.8) может прыгать через тир, и брать за неё
 *  цену ОДНОГО шага было бы дырой в экономике: common→immortal обошёлся бы в 14 вместо 22, то есть
 *  дешевле готового immortal (20) — при том что этот путь ещё и сохраняет career-связку
 *  «игрок×герой». Сумма шагов держит уже зафиксированный инвариант: вырастить дороже, чем купить
 *  готовое, а игрок платит премию за гарантию (см. комментарий к `RARITY.heroPrice`). */
export function upgradePathCost(from: Rarity, to: Rarity): number | null {
  if (rarityRank(to) <= rarityRank(from)) return null;
  let total = 0;
  for (let rank = rarityRank(from) + 1; rank <= rarityRank(to); rank += 1) {
    const step = RARITIES[rank];
    if (step === "common") return null;
    total += RARITY.upgradeCost[step];
  }
  return total;
}

/** Ролл редкости входящего героя — общая лестница (`rarity.ts`) под ключом героя. */
export function rollHeroRarity(seed: string, heroId: number, stageIndex: number): Rarity {
  return rollRarity(seed, `hero-${heroId}`, stageIndex);
}

/** Вклад ОДНОГО героя этой редкости в слагаемые (heroSynergy + base у immortal). Для превью
 *  замены/резерва: чистый прирост = вклад входящего − вклад заменяемого. */
export function rarityContribution(rarity: Rarity): { heroSynergy: number; base: number } {
  return {
    heroSynergy: RARITY.heroSynergyBonus[rarity],
    base: rarity === "immortal" ? RARITY.immortalBaseBonus : 0,
  };
}

/** Вклад редкости в Team OVR ОДНИМ числом. Team OVR — сумма слагаемых, поэтому и вклад редкости
 *  в него — сумма её частей; рынку нужна именно она, чтобы сравнивать карты между собой. */
export function rarityOvrContribution(rarity: Rarity): number {
  const c = rarityContribution(rarity);
  return c.heroSynergy + c.base;
}

/** Чистый сдвиг слагаемых при замене героя `outgoing`→`incoming` (их редкости). Именно этого не
 *  хватало превью рынка/резерва: показывался бонус входящего без вычитания редкости заменяемого. */
export function raritySwapDelta(outgoing: Rarity, incoming: Rarity): { heroSynergy: number; base: number } {
  const o = rarityContribution(outgoing);
  const i = rarityContribution(incoming);
  return { heroSynergy: i.heroSynergy - o.heroSynergy, base: i.base - o.base };
}

/** Вклад редкости АКТИВНЫХ героев в слагаемые Team OVR. Чистая: те же вход ⇒ тот же выход.
 *  Пересчитывается при каждой замене героя (как tactics), поэтому без состояния.
 *  `factor` — множитель вклада (trade-off Wide Pool, `tacticRarityFactor`); 1 = без ослабления. */
export function rarityModifiers(
  rarityByHero: Record<string, Rarity>,
  activeHeroes: readonly number[],
  factor = 1,
): SummandModifiers {
  const mod: SummandModifiers = { base: 0, heroSynergy: 0, chemistry: 0 };
  for (const heroId of activeHeroes) {
    const rarity = rarityByHero[String(heroId)] ?? "common";
    mod.heroSynergy += RARITY.heroSynergyBonus[rarity] * factor;
    if (rarity === "immortal") mod.base += RARITY.immortalBaseBonus * factor;
  }
  return mod;
}

/** Строки для UI: по одному активному герою — его редкость и вклад (для breakdown). */
export interface RarityRow {
  heroId: number;
  rarity: Rarity;
  heroSynergyBonus: number;
  baseBonus: number;
}

