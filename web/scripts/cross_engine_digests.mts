// Сверка сима Аркады между движками (M24): одни и те же забеги бота (шесть героев, включая кражу Rubick, × два сида) в Chromium (V8), WebKit (JavaScriptCore — Safari и
// WebView на iPhone) и Node; дайджесты должны совпасть бит-в-бит, иначе реплей и дейлик с одного устройства не
// воспроизводятся на другом. До M24 расходилось 9 забегов из 10 (Math.sin/cos/atan2/hypot) — теперь сим считает через
// `game/arcade/dmath.ts`, а запрет держит `test/arcadeDeterminism.test.ts`.
// Запуск из web/: `npx playwright install webkit` (один раз), затем `npx tsx scripts/cross_engine_digests.mts [минут]`.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, webkit } from "playwright";

const minutes = Number(process.argv[2] ?? 6);
const CAP = 60 * 60 * minutes;
const jobs: [string, string][] = [["juggernaut", "short"], ["zeus", "short"], ["windranger", "river"], ["io", "short"], ["drow_ranger", "dire"], ["rubick", "dire"]];
const seeds = [0, 1];

const web = fileURLToPath(new URL("..", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "arcade-xengine-"));
const entry = join(dir, "entry.ts"), out = join(dir, "bundle.js");
writeFileSync(entry, `
import { ArcadeSim } from ${JSON.stringify(join(web, "src/game/arcade/sim.ts"))};
import { botInput } from ${JSON.stringify(join(web, "scripts/sim_arcade.ts"))};
(globalThis as any).runDigests = (hero: string, act: string, seeds: number[], cap: number) => seeds.map((s) => {
  const sim = new ArcadeSim("x-" + s, { rank: 0, hero, act });
  while (!sim.over && sim.tick < cap && sim.steps < cap * 3) sim.step(botInput(sim));
  return sim.tick + ":" + sim.digest();
});
`);
// Бот читает process.argv при загрузке модуля — в браузере его нет.
await build({ entryPoints: [entry], bundle: true, format: "iife", platform: "browser", outfile: out, logLevel: "error", define: { "process.argv": '["node","xengine"]', "process.env": "{}" } });
const code = readFileSync(out, "utf8");

const results: Record<string, string[]> = {};
for (const [name, type] of [["chromium", chromium], ["webkit", webkit]] as const) {
  const browser = await type.launch();
  const page = await browser.newPage();
  await page.setContent("<html><body></body></html>");
  await page.addScriptTag({ content: code });
  for (const [hero, act] of jobs) results[`${name} ${hero}/${act}`] = await page.evaluate(`runDigests(${JSON.stringify(hero)}, ${JSON.stringify(act)}, ${JSON.stringify(seeds)}, ${CAP})`) as string[];
  await browser.close();
}
(0, eval)(code);
for (const [hero, act] of jobs) results[`node ${hero}/${act}`] = (globalThis as unknown as { runDigests(h: string, a: string, s: number[], c: number): string[] }).runDigests(hero, act, seeds, CAP);

let diff = 0;
for (const [hero, act] of jobs) seeds.forEach((s, i) => {
  const [c, w, n] = ["chromium", "webkit", "node"].map((e) => results[`${e} ${hero}/${act}`][i]);
  const same = c === w && c === n;
  if (!same) diff++;
  console.log(`${hero}/${act} seed ${s}: ${same ? "SAME" : "DIFF"} chromium=${c} webkit=${w} node=${n}`);
});
console.log(diff === 0 ? "все движки совпали" : `расхождений: ${diff}`);
process.exit(diff === 0 ? 0 : 1);
