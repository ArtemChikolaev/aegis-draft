import { describe, expect, it } from "vitest";
import { loadGameData } from "./helpers/data.ts";
import { isMockBaseline } from "./helpers/dataset.ts";
import {
  buildRealField,
  REAL_FIELD_OPPONENTS,
  realTournamentEvents,
} from "../src/game/realTournament.ts";
import { RunEngine } from "../src/game/engine.ts";
import { TournamentEngine } from "../src/game/tournament.ts";
import { baseRating } from "../src/game/score.ts";
import { decodeRunLink, encodeRunLink, validateRunLinkInput, type RunLink } from "../src/state/runLink.ts";
import { buildCareerEntry, careerEntriesForMode } from "../src/state/careerStore.ts";
import type { RunConfig } from "../src/game/packs.ts";

const data = loadGameData();
// Каталог RT существует только на реальном датасете (мок — 7 команд, полного поля нет).
// Тот же приём, что у golden: на «не своём» датасете тесты честно скипаются, а не зеленеют.
const onMock = isMockBaseline(data.manifest);
const catalog = realTournamentEvents(data);

const RT_CONFIG: RunConfig = {
  draftStyle: "mixed", format: "last_5y", rerolls: 2, scoring: "event", allocation: "auto",
};

describe("realTournament — каталог и поле (реальный датасет)", () => {
  it.skipIf(onMock)("каталог не пуст и содержит только события с полным полем", () => {
    expect(catalog.length).toBeGreaterThan(0);
    for (const option of catalog) {
      expect(option.packCount).toBeGreaterThanOrEqual(REAL_FIELD_OPPONENTS);
    }
    // Новые сверху: список читается как история сцены.
    for (let i = 1; i < catalog.length; i += 1) {
      expect(catalog[i - 1].year ?? 0).toBeGreaterThanOrEqual(catalog[i].year ?? 0);
    }
  });

  it.skipIf(onMock)("поле: ровно 17 соперников по убыванию силы, детерминизм, полный lock", () => {
    const eventId = catalog[0].eventId;
    const field = buildRealField(data, eventId);
    expect(field.opponents).toHaveLength(REAL_FIELD_OPPONENTS);
    for (let i = 1; i < field.opponents.length; i += 1) {
      expect(field.opponents[i - 1].strength).toBeGreaterThanOrEqual(field.opponents[i].strength);
    }
    // Сила честная: в диапазоне Team OVR, не botStrength-рулетка.
    for (const opponent of field.opponents) {
      expect(opponent.strength).toBeGreaterThan(40);
      expect(opponent.strength).toBeLessThan(130);
      expect(opponent.isUser).toBe(false);
    }
    // Lock покрывает ВСЕ паки события — и тех, кто не попал в топ-17 поля.
    const eventPacks = data.packs.filter((pack) => pack.eventId === eventId);
    for (const pack of eventPacks) {
      for (const player of pack.players) expect(field.lockedAccounts.has(player.accountId)).toBe(true);
    }
    // Детерминизм: сила из данных, сид на поле не влияет.
    const again = buildRealField(data, eventId);
    expect(again.opponents).toEqual(field.opponents);
  });

  it("fail-fast: неизвестное или тонкое событие — ошибка, а не молчаливое ослабление", () => {
    expect(() => buildRealField(data, "league-nope")).toThrow(/не собирает поле/);
  });

  it.skipIf(onMock)("roster lock в движке: залоченный не появляется в паках и не пикается", () => {
    const eventId = catalog[0].eventId;
    const field = buildRealField(data, eventId);
    const engine = new RunEngine(data, RT_CONFIG, "rt-lock-seed", { lockedAccounts: field.lockedAccounts });
    // Дюжина рероллов паков: ни один кандидат не из lock-множества.
    for (let round = 0; round < 12; round += 1) {
      for (const candidate of engine.currentPack.candidates) {
        expect(field.lockedAccounts.has(candidate.player.accountId)).toBe(false);
      }
      engine.pickPlayer(engine.currentPack.candidates.findIndex((c) => engine.canPickPlayer(
        engine.currentPack.candidates.indexOf(c),
      )));
      if (engine.rosterFilled >= 5) break;
    }
  });

  it.skipIf(onMock)("RT-скоринг: mixed-механика, но base = event-снапшоты (не team-success)", () => {
    const eventId = catalog[0].eventId;
    const field = buildRealField(data, eventId);
    const engine = new RunEngine(data, RT_CONFIG, "rt-score-seed", { lockedAccounts: field.lockedAccounts });
    while (engine.rosterFilled < 5) {
      const idx = engine.currentPack.candidates.findIndex((_, i) => engine.canPickPlayer(i));
      engine.pickPlayer(idx);
    }
    const score = engine.score();
    expect(score).not.toBeNull();
    // Форма своей эпохи (RT-B): точное равенство с baseRating игроков — override не включился.
    expect(score!.base).toBeCloseTo(baseRating(engine.players), 6);
  });
});

describe("realTournament — ссылка и карьера", () => {
  const link: RunLink = {
    v: 1, s: 1, r: "vX", mode: "tournament", seed: "rt-seed", config: RT_CONFIG, eventId: "league-42",
  };

  it("кодек несёт событие round-trip; tournament-ссылка без события — битая", () => {
    const decoded = decodeRunLink(encodeRunLink(link));
    expect(decoded).toEqual(link);
    const withoutEvent = { ...link };
    delete (withoutEvent as Partial<RunLink>).eventId;
    expect(decodeRunLink(encodeRunLink(withoutEvent as RunLink))).toBeNull();
  });

  it("seed-код под другое событие — честный config-mismatch", () => {
    const encoded = encodeRunLink(link);
    const okay = validateRunLinkInput(encoded, "tournament", RT_CONFIG, 1, "vX", undefined, "league-42");
    expect(okay.issue).toBeNull();
    const other = validateRunLinkInput(encoded, "tournament", RT_CONFIG, 1, "vX", undefined, "league-7");
    expect(other.issue).toBe("config");
  });

  it("карьера: запись RT живёт в своём бакете, не в Quick Draft и не в Roguelite", () => {
    // Честная фикстура: настоящий терминальный турнир, а не поддельный снапшот.
    const tournamentEngine = new TournamentEngine(data, "last_2y", "rt-career-seed", 83, "RT Five");
    while (tournamentEngine.advance()) { /* до терминальной стадии */ }
    const roster = data.packs[0].players.slice(0, 5);
    const entry = buildCareerEntry({
      seed: "rt-career",
      datasetSchemaVersion: 1,
      ratingModelVersion: "vX",
      config: RT_CONFIG,
      mode: "tournament",
      score: {
        base: 80, heroSynergy: 2, chemistry: 1, teamOvr: 83,
        assignment: { byPlayer: Object.fromEntries(roster.map((p, i) => [p.accountId, i + 1])), total: 0 },
      },
      roster: roster.map((player, i) => ({
        role: player.role,
        candidate: {
          player, teamId: data.packs[0].teamId, teamName: data.packs[0].teamName,
          eventId: data.packs[0].eventId, signatureHeroes: [i + 1],
        },
      })),
      tournament: tournamentEngine.snapshot,
    });
    expect(entry.configLabel.mode).toBe("tournament");
    expect(careerEntriesForMode([entry], "tournament")).toHaveLength(1);
    expect(careerEntriesForMode([entry], "classic")).toHaveLength(0);
    expect(careerEntriesForMode([entry], "run")).toHaveLength(0);
  });
});
