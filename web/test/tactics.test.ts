import { describe, expect, it } from "vitest";
import {
  TACTICS,
  TACTIC_IDS,
  TACTIC_SLOTS,
  evaluateTactics,
  tacticLabelParams,
  tacticMarketEffects,
  tacticRarityFactor,
  type TacticContext,
  type TacticPlayer,
} from "../src/game/tactics.ts";
import { distinctGameplayTags, heroTags, taggedHeroIds } from "../src/game/heroTags.ts";
import { translate, type MessageKey } from "../src/i18n/core.ts";

function player(over: Partial<TacticPlayer> & { accountId: number }): TacticPlayer {
  return { ovr: 80, eventYear: 2020, assignedHeroGames: 0, ...over };
}

/** База: пять ничем не примечательных игроков одной эпохи без сыгранных пар. */
function baseContext(): TacticContext {
  const players = [1, 2, 3, 4, 5].map((accountId) => player({ accountId }));
  const pairs = players.flatMap((a, i) =>
    players.slice(i + 1).map((b) => ({ a: a.accountId, b: b.accountId, games: 0 })));
  return { players, pairs, stagesCleared: 0, assignedHeroes: [] };
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

describe("Wide Pool", () => {
  /** Пятёрка с ≥minTags разных gameplay-архетипов — жадный отбор из курируемого словаря тегов
   *  (он живёт в коде, не в датасете, поэтому тест одинаков на real и mock). */
  function wideHeroes(): number[] {
    const chosen: number[] = [];
    const covered = new Set<string>();
    while (chosen.length < 5) {
      let best: number | null = null;
      let bestNew = -1;
      for (const heroId of taggedHeroIds()) {
        if (chosen.includes(heroId)) continue;
        const fresh = (heroTags(heroId)?.play ?? []).filter((tag) => !covered.has(tag)).length;
        if (fresh > bestNew) { best = heroId; bestNew = fresh; }
      }
      chosen.push(best!);
      (heroTags(best!)?.play ?? []).forEach((tag) => covered.add(tag));
    }
    return chosen;
  }

  it("широкая пятёрка даёт Hero Synergy лестницей с потолком; узкая — ничего", () => {
    const cfg = TACTICS.widePool;
    const wide = wideHeroes();
    expect(distinctGameplayTags(wide)).toBeGreaterThanOrEqual(cfg.minTags);
    const ctx = { ...baseContext(), assignedHeroes: wide };
    const result = evaluateTactics(["widePool"], ctx);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].summand).toBe("heroSynergy");
    const distinct = distinctGameplayTags(wide);
    expect(result.modifiers.heroSynergy)
      .toBeCloseTo(Math.min(cfg.max, (distinct - cfg.minTags + 1) * cfg.perTag), 6);
    // Узкая пятёрка: пять копий одного набора тегов условие не закрывают.
    const narrow = { ...baseContext(), assignedHeroes: [wide[0], wide[0], wide[0], wide[0], wide[0]] };
    expect(evaluateTactics(["widePool"], narrow).sources).toEqual([]);
    // Пустое назначение (драфт не окончен) — тоже ничего, а не исключение.
    expect(evaluateTactics(["widePool"], baseContext()).sources).toEqual([]);
  });

  it("trade-off: фактор редкости 0.5 только при экипированной карте, и его видит рынок", () => {
    expect(tacticRarityFactor(["widePool"])).toBe(TACTICS.widePool.rarityFactor);
    expect(tacticRarityFactor(["lastDance"])).toBe(1);
    expect(tacticRarityFactor([])).toBe(1);
  });
});

describe("слоты", () => {
  it("пассивных слотов ровно пять", () => {
    expect(TACTIC_SLOTS).toBe(5);
  });
});

// R11.5: описание тактики печатало буквально «{n}» — плейсхолдеру никто не передавал значение.
// Числа теперь приходят из того же `TACTICS`, что и эффект; тест сторожит сам класс ошибки.
describe("описания тактик подставляют все числа", () => {
  it("ни один плейсхолдер не остаётся в тексте — ни в RU, ни в EN", () => {
    for (const locale of ["ru", "en"] as const) {
      for (const id of TACTIC_IDS) {
        const text = translate(locale, `tactic.desc.${id}` as MessageKey, tacticLabelParams(id));
        expect(text, `${locale}/${id}`).not.toMatch(/[{}]/);
      }
    }
  });

  it("параметры описания берутся из TACTICS, а не дублируются числом в строке", () => {
    expect(tacticLabelParams("signatureSpecialists").n).toBe(TACTICS.signatureSpecialists.gamesWindow);
    expect(tacticLabelParams("noSuperstars").n).toBe(TACTICS.noSuperstars.starOvr);
    expect(tacticLabelParams("lastDance").cards).toBe(TACTICS.lastDance.marketPackPenalty);
  });
});
