// Генерация паков (скилл scoring-model). Два стиля драфта:
//  - Team Packs: пак = реальный ростер команды на турнире; берёшь одного игрока (любая роль).
//  - Mixed Draft: пак = 5 игроков из РАЗНЫХ команд, по одному на слот; порядок выбора свободный.
import type { MutatorId } from "./dynastyMutators.ts";
import type { EventInfo, Format, Pack, PackPlayer, Role } from "../types/data.ts";
import { Rng } from "./rng.ts";

/** 5 слотов ростера. support ×2. */
export const ROLE_SEQUENCE: Role[] = ["safelane", "mid", "offlane", "support", "support"];

export type DraftStyle = "team" | "mixed";
export type Scoring = "event" | "peak";
export type Allocation = "auto" | "manual";

export interface RunConfig {
  draftStyle: DraftStyle;
  format: Format;
  /** число рерроллов; Infinity = бесконечно (Easy). */
  rerolls: number;
  scoring: Scoring;
  allocation: Allocation;
  /** Хардкор: закрывает профили игроков и перевыбор соперников. Опционально — старые
   *  сейвы и записи карьеры читаются без него (см. state/runPersist, state/careerStore).
   *  На движок НЕ влияет: ограничивает только доступные игроку действия, не RNG. */
  hardMode?: boolean;
  /** Cheat Mode — правило КОНКРЕТНОГО забега (R2.1), а не глобальная настройка приложения:
   *  иначе непонятно, к какому seed и сейву оно относится. Бесконечное золото; забег помечается
   *  несоревновательным и не двигает мета-прогрессию. Опционально — старые сейвы и ссылки
   *  читаются как `false`. Только Roguelite Run; взаимоисключающ с `hardMode`.
   *  На RNG не влияет: меняет только проверку платёжеспособности, не потоки роллов. */
  cheatMode?: boolean;
  /** Stake (T6.4): добровольное правило, под которым играется весь сезон Roguelite Run —
   *  то же множество, что мутаторы кругов Династии (решение 2026-08-09 «мутаторы = Stakes»).
   *  Опционально — старые сейвы/ссылки читаются без него. Только Roguelite Run; с Cheat Mode
   *  не совмещается (несоревновательный забег не носит соревновательную метку). */
  stake?: MutatorId;
}

/** Кандидат в паке — игрок с указанием происхождения. */
export interface Candidate {
  player: PackPlayer;
  teamId: number;
  teamName: string;
  /** Логотип команды (CDN). Необязателен: у части исторических команд его нет — UI держит фолбэк. */
  logoUrl?: string;
  eventId: string;
  signatureHeroes: number[];
}

/** Stable pointer to a candidate inside the versioned dataset.
 *  accountId alone is insufficient: the same player may have several event/team snapshots. */
export interface CandidateRef {
  accountId: number;
  teamId: number;
  eventId: string;
}

export function candidateRef(candidate: Candidate): CandidateRef {
  return {
    accountId: candidate.player.accountId,
    teamId: candidate.teamId,
    eventId: candidate.eventId,
  };
}

export function candidateMatchesRef(candidate: Candidate, ref: CandidateRef): boolean {
  return candidate.player.accountId === ref.accountId
    && candidate.teamId === ref.teamId
    && candidate.eventId === ref.eventId;
}

export interface DraftPack {
  kind: DraftStyle;
  label: string;
  sublabel?: string;
  /** Логотип команды — только у team-пака: в Mixed команда у каждого кандидата своя, и общего
   *  знака у пака не существует. Необязателен, как и везде: покрытие неполное. */
  logoUrl?: string;
  /** Команда пака — по ней UI находит знак в локальном зеркале арта (T11.2). У Mixed её нет
   *  по той же причине, что и общего логотипа. */
  teamId?: number;
  /** Team: 5 игроков команды. Mixed: 5 кандидатов, индекс = слот ROLE_SEQUENCE. */
  candidates: Candidate[];
  signatureHeroes: number[];
}

/** Доступен ли пак в окне. Источник истины — `pack.formats`: они у́же формата события, потому
 *  что пайплайн срезает окна, где команда разовая (гейт присутствия, TDATA3). Фолбэк на окна
 *  события — для датасетов до появления поля; проверка события остаётся в обоих ветках, чтобы
 *  пак не пережил выпадение своего события из окна. */
export function packInFormat(pack: Pack, event: EventInfo | undefined, format: Format): boolean {
  if (!event?.formats?.includes(format)) return false;
  return pack.formats ? pack.formats.includes(format) : true;
}

