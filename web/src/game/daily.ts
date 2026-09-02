// Дейлик (PRD §5.14): один общий сид на всех на сутки, без сервера. Сид выводится из даты (UTC),
// конфиг фиксирован — поэтому у всех игроков одни и те же паки, а место сравнимо. Это тот же
// механизм, что челлендж по сид-коду (T3.14): дейлик лишь договаривается о сиде за игроков.
// Результаты живут в локальной карьере (careerStore) — по seed запись узнаётся как дейлик.
import type { RunConfig } from "./packs.ts";

export const DAILY_SEED_PREFIX = "daily-";

/** Фиксированные настройки дейлика: Standard-конфиг Quick Draft. Менять — только вместе с датой
 *  (прошлые записи карьеры сравнимы между собой лишь при одном конфиге). */
export const DAILY_CONFIG: RunConfig = {
  draftStyle: "team",
  format: "last_2y",
  rerolls: 1,
  scoring: "event",
  allocation: "auto",
  hardMode: false,
};

/** Календарный ключ дня по UTC: смена дейлика в один момент для всех часовых поясов. */
export function dailyDateKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function dailySeed(now: Date = new Date()): string {
  return `${DAILY_SEED_PREFIX}${dailyDateKey(now)}`;
}

/** Дата дейлика из сида (`YYYY-MM-DD`) либо null, если сид не дейличный. */
export function dailySeedDate(seed: string): string | null {
  const match = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(seed);
  return match ? match[1] : null;
}

export function isDailySeed(seed: string): boolean {
  return dailySeedDate(seed) !== null;
}

/** Короткая подпись дня для интерфейса («2 сент.» / «Sep 2»); день трактуется как UTC. */
export function formatDailyDate(dateKey: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${dateKey}T00:00:00Z`));
}
