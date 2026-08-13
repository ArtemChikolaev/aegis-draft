// Экономика Esports Manager (T5.5). Все числа синтезируются из нашей рейтинг-модели —
// рыночных данных о зарплатах нет (modes-scenarios §0), поэтому зарплата = функция OVR
// с детерминированным шумом по сиду. Правишь числа → бампай MANAGER_ECONOMY_VERSION:
// она лежит в сейве и честно инвалидирует несовместимую карьеру (как balanceConfigVersion).
import { Rng } from "../rng.ts";

export const MANAGER_ECONOMY_VERSION = "m1.2.0"; // m1.2.0: событие-выбор (буткемп) меняет роллы :re:

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

/** Зарплата в $k/мес из OVR + шум ±15%. Калибровка по наблюдениям 322-0 (2026-08-11):
 *  87→~41, 83→~30, 76→~22, 66→~10, 63→~8. Кривая степенная: звезда дороже суперлинейно. */
export function salaryFor(ovr: number, rng: Rng): number {
  const base = 6 + 0.25 * Math.pow(Math.max(0, ovr - 60), 1.5);
  const noisy = base * (0.85 + rng.float() * 0.3);
  return Math.max(4, Math.round(noisy));
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

/** Сдвиг среднего поля относительно силы состава игрока: выше тир — жёстче поле.
 *  Это и есть гейт квалификаций: в tier2 играешь на равных, финал сезона заметно сильнее. */
export const FIELD_OFFSET: Record<ManagerEventKind, { mean: number; sd: number }> = {
  tier2: { mean: -1, sd: 4 },
  qualifier: { mean: 1, sd: 4 },
  online: { mean: 4, sd: 4 },
  lan: { mean: 7, sd: 5 },
  finaleQual: { mean: 3, sd: 4 },
  finale: { mean: 9, sd: 5 },
};

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

/** Случайные события между турнирами: шанс на «Продолжить», эффекты детерминированы
 *  по сиду. Тексты свои, механика — по мотивам живого прохода 322-0. `choice` — событие-
 *  решение (Bootcamp Opportunity): плоский эффект не применяется, игрок платит либо нет. */
export const RANDOM_EVENT_CHANCE = 0.25;
export type ManagerRandomEventKind = "sponsorWindfall" | "fanMeetup" | "gearSponsor" | "burnout" | "bootcampOffer";
export interface RandomEventDef {
  cashK?: number;
  happiness?: number;
  /** Событие-выбор: принять = заплатить costK и получить happiness всему ростеру. */
  choice?: { costK: number; happiness: number };
}
export const RANDOM_EVENTS: Record<ManagerRandomEventKind, RandomEventDef> = {
  sponsorWindfall: { cashK: 15 },
  gearSponsor: { cashK: 6 },
  fanMeetup: { happiness: 5 },
  burnout: { happiness: -4 },
  bootcampOffer: { choice: { costK: 20, happiness: 6 } },
};

/** Новая зарплата в оффсезоне: пересчёт от нового OVR, сглаженный к текущему контракту —
 *  договор пересматривают, а не подписывают с нуля. Слава дорожает: +4%/звезду. */
export function renegotiatedSalary(currentSalary: number, newOvr: number, rng: Rng, fameStars = 0): number {
  const fresh = salaryFor(newOvr, rng);
  const base = (currentSalary + fresh) / 2;
  return Math.max(4, Math.round(base * (1 + fameStars * FAME.salaryBumpPerStar)));
}
