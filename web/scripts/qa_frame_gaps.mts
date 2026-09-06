// Ищем кадры, где герой ПРОПАДАЕТ: силуэт пустой или скукожился до нескольких пикселей.
// Владелец 2026-09-06: «джагер во время бега опять пропадает» — у Juggernaut в ряду walk последние
// три кадра из восьми пустые. Причина в рендере: гашение root motion выключалось, когда смещение
// корня превышало половину охвата камеры, и модель просто уходила за кадр.
// Запуск из web/: `npx tsx scripts/qa_frame_gaps.mts [dota_px2] [anim…]`
import { chromium } from "playwright";
import { readdirSync, readFileSync } from "node:fs";

const dir = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "dota_px2";
const ROOT = `public/art/sprites/${dir}`;
const anims = process.argv.slice(3).filter((a) => !a.startsWith("--"));
const ids = readdirSync(ROOT).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();

const PAGE = `(async (b64, meta, anims) => {
  const img = new Image(); img.src = 'data:image/webp;base64,' + b64; await img.decode();
  const f = meta.frame, c = document.createElement('canvas'); c.width = f; c.height = f;
  const x = c.getContext('2d', { willReadFrequently: true });
  const out = {};
  for (const [name, a] of Object.entries(meta.anims)) {
    if (anims.length && !anims.includes(name)) continue;
    const counts = [];
    for (let d = 0; d < meta.dirs; d++) {
      for (let fr = 0; fr < a.frames; fr++) {
        x.clearRect(0,0,f,f); x.drawImage(img, fr*f, (a.row + d)*f, f, f, 0, 0, f, f);
        const px = x.getImageData(0,0,f,f).data;
        let n = 0;
        for (let i = 3; i < px.length; i += 4) if (px[i] > 40) n++;
        counts.push(n);
      }
    }
    const sorted = counts.slice().sort((p, q) => p - q);
    const med = sorted[sorted.length >> 1] || 1;
    out[name] = { gaps: counts.filter((n) => n < med * 0.2).length, total: counts.length, med };
  }
  return out;
})`;

const browser = await chromium.launch();
const page = await browser.newPage();
let bad = 0;
for (const id of ids) {
  const meta = JSON.parse(readFileSync(`${ROOT}/${id}.json`, "utf8"));
  const r = await page.evaluate(`${PAGE}(${JSON.stringify(readFileSync(`${ROOT}/${id}.webp`).toString("base64"))}, ${JSON.stringify(meta)}, ${JSON.stringify(anims)})`) as Record<string, { gaps: number; total: number; med: number }>;
  const hits = Object.entries(r).filter(([, v]) => v.gaps > 0);
  if (hits.length) {
    bad++;
    console.log(`✗ ${id.padEnd(34)} ${hits.map(([k, v]) => `${k}: ${v.gaps}/${v.total} пустых`).join(" · ")}`);
  }
}
await browser.close();
console.log(`\nпроверено ${ids.length}, с пропадающими кадрами ${bad}`);
