// Свип сидов anteRun-e2e (CAMP_SEED/CHEAT_SEED) по датасету из AEGIS_DATA_DIR (по умолчанию web/public/data).
// Сид обязан проходить на ДВУХ датасетах (локально — реальный слайс, CI — mock), поэтому гонять
// дважды и брать пересечение (мок пишется в web/.mock-data, боевой датасет не трогается):
//   npm run gen:mock && AEGIS_DATA_DIR=.mock-data npm run sim:sweep   # mock (как CI)
//   npm run sim:sweep                                                 # реальный
// С M24 спека сама проверяет свои сиды на датасете e2e-сервера и при провале берёт годный (scripts/lib/e2e_seeds.ts);
// свип нужен, чтобы выбрать новый «предпочтительный» сид с запасом. Модель отбирает КАНДИДАТОВ; boostInCamp
// повторяется неточно — финальная правда только живым прогоном cheat-тестов (R15.8: модельные 3/9/13 падали на mock).
// Критерии (evaluateE2eSeed): camp — 3 этапа с карточной наградой и статичная смерть ≤6 этапов; cheat — прокачанный
// забег доживает до финала акта, статичный гибнет ≤6 этапов.
import { loadGameData } from "../test/helpers/data.ts";
import { evaluateE2eSeed } from "./lib/e2e_seeds.ts";

const data = loadGameData();
const campOk: string[] = [];
const cheatOk: string[] = [];
for (let n = 1; n <= 200; n++) {
  const camp = evaluateE2eSeed(data, "camp", `camp-e2e-${n}`);
  if (camp.ok) campOk.push(`camp-e2e-${n}(${camp.note})`);
  const cheat = evaluateE2eSeed(data, "cheat", `cheat-e2e-${n}`);
  if (cheat.ok) cheatOk.push(`cheat-e2e-${n}(${cheat.note})`);
}
console.log("CAMP ok:", campOk.join(" ") || "—");
console.log("CHEAT ok:", cheatOk.join(" ") || "—");
