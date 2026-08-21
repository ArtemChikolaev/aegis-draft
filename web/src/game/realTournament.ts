// Real Tournament (T5.6): поле турнира = РЕАЛЬНЫЕ составы выбранного события, игрок собирает
// challenger-пятёрку из тех, кого на событии не было (roster lock по каноническому accountId).
// Не новый движок, а два переиспользования (modes-scenarios §2.3): TournamentEngine получает
// явное поле (как финал Manager, срез 6), а challenger-драфт — обычный mixed-пак RunEngine с
// lock-исключением через существующий механизм usedPlayers.
//
// Решения (2026-08-19, BACKLOG T5.6):
//  - RT-A: событие выбирается СПИСКОМ (фантазия режима — «сыграть этот турнир»); сид остаётся
//    осью воспроизводимости (симуляция + пак-рулетка challenger-драфта).
//  - RT-B: форма СВОЕЙ эпохи как есть — сила поля и челленджеров считается их event-снапшотами
//    (никакой нормализации между эпохами; дисбаланс виден через projection, underdog — фича).
//  - RT-C: challenger-пул = пак-снапшоты выбранного формата (ось Format остаётся рабочей —
//    это «эпоха» пула легенд) минус ВСЕ аккаунты события: лочится событие целиком, а не только
//    топ-17 поля, — «в этом турнире нет» из питча.
//  - Реальный исход НЕ реплеим: placements deferred до Liquipedia — поле воспроизводится по
//    силе, турнир симулируется по сиду (UI обязан говорить «симуляция», см. i18n).
import type { GameData, Pack } from "../types/data.ts";
import type { TournamentTeam } from "./tournament.ts";
import { monogramOf, SIGIL_COLORS } from "./tournament.ts";
import {
  chemistryPlayersFromRoster,
  heroStatsForAssignment,
  scoreTeam,
} from "./score.ts";
import { candidatesOf } from "./packs.ts";

/** Поле сетки — константа движка: 2 группы × 9, юзер + 17 соперников. */
export const REAL_FIELD_OPPONENTS = 17;

export interface RealEventOption {
  eventId: string;
  name: string;
  year: number | null;
  type: string;
  /** Сколько реальных составов есть у события (может быть больше поля — слабейшие отсекаются). */
  packCount: number;
}

export interface RealField {
  eventId: string;
  eventName: string;
  /** Ровно 17 соперников, отсортированы по силе (сильнейший первым). */
  opponents: TournamentTeam[];
  /** ВСЕ аккаунты события (всех его паков, не только поля) — исключаются из challenger-пула. */
  lockedAccounts: ReadonlySet<number>;
}

function packsByEvent(data: GameData): Map<string, Pack[]> {
  const map = new Map<string, Pack[]>();
  for (const pack of data.packs) {
    const arr = map.get(pack.eventId) ?? [];
    arr.push(pack);
    map.set(pack.eventId, arr);
  }
  return map;
}

/** Каталог событий, играбельных как Real Tournament: реальных составов хватает на полное поле.
 *  Порядок — новые сверху (год, затем имя): список читается как история сцены. */
export function realTournamentEvents(data: GameData): RealEventOption[] {
  const byEvent = packsByEvent(data);
  return data.events
    .map((event) => ({
      eventId: event.id,
      name: event.name,
      year: event.year ?? null,
      type: event.type,
      packCount: byEvent.get(event.id)?.length ?? 0,
    }))
    .filter((option) => option.packCount >= REAL_FIELD_OPPONENTS)
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name));
}

/** Честная сила реального состава: тот же scoreTeam, что считает пятёрку игрока, — Base их
 *  event-OVR + Hero Synergy по их сигнатуркам + Chemistry их реальных пар. Никакой botStrength:
 *  «сила соперников честная, а не рандом» (modes-scenarios §2.3). */
export function realPackStrength(data: GameData, pack: Pack): number {
  const roster = candidatesOf(pack).map((candidate) => ({ candidate }));
  const signatures = Object.fromEntries(
    pack.players.map((player) => [player.accountId, pack.signatureHeroes]),
  );
  const score = scoreTeam(
    pack.players,
    pack.signatureHeroes,
    heroStatsForAssignment(data),
    data.squadSynergy,
    data.teammates,
    chemistryPlayersFromRoster(roster),
    signatures,
  );
  return Math.round(score.teamOvr * 10) / 10;
}

/**
 * Построить реальное поле события. Fail-fast: событие с < 17 составами — ошибка данных/каталога
 * (каталог realTournamentEvents такие не отдаёт), молча ослаблять lock или добивать ботами
 * запрещено (PRD §5.9.1).
 *
 * Детерминизм: сила считается из данных (без Rng), сортировка с tie-break по id пака —
 * тот же датасет ⇒ то же поле, сид на состав поля не влияет (он решает только исход матчей).
 */
export function buildRealField(data: GameData, eventId: string): RealField {
  const event = data.events.find((item) => item.id === eventId);
  const packs = packsByEvent(data).get(eventId) ?? [];
  if (!event || packs.length < REAL_FIELD_OPPONENTS) {
    throw new Error(
      `Real Tournament: событие ${eventId} не собирает поле (${packs.length}/${REAL_FIELD_OPPONENTS} составов)`,
    );
  }

  const scored = packs
    .map((pack) => ({ pack, strength: realPackStrength(data, pack) }))
    .sort((a, b) => b.strength - a.strength || a.pack.id.localeCompare(b.pack.id));
  const field = scored.slice(0, REAL_FIELD_OPPONENTS);

  const year = event.year != null ? String(event.year) : event.startDate?.slice(0, 4) ?? "";
  // Монограммы реальных имён МОГУТ совпадать (Team Spirit / Team Secret → TS): у ботов
  // уникальность гарантирует генератор имён, у реальных команд имена не наши — различает
  // цвет опознания и само имя в строке.
  const opponents = field.map(({ pack, strength }, index) => ({
    id: pack.id,
    name: pack.teamName,
    eventLabel: [event.short ?? event.name, year].filter(Boolean).join(" · "),
    strength,
    isUser: false,
    sigil: { monogram: monogramOf(pack.teamName), color: index % SIGIL_COLORS },
  }));

  // Lock — по ВСЕМ пакам события: игрок, сыгравший турнир, не может быть и в поле, и в
  // challenger-пятёрке, даже если его состав не попал в топ-17.
  const lockedAccounts = new Set<number>();
  for (const pack of packs) {
    for (const player of pack.players) lockedAccounts.add(player.accountId);
  }
  return { eventId, eventName: event.name, opponents, lockedAccounts };
}
