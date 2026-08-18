// Экономика Esports Manager (T5.5). Все числа синтезируются из нашей рейтинг-модели —
// рыночных данных о зарплатах нет (modes-scenarios §0), поэтому зарплата = функция OVR
// с детерминированным шумом по сиду. Правишь числа → бампай MANAGER_ECONOMY_VERSION:
// она лежит в сейве и честно инвалидирует несовместимую карьеру (как balanceConfigVersion).
import { Rng } from "../rng.ts";

export const MANAGER_ECONOMY_VERSION = "m1.6.0"; // m1.6.0: события-выборы streamDeal/heroClinic (срез 7; роллы :re: сдвинулись)

/** Сложность = месячный доход организации, $k (322-0-парити: 120/100/80). */
export const MANAGER_INCOME: Record<ManagerDifficulty, number> = {
  easy: 120,
  normal: 100,
  hard: 80,
};
export type ManagerDifficulty = "easy" | "normal" | "hard";

/** Регионы — flavor: влияют на сид поля (разные соперники), данных о регионах игроков нет. */
export const MANAGER_REGIONS = ["weu", "eeu", "na", "sa", "sea", "cn"] as const;
export type ManagerRegion = (typeof MANAGER_REGIONS)[number];

/** Зарплата в $k/мес из OVR + шум ±15%. Кривая степенная: звезда дороже суперлинейно.
 *  Калибровка m1.3.0 по sim_manager: прежняя кривая (6 + 0.25·(ovr−60)^1.5) давала
 *  cheap-пятёрку за $29k при доходе $100k — профицит $70k/мес обесценивал экономику.
 *  Теперь: 60→~11, 75→~33, 87→~59 (322-0-масштаб: их подписи впритык к доходу). */
export function salaryFor(ovr: number, rng: Rng): number {
  const base = 8 + 0.28 * Math.pow(Math.max(0, ovr - 55), 1.5);
  const noisy = base * (0.85 + rng.float() * 0.3);
  return Math.max(5, Math.round(noisy));
}

/** Бенд для скрытой зарплаты на трайаутах: платёжеспособность видна, точная цифра — нет. */
export function salaryBand(salary: number): 1 | 2 | 3 | 4 {
  return salary < 12 ? 1 : salary < 20 ? 2 : salary < 35 ? 3 : 4;
}

/** Призовые по типам событий, $k за место (по мотивам измеренных таблиц 322-0). */
export const PRIZES: Record<ManagerEventKind, readonly number[]> = {
  tier2: [28, 17, 10, 6, 3.5, 3.5, 2, 2],
  qualifier: [0, 0, 0, 0, 0, 0, 0, 0],
  online: [85, 50, 28, 18, 10, 10, 5, 5],
  lan: [280, 140, 85, 55, 35, 35, 18, 18, 9, 9, 9, 9],
  finaleQual: [0, 0, 0, 0, 0, 0, 0, 0],
  finale: [850, 420, 250, 155, 90, 90, 55, 55, 28, 28, 28, 28, 14, 14, 14, 14, 0, 0],
};
export type ManagerEventKind = "tier2" | "qualifier" | "online" | "lan" | "finaleQual" | "finale";

/** Сила бота НЕ зависит от силы игрока (фикс m1.3.0 по sim_manager: поле «вокруг игрока»
 *  обнуляло смысл усиления — дешёвая и дорогая пятёрки проходили квалы одинаково).
 *  Мир фиксированный: сила = ELO орга (1240–1320 на старте, дальше дрейф) + тир события. */
export const BOT_STRENGTH = {
  /** 1240 ELO → 60 OVR-эквивалента, 1320 → 72; дрейф ELO двигает силу орга между сезонами. */
  base: 60,
  eloAnchor: 1240,
  perElo: 0.15,
  sd: 3,
  min: 55,
  max: 100,
} as const;

