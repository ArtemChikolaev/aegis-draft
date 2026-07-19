// Генерация паков (скилл scoring-model). Два стиля драфта:
//  - Team Packs: пак = реальный ростер команды на турнире; берёшь одного игрока (любая роль).
//  - Mixed Draft: пак = 5 игроков из РАЗНЫХ команд, по одному на слот; порядок выбора свободный.
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
}

/** Кандидат в паке — игрок с указанием происхождения. */
export interface Candidate {
  player: PackPlayer;
  teamId: number;
  teamName: string;
  eventId: string;
  signatureHeroes: number[];
}

export interface DraftPack {
  kind: DraftStyle;
  label: string;
  sublabel?: string;
  /** Team: 5 игроков команды. Mixed: 5 кандидатов, индекс = слот ROLE_SEQUENCE. */
  candidates: Candidate[];
  signatureHeroes: number[];
}

/** Паки, чьё событие входит в выбранный формат. */
export function poolForFormat(packs: Pack[], events: EventInfo[], format: Format): Pack[] {
  const formatsByEvent = new Map(events.map((e) => [e.id, e.formats]));
  return packs.filter((p) => formatsByEvent.get(p.eventId)?.includes(format));
}

function candidatesOf(pack: Pack): Candidate[] {
  return pack.players.map((player) => ({
    player,
    teamId: pack.teamId,
    teamName: pack.teamName,
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
