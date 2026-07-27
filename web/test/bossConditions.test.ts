import { describe, expect, it } from "vitest";
import {
  BOSSES,
  BOSS_IDS,
  bannedHeroesForStage,
  bossForStage,
  evaluateBoss,
  type BossContext,
} from "../src/game/bossConditions.ts";
import { ACT_LENGTH, isActFinale } from "../src/game/anteRun.ts";

function ctx(over: Partial<BossContext> = {}): BossContext {
  return {
    base: 88,
    heroSynergy: 5,
    chemistry: 3,
    playerOvrs: [88, 87, 86, 85, 84],
    activeHeroes: [1, 2, 3, 4, 5],
    bannedHeroes: [],
    ...over,
  };
}

describe("bossForStage", () => {
  // R6.2: босс — только финал акта. Раньше он стоял на КАЖДОМ этапе с третьего (3 из 5).
  it("босс только на финале акта, обычные этапы чисты, финал детерминирован по seed", () => {
    for (let stage = 0; stage < 40; stage += 1) {
      const boss = bossForStage("s", stage);
      expect(boss == null).toBe(!isActFinale(stage));
    }
    const finale = ACT_LENGTH - 1;
    expect(bossForStage("s", finale)).toBe(bossForStage("s", finale)); // детерминизм
  });

  it("каждый тип встречается на каком-то этапе (полнота каталога)", () => {
    const seen = new Set<string>();
    for (let stage = 0; stage < 1000; stage += 1) {
      const boss = bossForStage("catalog", stage);
      if (boss) seen.add(boss);
    }
    expect([...seen].sort()).toEqual([...BOSS_IDS].sort());
  });
});

describe("baseFloor — рычаг Base", () => {
  it("слабый Base штрафуется, сильный проходит", () => {
    const weak = evaluateBoss("baseFloor", ctx({ base: BOSSES.baseFloor.threshold - 4 }));
    expect(weak.met).toBe(false);
    expect(weak.penalty).toBeCloseTo(4 * BOSSES.baseFloor.perPoint, 5);
    const strong = evaluateBoss("baseFloor", ctx({ base: BOSSES.baseFloor.threshold }));
    expect(strong.met).toBe(true);
    expect(strong.penalty).toBe(0);
  });

  it("штраф упирается в cap", () => {
    const huge = evaluateBoss("baseFloor", ctx({ base: 0 }));
    expect(huge.penalty).toBe(BOSSES.baseFloor.max);
  });
});

describe("heroSynergyDemand — рычаг Hero Synergy", () => {
  it("ниже порога штраф, на пороге нет", () => {
    expect(evaluateBoss("heroSynergyDemand", ctx({ heroSynergy: 0 })).met).toBe(false);
    expect(evaluateBoss("heroSynergyDemand", ctx({ heroSynergy: BOSSES.heroSynergyDemand.threshold })).met).toBe(true);
  });
});

describe("chemistryBlackout — рычаг Chemistry", () => {
  it("штраф равен текущей Chemistry (с cap), ноль Chemistry = met", () => {
    const c = evaluateBoss("chemistryBlackout", ctx({ chemistry: 5 }));
    expect(c.penalty).toBeCloseTo(Math.min(5, BOSSES.chemistryBlackout.max), 5);
    expect(evaluateBoss("chemistryBlackout", ctx({ chemistry: 0 })).met).toBe(true);
  });
});

describe("unbalancedRoster — рычаг формы", () => {
  it("широкий разброс OVR штрафуется, ровный состав проходит", () => {
    const wide = evaluateBoss("unbalancedRoster", ctx({ playerOvrs: [95, 70, 70, 70, 70] }));
    expect(wide.met).toBe(false);
    expect(wide.penalty).toBeGreaterThan(0);
    const even = evaluateBoss("unbalancedRoster", ctx({ playerOvrs: [84, 84, 85, 85, 86] }));
    expect(even.met).toBe(true);
  });
});

describe("heroBan — рычаг hero pool", () => {
  it("активный забаненный герой штрафует, замена снимает штраф", () => {
    const hit = evaluateBoss("heroBan", ctx({ activeHeroes: [1, 2, 3], bannedHeroes: [2, 9] }));
    expect(hit.met).toBe(false);
    expect(hit.penalty).toBeCloseTo(BOSSES.heroBan.perHero, 5);
    const clean = evaluateBoss("heroBan", ctx({ activeHeroes: [1, 3], bannedHeroes: [2, 9] }));
    expect(clean.met).toBe(true);
    expect(clean.penalty).toBe(0);
  });

  it("баны детерминированы по seed и только на heroBan-этапах", () => {
    const pool = Array.from({ length: 40 }, (_, i) => i + 1);
    // Найти heroBan-этап
    let banStage = -1;
    for (let stage = 0; stage < 300; stage += 1) {
      if (bossForStage("banseed", stage) === "heroBan") { banStage = stage; break; }
    }
    expect(banStage).toBeGreaterThan(0);
    const a = bannedHeroesForStage("banseed", banStage, pool);
    expect(a.length).toBeGreaterThan(0);
    expect(bannedHeroesForStage("banseed", banStage, pool)).toEqual(a); // детерминизм
    // Не-heroBan этап не банит.
    let other = -1;
    for (let stage = 0; stage < 300; stage += 1) {
      if (bossForStage("banseed", stage) && bossForStage("banseed", stage) !== "heroBan") { other = stage; break; }
    }
    expect(bannedHeroesForStage("banseed", other, pool)).toEqual([]);
  });
});

describe("детерминизм evaluateBoss", () => {
  it("тот же вход ⇒ тот же выход", () => {
    expect(evaluateBoss("baseFloor", ctx())).toEqual(evaluateBoss("baseFloor", ctx()));
  });
});
