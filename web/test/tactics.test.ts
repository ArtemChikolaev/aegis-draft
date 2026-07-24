import { describe, expect, it } from "vitest";
import {
  TACTICS,
  TACTIC_SLOTS,
  evaluateTactics,
  tacticMarketEffects,
  type TacticContext,
  type TacticPlayer,
} from "../src/game/tactics.ts";

function player(over: Partial<TacticPlayer> & { accountId: number }): TacticPlayer {
  return { ovr: 80, eventYear: 2020, assignedHeroGames: 0, ...over };
}

/** База: пять ничем не примечательных игроков одной эпохи без сыгранных пар. */
function baseContext(): TacticContext {
  const players = [1, 2, 3, 4, 5].map((accountId) => player({ accountId }));
  const pairs = players.flatMap((a, i) =>
    players.slice(i + 1).map((b) => ({ a: a.accountId, b: b.accountId, games: 0 })));
  return { players, pairs, stagesCleared: 0 };
}

describe("evaluateTactics — детерминизм и порядок", () => {
  it("тот же вход ⇒ тот же выход", () => {
    const ctx = baseContext();
    expect(evaluateTactics(["oldTeammates", "noSuperstars"], ctx))
      .toEqual(evaluateTactics(["oldTeammates", "noSuperstars"], ctx));
  });

  it("порядок источников не зависит от порядка экипировки", () => {
    const ctx = baseContext();
    const a = evaluateTactics(["noSuperstars", "signatureSpecialists"], ctx).sources.map((s) => s.tacticId);
    const b = evaluateTactics(["signatureSpecialists", "noSuperstars"], ctx).sources.map((s) => s.tacticId);
    expect(a).toEqual(b);
  });

  it("неизвестный id игнорируется", () => {
    const ctx = baseContext();
    expect(evaluateTactics(["totally-unknown"], ctx).sources).toEqual([]);
  });
});

describe("Signature Specialists", () => {
  it("специалисты дают Hero Synergy, звёзды штрафуют", () => {
    const ctx = baseContext();
    ctx.players[0].assignedHeroGames = TACTICS.signatureSpecialists.gamesWindow; // полный вклад
    const bonus = evaluateTactics(["signatureSpecialists"], ctx);
    expect(bonus.modifiers.heroSynergy).toBeCloseTo(TACTICS.signatureSpecialists.perPlayer, 5);

    ctx.players[1].ovr = TACTICS.signatureSpecialists.starOvr + 2; // звезда
    const withStar = evaluateTactics(["signatureSpecialists"], ctx);
    expect(withStar.modifiers.heroSynergy).toBeLessThan(bonus.modifiers.heroSynergy);
    expect(withStar.sources.some((s) => s.delta < 0)).toBe(true);
  });

  it("игры сверх окна не растят бонус (плато)", () => {
    const ctx = baseContext();
    ctx.players[0].assignedHeroGames = TACTICS.signatureSpecialists.gamesWindow;
    const capped = evaluateTactics(["signatureSpecialists"], ctx).modifiers.heroSynergy;
    ctx.players[0].assignedHeroGames = TACTICS.signatureSpecialists.gamesWindow * 10;
    expect(evaluateTactics(["signatureSpecialists"], ctx).modifiers.heroSynergy).toBeCloseTo(capped, 5);
  });
});

describe("Old Teammates", () => {
  it("считает пары от порога и упирается в cap", () => {
    const ctx = baseContext();
    for (const pair of ctx.pairs) pair.games = TACTICS.oldTeammates.minGames; // все 10 пар сыграны
    const result = evaluateTactics(["oldTeammates"], ctx);
    expect(result.modifiers.chemistry).toBe(TACTICS.oldTeammates.max);
  });

  it("пары ниже порога не считаются", () => {
    const ctx = baseContext();
    for (const pair of ctx.pairs) pair.games = TACTICS.oldTeammates.minGames - 1;
    expect(evaluateTactics(["oldTeammates"], ctx).sources).toEqual([]);
  });
});

describe("Fresh Project", () => {
  it("копит с этапами и целит слабейшую пару", () => {
    const ctx = baseContext();
    ctx.pairs.forEach((pair, i) => { pair.games = i === 0 ? 0 : 500; });
    const stage0 = evaluateTactics(["freshProject"], ctx).modifiers.chemistry;
    expect(stage0).toBe(0); // до первого этапа эффекта нет
    ctx.stagesCleared = 2;
    expect(evaluateTactics(["freshProject"], ctx).modifiers.chemistry).toBeGreaterThan(0);
  });
});

describe("No Superstars", () => {
  it("даёт Chemistry без звёзд и гаснет при появлении", () => {
    const ctx = baseContext();
    expect(evaluateTactics(["noSuperstars"], ctx).modifiers.chemistry).toBe(TACTICS.noSuperstars.bonus);
    ctx.players[2].ovr = TACTICS.noSuperstars.starOvr;
    expect(evaluateTactics(["noSuperstars"], ctx).sources).toEqual([]);
  });
});

describe("Last Dance", () => {
  it("усиливает Base за игроков одной эпохи", () => {
    const ctx = baseContext(); // все 2020 → эпоха из 5
    const result = evaluateTactics(["lastDance"], ctx);
    expect(result.modifiers.base).toBeGreaterThan(0);
    expect(result.sources[0].summand).toBe("base");
  });

  it("разрозненные годы не собирают эпоху", () => {
    const ctx = baseContext();
    ctx.players.forEach((p, i) => { p.eventYear = 2010 + i * 4; }); // 2010,14,18,22,26
    expect(evaluateTactics(["lastDance"], ctx).sources).toEqual([]);
  });
});

describe("tacticMarketEffects — trade-off'ы на рынке", () => {
  it("Old Teammates удорожает замену, Last Dance сужает пак", () => {
    expect(tacticMarketEffects(["oldTeammates"]).playerCostSurcharge)
      .toBe(TACTICS.oldTeammates.playerCostSurcharge);
    expect(tacticMarketEffects(["lastDance"]).packSizePenalty)
      .toBe(TACTICS.lastDance.marketPackPenalty);
    expect(tacticMarketEffects([])).toEqual({ playerCostSurcharge: 0, packSizePenalty: 0 });
  });
});

describe("слоты", () => {
  it("тактик ровно три", () => {
    expect(TACTIC_SLOTS).toBe(3);
  });
});
