// Mixed Draft: base игрока = успех его команды за окно, а не форма на конкретном событии
// (PRD §5.3, §5.4.3). Скилл scoring-model, раздел «Base».
//
// ЗАЧЕМ. В Mixed пятёрка собрана из разных команд, общего события у них нет, поэтому event
// OVR там несопоставим: замер по packs.json — один и тот же игрок встречается в 62 паках с
// OVR 60..91 (разброс 31). То есть число говорит не про игрока, а про то, какой ивент выпал
// рандому. Успех команды за окно — свойство игрока в этом окне, и оно сравнимо между командами.
//
// ЧТО СЕЙЧАС В ДАННЫХ (важно не переоценивать). `successScore` приходит из прокси-агрегатора
// pipeline/internal/domain.BuildTeamSuccess = сглаженный winrate × вес тира лиги. Компоненты
// PRD «плейсменты 40% + призовые 20% + топ-финиши 15%» в данных НУЛЕВЫЕ (проверено: 417 записей
// окон, titles/topFinishes/prizeUsd = 0 во всех) — они выводятся из Liquipedia, а T1.3 ⛔.
// Полная реализация v1.2.0 лежит в pipeline/internal/teamsuccess, но не подключена.
// Когда Liquipedia приедет, поменяются ВХОДНЫЕ данные, а нормализация ниже останется той же.
//
// ПОЧЕМУ НОРМАЛИЗАЦИЯ ЗДЕСЬ, А НЕ В GO. Сырой successScore живёт в своей шкале (замер:
// медиана 32, диапазон 15.6..54.7), а игровая шкала — event OVR (медиана 74, 54..99) и сила
// ботов Normal(86,5). Подставить сырое число в base нельзя: команда получила бы Team OVR ~38
// против ботов ~86 и по ELO проигрывала бы каждую серию с вероятностью ~99%. Отображение
// одной шкалы на другую — это баланс, как и сам `Team OVR = base + synergy + chemistry`,
// поэтому оно живёт на фронте и меняется без пересборки датасета (см. data-contract,
// инвариант «сырые числа в данных, сглаживание/калибровка на клиенте»).

import type { Format, PackPlayer, TeamSuccess } from "../types/data.ts";

/** Параметры отображения успеха команды в игровую шкалу. Версионируются с моделью. */
export const MIXED_BASE = {
  /** Полоса силы команды ДО поправки на игрока. Калибрована по РЕАЛИЗОВАННОЙ медиане Team OVR
   *  (60 забегов на стиль, реальный датасет), а не по медиане когорты: игрок берёт не среднюю
   *  команду, а лучшую доступную, поэтому «середина полосы = медиана OVR» давала перекос
   *  Mixed +5 очков (83.4 против 78.3) и делала режим строго выгоднее. Замер на 48..76:
   *  Team Packs 78.3 (p10 72.6, p90 84.2) · Mixed 76.8 (p10 70.0, p90 83.8) — распределения
   *  перекрываются, ни один стиль не доминирует, оба играбельны против ботов Normal(86,5).
   *  Потолок 76 держит 76 × 1.2 = 91.2 ниже клампа 100: на 95 верхний перцентиль насыщался и
   *  терял разрешение (сильная и очень сильная команда давали одно число) — поймано тестом.
   *  Данные поменяются существенно → перепроверить тем же замером. */
  min: 48,
  max: 76,
  /** Поправка на индивидуальную форму, дословно PRD §5.4.3: 0.8 + 0.4·OVR/100 (OVR 50 нейтрален). */
  factorBase: 0.8,
  factorSpan: 0.4,
} as const;

/** Когорта одного format-scope: отсортированные successScore всех команд с данными.
 *  Скилл требует явный scope — окна не должны смешиваться молча. */
export type SuccessCohort = { format: Format; sorted: number[] };

