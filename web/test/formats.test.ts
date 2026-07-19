import { describe, expect, it } from "vitest";
import { RunEngine } from "../src/game/engine.ts";
import { poolForFormat, type Format } from "../src/game/packs.ts";
import { loadGameData } from "./helpers/data.ts";
import { defaultRunConfig } from "./helpers/packs.ts";
import { engineSignature, runToEnd } from "./helpers/engine.ts";
import { mixedSupportsFormat } from "../src/game/teamSuccess.ts";

// Слепое пятно до этого: движок/скоринг гонялись только на last_2y (defaultRunConfig), а на
// проде живут все форматы манифеста. Здесь — инварианты по КАЖДОМУ объявленному формату:
// полный забег доигрывается, счёт конечен, забег детерминирован. Не golden (фикстуры были бы
// хрупкими по формату) — проверяем свойства, устойчивые и к mock (CI), и к реальному датасету.
describe("форматы: полный забег по каждому объявленному формату", () => {
  const data = loadGameData();
  const formats = data.manifest.formats as Format[];

  it("манифест непуст и содержит хотя бы last_2y", () => {
    expect(formats.length).toBeGreaterThan(0);
    expect(formats).toContain("last_2y");
  });

  for (const format of formats) {
    describe(format, () => {
      it("пул формата даёт >=5 команд (иначе драфт неполон)", () => {
        const pool = poolForFormat(data.packs, data.events, format);
        expect(new Set(pool.map((p) => p.teamId)).size, format).toBeGreaterThanOrEqual(5);
      });

      // Mixed оценивает игроков по успеху команды за окно, поэтому играбелен только там, где
      // team-success собран. Сегодня пуст valve_legacy (плейсменты/призовые ждут Liquipedia,
      // T1.3 ⛔) — в нём режим честно закрыт в UI, и гонять забег бессмысленно. Проверка по
      // данным, а не по имени формата: наполнится — тест начнёт его покрывать сам.
      const styles = mixedSupportsFormat(data.teamSuccess, format)
        ? (["team", "mixed"] as const)
        : (["team"] as const);
      for (const draftStyle of styles) {
        it(`${draftStyle}: забег доигрывается, ростер 5, счёт конечен`, () => {
          const engine = new RunEngine(data, { ...defaultRunConfig, draftStyle, format }, `fmt-${format}-${draftStyle}`);
          runToEnd(engine);
          expect(engine.isComplete, `${format}/${draftStyle} не доигрался`).toBe(true);
          expect(engine.rosterView.filter((slot) => slot.candidate).length).toBe(5);
          const score = engine.score();
          expect(score).not.toBeNull();
          for (const part of [score!.base, score!.heroSynergy, score!.chemistry, score!.teamOvr]) {
            expect(Number.isFinite(part), `${format}/${draftStyle}: нечисловая часть счёта`).toBe(true);
          }
        });
      }

      it("детерминизм: тот же seed+формат → та же подпись забега", () => {
        const a = new RunEngine(data, { ...defaultRunConfig, format }, `det-${format}`);
        const b = new RunEngine(data, { ...defaultRunConfig, format }, `det-${format}`);
        runToEnd(a);
        runToEnd(b);
        expect(engineSignature(a)).toBe(engineSignature(b));
      });
    });
  }
});
