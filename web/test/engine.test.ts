import { describe, expect, it } from "vitest";
import { RunEngine, HERO_TARGET } from "../src/game/engine.ts";
import { ROLE_SEQUENCE } from "../src/game/packs.ts";
import type { Role } from "../src/types/data.ts";
import { loadGameData } from "./helpers/data.ts";
import { defaultRunConfig } from "./helpers/packs.ts";
import { driveEngine, engineSignature, runToEnd } from "./helpers/engine.ts";

describe("RunEngine", () => {
  const data = loadGameData();

  it("детерминированный seed → одинаковый результат", () => {
    const a = new RunEngine(data, defaultRunConfig, "seed-123");
    const b = new RunEngine(data, defaultRunConfig, "seed-123");
    expect(a.currentPack.label).toBe(b.currentPack.label);
    runToEnd(a);
    runToEnd(b);
    expect(engineSignature(a)).toBe(engineSignature(b));
  });

  it("заполняет 5 ролей и 5 героев", () => {
    const engine = new RunEngine(data, defaultRunConfig, "run-team");
    runToEnd(engine);
    expect(engine.isComplete).toBe(true);
    expect(engine.players.length).toBe(5);
    expect(engine.heroes.length).toBe(HERO_TARGET);
    expect(new Set(engine.heroes).size).toBe(engine.heroes.length);
    const roles = engine.rosterView.map((s) => (s.candidate ? s.role : "—"));
    expect(roles).toEqual(["safelane", "mid", "offlane", "support", "support"]);
  });

  it("score() доступен после хотя бы одного игрока", () => {
    const engine = new RunEngine(data, defaultRunConfig, "score-gate");
    expect(engine.score()).toBeNull();
    const idx = engine.currentPack.candidates.findIndex((_, i) => engine.canPickPlayer(i));
    engine.pickPlayer(idx);
    expect(engine.score()?.teamOvr).toBeGreaterThan(0);
  });

  it("resume: replay лога восстанавливает состояние", () => {
    const config = { ...defaultRunConfig, rerolls: 3 };
    const log: Parameters<typeof driveEngine>[1] = [];
    const live = new RunEngine(data, config, "resume-seed");
    if (live.reroll()) log.push({ t: "reroll" });
    for (let k = 0; k < 3; k++) {
      const idx = live.currentPack.candidates.findIndex((_, i) => live.canPickPlayer(i));
      live.pickPlayer(idx);
      log.push({ t: "pickPlayer", index: idx });
    }
    const restored = new RunEngine(data, config, "resume-seed");
    driveEngine(restored, log);
    expect(engineSignature(live)).toBe(engineSignature(restored));
  });
});

describe("RunEngine manual allocation", () => {
  const data = loadGameData();

  it("swapHeroes запрещён в auto после complete", () => {
    const auto = new RunEngine(data, defaultRunConfig, "run-auto-swap");
    runToEnd(auto);
    const [a, b] = auto.players.map((p) => p.accountId);
    expect(() => auto.swapHeroes(a, b)).toThrow(/Manual/i);
  });

  it("swapHeroes в manual меняет назначение героев", () => {
    const manual = new RunEngine(data, { ...defaultRunConfig, allocation: "manual" }, "run-manual-swap");
    runToEnd(manual);
    const swapA = manual.players[0].accountId;
    const swapB = manual.players[1].accountId;
    const heroBeforeA = manual.score()!.assignment.byPlayer[swapA];
    const heroBeforeB = manual.score()!.assignment.byPlayer[swapB];
    manual.swapHeroes(swapA, swapB);
    expect(manual.score()!.assignment.byPlayer[swapA]).toBe(heroBeforeB);
    expect(manual.score()!.assignment.byPlayer[swapB]).toBe(heroBeforeA);
  });

  it("assign фиксирует героя за игроком в manual", () => {
    const manual = new RunEngine(data, { ...defaultRunConfig, allocation: "manual" }, "run-manual");
    runToEnd(manual);
    const accountId = manual.players[0].accountId;
    const heroId = manual.heroes[0];
    manual.assign(accountId, heroId);
    expect(manual.score()!.assignment.byPlayer[accountId]).toBe(heroId);
  });

  it("assign отклоняет игрока вне ростера", () => {
    const manual = new RunEngine(data, { ...defaultRunConfig, allocation: "manual" }, "run-manual-assign");
    runToEnd(manual);
    const outsider = Math.max(...manual.players.map((p) => p.accountId)) + 1;
    expect(() => manual.assign(outsider, manual.heroes[0])).toThrow();
    expect(manual.manualAssignment[outsider]).toBeUndefined();
  });
});

describe("RunEngine rerolls", () => {
  const data = loadGameData();

  it("finite reroll budget", () => {
    const engine = new RunEngine(data, { ...defaultRunConfig, rerolls: 1 }, "run-reroll");
    expect(engine.reroll()).toBe(true);
    expect(engine.rerollsLeft).toBe(0);
    expect(engine.reroll()).toBe(false);
  });

  it("infinite rerolls не исчерпываются", () => {
    const engine = new RunEngine(data, defaultRunConfig, "run-inf");
    for (let i = 0; i < 20; i++) expect(engine.reroll()).toBe(true);
    expect(engine.rerollsLeft).toBe(Infinity);
  });
});

