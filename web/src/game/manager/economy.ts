// Экономика Esports Manager (T5.5). Все числа синтезируются из нашей рейтинг-модели —
// рыночных данных о зарплатах нет (modes-scenarios §0), поэтому зарплата = функция OVR
// с детерминированным шумом по сиду. Правишь числа → бампай MANAGER_ECONOMY_VERSION:
// она лежит в сейве и честно инвалидирует несовместимую карьеру (как balanceConfigVersion).
import { Rng } from "../rng.ts";

export const MANAGER_ECONOMY_VERSION = "m1.0.0";

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

/** Дрифт формы в оффсезоне: целое в [−3, +3] (322-0: driftMin/Max). */
export function offseasonDrift(rng: Rng): number {
  return rng.int(7) - 3;
}

/** Новая зарплата в оффсезоне: пересчёт от нового OVR, сглаженный к текущему контракту —
 *  договор пересматривают, а не подписывают с нуля. */
export function renegotiatedSalary(currentSalary: number, newOvr: number, rng: Rng): number {
  const fresh = salaryFor(newOvr, rng);
  return Math.max(4, Math.round((currentSalary + fresh) / 2));
}
