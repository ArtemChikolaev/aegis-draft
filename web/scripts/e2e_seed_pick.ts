// Подбор e2e-сидов для anteRun.spec отдельным процессом (M24). Модель — игровые модули, а они импортируют JSON без
// атрибута `type: "json"`: Vite, vitest и tsx это понимают, загрузчик Playwright — нет. Поэтому спека зовёт этот скрипт
// через tsx и читает ответ из stdout: `{ "<режим>": { "preferred": "<сид>", "count": N } }` → `{ "<режим>": ["<сид>", …] }`.
import { pickE2eSeeds, type E2eSeedMode } from "./lib/e2e_seeds.ts";

const ask = JSON.parse(process.argv[2] ?? "{}") as Partial<Record<E2eSeedMode, { preferred: string; count: number }>>;
const out: Partial<Record<E2eSeedMode, string[]>> = {};
for (const [mode, req] of Object.entries(ask) as [E2eSeedMode, { preferred: string; count: number }][]) {
  out[mode] = pickE2eSeeds(mode, req.preferred, { count: req.count });
}
process.stdout.write(JSON.stringify(out));
