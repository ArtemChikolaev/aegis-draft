// Ищем листы, где герой УЕЗЖАЕТ из центра кадра: гашение root motion обрезалось по пределу, и в
// длинном клипе бега силуэт доползал до края (а то и выходил за него). Дополняет qa_frame_gaps.mts:
// тот ловит уже пропавшие кадры, этот — те, что вот-вот пропадут.
// Запуск из web/: `npx tsx scripts/qa_frame_drift.mts [dota_px2] [порог 0..1] [anim…]`
import { chromium } from "playwright";
import { readdirSync, readFileSync } from "node:fs";

const dir = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "dota_px2";
const ROOT = `public/art/sprites/${dir}`;
const limit = Number(process.argv[3]) || 0.25;
const anims = process.argv.slice(4).filter((a) => !a.startsWith("--"));
const ids = readdirSync(ROOT).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();

const PAGE = `(async (b64, meta, anims) => {
  const img = new Image(); img.src = 'data:image/webp;base64,' + b64; await img.decode();
  const f = meta.frame, c = document.createElement('canvas'); c.width = f; c.height = f;
  const x = c.getContext('2d', { willReadFrequently: true });
  const out = {};
  for (const [name, a] of Object.entries(meta.anims)) {
    if (anims.length && !anims.includes(name)) continue;
    let worst = 0;
    for (let d = 0; d < meta.dirs; d++) {
      const cx = [], cy = [];
      for (let fr = 0; fr < a.frames; fr++) {
        x.clearRect(0,0,f,f); x.drawImage(img, fr*f, (a.row + d)*f, f, f, 0, 0, f, f);
        const px = x.getImageData(0,0,f,f).data;
        let sx = 0, sy = 0, n = 0;
        for (let i = 0; i < px.length; i += 4) if (px[i+3] > 40) { const p = i >> 2; sx += p % f; sy += (p / f) | 0; n++; }
        if (n > 20) { cx.push(sx / n); cy.push(sy / n); }
      }
      if (cx.length < 2) continue;
      const span = Math.max(Math.max(...cx) - Math.min(...cx), Math.max(...cy) - Math.min(...cy));
      worst = Math.max(worst, span / f);
    }
    out[name] = +worst.toFixed(3);
  }
  return out;
})`;

const browser = await chromium.launch();
const page = await browser.newPage();
let bad = 0;
for (const id of ids) {
  const meta = JSON.parse(readFileSync(`${ROOT}/${id}.json`, "utf8"));
  const r = await page.evaluate(`${PAGE}(${JSON.stringify(readFileSync(`${ROOT}/${id}.webp`).toString("base64"))}, ${JSON.stringify(meta)}, ${JSON.stringify(anims)})`) as Record<string, number>;
  const hits = Object.entries(r).filter(([, v]) => v > limit).sort((a, b) => b[1] - a[1]);
  if (hits.length) {
    bad++;
    console.log(`✗ ${id.padEnd(34)} ${hits.map(([k, v]) => `${k}: ${(v * 100) | 0}% кадра`).join(" · ")}`);
  }
}
await browser.close();
console.log(`\nпроверено ${ids.length}, уезжает силуэт у ${bad} (порог ${limit * 100}%)`);