export function buildSuccessCohort(teamSuccess: TeamSuccess, format: Format): SuccessCohort {
  const sorted: number[] = [];
  for (const windows of Object.values(teamSuccess)) {
    const score = windows[format]?.successScore;
    if (typeof score === "number" && Number.isFinite(score)) sorted.push(score);
  }
  sorted.sort((a, b) => a - b);
  return { format, sorted };
}

/** Есть ли у команды успех за это окно. Mixed-пак не должен предлагать команду без данных:
 *  PRD запрещает нейтральный fallback, а бросать исключение посреди забега — хуже, чем
 *  не показать команду вовсе (см. фильтр в generatePack). */
export function hasTeamSuccess(teamSuccess: TeamSuccess, teamId: number, format: Format): boolean {
  const score = teamSuccess[String(teamId)]?.[format]?.successScore;
  return typeof score === "number" && Number.isFinite(score);
}

/** Mixed-паку нужны 5 игроков из 5 РАЗНЫХ команд, поэтому меньше пяти команд с данными
 *  в окне — режим в нём неиграбелен. */
export const MIXED_MIN_TEAMS = 5;

/** Доступен ли Mixed в этом окне. Проверяем по данным, а не по имени формата: сегодня пустой
 *  только valve_legacy (плейсменты/призовые ждут Liquipedia, T1.3 ⛔), и когда он наполнится,
 *  режим откроется сам — без правки кода. */
export function mixedSupportsFormat(teamSuccess: TeamSuccess, format: Format): boolean {
  return buildSuccessCohort(teamSuccess, format).sorted.length >= MIXED_MIN_TEAMS;
}

/** Перцентиль значения в когорте → [0,1]. Пустая когорта → 0.5 (нейтраль). */
function percentile(cohort: SuccessCohort, score: number): number {
  const n = cohort.sorted.length;
  if (n === 0) return 0.5;
  if (n === 1) return 0.5;
  // Доля команд строго слабее + половина равных — устойчиво к дубликатам скора.
  let below = 0;
  let equal = 0;
  for (const value of cohort.sorted) {
    if (value < score) below += 1;
    else if (value === score) equal += 1;
  }
  return (below + equal / 2) / n;
}

/** Успех команды в игровой шкале (без поправки на игрока). */
export function teamStrength(cohort: SuccessCohort, teamSuccess: TeamSuccess, teamId: number): number {
  const score = teamSuccess[String(teamId)]?.[cohort.format]?.successScore;
  if (typeof score !== "number" || !Number.isFinite(score)) {
    // Сюда не должны доходить: generatePack отфильтровывает такие команды заранее.
    throw new Error(`Нет team-success для команды ${teamId} в окне ${cohort.format}`);
  }
  const p = percentile(cohort, score);
  return MIXED_BASE.min + p * (MIXED_BASE.max - MIXED_BASE.min);
}

/** Base одного игрока в Mixed: успех команды × ограниченная поправка на его форму. */
export function mixedPlayerBase(
  cohort: SuccessCohort,
  teamSuccess: TeamSuccess,
  teamId: number,
  ovr: number,
): number {
  const team = teamStrength(cohort, teamSuccess, teamId);
  const factor = MIXED_BASE.factorBase + MIXED_BASE.factorSpan * (ovr / 100);
  return Math.min(100, Math.max(0, team * factor));
}

/** Base пятёрки в Mixed — среднее по игрокам, как и event-версия (baseRating). */
export function mixedBaseRating(
  players: PackPlayer[],
  teamIdByPlayer: Map<number, number>,
  teamSuccess: TeamSuccess,
  format: Format,
): number {
  if (players.length === 0) return 0;
  const cohort = buildSuccessCohort(teamSuccess, format);
  let sum = 0;
  for (const player of players) {
    const teamId = teamIdByPlayer.get(player.accountId);
    if (teamId === undefined) throw new Error(`Нет teamId для игрока ${player.accountId} в Mixed`);
    sum += mixedPlayerBase(cohort, teamSuccess, teamId, player.ovr);
  }
  return sum / players.length;
}