/** Сдвиг тира: tier2 — разминка, финал сезона — сильнейшее поле года. */
export const TIER_ADJUST: Record<ManagerEventKind, number> = {
  tier2: -6,
  qualifier: -2,
  online: 2,
  lan: 5,
  finaleQual: 1,
  finale: 8,
};

export function botStrength(elo: number, kind: ManagerEventKind, rng: Rng): number {
  const raw = BOT_STRENGTH.base + (elo - BOT_STRENGTH.eloAnchor) * BOT_STRENGTH.perElo + TIER_ADJUST[kind] + rng.normal(0, BOT_STRENGTH.sd);
  return Math.round(Math.min(BOT_STRENGTH.max, Math.max(BOT_STRENGTH.min, raw)));
}

/** Размер поля по типу события (включая игрока). */
export const FIELD_SIZE: Record<ManagerEventKind, number> = {
  tier2: 8,
  qualifier: 8,
  online: 8,
  lan: 12,
  finaleQual: 8,
  finale: 18,
};

/** Сколько мест проходят дальше из гейтящих событий. */
export const QUALIFIER_ADVANCE = 2; // qualifier → online+lan цикла
export const FINALE_QUAL_ADVANCE = 1; // finaleQual → финал сезона

/** ELO мирового рейтинга: старт игрока и разброс ботов — 322-0-парити. */
export const ELO_START = 1100;
export const ELO_BOT_MIN = 1240;
export const ELO_BOT_MAX = 1320;
export const ELO_K = 16;

/** Дрифт формы в оффсезоне: целое в [−3, +3] (322-0: driftMin/Max). Настроение смещает
 *  дрифт (322-0: driftHappyBias +1 / driftSadBias −1), кламп остаётся [−3, +3]. */
export function offseasonDrift(rng: Rng, happiness: number): number {
  const bias = happiness >= HAPPINESS.happyBiasFrom ? 1 : happiness < HAPPINESS.unhappyThreshold ? -1 : 0;
  return Math.max(-3, Math.min(3, rng.int(7) - 3 + bias));
}

/** Happiness (322-0-парити, замер 2026-07-16): старт 70, титул +8, топ-3 +3,
 *  дно LAN −4, мимо финала сезона −6; несчастен ниже 30. */
export const HAPPINESS = {
  start: 70,
  min: 0,
  max: 100,
  title: 8,
  eventTop3: 3,
  lanBottom: -4,
  missFinale: -6,
  unhappyThreshold: 30,
  happyBiasFrom: 70,
} as const;

/** Fame в звёздах 0..10 (322-0-парити): титулы по тиру события, топ-4 финала,
 *  сезонное затухание. starDivisor у них конвертирует fame в надбавку зарплаты. */
export const FAME = {
  max: 10,
  finaleTitle: 2,
  lanTitle: 1,
  onlineTitle: 0.5,
  tier2Title: 0.25,
  finaleTop4: 0.5,
  seasonDecay: -0.5,
  /** +4% к пересмотру зарплаты за звезду (322-0: fameBumpPerStar 0.04). */
  salaryBumpPerStar: 0.04,
} as const;

/** Жизненный цикл игрока в оффсезоне (322-0-парити): базовый шанс ретайра, надбавки
 *  ветерану (3+ сезонов) и несчастному; несчастный дополнительно уходит сам с шансом 35%. */
export const LIFECYCLE = {
  retireBase: 0.02,
  retireVeteranBonus: 0.03,
  veteranSeasons: 3,
  retireUnhappyBonus: 0.05,
  leaveChance: 0.35,
} as const;

/** Бонус за место выше соперника-rival в общем событии. У 322-0 замерено +$25k;
 *  берём скромнее до калибровки симом — их экономика щедрее нашей. */
export const RIVAL_BONUS_K = 10;

/** Трансферное окно оффсезона (срез 5): единственный спендинг банка — покупка силы.
 *  Взнос платится из банка сверх зарплаты; кривая круче зарплатной, чтобы звезда была
 *  событием сезона, а не привычкой: 65→~90k, 75→~215k, 85→~400k. */