describe("RunEngine mixed draft", () => {
  const data = loadGameData();
  const mixedConfig = { ...defaultRunConfig, draftStyle: "mixed" as const };

  it("свободный порядок ролей, затем герои", () => {
    const engine = new RunEngine(data, mixedConfig, "run-mixed");
    const mixedTeamIds = new Set<number>();
    const pickOrder: Role[] = ["mid", "support", "safelane", "offlane", "support"];
    const remaining: Record<Role, number> = { safelane: 1, mid: 1, offlane: 1, support: 2 };

    for (const role of pickOrder) {
      expect(new Set(engine.currentPack.candidates.map((c) => c.teamId)).size).toBe(5);
      engine.currentPack.candidates.forEach((candidate, index) => {
        expect(engine.canPickPlayer(index)).toBe(remaining[candidate.player.role] > 0);
      });
      const idx = engine.currentPack.candidates.findIndex(
        (candidate, index) => candidate.player.role === role && engine.canPickPlayer(index),
      );
      expect(idx).toBeGreaterThanOrEqual(0);
      mixedTeamIds.add(engine.currentPack.candidates[idx].teamId);
      engine.pickPlayer(idx);
      remaining[role] -= 1;
    }

    runToEnd(engine);
    expect(engine.isComplete).toBe(true);
    expect(engine.heroes.length).toBe(HERO_TARGET);
    expect(mixedTeamIds.size).toBeGreaterThanOrEqual(3);
  });
});

describe("RunEngine hero draft gating", () => {
  const data = loadGameData();

  it("после 5 игроков нельзя брать игроков; герои только из пака", () => {
    const hd = new RunEngine(data, defaultRunConfig, "run-hero");
    while (hd.rosterFilled < ROLE_SEQUENCE.length) {
      hd.pickPlayer(hd.currentPack.candidates.findIndex((_, i) => hd.canPickPlayer(i)));
    }
    expect(hd.canPickPlayer(0)).toBe(false);
    expect(hd.packHeroes.length).toBe(HERO_TARGET);
    const outsideHero = data.heroes.find((hero) => !hd.packHeroes.includes(hero.id))!.id;
    expect(hd.canPickHero(outsideHero)).toBe(false);
    expect(() => hd.pickHero(outsideHero)).toThrow();
  });
});

describe("RunEngine roguelite reserve", () => {
  const data = loadGameData();

  it("player swap кладёт снятого на скамейку (список) и обратим по accountId", () => {
    const engine = new RunEngine(data, defaultRunConfig, "reserve-player");
    runToEnd(engine);
    const option = engine.marketPlayerCandidates.find((candidate) =>
      engine.rosterView.some((slot) => slot.role === candidate.player.role))!;
    const slotIndex = engine.rosterView.findIndex((slot) => slot.role === option.player.role);
    const outgoing = engine.rosterView[slotIndex].candidate!;
    expect(engine.previewPlayerReplacement(slotIndex, option).teamOvr).toBeGreaterThan(0);

    engine.replacePlayer(slotIndex, option);
    expect(engine.reservePlayers.map((c) => c.player.accountId)).toContain(outgoing.player.accountId);
    expect(engine.rosterView[slotIndex].candidate?.player.accountId).toBe(option.player.accountId);

    engine.swapReservePlayer(slotIndex, outgoing.player.accountId);
    expect(engine.rosterView[slotIndex].candidate?.player.accountId).toBe(outgoing.player.accountId);
    expect(engine.reservePlayers.map((c) => c.player.accountId)).toContain(option.player.accountId);
  });

  it("несколько покупок кладут ВСЕХ снятых на скамейку (Balatro-мульти)", () => {
    const engine = new RunEngine(data, defaultRunConfig, "reserve-multi");
    runToEnd(engine);
    const removed: number[] = [];
    for (const role of ["safelane", "mid"] as const) {
      const slotIndex = engine.rosterView.findIndex((slot) => slot.role === role);
      if (slotIndex < 0) continue;
      const option = engine.marketPlayerCandidates.find((c) => c.player.role === role);
      if (!option) continue;
      removed.push(engine.rosterView[slotIndex].candidate!.player.accountId);
      engine.replacePlayer(slotIndex, option);
    }
    expect(removed.length).toBe(2);
    const bench = engine.reservePlayers.map((c) => c.player.accountId);
    for (const accountId of removed) expect(bench).toContain(accountId);
  });

  it("hero re-pick кладёт снятого героя в пул, swap не создаёт дубли", () => {
    const engine = new RunEngine(data, defaultRunConfig, "reserve-hero");
    runToEnd(engine);
    const outgoing = engine.heroes[0];
    const incoming = engine.marketHeroCandidates[0];
    expect(engine.previewHeroReplacement(outgoing, incoming).teamOvr).toBeGreaterThan(0);

    engine.replaceHero(outgoing, incoming);
    expect(engine.heroes).toContain(incoming);
    expect(engine.reserveHeroes).toContain(outgoing);

    engine.swapReserveHero(incoming, outgoing);
    expect(engine.heroes).toContain(outgoing);
    expect(engine.reserveHeroes).toContain(incoming);
    expect(new Set([...engine.heroes, ...engine.reserveHeroes]).size)
      .toBe(engine.heroes.length + engine.reserveHeroes.length);
  });
});
