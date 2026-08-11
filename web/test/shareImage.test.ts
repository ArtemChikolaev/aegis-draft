import { describe, expect, it } from "vitest";
import { shareCardPlayers, shareFileName } from "../src/features/tournament/shareImage.ts";
import type { RosterSlot } from "../src/game/engine.ts";
import type { Candidate } from "../src/game/packs.ts";
import type { Role } from "../src/types/data.ts";

// Canvas в jsdom нет — тестируются чистые части: сборка строк карточки и имя файла.
// Сам рендер проверяется живьём (обе темы) — см. T7.1 в BACKLOG.

const candidate = (accountId: number, nickname: string, role: Role): Candidate => ({
  player: { accountId, nickname, role, ovr: 90, impact: 90, economy: 90, reliability: 90, games: 20 },
  teamId: 1,
  teamName: "Team",
  eventId: "ti2024",
  signatureHeroes: [],
});

const slot = (role: Role, c: Candidate | null): RosterSlot => ({ role, candidate: c });

const heroName = (id: number) => (id === 14 ? "Pudge" : `#${id}`);

const roleLabel = (role: Role) => role.toUpperCase();

describe("shareCardPlayers", () => {
  it("собирает строку на каждый занятый слот: роль, ник, назначенный герой", () => {
    const roster = [
      slot("safelane", candidate(1, "Yatoro", "safelane")),
      slot("mid", candidate(2, "Larl", "mid")),
    ];
    const rows = shareCardPlayers(roster, { 1: 14 }, heroName, roleLabel);
    expect(rows).toEqual([
      { role: "safelane", roleLabel: "SAFELANE", nickname: "Yatoro", heroName: "Pudge" },
      // Без назначения имя героя пустое — плитка рисуется без строки героя, а не падает.
      { role: "mid", roleLabel: "MID", nickname: "Larl", heroName: "" },
    ]);
  });

  it("пустой слот пропускается, неизвестный герой не роняет сборку", () => {
    const roster = [
      slot("offlane", null),
      slot("support", candidate(3, "Miposhka", "support")),
    ];
    const rows = shareCardPlayers(roster, { 3: 999 }, heroName, roleLabel);
    expect(rows).toHaveLength(1);
    expect(rows[0].heroName).toBe("#999");
  });
});

describe("shareFileName", () => {
  it("сид фильтруется до безопасных символов и ограничен по длине", () => {
    expect(shareFileName("AbC-12_3")).toBe("aegis-draft-AbC-12_3.png");
    expect(shareFileName("x".repeat(60))).toBe(`aegis-draft-${"x".repeat(40)}.png`);
    // Сид из одних недопустимых символов не даёт пустое имя.
    expect(shareFileName("///???")).toBe("aegis-draft-run.png");
  });
});
