// Единая версия и поверхность баланса Roguelite Run (T6.3). Плейсхолдер-коэффициенты живут в
// своих game-модулях (они когезивны с логикой), а ЗДЕСЬ — единственная версия `BALANCE_CONFIG_VERSION`
// и агрегатор `BALANCE`, через который симулятор и документация видят всю поверхность настройки.
//
// Контракт версии: меняешь ЛЮБОЙ игровой коэффициент (ANTE_*, ECONOMY, TACTICS, CAMP_ACTIONS,
// BOSSES) — бампни `BALANCE_CONFIG_VERSION`. Она входит в воспроизводимое состояние seeded-забега
// (runLink/SavedRun), поэтому её сдвиг честно инвалидирует несовместимый сейв и предупреждает о
// расхождении в присланной ссылке — как schemaVersion/ratingModelVersion (PRD §5.9.2, §5.10.5).
//
// Это НЕ ratingModelVersion: формула Team OVR (score.ts) не меняется этими числами, только орка/
// экономика/условия забега. Тонкая калибровка — через `npm run sim` (web/scripts/sim_run.ts).
import { ANTE_TARGETS, ANTE_FIELD_STEP, ANTE_FIELD_HANDICAP } from "./anteRun.ts";
import { ECONOMY } from "./anteEconomy.ts";
import { TACTICS } from "./tactics.ts";
import { CAMP_ACTIONS } from "./campActions.ts";
import { BOSSES } from "./bossConditions.ts";
import { RARITY } from "./heroRarity.ts";

/** Версия набора игровых коэффициентов Roguelite Run. Бампать при любой правке чисел баланса.
 *  b1.1.0 (2026-07-24): ANTE_FIELD_HANDICAP 12→16 по прогону симулятора — наивный win-rate
 *  8%→20% (skilled ≈ PRD-цель 30–40%), статик остаётся ≈0%.
 *  b1.2.0 (2026-07-24): срез 3b — редкость героев (RARITY: бонусы Hero Synergy/Base + цены
 *  улучшения). Новая ось силы забега → воспроизводимое состояние меняется. */
export const BALANCE_CONFIG_VERSION = "b1.2.0";

/** Вся поверхность настройки в одном месте — для симулятора, отчётов и обзора. Числа принадлежат
 *  своим модулям; здесь только сборка и версия. */
export const BALANCE = {
  version: BALANCE_CONFIG_VERSION,
  ante: { targets: ANTE_TARGETS, fieldStep: ANTE_FIELD_STEP, fieldHandicap: ANTE_FIELD_HANDICAP },
  economy: ECONOMY,
  tactics: TACTICS,
  campActions: CAMP_ACTIONS,
  bosses: BOSSES,
  rarity: RARITY,
} as const;