/** Паки, доступные в выбранном формате. */
export function poolForFormat(packs: Pack[], events: EventInfo[], format: Format): Pack[] {
  const eventById = new Map(events.map((e) => [e.id, e]));
  return packs.filter((p) => packInFormat(p, eventById.get(p.eventId), format));
}

export function candidatesOf(pack: Pack): Candidate[] {
  return pack.players.map((player) => ({
    player,
    teamId: pack.teamId,
    teamName: pack.teamName,
    logoUrl: pack.logoUrl,
    eventId: pack.eventId,
    signatureHeroes: pack.signatureHeroes,
  }));
}

/** Обёртка реального ростера команды в DraftPack. */
export function teamPack(pack: Pack): DraftPack {
  return {
    kind: "team",
    label: pack.teamName,
    sublabel: pack.eventId,
    logoUrl: pack.logoUrl,
    teamId: pack.teamId,
    candidates: candidatesOf(pack),
    signatureHeroes: pack.signatureHeroes,
  };
}

/** Mixed-пак: ровно один кандидат на слот, все игроки и команды уникальны.
 *  excludePlayers — уже драфтованные игроки (не предлагать повторно). */
export function mixedPack(
  pool: Pack[],
  rng: Rng,
  excludePlayers: Set<number> = new Set(),
  /** Команда без team-success не может быть оценена в Mixed (PRD запрещает нейтральный
   *  fallback), поэтому её не показываем вовсе — это честнее, чем падать посреди забега. */
  teamAllowed: (teamId: number) => boolean = () => true,
): DraftPack {
  const all = pool
    .flatMap(candidatesOf)
    .filter((c) => !excludePlayers.has(c.player.accountId) && teamAllowed(c.teamId));
  const byRole = new Map<Role, Candidate[]>();
  for (const c of all) {
    const arr = byRole.get(c.player.role) ?? [];
    arr.push(c);
    byRole.set(c.player.role, arr);
  }

  const optionsByRole = new Map(
    [...byRole].map(([role, candidates]) => [role, rng.shuffle(candidates)]),
  );
  const candidates = findMixedLineup(optionsByRole, 0, new Set(), new Set(), []);
  if (!candidates) {
    const counts = ROLE_SEQUENCE.map((role) => `${role}:${byRole.get(role)?.length ?? 0}`).join(", ");
    throw new Error(`Нельзя собрать Mixed pack: нужны 5 уникальных игроков из 5 разных команд (${counts})`);
  }

  const signatureHeroes = [...new Set(candidates.flatMap((c) => c.signatureHeroes))];
  return { kind: "mixed", label: "Free Agents", sublabel: "5 из разных команд", candidates, signatureHeroes };
}

function findMixedLineup(
  optionsByRole: Map<Role, Candidate[]>,
  slot: number,
  usedTeams: Set<number>,
  usedPlayers: Set<number>,
  chosen: Candidate[],
): Candidate[] | null {
  if (slot === ROLE_SEQUENCE.length) return [...chosen];
  const role = ROLE_SEQUENCE[slot];
  for (const candidate of optionsByRole.get(role) ?? []) {
    if (usedTeams.has(candidate.teamId) || usedPlayers.has(candidate.player.accountId)) continue;
    usedTeams.add(candidate.teamId);
    usedPlayers.add(candidate.player.accountId);
    chosen.push(candidate);
    const result = findMixedLineup(optionsByRole, slot + 1, usedTeams, usedPlayers, chosen);
    if (result) return result;
    chosen.pop();
    usedPlayers.delete(candidate.player.accountId);
    usedTeams.delete(candidate.teamId);
  }
  return null;
}

/** Сгенерировать следующий пак под конфиг. excludeTeamIds — мягкий анти-повтор Team-паков;
 *  excludePlayerIds — уже драфтованные игроки (для Mixed, чтобы не предлагать повторно). */
export function generatePack(
  pool: Pack[],
  config: RunConfig,
  rng: Rng,
  opts: { excludeTeamIds?: Set<number>; excludePlayerIds?: Set<number>; teamAllowed?: (teamId: number) => boolean } = {},
): DraftPack {
  if (config.draftStyle === "mixed") {
    return mixedPack(pool, rng, opts.excludePlayerIds ?? new Set(), opts.teamAllowed);
  }
  const exclude = opts.excludeTeamIds ?? new Set<number>();
  const available = pool.filter((p) => !exclude.has(p.teamId));
  const from = available.length > 0 ? available : pool;
  return teamPack(rng.pick(from));
}
