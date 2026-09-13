// Слой одной надетой части: разница между листом «герой без части» и «герой с частью».
// Зачем разницей, а не рендером части отдельно: Workbench (наш движок рендера) не умеет holdout,
// то есть не может вырезать из части пиксели, которые закрывает тело. А разница двух кадров даёт
// ровно видимые пиксели части — с правильным перекрытием и бесплатно, потому что лист «без части»
// у героя уже есть. Считать по СЫРЫМ (неквантованным) листам одного кадрирования (`--fit-from`,
// RAW=1 в dota_pipeline.sh) — тогда шума нет; допуск и отсев одиночных пикселей лечат остаток.
// Запуск из web/: `npx tsx scripts/sprite_part_layer.mts base.png with.png out.png [tol]`;
// пакетно — dota_part_layers.mts (T13.80), он импортирует partLayer().
import { chromium, type Page } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PAGE = `(async (aB64, aMime, bB64, bMime, tol, despeckle) => {
  const load = (b64, mime) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:' + mime + ';base64,' + b64; });
  const [a, b] = await Promise.all([load(aB64, aMime), load(bB64, bMime)]);
  if (a.width !== b.width || a.height !== b.height) return { error: 'размеры листов не совпадают' };
  const c = document.createElement('canvas'); c.width = a.width; c.height = a.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(a, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
  x.clearRect(0, 0, c.width, c.height); x.drawImage(b, 0, 0);
  const img = x.getImageData(0, 0, c.width, c.height); const db = img.data;
  const w = c.width, h = c.height;
  const keep = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < db.length; i += 4, p++) {
    const diff = Math.abs(da[i] - db[i]) + Math.abs(da[i+1] - db[i+1]) + Math.abs(da[i+2] - db[i+2]) + Math.abs(da[i+3] - db[i+3]);
    keep[p] = diff > tol ? 1 : 0;
  }
  // Одиночный пиксель без соседей по 4-связности — шум затенения, не часть (тонкая линия части имеет соседей вдоль себя).
  if (despeckle) {
    const out = new Uint8Array(keep);
    for (let p = 0; p < keep.length; p++) {
      if (!keep[p]) continue;
      const xx = p % w, yy = (p / w) | 0;
      const n = (xx > 0 && keep[p-1]) || (xx < w-1 && keep[p+1]) || (yy > 0 && keep[p-w]) || (yy < h-1 && keep[p+w]);
      if (!n) out[p] = 0;
    }
    keep.set(out);
  }
  let kept = 0;
  for (let i = 0, p = 0; i < db.length; i += 4, p++) { if (!keep[p]) db[i+3] = 0; else kept++; }
  x.putImageData(img, 0, 0);
  return { png: c.toDataURL('image/png'), kept, total: w * h };
})`;

const mime = (f: string) => (f.endsWith(".webp") ? "image/webp" : "image/png");

/** Слой части: PNG с пикселями, где `withPart` отличается от `base` сильнее `tol` (сумма |ΔRGBA|). */
export async function partLayer(page: Page, base: string, withPart: string, tol = 12, despeckle = true): Promise<{ png: Buffer; kept: number; total: number }> {
  const r = await page.evaluate(`${PAGE}(${JSON.stringify(readFileSync(base).toString("base64"))}, ${JSON.stringify(mime(base))}, ${JSON.stringify(readFileSync(withPart).toString("base64"))}, ${JSON.stringify(mime(withPart))}, ${tol}, ${despeckle})`) as { png?: string; kept?: number; total?: number; error?: string };
  if (r.error) throw new Error(`${withPart}: ${r.error}`);
  return { png: Buffer.from(r.png!.split(",")[1], "base64"), kept: r.kept!, total: r.total! };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [base, withPart, out, tolArg] = process.argv.slice(2);
  if (!base || !withPart || !out) { console.error("нужно: base.png with.png out.png [tol]"); process.exit(1); }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const r = await partLayer(page, base, withPart, Number(tolArg ?? 12));
  await browser.close();
  writeFileSync(out, r.png);
  console.log(`${out}: пикселей части ${r.kept} из ${r.total} (${((r.kept / r.total) * 100).toFixed(1)}%)`);
}
