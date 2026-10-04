// Сверка сима Аркады между движками (M24): одни и те же забеги бота (шесть героев, включая кражу Rubick, × два сида) в Chromium (V8), WebKit (JavaScriptCore — Safari и
// WebView на iPhone) и Node; дайджесты должны совпасть бит-в-бит, иначе реплей и дейлик с одного устройства не
// воспроизводятся на другом. До M24 расходилось 9 забегов из 10 (Math.sin/cos/atan2/hypot) — теперь сим считает через
// `game/dmath.ts`, а запрет держит `test/gameDeterminism.test.ts`.
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
import { Rng } from ${JSON.stringify(join(web, "src/game/rng.ts"))};
import { eloWinProbability } from ${JSON.stringify(join(web, "src/game/tournament.ts"))};
import { dpow, ipow } from ${JSON.stringify(join(web, "src/game/dmath.ts"))};
// Математика драфта (M25): нормальное распределение турнира, вероятность матча Elo, степени цен Manager и Буткемпа —
// дайджест битов результатов; всё, что драфт берёт из случайности, проходит через эти функции.
(globalThis as any).mathDigest = () => {
  const rng = new Rng("xengine-math");
  const buf = new Float64Array(1), bits = new Uint32Array(buf.buffer);
  let h = 2166136261;
  const mix = (x: number) => { buf[0] = x; h = Math.imul(h ^ bits[0], 16777619); h = Math.imul(h ^ bits[1], 16777619); };
  for (let i = 0; i < 20000; i++) {
    mix(rng.normal(50, 12));
    mix(eloWinProbability(rng.float() * 100, rng.float() * 100, 22));
    mix(dpow(rng.float() * 45, 1.5)); mix(dpow(1.12, rng.float() * 5)); mix(ipow(1 + rng.float(), i % 9));
  }
  return (h >>> 0).toString(16);
};
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
  results[`${name} math`] = [await page.evaluate("mathDigest()") as string];
  await browser.close();
}
(0, eval)(code);
for (const [hero, act] of jobs) results[`node ${hero}/${act}`] = (globalThis as unknown as { runDigests(h: string, a: string, s: number[], c: number): string[] }).runDigests(hero, act, seeds, CAP);
results["node math"] = [(globalThis as unknown as { mathDigest(): string }).mathDigest()];

let diff = 0;
for (const [hero, act] of jobs) seeds.forEach((s, i) => {
  const [c, w, n] = ["chromium", "webkit", "node"].map((e) => results[`${e} ${hero}/${act}`][i]);
  const same = c === w && c === n;
  if (!same) diff++;
  console.log(`${hero}/${act} seed ${s}: ${same ? "SAME" : "DIFF"} chromium=${c} webkit=${w} node=${n}`);
});
{
  const [c, w, n] = ["chromium", "webkit", "node"].map((e) => results[`${e} math`][0]);
  const same = c === w && c === n;
  if (!same) diff++;
  console.log(`математика драфта: ${same ? "SAME" : "DIFF"} chromium=${c} webkit=${w} node=${n}`);
}
console.log(diff === 0 ? "все движки совпали" : `расхождений: ${diff}`);
process.exit(diff === 0 ? 0 : 1);
