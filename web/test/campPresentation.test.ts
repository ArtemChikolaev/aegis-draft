import { describe, expect, it } from "vitest";
import { heroTags, taggedHeroIds } from "../src/game/heroTags.ts";
import type { TacticContext, TacticPlayer } from "../src/game/tactics.ts";
import {
  campPowerPreview,
  evaluateCampPower,
  type CampBuildContext,
  type CampPowerState,
} from "../src/features/run/campPresentation.ts";

function tacticContext(ovrs: number[]): TacticContext {
  const players: TacticPlayer[] = ovrs.map((ovr, index) => ({
    accountId: index + 1,
    ovr,
    eventYear: 2020,
    assignedHeroGames: 0,
  }));
  return {
    players,
    pairs: players.flatMap((a, index) => players.slice(index + 1).map((b) => ({
      a: a.accountId,
      b: b.accountId,
      games: 0,
    }))),
    stagesCleared: 3,
  };
}

function state(overrides: Partial<CampPowerState> = {}): CampPowerState {
  return {
    score: { base: 80, heroSynergy: 10, chemistry: 10 },
    tacticContext: tacticContext([80, 80, 80, 80, 80]),
    activeHeroes: [],
    heroRarity: {},
    ...overrides,
  };
}

const emptyBuild: CampBuildContext = {
  economy: { base: 0, heroSynergy: 0, chemistry: 0 },
  equippedCards: [],
  cardRarity: {},
  cardCharges: {},
};

/** Превью так, как его зовёт экран: `before` — уже посчитанная оценка текущего состава. */
function preview(before: CampPowerState, after: CampPowerState, build: CampBuildContext) {
  return campPowerPreview(evaluateCampPower(before, build), after, build);
}

describe("Camp Run Power preview", () => {
  it("учитывает выключение тактики после замены, даже когда сырой OVR растёт", () => {
    const result = preview(
      state(),
      state({
        score: { base: 81, heroSynergy: 10, chemistry: 10 },
        // No Superstars даёт +2 до замены и выключается на пороге 88 OVR после неё.
        tacticContext: tacticContext([88, 80, 80, 80, 80]),
      }),
      { ...emptyBuild, equippedCards: ["noSuperstars"] },
    );

    expect(result.before.tactics.modifiers.chemistry).toBe(2);
    expect(result.after.tactics.modifiers.chemistry).toBe(0);
    expect(result.delta).toBeCloseTo(-1, 6);
    expect(result.deltas).toEqual(expect.arrayContaining([
      expect.objectContaining({ summand: "base", delta: 1 }),
      expect.objectContaining({ summand: "chemistry", delta: -2 }),
    ]));
  });

  it("пересчитывает условный предмет от нового набора героев", () => {
    const ids = taggedHeroIds();
    const control = ids.find((id) => heroTags(id)?.play.includes("control"));
    const withoutControl = ids.find((id) => !heroTags(id)?.play.includes("control"));
    expect(control).toBeDefined();
    expect(withoutControl).toBeDefined();

    const result = preview(
      state({ activeHeroes: [control!] }),
      state({
        score: { base: 81, heroSynergy: 10, chemistry: 10 },
        activeHeroes: [withoutControl!],
      }),
      { ...emptyBuild, equippedCards: ["scytheOfVyse"] },
    );

    expect(result.before.items.additive).toBe(2);
    expect(result.after.items.additive).toBe(0);
    // +1 сырого OVR не перекрывает потерю +2% к сотне силы.
    expect(result.delta).toBeCloseTo(-1, 6);
  });

  it("before — переданная оценка как есть: превью не пересчитывает текущий состав", () => {
    const build = { ...emptyBuild, equippedCards: ["noSuperstars"] };
    const before = evaluateCampPower(state(), build);
    const result = campPowerPreview(before, state({ score: { base: 81, heroSynergy: 10, chemistry: 10 } }), build);

    expect(result.before).toBe(before);
    expect(result.delta).toBeCloseTo(result.after.power.total - before.power.total, 6);
  });
});
