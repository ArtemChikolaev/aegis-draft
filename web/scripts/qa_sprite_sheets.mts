// Проверка листов спрайтов Аркады без глаза: лист есть, кадры двигаются, силуэт разумного размера.
// Ловит то, что видно только на картинке: лист не отрендерился, клип оказался статичной позой
// («герой скользит по полу»), от сета приехало одно оружие без тела или наоборот гигантский меш.
// Запуск из web/: `npx tsx scripts/qa_sprite_sheets.mts [dota_px2] [id …]`  (без id — все листы вида `<hero>@<skin>`).
// Canvas — headless Chromium (Playwright в devDependencies). Скрипт страницы — строкой, не функцией:
// esbuild-хелпера `__name` в page.evaluate не существует.
import { chromium } from "playwright";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const WEB = fileURLToPath(new URL("..", import.meta.url));
const dir = process.argv[2] && !process.argv[2].includes("@") ? process.argv[2] : "dota_px2";
const ROOT = `${WEB}public/art/sprites/${dir}`;
const explicit = process.argv.slice(2).filter((a) => a !== dir);
const ids = explicit.length
  ? explicit
  : readdirSync(ROOT).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).filter((id) => id.includes("@")).sort();

const b64 = (p: string) => readFileSync(p).toString("base64");
const PAGE = `(async (png, meta, anim) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
  const f = meta.frame;
  const c = document.createElement('canvas'); c.width = f; c.height = f;
  const x = c.getContext('2d', { willReadFrequently: true });
  const grab = function (row, fr) { x.clearRect(0,0,f,f); x.drawImage(img, fr*f, row*f, f, f, 0, 0, f, f); return x.getImageData(0,0,f,f).data; };
  const opaque = function (d) { let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; return n; };
  const rows = meta.anims;
  const idle = rows.idle ?? rows.walk;
  const move = rows[anim] ?? rows.walk ?? rows.idle;
  const a0 = grab(move.row, 0);
  let motion = 0;
  for (let fr = 1; fr < move.frames; fr++) {
    const b = grab(move.row, fr);
    let d = 0;
    for (let i = 0; i < a0.length; i += 4) { if (Math.abs(a0[i]-b[i]) + Math.abs(a0[i+1]-b[i+1]) + Math.abs(a0[i+3]-b[i+3]) > 24) d++; }
    if (d > motion) motion = d;
  }
  return { pixels: opaque(grab(idle.row, 0)), motion: motion, anims: Object.keys(rows) };
})`;

const browser = await chromium.launch();
const page = await browser.newPage();
const measure = async (id: string) => {
  const meta = JSON.parse(readFileSync(`${ROOT}/${id}.json`, "utf8"));
  return (await page.evaluate(`${PAGE}(${JSON.stringify(b64(`${ROOT}/${id}.png`))}, ${JSON.stringify(meta)}, "walk")`)) as {
    pixels: number; motion: number; anims: string[];
  };
};

const base = new Map<string, Awaited<ReturnType<typeof measure>>>();
let bad = 0;
for (const id of ids) {
  const hero = id.split("@")[0];
  try {
    if (!base.has(hero)) base.set(hero, await measure(hero));
    const b = base.get(hero)!;
    const m = await measure(id);
    const ratio = m.pixels / Math.max(1, b.pixels);
    const flags = [
      m.motion < 60 ? "ЗАСТЫЛ" : "",
      ratio < 0.45 ? "СИЛУЭТ МЕЛКИЙ" : "",
      ratio > 2.2 ? "СИЛУЭТ ОГРОМНЫЙ" : "",
      m.anims.includes("cast") ? "" : "БЕЗ CAST",
    ].filter(Boolean);
    if (flags.length) bad++;
    console.log(`${flags.length ? "✗" : "·"} ${id.padEnd(38)} пикселей ${String(m.pixels).padStart(5)} (×${ratio.toFixed(2)})  движение ${String(m.motion).padStart(5)}  ${flags.join(" ")}`);
  } catch (e) {
    bad++;
    console.log(`✗ ${id.padEnd(38)} ${String(e).slice(0, 90)}`);
  }
}
console.log(`\nпроверено ${ids.length}, с замечаниями ${bad}`);
await browser.close();
