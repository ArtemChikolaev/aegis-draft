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

describe("doubleBans: «баны повсюду» — heroBan судит все этапы вне финалов (b1.41.0)", () => {
  const pool = Array.from({ length: 120 }, (_, i) => i + 1);

  it("вне финалов правило амбиентное, финал роллит босса как обычно", () => {
    // Стартовый Stake: каждый нефинальный этап сезона — heroBan, без стейка — null.
    for (const stage of [0, 1, 2, 3]) {
      expect(bossForStage("ambient-seed", stage, 0, "doubleBans")).toBe("heroBan");
      expect(bossForStage("ambient-seed", stage)).toBeNull();
    }
    // Финал акта — обычный ролл, стейк его не переиначивает.
    const finale = SEASON.actLength - 1;
    expect(bossForStage("ambient-seed", finale, 0, "doubleBans")).toBe(bossForStage("ambient-seed", finale));
    // Мутатор круга: те же амбиентные баны в круге под doubleBans, и нет — под другим правилом.
    expect(bossForStage(seedFor("doubleBans"), SEASON_LEN, 0)).toBe("heroBan");
    expect(bossForStage(seedFor("expensiveMarket"), SEASON_LEN, 0)).toBeNull();
  });

  it("бан-лист длиной banCount, ротация по этапам, реролл пересматривает список, не правило", () => {
    const listAt = (stage: number, rerolls = 0) =>
      bannedHeroesForStage("ambient-seed", stage, pool, rerolls, "doubleBans");
    expect(listAt(0).length).toBe(MUTATORS.doubleBans.banCount);
    expect(listAt(0)).toEqual(listAt(0)); // детерминизм
    expect(listAt(1)).not.toEqual(listAt(0)); // ротация: у каждого этапа свой список
    // Реролл: правило остаётся heroBan, но список пересмотрен.
    expect(bossForStage("ambient-seed", 0, 3, "doubleBans")).toBe("heroBan");
    expect(listAt(0, 1)).not.toEqual(listAt(0));
    // Без стейка нефинальный этап списка не имеет.
    expect(bannedHeroesForStage("ambient-seed", 0, pool).length).toBe(0);
  });

  it("на финале с роллнутым heroBan список под правилом тоже banCount, без правила — 12", () => {
    let found: string | null = null;
    for (let i = 0; i < 2000 && !found; i += 1) {
      const seed = `bans-${i}`;
      if (mutatorForCircle(seed, 1) === "doubleBans" && bossForStage(seed, CIRCLE_FINALE) === "heroBan") {
        found = seed;
      }
    }
    expect(found).not.toBeNull();
    expect(bannedHeroesForStage(found!, CIRCLE_FINALE, pool).length).toBe(MUTATORS.doubleBans.banCount);
    // Тот же ролл на финале БЕЗ правила (внутри сезона стейка нет) — обычные 12.
    for (let i = 0; i < 2000; i += 1) {
      const seed = `plain-${i}`;
      const finale = SEASON.actLength - 1;
      if (bossForStage(seed, finale) === "heroBan") {
        expect(bannedHeroesForStage(seed, finale, pool).length).toBe(12);
        return;
      }
    }
    throw new Error("не нашлось сида с heroBan на финале сезона");
  });
});

describe("uncappedBoss: штраф без потолка", () => {
  function bossCtx(seed: string, over: Partial<BossContext> = {}): BossContext {
    return {
      seed,
      absoluteStageIndex: CIRCLE_FINALE,
      base: 88,
      heroSynergy: 5,
      chemistry: 20,
      playerOvrs: [88, 87, 86, 85, 84],
      activeHeroes: [1, 2, 3, 4, 5],
      bannedHeroes: [],
      assignedHeroGames: [80, 80, 80, 80, 80],
      // Все 10 пар — сыгранные связки: сырой штраф (10 − tolerated)·perPair заведомо выше max.
      pairCoGames: Array(10).fill(BOSSES.chemistryBlackout.minPairGames),
      ...over,
    };
  }

  it("под мутатором штраф равен полной величине, без него — клампится", () => {
    const cfg = BOSSES.chemistryBlackout;
    const rawPenalty = (10 - cfg.tolerated) * cfg.perPair;
    expect(rawPenalty).toBeGreaterThan(cfg.max); // фикстура воспроизводит случай
    const uncapped = evaluateBoss("chemistryBlackout", bossCtx(seedFor("uncappedBoss")));
    expect(uncapped.penalty).toBe(rawPenalty);
    const capped = evaluateBoss("chemistryBlackout", bossCtx(seedFor("doubleBans")));
    expect(capped.penalty).toBe(cfg.max);
  });

  it("правило судит все турниры выше обычных — elite и playoffCheck (b1.41.0)", () => {
    const SEASON_ELITE = 2; // акт 1: regular, regular, ELITE, PLAYOFF CHECK, boss
    const SEASON_PLAYOFF = 3;
    const CIRCLE_ELITE = SEASON_LEN + 2;
    // Стартовый Stake: elite и playoffCheck получают правило, обычные этапы и «без стейка» — нет.
    expect(bossForStage("elite-seed", SEASON_ELITE, 0, "uncappedBoss")).not.toBeNull();
    expect(bossForStage("elite-seed", SEASON_PLAYOFF, 0, "uncappedBoss")).not.toBeNull();
    expect(bossForStage("elite-seed", 0, 0, "uncappedBoss")).toBeNull();
    expect(bossForStage("elite-seed", SEASON_ELITE)).toBeNull();
    expect(bossForStage("elite-seed", SEASON_ELITE, 0, "expensiveMarket")).toBeNull();
    // Финалы актов стейк не переиначивает: то же правило, что и без него.
    const finale = SEASON.actLength - 1;
    expect(bossForStage("elite-seed", finale, 0, "uncappedBoss")).toBe(bossForStage("elite-seed", finale));
    // Круг Династии: элитные этапы роллят правило только под мутатором uncappedBoss
    // (амбиентный heroBan круга doubleBans — отдельное правило, tighterTargets — контроль).
    expect(bossForStage(seedFor("uncappedBoss"), CIRCLE_ELITE)).not.toBeNull();
    expect(bossForStage(seedFor("tighterTargets"), CIRCLE_ELITE)).toBeNull();
    // heroBan на элитном этапе отдаёт бан-лист (bannedHeroesForStage обязан знать про stake).
    const pool = Array.from({ length: 60 }, (_, i) => i + 1);
    for (let i = 0; i < 400; i += 1) {
      const seed = `elite-ban-${i}`;
      if (bossForStage(seed, SEASON_ELITE, 0, "uncappedBoss") === "heroBan") {
        expect(bannedHeroesForStage(seed, SEASON_ELITE, pool, 0, "uncappedBoss").length).toBe(12);
        expect(bannedHeroesForStage(seed, SEASON_ELITE, pool).length).toBe(0);
        return;
      }
    }
    throw new Error("не нашлось сида с heroBan на элитном этапе");
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
