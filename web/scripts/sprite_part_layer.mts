// Слой одной надетой части: разница между листом «герой без части» и «герой с частью».
// Зачем разницей, а не рендером части отдельно: Workbench (наш движок рендера) не умеет holdout,
// то есть не может вырезать из части пиксели, которые закрывает тело. А разница двух кадров даёт
// ровно видимые пиксели части — с правильным перекрытием и бесплатно, потому что лист «без части»
// у героя уже есть. Пиксельные листы квантованы, поэтому шума на границах почти нет; допуск лечит
// остаток. Запуск из web/: `npx tsx scripts/sprite_part_layer.mts base.webp with.webp out.png [tol]`.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const [base, withPart, out, tolArg] = process.argv.slice(2);
if (!base || !withPart || !out) { console.error("нужно: base.webp with.webp out.png [tol]"); process.exit(1); }
const tol = Number(tolArg ?? 12);

const PAGE = `(async (aB64, bB64, tol) => {
  const load = (b64) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/webp;base64,' + b64; });
  const [a, b] = await Promise.all([load(aB64), load(bB64)]);
  if (a.width !== b.width || a.height !== b.height) return { error: 'размеры листов не совпадают' };
  const c = document.createElement('canvas'); c.width = a.width; c.height = a.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(a, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
  x.clearRect(0, 0, c.width, c.height); x.drawImage(b, 0, 0);
  const img = x.getImageData(0, 0, c.width, c.height); const db = img.data;
  let kept = 0;
  for (let i = 0; i < db.length; i += 4) {
    const diff = Math.abs(da[i] - db[i]) + Math.abs(da[i+1] - db[i+1]) + Math.abs(da[i+2] - db[i+2]) + Math.abs(da[i+3] - db[i+3]);
    if (diff <= tol) { db[i+3] = 0; } else kept++;
  }
  x.putImageData(img, 0, 0);
  return { png: c.toDataURL('image/png'), kept, total: (db.length / 4) };
})`;

const browser = await chromium.launch();
const page = await browser.newPage();
const r = await page.evaluate(`${PAGE}(${JSON.stringify(readFileSync(base).toString("base64"))}, ${JSON.stringify(readFileSync(withPart).toString("base64"))}, ${tol})`) as { png?: string; kept?: number; total?: number; error?: string };
await browser.close();
if (r.error) { console.error(r.error); process.exit(1); }
writeFileSync(out, Buffer.from(r.png!.split(",")[1], "base64"));
console.log(`${out}: пикселей части ${r.kept} из ${r.total} (${((r.kept! / r.total!) * 100).toFixed(1)}%)`);
