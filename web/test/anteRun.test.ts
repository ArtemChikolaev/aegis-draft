import { describe, expect, it } from "vitest";
import {
  AnteRunEngine,
  ANTE_FIELD_STEP,
  LEGAL_ANTE_TARGETS,
  ANTE_FIELD,
  ANTE_THREAT,
  anteFieldMult,
  ACT_LENGTH,
  anteFieldModel,
  anteThreat,
  buildSeason,
  grantsDynastyTitle,
  isActFinale,
  nextBossStage,
  isLegalAnteTarget,
  placementWorstRank,
  SEASON,
  SEASON_ACT_FINALES,
  SEASON_ACTS,
  SEASON_TARGETS,
  SEASON_TEMPLATE,
  seasonFromTargets,
  seasonStage,
  stageMutators,
  effectiveStageTarget,
  marketCostFactor,
} from "../src/game/anteRun.ts";
import { QUICK_DRAFT_FIELD, TournamentEngine } from "../src/game/tournament.ts";
import { loadGameData } from "./helpers/data.ts";
import { advanceToEnd } from "./helpers/tournament.ts";

const data = loadGameData();

function botStrengths(engine: TournamentEngine): number[] {
  return engine.snapshot.field.filter((t) => !t.isUser).map((t) => t.strength);
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Прогнать забег до конца, собрав места каждого разрешённого этапа. */
function runToEnd(engine: AnteRunEngine) {
  const placements: (string | null)[] = [];
  let guard = 0;
  while (engine.state.phase === "playing" && guard < 50) {
    engine.resolveStage();
    placements.push(engine.state.lastPlacement);
    guard += 1;
  }
  return { placements, phase: engine.state.phase, index: engine.state.index };
}

describe("placementWorstRank", () => {
  it("бакет мест → худшее числовое место", () => {
    expect(placementWorstRank("1")).toBe(1);
    expect(placementWorstRank("4")).toBe(4);
    expect(placementWorstRank("5-6")).toBe(6);
    expect(placementWorstRank("7-8")).toBe(8);
    expect(placementWorstRank("9-12")).toBe(12);
    expect(placementWorstRank("17")).toBe(17);
    expect(placementWorstRank("18")).toBe(18);
  });
});

// R6.1: сезон = акт-модель, а не плоский массив порогов.
describe("Акт-модель сезона (R6.1)", () => {
  it("сезон по умолчанию — 5 актов × 5 этапов, длина не константа победы", () => {
    expect(SEASON.acts).toBe(SEASON_ACTS);
    expect(SEASON.actLength).toBe(SEASON_TEMPLATE.length);
    expect(SEASON.stages).toHaveLength(SEASON_ACTS * SEASON_TEMPLATE.length);
    // Ровно то, ради чего модель конфигурируемая: R10 сравнивает 20/25/30 без правки оркестратора.
    expect(buildSeason({ acts: 4 }).stages).toHaveLength(20);
    expect(buildSeason({ acts: 6 }).stages).toHaveLength(30);
  });

  it("шаблон акта повторяется, а нумерация идёт «акт · этап в акте»", () => {
    expect(SEASON.stages.slice(0, 5).map((s) => s.kind)).toEqual([...SEASON_TEMPLATE]);
    expect(SEASON.stages.slice(5, 10).map((s) => s.kind)).toEqual([...SEASON_TEMPLATE]);
    expect(SEASON.stages[7]).toMatchObject({ act: 2, stageInAct: 3, kind: "elite" });
    expect(SEASON.stages[24]).toMatchObject({ act: 5, stageInAct: 5, kind: "boss" });
  });

  it("порог берётся из типа этапа, а финалы актов ужесточаются (PRD §5.9.3)", () => {
    const targets = SEASON.stages.map((s) => s.target);
    expect(targets.slice(0, 5)).toEqual([8, 8, 6, 4, SEASON_ACT_FINALES[0]]);
    expect(SEASON.stages.filter((s) => s.kind === "boss").map((s) => s.target))
      .toEqual([...SEASON_ACT_FINALES]);
    expect(SEASON.stages.filter((s) => s.kind === "regular").every((s) => s.target === SEASON_TARGETS.regular)).toBe(true);
    expect(SEASON.stages.filter((s) => s.kind === "elite").every((s) => s.target === SEASON_TARGETS.elite)).toBe(true);
    // Все пороги обязаны быть worst-rank реального бакета — иначе подпись врёт (R9.3).
    expect(targets.every(isLegalAnteTarget)).toBe(true);
  });

  it("чемпионство требуется ровно один раз — на последнем этапе сезона (R6.4, PRD §10.I)", () => {
    // Ответ на открытый вопрос «цена одной неудачной сетки»: до R6.4 порог `1-е` стоял и на
    // Stage 20, и на Stage 25, то есть забег из двадцати турниров обрывался на одном BO5 в
    // середине сезона. Замер показал, что смягчение S20 не меняет общий win-rate — оно переносит
    // точку обрыва в финал. Правило продуктовое, поэтому фиксируем его тестом, а не комментарием.
    const championships = SEASON.stages.filter((stage) => stage.target === 1);
    expect(championships).toHaveLength(1);
    expect(championships[0].index).toBe(SEASON.stages.length - 1);
    // Предыдущий финал акта требует топ-2: место выше порога платится премией, а не проходом.
    expect(SEASON.stages[19]).toMatchObject({ act: 4, kind: "boss", target: 2 });
  });

  // R9.4: разведка обязана раскрывать то, чего ещё не видно, поэтому смотрит СТРОГО дальше
  // предстоящего этапа — его правило и так на экране Буткемпа.
  it("nextBossStage находит следующий боссовый этап строго дальше текущего", () => {
    expect(nextBossStage(0)).toBe(4);
    // Предстоящий этап сам боссовый → разведка показывает уже СЛЕДУЮЩИЙ акт, а не то же самое.
    expect(nextBossStage(4)).toBe(9);
    expect(nextBossStage(5)).toBe(9);
    expect(nextBossStage(9)).toBe(14);
    // Работает и в Династии: там сезон кончился, а акты продолжаются.
    expect(nextBossStage(24)).toBe(29);
    expect(isActFinale(nextBossStage(7))).toBe(true);
  });

  it("правила этапа считаются и ЗА пределами сезона: там продолжается Династия", () => {
    // T5.8 продолжает те же акты после Stage 25, поэтому арифметика обязана работать дальше
    // конца массива, а не падать и не возвращать undefined.
    expect(seasonStage(25)).toMatchObject({ act: 6, stageInAct: 1, kind: "regular" });
    expect(seasonStage(29)).toMatchObject({ act: 6, stageInAct: 5, kind: "boss" });
    // Список финалов короче числа актов — последний порог повторяется, а не становится undefined.
    expect(seasonStage(29).target).toBe(SEASON_ACT_FINALES[SEASON_ACT_FINALES.length - 1]);
  });
});

describe("TournamentEngine FieldModel", () => {
  const sd = (xs: number[]) => {
    const m = mean(xs);
    return Math.sqrt(xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / xs.length);
  };

  it("явная модель Quick Draft тождественна дефолту (golden не двигается)", () => {
    const base = new TournamentEngine(data, "last_2y", "ante-fb", 80, "N");
    const explicit = new TournamentEngine(data, "last_2y", "ante-fb", 80, "N", 0, QUICK_DRAFT_FIELD);
    expect(botStrengths(explicit)).toEqual(botStrengths(base));
    expect(explicit.snapshot.userPlacement).toBe(base.snapshot.userPlacement);
  });

  it("сдвиг mean поднимает поле и НЕ схлопывает разброс", () => {
    // Ровно то, что было сломано: прежний пост-сдвиг с переклампом давал sd ≈ 1 (спайк на
    // границе). Модель этапа обязана сохранять живой разброс на любом mean.
    const low = botStrengths(new TournamentEngine(
      data, "last_2y", "ante-fb", 80, "N", 0, { mean: 70, sd: 5, min: 60, max: 99 },
    ));
    const high = botStrengths(new TournamentEngine(
      data, "last_2y", "ante-fb", 80, "N", 0, { mean: 88, sd: 5, min: 60, max: 99 },
    ));
    expect(mean(high)).toBeGreaterThan(mean(low));
    expect(sd(low)).toBeGreaterThan(2);
    expect(sd(high)).toBeGreaterThan(2);
    // Ни одно значение не «прилипает» к границе большинством.
    const atFloor = low.filter((x) => x === 60).length / low.length;
    expect(atFloor).toBeLessThan(0.2);
  });

  it("threat поднимает итоговую силу выше потолка качества ростера", () => {
    const capped = botStrengths(new TournamentEngine(
      data, "last_2y", "ante-threat", 80, "N", 0, { mean: 95, sd: 5, min: 60, max: 99 },
    ));
    const withThreat = botStrengths(new TournamentEngine(
      data, "last_2y", "ante-threat", 80, "N", 0, { mean: 95, sd: 5, min: 60, max: 99, threat: 20 },
    ));
    expect(Math.max(...capped)).toBeLessThanOrEqual(99);
    // Потолка 99 у итоговой силы больше нет — иначе поздняя угроза упиралась бы в стену.
    expect(Math.max(...withThreat)).toBeGreaterThan(99);
    expect(mean(withThreat) - mean(capped)).toBeCloseTo(20, 6);
  });
});

describe("AnteRunEngine", () => {
  it("детерминизм: тот же seed → та же последовательность и та же фаза", () => {
    const a = runToEnd(new AnteRunEngine(data, "last_2y", "ante-det", 78, "Five"));
    const b = runToEnd(new AnteRunEngine(data, "last_2y", "ante-det", 78, "Five"));
    expect(a).toEqual(b);
  });

  it("забег всегда завершается за число этапов лестницы", () => {
    const run = runToEnd(new AnteRunEngine(data, "last_2y", "ante-fin", 75, "Five"));
    expect(run.phase).not.toBe("playing");
    expect(run.placements.length).toBeLessThanOrEqual(SEASON.stages.length);
  });

  it("поле каждого следующего этапа сильнее предыдущего", () => {
    // Порог 18 всегда пройден (худшее место ≤ 18) → движок доходит до последних этапов,
    // и можно сравнить силу поля этапа 0 и этапа 2 при одном teamOvr.
    const trivialTargets = [18, 18, 18];
    const engine = new AnteRunEngine(data, "last_2y", "ante-grow", 82, "Five", seasonFromTargets(trivialTargets));
    const stage0 = mean(botStrengths(engine.tournament));
    engine.resolveStage();
    engine.resolveStage();
    const stage2 = mean(botStrengths(engine.tournament));
    expect(engine.state.index).toBe(2);
    expect(engine.state.fieldMean).toBe(anteFieldModel(2).mean);
    expect(stage2).toBeGreaterThan(stage0);
  });

  it("проходимая лестница доводит до победы", () => {
    // targets=[18,18]: оба этапа гарантированно проходятся → терминальная фаза «won».
    const run = runToEnd(new AnteRunEngine(data, "last_2y", "ante-win", 70, "Five", seasonFromTargets([18, 18])));
    expect(run.phase).toBe("won");
    expect(run.placements).toHaveLength(2);
  });

  it("непроходимый порог = смерть на этом этапе", () => {
    // Слабый состав против требования чемпионства → гарантированная смерть на этапе 0.
    // Раньше здесь стоял target=0: он «недостижим», но и не является реальным бакетом, а такие
    // числа теперь запрещены (R9.3) — ложные подписи порогов ловятся конструктором.
    const engine = new AnteRunEngine(data, "last_2y", "ante-death", 45, "Five", seasonFromTargets([1, 8]));
    expect(engine.resolveStage()).toBe("lost");
    expect(engine.state.index).toBe(0);
    expect(engine.state.lastPlacement).not.toBeNull();
  });

  // R6.3: победа сезона терминальна, но Династия продолжает ТОТ ЖЕ забег добровольно.
  it("Династия продолжает забег за концом сезона, победа остаётся засчитанной", () => {
    const season = seasonFromTargets([18, 18]);
    const engine = new AnteRunEngine(data, "last_2y", "dynasty-go", 70, "Five", season);
    engine.resolveStage();
    expect(engine.resolveStage()).toBe("won");
    expect(engine.state).toMatchObject({ seasonWon: true, dynasty: false, index: 1 });

    // Продолжение: индекс уходит за сезон, правила этапа считаются арифметикой актов.
    expect(engine.continueDynasty()).toBe("playing");
    const inDynasty = engine.state;
    expect(inDynasty).toMatchObject({ index: 2, dynasty: true, seasonWon: true });
    expect(inDynasty.target).toBe(seasonStage(2, season).target);

    // Второй «победы» в Династии нет: штатный финал бесконечной фазы — поражение.
    for (let guard = 0; guard < 40 && engine.state.phase === "playing"; guard += 1) engine.resolveStage();
    expect(engine.state.phase).toBe("lost");
    expect(engine.state.seasonWon).toBe(true);
  });

  it("титул Династии даёт только акт ЗА пределами сезона (T5.8)", () => {
    // Внутри сезона финал акта уже оплачен призовыми и премией за место (R6.4) — второй награды
    // там быть не должно, иначе Династия перестаёт отличаться от сезона.
    expect(grantsDynastyTitle(4)).toBe(false);
    expect(grantsDynastyTitle(19)).toBe(false);
    // Победа сезона (этап 25, индекс 24) — не титул Династии: это сама победа.
    expect(grantsDynastyTitle(24)).toBe(false);
    expect(grantsDynastyTitle(29)).toBe(true);
    expect(grantsDynastyTitle(34)).toBe(true);
    // Обычный этап Династии титула не даёт.
    expect(grantsDynastyTitle(27)).toBe(false);
  });

  it("титулы считаются от пройденных актов и переживают вход в Династию", () => {
    const engine = new AnteRunEngine(data, "last_2y", "titles", 80, "Five");
    expect(engine.state.titles).toBe(0);
    engine.jumpToStage(5);
    expect(engine.state.titles).toBe(1);
    engine.jumpToStage(24);
    expect(engine.state.titles).toBe(4);
    // Победа сезона добавляет пятый титул, Династия продолжает счёт.
    engine.jumpToStage(29, { seasonWon: true });
    expect(engine.state.titles).toBe(5);
    engine.jumpToStage(30, { seasonWon: true });
    expect(engine.state.titles).toBe(6);
  });

  it("continueDynasty вне победы — no-op", () => {
    const engine = new AnteRunEngine(data, "last_2y", "dynasty-noop", 45, "Five", seasonFromTargets([1, 8]));
    expect(engine.continueDynasty()).toBe("playing");
    expect(engine.state.index).toBe(0);
    engine.resolveStage();
    expect(engine.state.phase).toBe("lost");
    expect(engine.continueDynasty()).toBe("lost");
  });

  it("resume Династии восстанавливает победу из сейва, а не выводит её из индекса", () => {
    const engine = new AnteRunEngine(data, "last_2y", "dynasty-resume", 80, "Five");
    engine.jumpToStage(27, { seasonWon: true });
    expect(engine.state).toMatchObject({ index: 27, dynasty: true, seasonWon: true, phase: "playing" });
    // Внутри сезона флаг не выдумывается: сейв без победы остаётся забегом без победы.
    engine.jumpToStage(3, { seasonWon: false });
    expect(engine.state.seasonWon).toBe(false);
  });

  it("после конца забега resolveStage — no-op", () => {
    const engine = new AnteRunEngine(data, "last_2y", "ante-noop", 45, "Five", seasonFromTargets([1]));
    engine.resolveStage();
    const after = engine.state;
    expect(engine.resolveStage()).toBe("lost");
    expect(engine.state).toEqual(after);
  });

  it("порог обязан быть worst-rank реального бакета (R9.3)", () => {
    // «топ-10» невыразимо: бакет 9-12 кончается на 12, поэтому target=10 вёл себя как топ-8.
    expect(LEGAL_ANTE_TARGETS).toEqual([1, 2, 3, 4, 6, 8, 12, 16, 17, 18]);
    expect(SEASON.stages.map((stage) => stage.target).every(isLegalAnteTarget)).toBe(true);
    expect(() => new AnteRunEngine(data, "last_2y", "illegal", 80, "Five", seasonFromTargets([10])))
      .toThrow(/worst-rank/);
    // Смена подписи 10 → 8 не сдвинула ни один бакет: оба режут ровно «9-12» и ниже.
    expect(placementWorstRank("7-8") <= 8).toBe(true);
    expect(placementWorstRank("9-12") > 8).toBe(true);
  });

  it("боссы стоят только на финалах актов (R6.2)", () => {
    expect([0, 1, 2, 3].map(isActFinale)).toEqual([false, false, false, false]);
    expect([4, 9, 14, 19, 24].map(isActFinale)).toEqual([true, true, true, true, true]);
  });

  it("слабый состав не проходит стартовый порог топ-8", () => {
    // teamOvr сильно ниже даже гандикапнутого поля (N74 на этапе 0) → место у дна → промах.
    const engine = new AnteRunEngine(data, "last_2y", "ante-weak", 45, "Five");
    expect(engine.resolveStage()).toBe("lost");
    expect(placementWorstRank(engine.state.lastPlacement!)).toBeGreaterThan(SEASON.stages[0].target);
  });
});

// R7.2: угроза поля сверх качества ростера.
describe("Угроза этапа (R7.2)", () => {
  it("рампа mean живёт ВНУТРИ акта, рост между актами несёт threat", () => {
    // Если бы mean рос по абсолютному этапу, к 25-му он ушёл бы за 143 и все боты уткнулись бы
    // в потолок качества 99 — спайк, ради устранения которого затевался R7.1, вернулся бы сверху.
    for (let stage = 0; stage < 30; stage += 1) {
      const field = anteFieldModel(stage);
      expect(field.mean).toBeGreaterThanOrEqual(ANTE_FIELD.meanBase);
      expect(field.mean).toBeLessThanOrEqual(ANTE_FIELD.meanBase + (ACT_LENGTH - 1) * ANTE_FIELD_STEP);
      expect(field.mean).toBeLessThan(ANTE_FIELD.max);
    }
    // Начало нового акта повторяет локальную рампу.
    expect(anteFieldModel(ACT_LENGTH).mean).toBe(anteFieldModel(0).mean);
  });

  it("угроза не убывает, ускоряется по актам и не имеет потолка", () => {
    let previous = -1;
    for (let stage = 0; stage < 50; stage += ACT_LENGTH) {
      const threat = anteThreat(stage);
      expect(threat).toBeGreaterThan(previous);
      previous = threat;
    }
    // Ускорение: прирост между актами сам растёт, иначе бесконечная Династия выходит на плато.
    const perAct = (n: number) => anteThreat(n * ACT_LENGTH);
    expect(perAct(3) - perAct(2)).toBeGreaterThan(perAct(2) - perAct(1));
    expect(anteThreat(200)).toBeGreaterThan(100);
  });

  it("elite-этап играется усиленным полем: у него нет правила, вся сложность там (R6.1)", () => {
    const eliteIndex = SEASON.stages.findIndex((stage) => stage.kind === "elite");
    expect(anteThreat(eliteIndex) - anteThreat(eliteIndex - 1)).toBe(ANTE_THREAT.elite);
    // Ровно один тип этапа даёт надбавку: обычные этапы внутри акта поднимает только mean.
    expect(anteThreat(0)).toBe(0);
    expect(anteThreat(1)).toBe(0);
  });

  it("финал акта играется более сильным полем, но правило босса остаётся главным", () => {
    // Надбавка — «финал акта сильнее», а не замена условия числом (PRD запрещает боссов,
    // которые только поднимают цифру).
    expect(anteThreat(ACT_LENGTH - 1) - anteThreat(ACT_LENGTH - 2)).toBe(ANTE_THREAT.boss);
    expect(isActFinale(ACT_LENGTH - 1)).toBe(true);
  });

  it("Stakes — сид снаружи, а не выдуманное здесь число", () => {
    expect(anteThreat(0)).toBe(0);
    expect(anteThreat(0, { stake: 7 })).toBe(7);
    expect(anteFieldModel(0, { stake: 7 }).threat).toBe(7);
  });

  it("множитель поля растёт по актам сглаженной рампой: акт 1 ровно 1, жёстче плоского — только финал (b1.39.0)", () => {
    // Акт 1 не тронут ни на одном этапе — сезонное начало и e2e-сиды не двигаются.
    for (let stage = 0; stage < ACT_LENGTH; stage += 1) expect(anteFieldMult(stage)).toBe(1);
    // Смысл рампы: вход в акт мягче плоского уровня, выше плоского — только финал акта.
    const q = 1 + ANTE_THREAT.multPerAct;
    for (let s = 0; s < ACT_LENGTH; s += 1) {
      const value = anteFieldMult(ACT_LENGTH + s);
      if (s < ACT_LENGTH - 1) expect(value).toBeLessThanOrEqual(q + 1e-12);
      else expect(value).toBeGreaterThan(q);
    }
    // Геосреднее акта = плоское значение × q^(центр − середина): смещение центра к хвосту —
    // калибровка полосы (см. ANTE_THREAT.multRampCenter), проверяем как контракт.
    const geoShift = q ** ((ACT_LENGTH - 1) / 2 / ACT_LENGTH - ANTE_THREAT.multRampCenter);
    const geoMean = (act: number) => {
      let product = 1;
      for (let s = 0; s < ACT_LENGTH; s += 1) product *= anteFieldMult((act - 1) * ACT_LENGTH + s);
      return product ** (1 / ACT_LENGTH);
    };
    expect(geoMean(2)).toBeCloseTo(q * geoShift, 6);
    expect(geoMean(3)).toBeCloseTo(q ** 2 * geoShift, 6);
    // Кривая строго неубывающая на всём горизонте, включая стык сезон → Династия.
    let previous = 0;
    for (let stage = 0; stage < 12 * ACT_LENGTH; stage += 1) {
      const value = anteFieldMult(stage);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = value;
    }
    // Мультипликативная часть идёт отдельным слоем от аддитивной угрозы: оба видны в модели этапа.
    expect(anteFieldModel(ACT_LENGTH).mult).toBeCloseTo(anteFieldMult(ACT_LENGTH), 6);
    expect(anteFieldModel(0).mult).toBe(1);
    // Сила ботов на этапе с множителем выше той же модели без него — множитель применяется
    // к итоговой силе (качество + угроза), поэтому порядок величин этапа растёт, а не только хвост.
    const withMult = new TournamentEngine(data, "last_2y", "mult-act2", 95, "Five", 0, anteFieldModel(2 * ACT_LENGTH));
    const noMult = new TournamentEngine(data, "last_2y", "mult-act2", 95, "Five", 0, { ...anteFieldModel(2 * ACT_LENGTH), mult: 1 });
    const botMean = (engine: TournamentEngine) => {
      const bots = engine.snapshot.field.filter((team) => !team.isUser);
      return bots.reduce((sum, team) => sum + team.strength, 0) / bots.length;
    };
    expect(botMean(withMult) / botMean(noMult)).toBeCloseTo(anteFieldMult(2 * ACT_LENGTH), 1);
  });

  it("Stakes (T6.4/T6.4-2): правила действуют на сезон теми же рычагами, Династия сохраняет мутатор круга", () => {
    const seed = "stake-spec";
    // Сезон: без Stakes правил нет; со Stakes — ровно они на каждом сезонном этапе.
    expect(stageMutators(seed, 3)).toEqual([]);
    expect(stageMutators(seed, 3, undefined, ["tighterTargets"])).toEqual(["tighterTargets"]);
    // Несколько разом (T6.4-2): активны все выбранные.
    expect(stageMutators(seed, 3, undefined, ["tighterTargets", "expensiveMarket"]))
      .toEqual(["tighterTargets", "expensiveMarket"]);
    // Династия: мутатор круга, Stakes НЕ стекаются и не перекрывают.
    const circleMutators = stageMutators(seed, SEASON.acts * ACT_LENGTH);
    expect(circleMutators.length).toBe(1);
    expect(stageMutators(seed, SEASON.acts * ACT_LENGTH, undefined, ["expensiveMarket"])).toEqual(circleMutators);
    // Рычаги: порог жёстче на шаг лестницы, рынок дороже — теми же функциями, что у кругов.
    const base = effectiveStageTarget(seed, 0);
    expect(effectiveStageTarget(seed, 0, undefined, ["tighterTargets"])).toBeLessThanOrEqual(base);
    expect(effectiveStageTarget(seed, 0, undefined, ["expensiveMarket"])).toBe(base);
    expect(marketCostFactor(seed, 1, undefined, ["expensiveMarket"])).toBeGreaterThan(1);
    expect(marketCostFactor(seed, 1)).toBe(1);
    // Комбинация: оба рычага действуют одновременно.
    const both: ("tighterTargets" | "expensiveMarket")[] = ["tighterTargets", "expensiveMarket"];
    expect(effectiveStageTarget(seed, 0, undefined, both)).toBeLessThanOrEqual(base);
    expect(marketCostFactor(seed, 1, undefined, both)).toBeGreaterThan(1);
    // Движок судит этап по Stake-порогу: state.target первого этапа жёстче обычного.
    const plain = new AnteRunEngine(data, "last_2y", seed, 80, "Five");
    const staked = new AnteRunEngine(data, "last_2y", seed, 80, "Five", undefined, ["tighterTargets"]);
    expect(staked.state.target).toBeLessThan(plain.state.target);
  });

  it("Династия идёт своим, более пологим шагом; геосреднее её актов и безграничность роста держатся (b1.37.0/b1.39.0)", () => {
    const seasonEnd = SEASON.acts * ACT_LENGTH;
    const atSeasonEnd = (1 + ANTE_THREAT.multPerAct) ** SEASON.acts;
    const geoMean = (firstStage: number) => {
      let product = 1;
      for (let s = 0; s < ACT_LENGTH; s += 1) product *= anteFieldMult(firstStage + s);
      return product ** (1 / ACT_LENGTH);
    };
    // Геосреднее первого акта Династии = уровень конца сезона (со сдвигом центра рампы уже
    // династийным шагом); дальше — тот же династийный шаг на акт.
    const qd = 1 + ANTE_THREAT.dynastyMultPerAct;
    const dynastyShift = qd ** ((ACT_LENGTH - 1) / 2 / ACT_LENGTH - ANTE_THREAT.multRampCenter);
    expect(geoMean(seasonEnd)).toBeCloseTo(atSeasonEnd * dynastyShift, 6);
    expect(geoMean(seasonEnd + ACT_LENGTH)).toBeCloseTo(atSeasonEnd * qd * dynastyShift, 6);
    expect(geoMean(seasonEnd + 3 * ACT_LENGTH)).toBeCloseTo(atSeasonEnd * qd ** 3 * dynastyShift, 6);
    // Шаг Династии мягче сезонного — но роста не отменяет: угроза по-прежнему безгранична (R6.3).
    expect(ANTE_THREAT.dynastyMultPerAct).toBeLessThan(ANTE_THREAT.multPerAct);
    expect(ANTE_THREAT.dynastyMultPerAct).toBeGreaterThan(0);
    expect(anteFieldMult(seasonEnd + 40 * ACT_LENGTH)).toBeGreaterThan(anteFieldMult(seasonEnd + 20 * ACT_LENGTH));
    // Сезонный якорь: геосреднее акта 3 = плоское b1.36.0 × сдвиг центра рампы.
    const qs = 1 + ANTE_THREAT.multPerAct;
    expect(geoMean(2 * ACT_LENGTH)).toBeCloseTo(1.4884 * qs ** ((ACT_LENGTH - 1) / 2 / ACT_LENGTH - ANTE_THREAT.multRampCenter), 4);
  });

  it("угроза выводит силу соперника выше потолка качества, а турнир остаётся валидным", () => {
    // Главный риск снятия cap 99 — не число само по себе, а то, что таблица перестанет сходиться.
    const engine = new TournamentEngine(
      data, "last_2y", "threat-late", 95, "Five", 0, anteFieldModel(24),
    );
    const snapshot = advanceToEnd(engine);
    expect(Math.max(...snapshot.field.map((team) => team.strength))).toBeGreaterThan(99);
    expect(snapshot.standings).toHaveLength(18);
    expect(new Set(snapshot.standings.map((row) => row.team.id)).size).toBe(18);
    expect(snapshot.userPlacement).toBeTruthy();
  });
});
