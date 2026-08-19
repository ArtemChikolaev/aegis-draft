import { describe, expect, it } from "vitest";
import {
  BOSSES,
  BOSS_IDS,
  bannedHeroesForStage,
  baseDemandFor,
  bossForStage,
  evaluateBoss,
  spreadLimitFor,
  type BossContext,
} from "../src/game/bossConditions.ts";
import { ACT_LENGTH, isActFinale } from "../src/game/anteRun.ts";

function ctx(over: Partial<BossContext> = {}): BossContext {
  return {
    // Seed нужен потолку штрафа (мутатор uncappedBoss, LG3); дефолтные этапы — внутри сезона,
    // где мутаторов нет, поэтому на прежние проверки он не влияет.
    seed: "boss-test",
    // Первый акт по умолчанию: планки боссов — рампа по актам (R12.5), поэтому у контекста теста
    // обязан быть этап, иначе тест проверял бы неизвестно какой порог.
    absoluteStageIndex: ACT_LENGTH - 1,
    base: 88,
    heroSynergy: 5,
    chemistry: 3,
    playerOvrs: [88, 87, 86, 85, 84],
    activeHeroes: [1, 2, 3, 4, 5],
    bannedHeroes: [],
    // По умолчанию все герои — «свои»: иначе heroSynergyDemand штрафовал бы в каждом тесте.
    assignedHeroGames: [80, 80, 80, 80, 80],
    // По умолчанию связок нет: иначе chemistryBlackout штрафовал бы в каждом тесте.
    pairCoGames: Array(10).fill(0),
    ...over,
  };
}

/** Финал акта `act` (1-based) — на нём и стоят боссы. */
const finaleOfAct = (act: number) => act * ACT_LENGTH - 1;

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

  // T5.9: правило можно перекупить в Буткемпе. Реролл обязан МЕНЯТЬ правило — при пяти типах
  // случайный повтор выпадал бы каждый пятый раз, и игрок платил бы за «то же самое».
  it("смена правила даёт другое правило, детерминирована и не трогает нулевой реролл", () => {
    for (let stage = ACT_LENGTH - 1; stage < 40; stage += ACT_LENGTH) {
      const original = bossForStage("reroll-seed", stage);
      expect(original).not.toBeNull();
      let previous = original;
      for (let n = 1; n <= 4; n += 1) {
        const rerolled = bossForStage("reroll-seed", stage, n);
        expect(rerolled).not.toBe(previous);
        expect(rerolled).toBe(bossForStage("reroll-seed", stage, n)); // детерминизм
        previous = rerolled;
      }
      // Ключ нулевого реролла сохранён ⇒ ни один уже сыгранный сид не сдвинулся.
      expect(bossForStage("reroll-seed", stage, 0)).toBe(original);
    }
  });

  it("баны героев следуют за перекупленным правилом", () => {
    const pool = Array.from({ length: 40 }, (_, i) => i + 1);
    // Ищем этап, где heroBan появляется ИМЕННО после смены правила.
    let stage = -1;
    let rerolls = 0;
    outer: for (let s = ACT_LENGTH - 1; s < 200; s += ACT_LENGTH) {
      for (let n = 1; n <= 3; n += 1) {
        if (bossForStage("ban-reroll", s) !== "heroBan" && bossForStage("ban-reroll", s, n) === "heroBan") {
          stage = s; rerolls = n; break outer;
        }
      }
    }
    expect(stage).toBeGreaterThanOrEqual(0);
    expect(bannedHeroesForStage("ban-reroll", stage, pool)).toEqual([]);
    const banned = bannedHeroesForStage("ban-reroll", stage, pool, rerolls);
    expect(banned.length).toBeGreaterThan(0);
    expect(bannedHeroesForStage("ban-reroll", stage, pool, rerolls)).toEqual(banned);
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
    const stage = finaleOfAct(1);
    const demand = baseDemandFor(stage);
    const weak = evaluateBoss("baseFloor", ctx({ absoluteStageIndex: stage, base: demand - 4 }));
    expect(weak.met).toBe(false);
    expect(weak.penalty).toBeCloseTo(4 * BOSSES.baseFloor.perPoint, 5);
    const strong = evaluateBoss("baseFloor", ctx({ absoluteStageIndex: stage, base: demand }));
    expect(strong.met).toBe(true);
    expect(strong.penalty).toBe(0);
  });

  it("штраф упирается в cap", () => {
    const huge = evaluateBoss("baseFloor", ctx({ base: 0 }));
    expect(huge.penalty).toBe(BOSSES.baseFloor.max);
  });

  // R12.5: планка-константа делила сезон на «штраф всегда» и «штрафа никогда» — решением она не
  // была нигде. Здесь фиксируется именно это: планка растёт вместе с Base и упирается в потолок.
  it("планка растёт по актам и не уходит выше потолка качества", () => {
    const demands = [1, 2, 3, 4, 5].map((act) => baseDemandFor(finaleOfAct(act)));
    for (let i = 1; i < demands.length; i += 1) {
      expect(demands[i]).toBeGreaterThan(demands[i - 1]);
    }
    // Глубокая Династия: рампа асимптотически подходит к потолку качества, но никогда не требует
    // больше, чем игрок вообще может иметь.
    expect(baseDemandFor(finaleOfAct(40))).toBeLessThan(BOSSES.baseFloor.ceiling);
    expect(baseDemandFor(finaleOfAct(40))).toBeGreaterThan(BOSSES.baseFloor.ceiling - 1);
  });

  it("один и тот же Base проходит в начале сезона и не проходит в конце", () => {
    const base = 88;
    expect(evaluateBoss("baseFloor", ctx({ absoluteStageIndex: finaleOfAct(1), base })).met).toBe(true);
    expect(evaluateBoss("baseFloor", ctx({ absoluteStageIndex: finaleOfAct(5), base })).met).toBe(false);
  });
});

