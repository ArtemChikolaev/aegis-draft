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
 *  улучшения). Новая ось силы забега → воспроизводимое состояние меняется.
 *  b1.3.0 (2026-07-27): P0 вехи M5R. (1) R9.1 — Last Dance сужает пак сбалансированно, а не
 *  срезает хвост ROLE_SEQUENCE, поэтому состав рынка при активной тактике другой. (2) R3.1 —
 *  мета-гейт редкости разделён на `drops`/`upgrades`: в первом забеге появилось ручное улучшение
 *  за золото, то есть экономика забега изменилась. Оба сдвига меняют воспроизводимое состояние.
 *  b1.4.0 (2026-07-27): R6.2 — босс только на финале акта (было: на каждом этапе с третьего).
 *  Замер `npm run sim -- 300`: наивный win-rate 19.3% → 24.0%, статик 0.0% → 0.7%, гибель на
 *  этапе 2 упала 15 → 6 (там стоял босс). Забег стал измеримо легче — это осознанное следствие
 *  устранения дефекта, а не калибровка; профиль пере-калибруют R6.4/R10, компенсировать другими
 *  плейсхолдерами «на глаз» запрещено. Плюс R9.3: первый порог записан как `8` вместо ложного
 *  `10` (поведение не изменилось — оба режут бакет «9-12») и добавлен Cheat Mode (opt-in). */
export const BALANCE_CONFIG_VERSION = "b1.4.0";

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
