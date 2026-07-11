// Генерация паков (скилл scoring-model). Два стиля драфта:
//  - Team Packs: пак = реальный ростер команды на турнире; берёшь одного игрока (любая роль).
//  - Mixed Draft: пак = 5 игроков из РАЗНЫХ команд, по одному на слот; порядок строгий 1→5.
import type { EventInfo, Format, Pack, PackPlayer, Role } from "../types/data.ts";
import { Rng } from "./rng.ts";

/** 5 слотов ростера по порядку (Mixed идёт строго по нему). support ×2. */
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

/**
 * Mixed-пак: по одному кандидату на каждый слот ROLE_SEQUENCE, каждый — из своей команды.
 * Предпочитаем разные команды; если пул мал (мок) — допускаем повтор, но стараемся не дублировать.
 */
export function mixedPack(pool: Pack[], rng: Rng): DraftPack {
  const all = pool.flatMap(candidatesOf);
  const byRole = new Map<Role, Candidate[]>();
  for (const c of all) {
    const arr = byRole.get(c.player.role) ?? [];
    arr.push(c);
    byRole.set(c.player.role, arr);
  }

  const usedTeams = new Set<number>();
  const usedPlayers = new Set<number>();
  const candidates: Candidate[] = [];

  for (const role of ROLE_SEQUENCE) {
    const options = rng.shuffle(byRole.get(role) ?? []);
    // 1) свежая команда и игрок; 2) хотя бы свежий игрок; 3) что угодно
    const pickBy = (pred: (c: Candidate) => boolean) => options.find(pred);
    const chosen =
      pickBy((c) => !usedTeams.has(c.teamId) && !usedPlayers.has(c.player.accountId)) ??
      pickBy((c) => !usedPlayers.has(c.player.accountId)) ??
      options[0];
    if (chosen) {
      usedTeams.add(chosen.teamId);
      usedPlayers.add(chosen.player.accountId);
      candidates.push(chosen);
    }
  }

  const signatureHeroes = [...new Set(candidates.flatMap((c) => c.signatureHeroes))];
  return { kind: "mixed", label: "Free Agents", sublabel: "5 из разных команд", candidates, signatureHeroes };
}

/** Сгенерировать следующий пак под конфиг. opts.excludeTeamIds — для разнообразия Team-паков. */
export function generatePack(
  pool: Pack[],
  config: RunConfig,
  rng: Rng,
  opts: { excludeTeamIds?: Set<number> } = {},
): DraftPack {
  if (config.draftStyle === "mixed") return mixedPack(pool, rng);
  const exclude = opts.excludeTeamIds ?? new Set<number>();
  const available = pool.filter((p) => !exclude.has(p.teamId));
  const from = available.length > 0 ? available : pool;
  return teamPack(rng.pick(from));
}
