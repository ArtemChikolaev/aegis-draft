// Мутаторы круга Династии (LG3, R12.6): выбор по seed+кругу и применение всех четырёх правил.
import { describe, expect, it } from "vitest";
import { MUTATOR_IDS, MUTATORS, mutatorForCircle, type MutatorId } from "../src/game/dynastyMutators.ts";
import {
  dynastyCircleOf,
  effectiveStageTarget,
  marketCostFactor,
  mutatorForStage,
  SEASON,
  tightenedTarget,
} from "../src/game/anteRun.ts";
import { bannedHeroesForStage, BOSSES, bossForStage, evaluateBoss, type BossContext } from "../src/game/bossConditions.ts";
import { ECONOMY, marketOffers } from "../src/game/anteEconomy.ts";

const SEASON_LEN = SEASON.stages.length; // 25
const CIRCLE_FINALE = SEASON_LEN + SEASON.actLength - 1; // финал первого круга

/** Сид, у которого первый круг играется под нужным мутатором (детерминированный перебор). */
function seedFor(mutator: MutatorId, salt = ""): string {
  for (let i = 0; i < 400; i += 1) {
    const seed = `hunt-${salt}${mutator}-${i}`;
    if (mutatorForCircle(seed, 1) === mutator) return seed;
  }
  throw new Error(`не нашлось сида под мутатор ${mutator} — сломан выбор?`);
}

describe("выбор мутатора круга", () => {
  it("внутри сезона мутаторов нет", () => {
    for (let stage = 0; stage < SEASON_LEN; stage += 1) {
      expect(mutatorForStage("mutator-seed", stage)).toBeNull();
    }
  });

  it("детерминирован и один на все этапы круга", () => {
    const first = mutatorForStage("mutator-seed", SEASON_LEN);
    expect(first).not.toBeNull();
    for (let stage = SEASON_LEN; stage <= CIRCLE_FINALE; stage += 1) {
      expect(mutatorForStage("mutator-seed", stage)).toBe(first);
    }
    expect(mutatorForCircle("mutator-seed", 1)).toBe(first);
  });

  it("по сидaм выпадают все четыре правила", () => {
    const seen = new Set<MutatorId | null>();
    for (let i = 0; i < 60; i += 1) seen.add(mutatorForCircle(`spread-${i}`, 1));
    expect([...seen].sort()).toEqual([...MUTATOR_IDS].sort());
  });

  it("круг — продолжение актов за сезоном", () => {
    expect(dynastyCircleOf(0)).toBe(0);
    expect(dynastyCircleOf(SEASON_LEN - 1)).toBe(0);
    expect(dynastyCircleOf(SEASON_LEN)).toBe(1);
    expect(dynastyCircleOf(CIRCLE_FINALE)).toBe(1);
    expect(dynastyCircleOf(CIRCLE_FINALE + 1)).toBe(2);
  });
});

describe("tighterTargets: пороги жёстче на шаг", () => {
  it("шаг идёт по легальной лестнице и не пробивает чемпионство", () => {
    expect(tightenedTarget(8, 1)).toBe(6);
    expect(tightenedTarget(6, 1)).toBe(4);
    expect(tightenedTarget(4, 1)).toBe(3);
    expect(tightenedTarget(2, 1)).toBe(1);
    expect(tightenedTarget(1, 1)).toBe(1);
    // Нелегальный порог (тестовые лестницы) — без изменений, а не выдуманное число.
    expect(tightenedTarget(42, 1)).toBe(42);
  });

  it("эффективный порог этапа круга ужесточён только под мутатором", () => {
    const withMutator = seedFor("tighterTargets");
    const withoutMutator = seedFor("expensiveMarket");
    const base = effectiveStageTarget(withoutMutator, SEASON_LEN);
    expect(effectiveStageTarget(withMutator, SEASON_LEN))
      .toBe(tightenedTarget(base, MUTATORS.tighterTargets.steps));
    // Внутри сезона порог не тронут даже у «мутаторного» сида.
    expect(effectiveStageTarget(withMutator, 0)).toBe(SEASON.stages[0].target);
  });
});

describe("doubleBans: бан-лист heroBan умножен", () => {
  it("под мутатором список длиннее в factor раз и детерминирован", () => {
    const pool = Array.from({ length: 60 }, (_, i) => i + 1);
    // Нужен сид, где круг под doubleBans И финал круга роллит heroBan.
    let found: string | null = null;
    for (let i = 0; i < 2000 && !found; i += 1) {
      const seed = `bans-${i}`;
      if (mutatorForCircle(seed, 1) === "doubleBans" && bossForStage(seed, CIRCLE_FINALE) === "heroBan") {
        found = seed;
      }
    }
    expect(found).not.toBeNull();
    const bans = bannedHeroesForStage(found!, CIRCLE_FINALE, pool);
    expect(bans.length).toBe(12 * MUTATORS.doubleBans.factor);
    expect(bannedHeroesForStage(found!, CIRCLE_FINALE, pool)).toEqual(bans);
    // Пул меньше удвоенного списка — честное сжатие, не падение.
    expect(bannedHeroesForStage(found!, CIRCLE_FINALE, pool.slice(0, 15)).length).toBe(15);
  });
});

describe("uncappedBoss: штраф без потолка", () => {
  function bossCtx(seed: string, over: Partial<BossContext> = {}): BossContext {
    return {
      seed,
      absoluteStageIndex: CIRCLE_FINALE,
      base: 88,
      heroSynergy: 5,
      chemistry: 20, // заведомо больше потолка chemistryBlackout.max
      playerOvrs: [88, 87, 86, 85, 84],
      activeHeroes: [1, 2, 3, 4, 5],
      bannedHeroes: [],
      assignedHeroGames: [80, 80, 80, 80, 80],
      ...over,
    };
  }

  it("под мутатором штраф равен полной величине, без него — клампится", () => {
    const uncapped = evaluateBoss("chemistryBlackout", bossCtx(seedFor("uncappedBoss")));
    expect(uncapped.penalty).toBe(20);
    const capped = evaluateBoss("chemistryBlackout", bossCtx(seedFor("doubleBans")));
    expect(capped.penalty).toBe(BOSSES.chemistryBlackout.max);
  });
});

describe("expensiveMarket: цены рынка выше", () => {
  it("множитель действует только в круге под мутатором", () => {
    const seed = seedFor("expensiveMarket");
    expect(marketCostFactor(seed, SEASON_LEN)).toBe(MUTATORS.expensiveMarket.costFactor);
    expect(marketCostFactor(seed, 0)).toBe(1);
    expect(marketCostFactor(seedFor("doubleBans"), SEASON_LEN)).toBe(1);
  });

  it("стат-карты рынка дорожают на генерации (превью = покупка)", () => {
    const seed = seedFor("expensiveMarket");
    const factor = MUTATORS.expensiveMarket.costFactor;
    for (const offer of marketOffers(seed, SEASON_LEN, 0)) {
      if (!offer.effect) continue;
      const cfg = ECONOMY.levers[offer.effect.summand];
      // Цена обязана быть одной из трёх ступеней качества, умноженной на множитель мутатора.
      const legal = [0, 1, 2].map((bonus) => Math.round((cfg.cost + bonus * cfg.costStep) * factor));
      expect(legal).toContain(offer.cost);
    }
  });
});
