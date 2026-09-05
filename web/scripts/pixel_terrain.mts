// Пиксельная земля Аркады из текстур Dota (docs/arcade-dota-sprites.md §7, владелец 2026-09-06: «земля мыльная, нужен пиксель»).
// Исходник `public/art/sprites/dota/terrain/<name>.png` (512 px) → 128 px: усреднение до 64 px (пятна, а не шум по пикселю),
// 5 ступеней яркости по квантилям с лестницей контраста вокруг среднего цвета (оттенок Dota сохраняется), общее затемнение
// под тон карты, ×2 nearest. Пишет в `public/art/sprites/dota_px/terrain/`. Запуск из web/: `npx tsx scripts/pixel_terrain.mts [lum=0.2] [contrast=0.3] [div=2]`.
// Canvas — через headless Chromium (Playwright уже в devDependencies; без sharp/PIL). Скрипт страницы — строкой, не функцией:
// esbuild-хелпер `__name` в page.evaluate не существует.
import { chromium } from "playwright";
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const WEB = fileURLToPath(new URL("..", import.meta.url));
const SRC = `${WEB}public/art/sprites/dota/terrain`;
const DST = `${WEB}public/art/sprites/dota_px/terrain`;
const jobs = [
  { name: "grass", lum: Number(process.argv[2] ?? 0.2), div: Number(process.argv[4] ?? 4), contrast: Number(process.argv[3] ?? 2.2) },
  { name: "dirt", lum: Number(process.argv[2] ?? 0.2) * 1.25, div: Number(process.argv[4] ?? 4), contrast: Number(process.argv[3] ?? 2.2) },
];
const PAGE = `(async (b64, N, K, contrast, targetLum, div) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  // 1) усреднение до N/2: крупные пятна, а не шум по пикселю; 2) K ступеней по квантилям яркости, цвет ступени — средний
  // цвет исходника в ней (оттенок Dota сохраняется), контраст слегка растянут; 3) ×2 nearest до N.
  const small = N / div;
  const c = document.createElement('canvas'); c.width = c.height = small; const x = c.getContext('2d');
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, small, small);
  const d = x.getImageData(0, 0, small, small); const p = d.data;
  const lum = []; for (let i = 0; i < p.length; i += 4) lum.push(0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]);
  const sorted = lum.slice().sort((a, b) => a - b);
  const cuts = []; for (let k = 1; k < K; k++) cuts.push(sorted[Math.floor((k / K) * sorted.length)]);
  const bins = Array.from({ length: K }, () => [0, 0, 0, 0]);
  const lvlOf = (l) => { let lvl = 0; while (lvl < cuts.length && l > cuts[lvl]) lvl++; return lvl; };
  for (let i = 0; i < lum.length; i++) { const b = bins[lvlOf(lum[i])]; b[0] += p[i * 4]; b[1] += p[i * 4 + 1]; b[2] += p[i * 4 + 2]; b[3]++; }
  const meanAll = [0, 1, 2].map((ch) => bins.reduce((s, b) => s + b[ch], 0) / Math.max(1, lum.length));
  const meanLum = (0.299 * meanAll[0] + 0.587 * meanAll[1] + 0.114 * meanAll[2]) / 255;
  const dark = targetLum / Math.max(0.01, meanLum); // общее затемнение под прежний тёмно-оливковый тон карты
  // Ступени — линейная лестница ±contrast вокруг среднего цвета (исходник Dota почти без контраста, данные не помогут).
  const pal = bins.map((b, i) => { const t = (i - (K - 1) / 2) / ((K - 1) / 2); return [0, 1, 2].map((ch) => Math.max(0, Math.min(255, Math.round(meanAll[ch] * dark * (1 + contrast * t))))); });
  for (let i = 0; i < lum.length; i++) { const [r, g, b] = pal[lvlOf(lum[i])]; p[i * 4] = r; p[i * 4 + 1] = g; p[i * 4 + 2] = b; p[i * 4 + 3] = 255; }
  x.putImageData(d, 0, 0);
  const out = document.createElement('canvas'); out.width = out.height = N; const ox = out.getContext('2d'); ox.imageSmoothingEnabled = false; ox.drawImage(c, 0, 0, N, N);
  const big = document.createElement('canvas'); big.width = big.height = 512; const bx = big.getContext('2d'); bx.imageSmoothingEnabled = false; bx.drawImage(out, 0, 0, 512, 512);
  return [out.toDataURL('image/png').split(',')[1], big.toDataURL('image/png').split(',')[1], pal];
})`;
const browser = await chromium.launch();
const page = await browser.newPage();
for (const j of jobs) {
  const b64 = readFileSync(`${SRC}/${j.name}.png`).toString("base64");
  const [out, prev, pal]: [string, string, number[][]] = await page.evaluate(`${PAGE}(${JSON.stringify(b64)}, 128, 5, ${j.contrast}, ${j.lum}, ${j.div})`);
  console.log(j.name, JSON.stringify(pal));
  writeFileSync(`${DST}/${j.name}.png`, Buffer.from(out, "base64"));
  void prev;
}
await browser.close();
console.log("ok");
