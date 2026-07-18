import { describe, expect, it } from "vitest";
import {
  buildTeammateIndex,
  nicknameIndex,
  teammateLinks,
} from "../src/features/teammates/teammateGraph.ts";
import type { EventInfo, Pack } from "../src/types/data.ts";
import { loadGameData } from "./helpers/data.ts";
import { isMockBaseline } from "./helpers/dataset.ts";

const events: EventInfo[] = [
  { id: "e-new", name: "Recent Major", type: "major", year: 2026, startDate: "2026-03-01", formats: ["last_1y", "last_2y"] },
  { id: "e-old", name: "Old TI", type: "ti", year: 2019, startDate: "2019-08-01", formats: ["last_5y", "valve_legacy"] },
];

const pack = (id: string, eventId: string, teamName: string, players: [number, string][]): Pack => ({
  id,
  eventId,
  teamId: 1,
  teamName,
  tag: teamName.slice(0, 3),
  players: players.map(([accountId, nickname]) => ({
    accountId, nickname, role: "mid", ovr: 80, impact: 80, economy: 80, reliability: 80, games: 10,
  })),
});

const packs: Pack[] = [
  pack("p1", "e-new", "Team A", [[1, "Alfa"], [2, "Bravo"], [3, "Charlie"]]),
  pack("p2", "e-old", "Team B", [[1, "Alfa"], [4, "Delta"]]),
  pack("p3", "e-new", "Team C", [[1, "Alfa"], [2, "Bravo"]]),
];

describe("teammateGraph", () => {
  it("окно решает, кто вообще считается тиммейтом", () => {
    const recent = buildTeammateIndex(packs, events, "last_1y");
    const legacy = buildTeammateIndex(packs, events, "valve_legacy");
    const names = nicknameIndex(packs);

    // В свежем окне Delta не появлялся — он только на старом TI.
    expect(teammateLinks(recent, names, 1).map((link) => link.nickname)).toEqual(["Bravo", "Charlie"]);
    expect(teammateLinks(legacy, names, 1).map((link) => link.nickname)).toEqual(["Delta"]);
  });

  it("повторный совместный турнир усиливает связь, а не дублирует соседа", () => {
    const index = buildTeammateIndex(packs, events, "last_2y");
    const links = teammateLinks(index, nicknameIndex(packs), 1);
    const bravo = links.find((link) => link.nickname === "Bravo")!;
    // Alfa и Bravo вместе дважды (p1 и p3) — это ОДИН сосед с двумя турнирами.
    expect(links.filter((link) => link.nickname === "Bravo")).toHaveLength(1);
    expect(bravo.shared).toHaveLength(2);
    expect(bravo.shared.map((event) => event.teamName).sort()).toEqual(["Team A", "Team C"]);
    // Сортировка по силе связи: двойная связь выше одиночной.
    expect(links[0].nickname).toBe("Bravo");
  });

  it("связь симметрична", () => {
    const index = buildTeammateIndex(packs, events, "last_2y");
    const names = nicknameIndex(packs);
    expect(teammateLinks(index, names, 2).map((l) => l.nickname)).toContain("Alfa");
    expect(teammateLinks(index, names, 1).map((l) => l.nickname)).toContain("Bravo");
  });

  it("у игрока вне окна соседей нет, а не падение", () => {
    const index = buildTeammateIndex(packs, events, "last_1y");
    expect(teammateLinks(index, nicknameIndex(packs), 999)).toEqual([]);
  });

  // Размерность — свойство РЕАЛЬНОГО датасета: у мока свои события и ростеры.
  it.skipIf(isMockBaseline(loadGameData().manifest))("на реальных данных кольцо соседей обозримо", () => {
    const data = loadGameData();
    const index = buildTeammateIndex(data.packs, data.events, "last_2y");
    const degrees = [...index.values()].map((neighbours) => neighbours.size).sort((a, b) => a - b);
    expect(degrees.length).toBeGreaterThan(100);
    // Медиана — единицы: вокруг центра помещается одно кольцо, ради этого и выбрана
    // радиальная раскладка вместо force-directed графа.
    expect(degrees[Math.floor(degrees.length / 2)]).toBeLessThan(15);
    // Хвост не должен взрываться — иначе подписи начнут наезжать даже в два радиуса.
    expect(degrees[degrees.length - 1]).toBeLessThan(80);
  });
});
