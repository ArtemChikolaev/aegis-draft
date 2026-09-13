// Общая обвязка скриптов подбора e2e-сидов (sweep_seeds_both, find_camp_seed): конфиг run-link
// спеки anteRun и драфт «первым доступным». Копии в двух скриптах были побайтно одинаковыми —
// следующая правка пути теста неизбежно разошлась бы с одной из них.
import type { RunEngine } from "../../src/game/engine.ts";
import type { RunConfig } from "../../src/game/packs.ts";

/** Конфиг run-link e2e-спеки anteRun (CAMP_SEED / CHEAT_SEED). */
export const E2E_RUN_CONFIG: RunConfig = {
  draftStyle: "team", format: "last_2y", rerolls: 2, scoring: "event", allocation: "auto", hardMode: false,
};

/** Драфт «первым доступным» — точная копия e2e/helpers.completeDraft: тест кликает первую
 *  незаблокированную карточку, а не лучшую по OVR. Жадный драфт дал бы другой ростер и другой seed. */
export function firstAvailableDraft(engine: RunEngine): void {
  for (let step = 0; step < 40 && !engine.isComplete; step++) {
    if (engine.rosterFilled < 5) {
      const idx = engine.currentPack.candidates.findIndex((_, i) => engine.canPickPlayer(i));
      if (idx >= 0) { engine.pickPlayer(idx); continue; }
      if (engine.rerollsLeft > 0) { engine.reroll(); continue; }
      break;
    }
    const hero = engine.packHeroes[0];
    if (hero == null) break;
    engine.pickHero(hero);
  }
}
