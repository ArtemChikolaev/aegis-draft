import type { RunConfig } from "../game/packs.ts";
import type { RosterSlot } from "../game/engine.ts";
import type { DraftPack } from "../game/packs.ts";
import type { GameData, Role } from "../types/data.ts";
import type { ScoreBreakdown } from "../game/score.ts";
import {
  heroSynergyRows,
  squadChemistryRows,
  heroStatsForAssignment,
} from "../game/score.ts";

const ROLE: Record<Role, string> = {
  safelane: "carry",
  mid: "mid",
  offlane: "off",
  support: "sup",
};

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

function heroName(data: GameData, id: number | null | undefined): string {
  if (id == null) return "—";
  return data.heroes.find((h) => h.id === id)?.name ?? `#${id}`;
}

function nick(data: GameData, accountId: number): string {
  return data.players[String(accountId)]?.nickname ?? `#${accountId}`;
}

function heroList(data: GameData, ids: number[]): string {
  return ids.map((id) => heroName(data, id)).join(", ");
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function formatPack(data: GameData, pack: DraftPack, offerHeroes: number[]): string[] {
  const lines: string[] = [];
  const event = pack.sublabel ? ` · ${pack.sublabel}` : "";
  lines.push(`Pack «${pack.label}»${event}`);
  for (const c of pack.candidates) {
    lines.push(
      `  ${pad(c.player.nickname, 14)} ${pad(ROLE[c.player.role], 5)} OVR ${c.player.ovr}`,
    );
  }
  if (offerHeroes.length > 0) {
    lines.push(`Offer: ${heroList(data, offerHeroes)}`);
  }
  return lines;
}

function formatScore(
  data: GameData,
  config: RunConfig,
  roster: RosterSlot[],
  score: ScoreBreakdown,
): string[] {
  const lines: string[] = [];
  const ovr = Math.round(score.teamOvr);
  lines.push(
    `Score  OVR ${ovr}  (= base ${fmt1(score.base)} + syn ${fmt1(score.heroSynergy)} + chem ${fmt1(score.chemistry)})`,
  );

  const rosterCandidates = roster.map((s) => s.candidate);
  const phs = heroStatsForAssignment(data, config.scoring, rosterCandidates);
  const synergyRows = heroSynergyRows(roster, score.assignment, phs);
  for (const r of synergyRows) {
    const hero = heroName(data, r.heroId);
    const games = r.games > 0 ? ` ${r.games}g` : "";
    lines.push(`  ${pad(r.nickname, 14)} → ${hero}${games}`);
  }

  const chemistryRows = squadChemistryRows(roster, data.squadSynergy, data.teammates)
    .filter((r) => r.bonus > 0)
    .slice(0, 10);
  for (const r of chemistryRows) {
    lines.push(
      `  chem ${r.nicknameA} + ${r.nicknameB}  ${r.games}g  +${fmt1(r.bonus)}`,
    );
  }

  return lines;
}

export function formatDraftSnap(input: {
  action: string;
  config: RunConfig;
  data: GameData;
  snapshot: {
    currentPack: DraftPack;
    packHeroes: number[];
    heroes: number[];
    roster: RosterSlot[];
    rosterFilled: number;
    isComplete: boolean;
    score: ScoreBreakdown | null;
  };
  detail?: Record<string, unknown>;
}): { headline: string; body: string } {
  const { action, config, data, snapshot, detail } = input;
  const { rosterFilled, heroes, isComplete } = snapshot;
  const heroCount = heroes.length;

  let headline = action;
  if (action === "pickPlayer" && detail?.nickname) {
    const role = detail.role ? ROLE[detail.role as Role] ?? String(detail.role) : "?";
    headline = `${action}: ${detail.nickname} (${role})`;
  } else if (action === "pickHero" && detail?.heroId != null) {
    headline = `${action}: ${heroName(data, detail.heroId as number)}`;
  } else if (action === "assign" && detail?.accountId != null && detail?.heroId != null) {
    headline = `${action}: ${nick(data, detail.accountId as number)} → ${heroName(data, detail.heroId as number)}`;
  } else if (action === "swapHeroes" && detail?.accountIdA != null && detail?.accountIdB != null) {
    headline = `${action}: ${nick(data, detail.accountIdA as number)} ↔ ${nick(data, detail.accountIdB as number)}`;
  } else if (action === "reroll") {
    const left = detail?.rerollsLeft ?? "?";
    headline = `${action} (${left} left)`;
  }

  const progress = `Roster ${rosterFilled}/5 · Heroes ${heroCount}/5${isComplete ? " · COMPLETE" : ""}`;
  const mode = `${config.draftStyle} · ${config.scoring} · ${config.format}`;

  const lines: string[] = [progress, mode, "", ...formatPack(data, snapshot.currentPack, snapshot.packHeroes)];

  if (snapshot.score) {
    lines.push("", ...formatScore(data, config, snapshot.roster, snapshot.score));
  }

  if (isComplete) {
    lines.push("", "→ Draft complete · open Result screen");
  }

  return { headline, body: lines.join("\n") };
}

export function formatDataLoaded(data: GameData): string {
  const m = data.manifest;
  const c = m.counts;
  const counts = c
    ? `players ${c.players ?? "?"} · packs ${c.packs ?? data.packs.length}`
    : `packs ${data.packs.length}`;
  return `${m.ratingModelVersion} · schema ${m.schemaVersion} · ${counts}`;
}

export function formatRunStart(config: RunConfig, seed: string, data: GameData): string {
  return [
    `seed ${seed}`,
    `style ${config.draftStyle} · scoring ${config.scoring} · format ${config.format} · rerolls ${config.rerolls}`,
    `dataset ${data.manifest.ratingModelVersion}`,
  ].join("\n");
}

import type {
  GroupMatch,
  PlacementKey,
  ProjectionKey,
  SeriesResult,
  TournamentSnapshot,
  TournamentStage,
  TournamentTeam,
} from "../game/tournament.ts";

const STAGE_SCREEN: Record<TournamentStage, string> = {
  field: "Tournament / Field",
  groups: "Tournament / Groups",
  playoffs: "Tournament / Playoffs",
  final: "Tournament / Grand Final",
  complete: "Tournament / Complete",
};

const PLACE: Record<PlacementKey, string> = {
  "1": "1st",
  "2": "2nd",
  "3": "3rd",
  "4": "4th",
  "5-6": "5th–6th",
  "7-8": "7th–8th",
  "9-12": "9th–12th",
  "13-16": "13th–16th",
  "17": "17th",
  "18": "18th",
};

const PROJ: Record<ProjectionKey, string> = {
  "1": "1st",
  "2-4": "2nd–4th",
  "5-8": "5th–8th",
  "9-12": "9th–12th",
  "13-16": "13th–16th",
  "17-18": "17th–18th",
};

const ROUTE = { upper: "UB", lower: "LB", out: "OUT" } as const;

function userTeam(t: TournamentSnapshot): TournamentTeam | undefined {
  return t.field.find((team) => team.isUser);
}

function userGroupId(t: TournamentSnapshot): "A" | "B" | null {
  for (const group of t.groups) {
    if (group.standings.some((row) => row.team.isUser)) return group.id;
  }
  return null;
}

function formatField(t: TournamentSnapshot, teamOvr: number, teamLabel: string): string[] {
  const rank = t.field.findIndex((team) => team.isUser) + 1;
  const lines = [
    `Screen: ${STAGE_SCREEN.field}`,
    `${teamLabel} · OVR ${Math.round(teamOvr)} · seed rank #${rank}/18 · projection ${PROJ[t.projection]}`,
    "",
    "Field (by strength):",
  ];
  for (const [index, team] of t.field.entries()) {
    const mark = team.isUser ? " ← you" : "";
    lines.push(`  ${String(index + 1).padStart(2)}. ${pad(team.name, 22)} OVR ${Math.round(team.strength)}${mark}`);
  }
  return lines;
}

function formatGroupStandings(t: TournamentSnapshot): string[] {
  const lines = [`Screen: ${STAGE_SCREEN.groups}`, ""];
  const mine = userGroupId(t);
  const user = userTeam(t);

  for (const group of t.groups) {
    const tag = group.id === mine ? " ★ your group" : "";
    lines.push(`Group ${group.id}${tag}:`);
    for (const row of group.standings) {
      const mark = row.team.isUser ? " ← you" : "";
      lines.push(
        `  #${row.rank} ${pad(row.team.name, 22)} ${row.wins}–${row.losses}  ${ROUTE[row.route]}${mark}`,
      );
    }
    lines.push("");
  }

  if (user) {
    const myMatches = t.groupMatches.filter((m) => m.teamA.isUser || m.teamB.isUser);
    lines.push(`Your group matches (BO2, ${myMatches.length} series):`);
    lines.push(...formatGroupMatches(myMatches, user.id));
    lines.push("");
  }

  const row = t.groups.flatMap((g) => g.standings).find((r) => r.team.isUser);
  if (row) {
    lines.push(`Group result: #${row.rank} in group ${mine} · ${row.wins}–${row.losses} · route ${ROUTE[row.route]}`);
  }
  return lines;
}

function formatGroupMatches(matches: GroupMatch[], userId: string): string[] {
  return matches.map((m) => {
    const opp = m.teamA.id === userId ? m.teamB : m.teamA;
    const scoreUs = m.teamA.id === userId ? m.scoreA : m.scoreB;
    const scoreOpp = m.teamA.id === userId ? m.scoreB : m.scoreA;
    const wl = scoreUs > scoreOpp ? "W" : scoreUs < scoreOpp ? "L" : "D";
    return `  vs ${pad(opp.name, 22)} ${scoreUs}–${scoreOpp}  ${wl}`;
  });
}

function formatSeriesLine(s: SeriesResult, userId: string): string {
  const us = s.teamA.id === userId ? s.teamA : s.teamB;
  const opp = s.teamA.id === userId ? s.teamB : s.teamA;
  const scoreUs = s.teamA.id === userId ? s.scoreA : s.scoreB;
  const scoreOpp = s.teamA.id === userId ? s.scoreB : s.scoreA;
  const wl = s.winnerId === us.id ? "W" : "L";
  return `  ${pad(s.round, 24)} vs ${pad(opp.name, 20)} ${scoreUs}–${scoreOpp}  ${wl}`;
}

function userPlayoffSeries(t: TournamentSnapshot, userId: string): SeriesResult[] {
  const out: SeriesResult[] = [];
  for (const round of t.playoffRounds) {
    for (const s of round.series) {
      if (s.teamA.id === userId || s.teamB.id === userId) out.push(s);
    }
  }
  const gf = t.grandFinal;
  if (gf.teamA.id === userId || gf.teamB.id === userId) out.push(gf);
  return out;
}

function formatPlayoffs(t: TournamentSnapshot): string[] {
  const user = userTeam(t);
  const lines = [
    `Screen: ${STAGE_SCREEN.playoffs}`,
    "",
    `Final: ${PLACE[t.userPlacement]} · Champion ${t.champion.name}`,
    "",
  ];

  if (user) {
    const series = userPlayoffSeries(t, user.id);
    if (series.length > 0) {
      lines.push("Your playoff path:");
      lines.push(...series.map((s) => formatSeriesLine(s, user.id)));
      lines.push("");
    } else {
      lines.push("Your playoff path: (eliminated in groups — no playoff series)");
      lines.push("");
    }
  }

  const gf = t.grandFinal;
  lines.push(
    `Grand Final: ${gf.teamA.name} vs ${gf.teamB.name}  ${gf.scoreA}–${gf.scoreB}  → ${gf.winnerId === gf.teamA.id ? gf.teamA.name : gf.teamB.name}`,
    "",
    "Final standings:",
  );
  for (const row of t.standings) {
    const mark = row.team.isUser ? " ← you" : "";
    lines.push(`  ${PLACE[row.placement].padEnd(8)} ${row.team.name}${mark}`);
  }
  return lines;
}

export function formatTournamentStage(
  t: TournamentSnapshot,
  meta: { teamName: string; teamOvr: number },
): { headline: string; body: string } {
  let lines: string[];
  let headline: string;

  switch (t.stage) {
    case "field":
      headline = "tournament · field";
      lines = formatField(t, meta.teamOvr, meta.teamName);
      break;
    case "groups":
      headline = "tournament · groups";
      lines = formatGroupStandings(t);
      break;
    case "playoffs":
      headline = `tournament · finished · ${PLACE[t.userPlacement]}`;
      lines = formatPlayoffs(t);
      break;
    default:
      headline = `tournament · ${t.stage}`;
      lines = [`Screen: ${STAGE_SCREEN[t.stage]}`];
  }

  if (t.canAdvance) {
    const next = t.stage === "field" ? "groups" : "playoffs";
    lines.push("", `→ advance to ${next}`);
  } else if (t.stage === "playoffs") {
    lines.push("", "→ tournament complete");
  }

  return { headline, body: lines.join("\n") };
}