describe("heroSynergyDemand — рычаг Hero Synergy", () => {
  // Условие структурное (штуки, не очки): величина Hero Synergy упирается в потолок к третьему
  // акту, и планка по ней выполнялась всеми и всегда.
  it("штрафуются герои СВЕРХ допуска, в пределах допуска условие выполнено", () => {
    const cfg = BOSSES.heroSynergyDemand;
    const off = new Array(cfg.tolerated + 2).fill(cfg.minGames - 1);
    const over = evaluateBoss("heroSynergyDemand", ctx({
      assignedHeroGames: [...off, ...Array(3).fill(100)],
    }));
    expect(over.met).toBe(false);
    expect(over.penalty).toBeCloseTo(2 * cfg.perHero, 5);
    expect(over.reasonParams).toMatchObject({ n: off.length, max: cfg.tolerated, games: cfg.minGames });

    // Ровно допуск — штрафа нет: пара «чужих» героев есть у любого состава (замер).
    const tolerated = evaluateBoss("heroSynergyDemand", ctx({
      assignedHeroGames: [...Array(cfg.tolerated).fill(0), ...Array(3).fill(cfg.minGames)],
    }));
    expect(tolerated.met).toBe(true);
    expect(tolerated.penalty).toBe(0);
  });

  it("не зависит от ВЕЛИЧИНЫ Hero Synergy — только от состава", () => {
    const games = { assignedHeroGames: [0, 0, 0, 0, 100] };
    const low = evaluateBoss("heroSynergyDemand", ctx({ ...games, heroSynergy: 0 }));
    const maxed = evaluateBoss("heroSynergyDemand", ctx({ ...games, heroSynergy: 19.5 }));
    expect(maxed.penalty).toBe(low.penalty);
    expect(maxed.met).toBe(low.met);
  });

  it("штраф упирается в cap", () => {
    const many = evaluateBoss("heroSynergyDemand", ctx({ assignedHeroGames: Array(20).fill(0) }));
    expect(many.penalty).toBe(BOSSES.heroSynergyDemand.max);
  });
});

describe("chemistryBlackout — рычаг Chemistry (структурное с 2026-08-18)", () => {
  const cfg = BOSSES.chemistryBlackout;
  /** N сыгранных связок + остальные пустые (всего 10 пар пятёрки). */
  const pairs = (known: number) =>
    [...Array(known).fill(cfg.minPairGames), ...Array(10 - known).fill(0)];

  it("связки в пределах допуска — met, сверх — штраф за штуки, cap держит", () => {
    expect(evaluateBoss("chemistryBlackout", ctx({ pairCoGames: pairs(cfg.tolerated) })).met).toBe(true);
    const over2 = evaluateBoss("chemistryBlackout", ctx({ pairCoGames: pairs(cfg.tolerated + 2) }));
    expect(over2.met).toBe(false);
    expect(over2.penalty).toBeCloseTo(2 * cfg.perPair, 5);
    const all = evaluateBoss("chemistryBlackout", ctx({ pairCoGames: pairs(10) }));
    expect(all.penalty).toBe(cfg.max);
  });

  it("величина Chemistry в условие не входит: прокачанный рычаг сам по себе не штрафуется", () => {
    // Высокая Chemistry при слабых связках (много пар чуть НИЖЕ бара) — met. Именно это
    // отличает условие от прежнего «налога на величину» (выполнялся в 2% случаев).
    const weakPairs = Array(10).fill(cfg.minPairGames - 1);
    const rich = evaluateBoss("chemistryBlackout", ctx({ chemistry: 12, pairCoGames: weakPairs }));
    expect(rich.met).toBe(true);
    expect(rich.penalty).toBe(0);
  });

  it("превью честное: reasonParams несут число связок, допуск и бар", () => {
    const evaluated = evaluateBoss("chemistryBlackout", ctx({ pairCoGames: pairs(7) }));
    expect(evaluated.reasonParams).toEqual({ n: 7, max: cfg.tolerated, games: cfg.minPairGames });
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

  // R12.5: разброс сам падает по ходу забега (замер: 14 → 7), поэтому допуск обязан сужаться —
  // иначе фиксированные 8 сначала штрафуют почти всех, а к финалу сезона никого.
  it("допуск разброса сужается по актам и не уходит в ноль в Династии", () => {
    const limits = [1, 2, 3, 4, 5].map((act) => spreadLimitFor(finaleOfAct(act)));
    for (let i = 1; i < limits.length; i += 1) {
      expect(limits[i]).toBeLessThan(limits[i - 1]);
    }
    expect(spreadLimitFor(finaleOfAct(40))).toBe(BOSSES.unbalancedRoster.floorSpread);
  });

  it("один и тот же разброс проходит в начале сезона и не проходит в конце", () => {
    const playerOvrs = [92, 88, 86, 84, 80]; // разброс 12
    expect(evaluateBoss("unbalancedRoster", ctx({ absoluteStageIndex: finaleOfAct(1), playerOvrs })).met).toBe(true);
    expect(evaluateBoss("unbalancedRoster", ctx({ absoluteStageIndex: finaleOfAct(5), playerOvrs })).met).toBe(false);
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
