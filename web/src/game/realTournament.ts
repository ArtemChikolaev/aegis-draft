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
  type ScoreBreakdown,
} from "./score.ts";
import { PREP } from "./prep.ts";
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
  /** Сила поля: медиана и лидер среди топ-17 — подпись сложности в селекте события. */
  fieldMedian: number;
  fieldTop: number;
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
    .filter((event) => (byEvent.get(event.id)?.length ?? 0) >= REAL_FIELD_OPPONENTS)
    .map((event) => {
      const packs = byEvent.get(event.id)!;
      // Та же сортировка и срез, что у buildRealField: подпись в селекте обязана совпадать с полем.
      const strengths = packs.map((pack) => realPackStrength(data, pack)).sort((a, b) => b - a).slice(0, REAL_FIELD_OPPONENTS);
      return {
        eventId: event.id,
        name: event.name,
        year: event.year ?? null,
        type: event.type,
        packCount: packs.length,
        fieldMedian: strengths[Math.floor(strengths.length / 2)],
        fieldTop: strengths[0],
      };
    })
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name));
}

/** Честная сила реального состава: тот же scoreTeam, что считает пятёрку игрока, — Base их
 *  event-OVR + Hero Synergy по их сигнатуркам. Никакой botStrength: «сила соперников честная,
 *  а не рандом» (modes-scenarios §2.3).
 *
 *  Chemistry полю НЕ начисляется (RT-D, 2026-08-23). Два довода, оба из замера на 300 сидах:
 *  (1) event-OVR реального состава уже содержит результат игры с этими тиммейтами — Chemistry
 *  в нашей формуле это драфт-механика «собери сыгравшихся», и начислять её поверх event-снапшота
 *  значит считать сыгранность дважды; (2) челленджеру она структурно недоступна: сыгранность
 *  (≥230 общих игр на пару) есть только у долгих топ-кор, и ровно они залочены событием — даже
 *  безлимитные рероллы и «стак из одного исторического ростера» давали chem ≤ 2.6 против +7.4
 *  (медиана поля) / +13 (топ). С Chemistry поле EWC 2026 давало 0% побед, 3.7% топ-8 и 33%
 *  последних мест при жадном драфте; без неё — 2% / 36% / 9%: андердог остаётся андердогом, но
 *  у выбора события появляется смысл сложности. Подробности — BACKLOG T5.6, PRD §5.9.1. */
export function realPackStrength(data: GameData, pack: Pack): number {
  const score = realPackScore(data, pack);
  return Math.round((score.base + score.heroSynergy) * 10) / 10;
}

/** Слагаемые честной силы состава — разбору соперника (RT-E срез 2) нужна отдельно его
 *  Hero Synergy: именно её режет прочитанная сигнатурная мета. */
export function realPackScore(data: GameData, pack: Pack): ScoreBreakdown {
  const roster = candidatesOf(pack).map((candidate) => ({ candidate }));
  const signatures = Object.fromEntries(
    pack.players.map((player) => [player.accountId, pack.signatureHeroes]),
  );
  return scoreTeam(
    pack.players,
    pack.signatureHeroes,
    heroStatsForAssignment(data),
    data.squadSynergy,
    data.teammates,
    chemistryPlayersFromRoster(roster),
    signatures,
  );
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

/** Сила состава поля под разбором соперника (RT-E срез 2): сигнатурные герои прочитаны —
 *  Hero Synergy режется на PREP.scoutSynergyCut; Base нетронут (класс игроков разбором не отнять). */
export function scoutedPackStrength(data: GameData, pack: Pack): number {
  const score = realPackScore(data, pack);
  return Math.round((score.base + score.heroSynergy * (1 - PREP.scoutSynergyCut)) * 10) / 10;
}

/** Поле под разборами челленджера: те же 17 составов (поле известно заранее и не меняется),
 *  разобранные пересчитаны с урезанной Hero Synergy; порядок по силе обновляется. Без разборов —
 *  тот же объект. */
export function rescoreRealField(data: GameData, field: RealField, scouted: ReadonlySet<string>): RealField {
  if (scouted.size === 0) return field;
  const packs = new Map(data.packs.filter((pack) => pack.eventId === field.eventId).map((pack) => [pack.id, pack]));
  const opponents = field.opponents
    .map((opponent) => {
      const pack = scouted.has(opponent.id) ? packs.get(opponent.id) : undefined;
      return pack ? { ...opponent, strength: scoutedPackStrength(data, pack) } : opponent;
    })
    .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));
  return { ...field, opponents };
}

/** Что даст разбор каждого состава поля: его сила сейчас, после разбора и потеря — подпись
 *  строки на экране подготовки. Уже разобранные помечены, чтобы UI не предлагал их повторно. */
export interface ScoutOption {
  teamId: string;
  name: string;
  strength: number;
  scoutedStrength: number;
  loss: number;
  scouted: boolean;
}

export function scoutOptions(data: GameData, field: RealField, scouted: ReadonlySet<string>): ScoutOption[] {
  const packs = new Map(data.packs.filter((pack) => pack.eventId === field.eventId).map((pack) => [pack.id, pack]));
  return field.opponents.flatMap((opponent) => {
    const pack = packs.get(opponent.id);
    if (!pack) return [];
    const strength = realPackStrength(data, pack);
    const scoutedStrength = scoutedPackStrength(data, pack);
    return [{
      teamId: opponent.id, name: opponent.name, strength, scoutedStrength,
      loss: Math.round((strength - scoutedStrength) * 10) / 10, scouted: scouted.has(opponent.id),
    }];
  });
}

/* ─── Underdog-подача (T5.6 срез 2, modes-scenarios §2.5.1) ───
 * Прогноз места (projection) считается от силы состава — в Real Tournament он и есть «сид
 * посева» челленджера среди реального поля. Сравнение с фактом на терминале превращает прогноз
 * в явный вызов: «ты 17-18-й — пробей выше». Чистая арифметика диапазонов, никакого Rng. */

export type UnderdogVerdict = "beat" | "met" | "missed";

/** Диапазон мест бакета: и projection, и placement — интервалы, сравниваем интервалами.
 *  Ключи бакетов приходят строками вида "1" | "2-4" | "5-8" | ... — парсинг общий. */
function bucketRange(key: string): [number, number] {
  const [lo, hi] = key.split("-").map(Number);
  return [lo, hi ?? lo];
}

/** Вердикт: финиш целиком выше прогноза — «пробил», пересекается — «в прогноз», ниже — «мимо». */
export function underdogVerdict(projection: string, placement: string): UnderdogVerdict {
  const [projLo, projHi] = bucketRange(projection);
  const [placeLo, placeHi] = bucketRange(placement);
  if (placeHi < projLo) return "beat";
  if (placeLo > projHi) return "missed";
  return "met";
}
