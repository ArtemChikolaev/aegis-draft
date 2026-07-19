import { describe, expect, it } from "vitest";
import { RunEngine } from "../src/game/engine.ts";
import { baseRating } from "../src/game/score.ts";
import {
  MIXED_BASE,
  buildSuccessCohort,
  hasTeamSuccess,
  mixedPlayerBase,
  mixedSupportsFormat,
} from "../src/game/teamSuccess.ts";
import { loadGameData } from "./helpers/data.ts";
import { defaultRunConfig } from "./helpers/packs.ts";
import { runToEnd } from "./helpers/engine.ts";
import type { Format } from "../src/types/data.ts";

// Mixed Draft оценивает игрока по успеху его команды за окно, а не по форме на конкретном
// событии (PRD §5.3/§5.4.3). Ключевой инвариант этой правки — Team Packs НЕ затронут.
describe("Mixed: base = успех команды за окно", () => {
  const data = loadGameData();
  const format = defaultRunConfig.format;

  it("Team Packs продолжает считать base как среднее event OVR", () => {
    const engine = new RunEngine(data, { ...defaultRunConfig, draftStyle: "team" }, "ts-team");
    runToEnd(engine);
    const score = engine.score()!;
    const players = engine.rosterView.flatMap((slot) => (slot.candidate ? [slot.candidate.player] : []));
    // Точное равенство: у team-ветки base не переопределяется вовсе.
    expect(score.base).toBe(baseRating(players));
  });

  it("Mixed считает base НЕ по event OVR", () => {
    const engine = new RunEngine(data, { ...defaultRunConfig, draftStyle: "mixed" }, "ts-mixed");
    runToEnd(engine);
    const score = engine.score()!;
    const players = engine.rosterView.flatMap((slot) => (slot.candidate ? [slot.candidate.player] : []));
    expect(score.base).not.toBe(baseRating(players));
  });

  it("base Mixed попадает в игровую шкалу, а не в сырую 15..55", () => {
    // Сырой successScore живёт в своей шкале и в base попасть не должен: иначе Team OVR ~38
    // против ботов Normal(86,5) — забег проигран до старта.
    for (const seed of ["scale-1", "scale-2", "scale-3", "scale-4"]) {
      const engine = new RunEngine(data, { ...defaultRunConfig, draftStyle: "mixed" }, seed);
      runToEnd(engine);
      const base = engine.score()!.base;
      expect(base, `${seed}: base вне игровой шкалы`).toBeGreaterThan(MIXED_BASE.min * MIXED_BASE.factorBase);
      expect(base, `${seed}: base выше потолка`).toBeLessThanOrEqual(100);
    }
  });

  it("сильнейшая команда окна даёт больший base, чем слабейшая, при равной форме игрока", () => {
    const cohort = buildSuccessCohort(data.teamSuccess, format);
    expect(cohort.sorted.length).toBeGreaterThan(1);
    const ids = Object.keys(data.teamSuccess).filter((id) => hasTeamSuccess(data.teamSuccess, Number(id), format));
    const scoreOf = (id: string) => data.teamSuccess[id][format]!.successScore;
    const best = ids.reduce((a, b) => (scoreOf(a) >= scoreOf(b) ? a : b));
    const worst = ids.reduce((a, b) => (scoreOf(a) <= scoreOf(b) ? a : b));
    const ovr = 75;
    expect(mixedPlayerBase(cohort, data.teamSuccess, Number(best), ovr))
      .toBeGreaterThan(mixedPlayerBase(cohort, data.teamSuccess, Number(worst), ovr));
  });

  it("поправка на индивидуальную форму ограничена 0.8..1.2 (PRD §5.4.3)", () => {
    const cohort = buildSuccessCohort(data.teamSuccess, format);
    const id = Number(Object.keys(data.teamSuccess).find((t) => hasTeamSuccess(data.teamSuccess, Number(t), format))!);
    const low = mixedPlayerBase(cohort, data.teamSuccess, id, 0);
    const high = mixedPlayerBase(cohort, data.teamSuccess, id, 100);
    // Крайние OVR дают ровно factorBase и factorBase+factorSpan от силы команды.
    expect(high / low).toBeCloseTo((MIXED_BASE.factorBase + MIXED_BASE.factorSpan) / MIXED_BASE.factorBase, 6);
    // И верх полосы не должен упираться в кламп 100 — иначе сильные команды сливаются в одно
    // число. Именно это поймал тест при первой калибровке (band 58..95).
    expect(MIXED_BASE.max * (MIXED_BASE.factorBase + MIXED_BASE.factorSpan)).toBeLessThanOrEqual(100);
  });

  it("окно без team-success закрыто для Mixed, а для Team Packs — нет", () => {
    const formats = data.manifest.formats as Format[];
    for (const f of formats) {
      const supported = mixedSupportsFormat(data.teamSuccess, f);
      const cohort = buildSuccessCohort(data.teamSuccess, f);
      // Гейт следует за данными, а не за именем формата.
      expect(supported, `${f}: гейт разошёлся с данными`).toBe(cohort.sorted.length >= 5);
      // Team Packs играбелен в любом окне манифеста независимо от team-success.
      const engine = new RunEngine(data, { ...defaultRunConfig, draftStyle: "team", format: f }, `gate-${f}`);
      runToEnd(engine);
      expect(engine.isComplete, `${f}: team-забег не доигрался`).toBe(true);
    }
  });
});
