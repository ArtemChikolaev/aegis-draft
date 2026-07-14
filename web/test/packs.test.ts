import { describe, expect, it } from "vitest";
import { mixedPack, poolForFormat, ROLE_SEQUENCE, teamPack } from "../src/game/packs.ts";
import { Rng } from "../src/game/rng.ts";
import type { Pack, Role } from "../src/types/data.ts";
import { loadGameData } from "./helpers/data.ts";

describe("poolForFormat", () => {
  const data = loadGameData();

  it("last_2y pool >= 5 паков", () => {
    expect(poolForFormat(data.packs, data.events, "last_2y").length).toBeGreaterThanOrEqual(5);
  });

  it("каждый непустой формат даёт >=5 команд для Mixed", () => {
    for (const format of data.manifest.formats) {
      const pool = poolForFormat(data.packs, data.events, format);
      if (pool.length === 0) continue;
      const teams = new Set(pool.map((p) => p.teamId));
      expect(teams.size, format).toBeGreaterThanOrEqual(5);
    }
  });
});

describe("mixedPack / teamPack edge cases", () => {
  const mkPack = (teamId: number, role: Role, accountId = teamId): Pack => ({
    id: `p-${teamId}-${role}-${accountId}`,
    eventId: "event",
    teamId,
    teamName: `Team ${teamId}`,
    players: [{
      accountId,
      nickname: `P${accountId}`,
      role,
      ovr: 80,
      impact: 80,
      economy: 80,
      reliability: 80,
      games: 10,
    }],
    signatureHeroes: [teamId],
  });

  it("mixedPack: 5 кандидатов из 5 команд, все роли", () => {
    const pool = ROLE_SEQUENCE.map((role, i) => mkPack(i + 1, role));
    const lineup = mixedPack(pool, new Rng("mixed-five"));
    expect(lineup.candidates).toHaveLength(5);
    expect(new Set(lineup.candidates.map((c) => c.teamId)).size).toBe(5);
    expect(lineup.candidates.map((c) => c.player.role)).toEqual(ROLE_SEQUENCE);
  });

  it("mixedPack: fail-fast без 5 уникальных команд", () => {
    const pool = ROLE_SEQUENCE.map((role, i) => mkPack(i + 1, role));
    const fourTeams = pool.map((pack, i) => (i === 4 ? { ...pack, teamId: 4, teamName: "Team 4" } : pack));
    expect(() => mixedPack(fourTeams, new Rng("four-teams"))).toThrow();
  });

  it("mixedPack: fail-fast при отсутствии роли", () => {
    const pool = ROLE_SEQUENCE.map((role, i) => mkPack(i + 1, role));
    const missingMid = pool.filter((pack) => pack.players[0].role !== "mid");
    expect(() => mixedPack(missingMid, new Rng("missing-mid"))).toThrow();
  });

  it("teamPack: сохраняет substitute (6+ игроков)", () => {
    const pool = ROLE_SEQUENCE.map((role, i) => mkPack(i + 1, role));
    const withSubstitutes: Pack = {
      ...pool[0],
      players: [
        ...pool.map((pack) => pack.players[0]),
        { ...pool[0].players[0], accountId: 99, nickname: "Sub", role: "support" },
      ],
    };
    expect(teamPack(withSubstitutes).candidates.length).toBeGreaterThanOrEqual(6);
  });
});
