// Подбор seed для e2e anteRun: по умолчанию — «предмет в слоте показывает разложение силы»,
// с `--scouting` / `--stand-in` — тесты Camp Action (см. комментарии в спеке).
// Повторяет ровно путь теста (scripts/lib/e2e_seeds.ts): тот же run-link конфиг, драфт «первым доступным» (как
// helpers.completeDraft — НЕ жадный, в отличие от sim_run), первый этап, Буткемп, первая карточная награда нужного вида:
//   по умолчанию — item, и после неё разложение силы не тривиально;
//   `--scouting` — «разведка раскрывает будущего босса»: scouting разыгрывается, и этап 2 после неё пройден;
//   `--stand-in` — «stand-in делает замену игрока бесплатной»: только этап 1 и карта standIn.
// С M24 спека сама проверяет свои сиды на датасете e2e-сервера; скрипт — чтобы выбрать новый предпочтительный с запасом.
import { loadGameData } from "../test/helpers/data.ts";
import { evaluateE2eSeed } from "./lib/e2e_seeds.ts";

const data = loadGameData();
const mode = process.argv.includes("--scouting") ? "scouting" : process.argv.includes("--stand-in") ? "standIn" : "item";
const maxFound = Number(process.env.MAX_FOUND ?? (mode === "item" ? 5 : 12));
// Для разведки на реальном слайсе годен примерно один сид из сотни (2026-09-26: 33 из 3000) — диапазон расширяется env.
const maxSeed = Number(process.env.MAX_SEED ?? 400);
const found: string[] = [];
for (let n = 1; n <= maxSeed && found.length < maxFound; n++) {
  const seed = `camp-e2e-${n}`;
  const verdict = evaluateE2eSeed(data, mode, seed);
  if (!verdict.ok) continue;
  found.push(seed);
  // Места этапов — запас сида: «1 → 1» переживёт следующий data-refresh вероятнее, чем «7-8».
  console.log(`✅ ${seed}  ${verdict.note}`);
}
if (!found.length) console.log("❌ подходящий seed не найден в диапазоне");
