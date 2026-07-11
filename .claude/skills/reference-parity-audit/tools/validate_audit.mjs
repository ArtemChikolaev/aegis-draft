#!/usr/bin/env node
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("usage: validate_audit.mjs <docs/audits/report.md>");
  process.exit(2);
}

const text = readFileSync(path, "utf8");
const required = [
  [/^#\s+.+/m, "title"],
  [/^##\s+Паспорт/m, "Паспорт"],
  [/^##\s+Матрица(?:\s+сравнения)?/m, "Матрица"],
  [/^##\s+Синхронизация/m, "Синхронизация"],
  [/^##\s+Повторная проверка/m, "Повторная проверка"],
];

const failures = required.filter(([pattern]) => !pattern.test(text)).map(([, label]) => `нет раздела ${label}`);
const statuses = ["parity", "intentional-divergence", "defect", "missing", "not-applicable", "unknown"];
const usedStatuses = statuses.filter((status) => text.includes(`\`${status}\``));
if (usedStatuses.length === 0) failures.push("матрица не использует допустимые статусы");
if (!/https?:\/\//.test(text)) failures.push("нет URL/источника референса");
if (!/PRD/i.test(text) || !/BACKLOG/i.test(text)) failures.push("не зафиксирована синхронизация PRD/BACKLOG");

if (failures.length > 0) {
  for (const failure of failures) console.error(`❌ ${failure}`);
  process.exit(1);
}

console.log(`✅ audit report valid: ${path} (${usedStatuses.join(", ")})`);