export const TRANSFER_LIMIT = 2; // сделок за окно: решения, а не шопинг

/** Штраф за минусовый банк в месячном тике (322-0 Sd: happinessPenalty −6, famePenalty −0.25):
 *  жизнь в долг раскручивает спираль несчастья → уходы звёзд. Естественный тормоз жадности. */
export const NEGATIVE_BANK_PENALTY = { happiness: -6, fame: -0.25 } as const;

/** Спонсорский доход от ELO (m1.5.0, плейтест 2026-08-15: чемпион мира жил на стартовых
 *  $100k и тонул в −$82k/мес при зарплатах звёзд — успех наказывался). Мировой топ живёт
 *  на спонсорах: +$0.12k за очко ELO над стартом, потолок +$80k. 1300 → +24k, 1642 → +65k. */
export const SPONSOR_BONUS = { perElo: 0.12, maxK: 80 } as const;
export function sponsorBonusK(elo: number): number {
  return Math.max(0, Math.min(SPONSOR_BONUS.maxK, Math.round((elo - ELO_START) * SPONSOR_BONUS.perElo)));
}
export const TRANSFER_MARKET_SIZE = 6;
export function transferFeeK(ovr: number, rng: Rng): number {
  const base = 20 + 0.9 * Math.pow(Math.max(0, ovr - 55), 1.8);
  return Math.max(25, Math.round(base * (0.9 + rng.float() * 0.2)));
}

/** Случайные события между турнирами: шанс на «Продолжить», эффекты детерминированы
 *  по сиду. Тексты свои, механика — по мотивам живого прохода 322-0. `choice` — событие-
 *  решение (Bootcamp Opportunity): плоский эффект не применяется, игрок принимает либо нет.
 *
 *  Срез 7: выборы различаются ОСЬЮ, а не числами. bootcampOffer платит деньгами за
 *  настроение; streamDeal — зеркальный (деньги ЗА счёт настроения); heroClinic покупает
 *  героя в пул орга (глубина matching), и конкретный герой виден до решения. Ось славы
 *  сознательно не используется: fame в этой экономике только удорожает пересмотр зарплаты,
 *  и «награда славой» была бы ловушкой, а не выбором. */
export const RANDOM_EVENT_CHANCE = 0.25;
export type ManagerRandomEventKind =
  | "sponsorWindfall" | "fanMeetup" | "gearSponsor" | "burnout"
  | "bootcampOffer" | "streamDeal" | "heroClinic";
export interface RandomEventDef {
  cashK?: number;
  happiness?: number;
  /** Событие-выбор: принять = заплатить costK / получить cashK, сдвинуть настроение
   *  всему ростеру; hero добавляет заранее показанного героя в пул орга. */
  choice?: { costK?: number; cashK?: number; happiness?: number; hero?: boolean };
}
export const RANDOM_EVENTS: Record<ManagerRandomEventKind, RandomEventDef> = {
  sponsorWindfall: { cashK: 15 },
  gearSponsor: { cashK: 6 },
  fanMeetup: { happiness: 5 },
  burnout: { happiness: -4 },
  bootcampOffer: { choice: { costK: 20, happiness: 6 } },
  streamDeal: { choice: { cashK: 25, happiness: -3 } },
  heroClinic: { choice: { costK: 15, hero: true } },
};

/** Новая зарплата в оффсезоне: пересчёт от нового OVR, сглаженный к текущему контракту —
 *  договор пересматривают, а не подписывают с нуля. Слава дорожает: +4%/звезду. */
export function renegotiatedSalary(currentSalary: number, newOvr: number, rng: Rng, fameStars = 0): number {
  const fresh = salaryFor(newOvr, rng);
  const base = (currentSalary + fresh) / 2;
  return Math.max(4, Math.round(base * (1 + fameStars * FAME.salaryBumpPerStar)));
}
