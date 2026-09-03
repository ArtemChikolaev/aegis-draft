// Playbook (T6.4, срез 2; PRD §5.10.2 п.5): добровольный набор из 6–10 карт (Tactics + Items),
// собранный в Штабе и включаемый перед забегом как Stakes. В забеге с Playbook карточные награды и
// trade-in берутся ТОЛЬКО из него; Camp Actions — утилиты, а не билд, и в Playbook не входят.
// Силы это не добавляет (карты из Playbook не активны со старта) — меняется предсказуемость билда.
// Решения пользователя 2026-09-02: фильтр добровольный (без Playbook пул как прежде), размер 6–10 с
// подсказкой 8, дейлик всегда без Playbook, сид-код/сейв несут список карт.
import { ITEM_IDS } from "./items.ts";
import { TACTIC_IDS } from "./tactics.ts";

export const PLAYBOOK_MIN = 6;
export const PLAYBOOK_MAX = 10;
export const PLAYBOOK_RECOMMENDED = 8;

/** Карты, из которых собирается Playbook: тактики и предметы, в порядке каталога. */
export const PLAYBOOK_CARD_IDS: readonly string[] = [...TACTIC_IDS, ...ITEM_IDS];

export function isPlaybookCard(cardId: string): boolean {
  return PLAYBOOK_CARD_IDS.includes(cardId);
}

/** Канонический Playbook: уникальные известные карты в порядке каталога; null — если размер вне
 *  6–10 или есть чужие id. Канон нужен, чтобы ссылка/сейв/сравнение конфигов не зависели от
 *  порядка кликов игрока. */
export function normalizePlaybook(ids: readonly string[]): string[] | null {
  const set = new Set(ids);
  if (set.size !== ids.length) return null;
  if (![...set].every(isPlaybookCard)) return null;
  if (set.size < PLAYBOOK_MIN || set.size > PLAYBOOK_MAX) return null;
  return PLAYBOOK_CARD_IDS.filter((id) => set.has(id));
}

/** Проходит ли карта фильтр Playbook. Без Playbook — всё; действия сбора — всегда. */
export function playbookAllows(playbook: readonly string[] | undefined, cardId: string): boolean {
  if (!playbook) return true;
  if (!isPlaybookCard(cardId)) return true;
  return playbook.includes(cardId);
}

export function samePlaybook(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  return [...(left ?? [])].sort().join(".") === [...(right ?? [])].sort().join(".");
}
