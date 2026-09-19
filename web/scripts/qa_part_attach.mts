// QA посадки слоёв частей (T13.80, владелец 2026-09-19: «лук в воздухе» у арканы Drow): доля кадров, где часть «висит» —
// её пиксели не касаются силуэта остального героя (тело + остальные слои по умолчанию семейства). Оружие держат в руке,
// плащ растёт из плеч: у правильно сидящей части доля ≈ 0. У части сета, чья модель не подогнана под тело основы
// (у арканы Drow свои анимации хвата, refit-луков для сетов в vpk нет), доля большая — такую пару (источник, слот) надо
// убрать из семейства (scripts/blender/dota_part_exclusions.json), а не показывать игроку сломанный облик.
//   npx tsx scripts/qa_part_attach.mts [dota_px] [--min 0.15] [--fam <id,…>]
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const opt = (k: string, d: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const dir = argv[0] && !argv[0].startsWith("--") ? argv[0] : "dota_px";
const min = Number(opt("--min", "0.15"));
const onlyFam = new Set(opt("--fam", "").split(",").filter(Boolean));
const P = `public/art/sprites/${dir}`;
const parts = JSON.parse(readFileSync("src/game/arcade/content/parts.ts", "utf8").split("/* DATA */")[1].split("/* END */")[0]) as Record<string, { slots: string[]; families: Record<string, { defaults: Record<string, string>; sources: Record<string, string[]> }> }>;

// Скрипт страницы — строкой (tsx/esbuild вставляет в функции `__name`, которого в браузере нет).
const PROBE = `(async ({ anchor, layer, meta, reach }) => {
  const load = (b) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = "data:image/webp;base64," + b; });
  const A = await Promise.all(anchor.map(load)), L = await load(layer);
  const W = L.width, H = L.height, F = meta.frame;
  const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d", { willReadFrequently: true });
  for (const im of A) x.drawImage(im, 0, 0); const a = x.getImageData(0, 0, W, H).data;
  x.clearRect(0, 0, W, H); x.drawImage(L, 0, 0); const l = x.getImageData(0, 0, W, H).data;
  let cells = 0, floating = 0;
  for (const [name, an] of Object.entries(meta.anims)) { if (name === "death") continue;
    for (let d = 0; d < (an.dirs ?? meta.dirs); d++) for (let f = 0; f < an.frames; f++) {
      const x0 = f * F, y0 = (an.row + d) * F; let has = 0, touch = false;
      for (let y = y0; y < y0 + F && !touch; y++) for (let xx = x0; xx < x0 + F && !touch; xx++) {
        if (l[(y * W + xx) * 4 + 3] < 128) continue; has++;
        for (let dy = -reach; dy <= reach && !touch; dy++) for (let dx = -reach; dx <= reach; dx++) { const yy = y + dy, xxx = xx + dx; if (yy < y0 || yy >= y0 + F || xxx < x0 || xxx >= x0 + F) continue; if (a[(yy * W + xxx) * 4 + 3] >= 128) { touch = true; break; } }
      }
      if (has > 6) { cells++; if (!touch) floating++; }
    } }
  return { cells, floating };
})`;

const browser = await chromium.launch();
const page = await browser.newPage();
const b64 = (id: string) => readFileSync(`${P}/${id}.webp`).toString("base64");
const bad: string[] = [];
for (const [, hp] of Object.entries(parts)) for (const [fam, f] of Object.entries(hp.families)) {
  if (onlyFam.size && !onlyFam.has(fam)) continue;
  const meta = JSON.parse(readFileSync(`${P}/${fam}+body.json`, "utf8"));
  for (const [src, slots] of Object.entries(f.sources)) for (const slot of slots) {
    const anchor = [`${fam}+body`, ...hp.slots.filter((s) => s !== slot && f.defaults[s]).map((s) => `${fam}+${f.defaults[s]}.${s}`)].map(b64);
    const r = await page.evaluate(`${PROBE}(${JSON.stringify({ anchor, layer: b64(`${fam}+${src}.${slot}`), meta, reach: Math.max(2, Math.round(meta.frame / 40)) })})`) as { cells: number; floating: number };
    const share = r.floating / Math.max(1, r.cells);
    if (share >= min) { bad.push(`${fam}+${src}.${slot}`); console.log(`${(share * 100).toFixed(0).padStart(3)}% кадров висит  ${fam}+${src}.${slot}  (${r.floating}/${r.cells})`); }
  }
}
await browser.close();
console.log(bad.length ? `подозрительных слоёв: ${bad.length}` : "все слои касаются героя");
