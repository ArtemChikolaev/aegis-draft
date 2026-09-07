// Объективная проверка листа: целость силуэта, плавность анимации и читаемость — по ВСЕМ кадрам и
// ВСЕМ направлениям, а не по одному ряду под одним углом (владелец 2026-09-06/07: «модель не до
// конца прорисована», «муэрта дёргается когда бегает», «весь чёрный внутри», «вся белая»).
//   • куски  — на сколько отдельных частей распадается силуэт: у целой модели 1–2, у битой десятки;
//   • рывок  — вторая разность центроида между соседними кадрами, % кадра: кольцо стоит, модель прыгает;
//   • строб  — чередование двух поз (кадр i похож на i+2 куда больше, чем на i+1): признак того, что
//              длинный клип сэмплирован реже цикла шага (Muerta: 12 кадров на 7 с бега);
//   • провал — насколько проседает площадь силуэта между кадрами: «не дорисовалась» ловится так;
//   • тон    — средняя яркость и насыщенность силуэта (стойка, лицом): чёрная модель / серая без текстур.
// Запуск из web/: `npx tsx scripts/qa_sheet_health.mts [dota_px2] [id…] [--json] [--top N]`
// Без id — все листы папки; печатает худшие по каждому признаку (порогом тут не отделаться: у смерти
// рывок велик по природе, поэтому ранжируем, а не отсекаем).
import { chromium } from "playwright";
import { readdirSync, readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const dir = argv[0] && !argv[0].startsWith("--") ? argv[0] : "dota_px2";
const ROOT = dir.startsWith("/") ? dir : `public/art/sprites/${dir}`;
const only = argv.slice(1).filter((a, i, arr) => !a.startsWith("--") && arr[i - 1] !== "--top");
const asJson = argv.includes("--json");
const top = Number(argv[argv.indexOf("--top") + 1]) || 25;
const ids = (only.length ? only : readdirSync(ROOT).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5))).sort();

interface AnimStat { куски: number; рывок: number; строб: number; провал: number; где: string }
interface SheetStat { anims: Record<string, AnimStat>; яркость: number; насыщенность: number; пусто: number }

const PAGE = `(async (b64, meta) => {
  const img = new Image(); img.src = 'data:image/webp;base64,' + b64; await img.decode();
  const F = meta.frame, c = document.createElement('canvas'); c.width = F; c.height = F;
  const x = c.getContext('2d', { willReadFrequently: true });
  const anims = {};
  let lumSum = 0, satSum = 0, lumN = 0, empty = 0, total = 0;
  const grab = (row, fr) => { x.clearRect(0, 0, F, F); x.drawImage(img, fr*F, row*F, F, F, 0, 0, F, F); return x.getImageData(0, 0, F, F).data; };
  for (const [name, a] of Object.entries(meta.anims)) {
    let worstParts = 0, worstJit = 0, worstStrobe = 0, worstDrop = 0, worstWhere = '';
    for (let d = 0; d < meta.dirs; d++) {
      const cent = [], parts = [], area = [], masks = [];
      for (let fr = 0; fr < a.frames; fr++) {
        const px = grab(a.row + d, fr);
        const on = new Uint8Array(F*F); let n = 0, sx = 0, sy = 0;
        for (let i = 0, p = 0; i < px.length; i += 4, p++) if (px[i+3] > 60) {
          on[p] = 1; n++; sx += p % F; sy += (p/F)|0;
          if (name === 'idle' && d === 0 && fr === 0) {
            const r = px[i]/255, g = px[i+1]/255, b = px[i+2]/255, mx = Math.max(r,g,b), mn = Math.min(r,g,b);
            lumSum += 0.299*r + 0.587*g + 0.114*b; satSum += mx > 0 ? (mx - mn)/mx : 0; lumN++;
          }
        }
        total++; if (n < 30) empty++;
        area.push(n); masks.push(on);
        if (n < 30) { parts.push(0); cent.push(null); continue; }
        cent.push([sx/n, sy/n]);
        const seen = new Uint8Array(F*F); let big = 0; const stack = [];
        for (let p = 0; p < F*F; p++) {
          if (!on[p] || seen[p]) continue;
          let size = 0; stack.push(p); seen[p] = 1;
          while (stack.length) { const q = stack.pop(); size++;
            const qx = q % F, qy = (q/F)|0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              const nx = qx+dx, ny = qy+dy; if (nx < 0 || ny < 0 || nx >= F || ny >= F) continue;
              const r = ny*F+nx; if (on[r] && !seen[r]) { seen[r] = 1; stack.push(r); } } }
          if (size > n*0.02) big++;
        }
        parts.push(big);
      }
      const medParts = parts.slice().sort((p,q)=>p-q)[parts.length>>1] ?? 0;
      if (medParts > worstParts) { worstParts = medParts; worstWhere = 'dir'+d; }
      const cc = cent.filter(Boolean);
      if (cc.length > 2) {
        for (let i = 1; i < cc.length - 1; i++) {
          const ax = cc[i+1][0] - 2*cc[i][0] + cc[i-1][0];
          const ay = cc[i+1][1] - 2*cc[i][1] + cc[i-1][1];
          const jit = Math.hypot(ax, ay) / F * 100;
          if (jit > worstJit) { worstJit = jit; if (!worstWhere) worstWhere = 'dir'+d; }
        }
      }
      // Строб: XOR-расстояние масок соседних кадров против кадров через один. У плавного цикла
      // d(i,i+1) < d(i,i+2); при чередовании двух поз d(i,i+2) ≈ 0 при большом d(i,i+1).
      if (masks.length >= 4 && area.every((v) => v >= 30)) {
        let d1 = 0, d2 = 0, k = 0;
        for (let i = 0; i + 2 < masks.length; i++) {
          let a1 = 0, a2 = 0; const m0 = masks[i], m1 = masks[i+1], m2 = masks[i+2];
          for (let p = 0; p < F*F; p++) { a1 += m0[p] ^ m1[p]; a2 += m0[p] ^ m2[p]; }
          d1 += a1; d2 += a2; k++;
        }
        const strobe = d1 > 0 ? 1 - Math.min(1, d2 / d1) : 0;  // 1 = чистое чередование
        if (strobe > worstStrobe) worstStrobe = strobe;
      }
      const areas = area.filter((v) => v > 0);
      if (areas.length > 2) {
        const sa = areas.slice().sort((p,q)=>p-q); const ma = sa[sa.length>>1] || 1;
        const drop = 1 - Math.min(...areas) / ma;
        if (drop > worstDrop) worstDrop = drop;
      }
    }
    anims[name] = { куски: worstParts, рывок: +worstJit.toFixed(1), строб: +worstStrobe.toFixed(2), провал: +worstDrop.toFixed(2), где: worstWhere };
  }
  return { anims, яркость: lumN ? +(lumSum/lumN).toFixed(3) : 0, насыщенность: lumN ? +(satSum/lumN).toFixed(3) : 0, пусто: +(empty/Math.max(1,total)).toFixed(3) };
})`;

const browser = await chromium.launch();
const page = await browser.newPage();
const all: Record<string, SheetStat> = {};
for (const id of ids) {
  const meta = JSON.parse(readFileSync(`${ROOT}/${id}.json`, "utf8"));
  all[id] = await page.evaluate(`${PAGE}(${JSON.stringify(readFileSync(`${ROOT}/${id}.webp`).toString("base64"))}, ${JSON.stringify(meta)})`) as SheetStat;
  if (only.length && !asJson) {
    const s = all[id];
    console.log(`${id.padEnd(34)} яркость ${s.яркость} насыщ ${s.насыщенность} пусто ${Math.round(s.пусто*100)}% · ${Object.entries(s.anims).map(([k, v]) => `${k}: кусков ${v.куски} рывок ${v.рывок}% строб ${v.строб} провал ${Math.round(v.провал*100)}%`).join(" · ")}`);
  }
}
await browser.close();
if (asJson) { console.log(JSON.stringify(all)); process.exit(0); }
if (only.length) process.exit(0);

// Ранжирование по признакам (движение — по рядам бега/стойки, где кадры обязаны быть плавными).
const rows: { id: string; anim: string; v: AnimStat }[] = [];
for (const [id, s] of Object.entries(all)) for (const [anim, v] of Object.entries(s.anims)) rows.push({ id, anim, v });
const loop = rows.filter((r) => r.anim === "walk" || r.anim === "idle");
const print = (title: string, list: string[]) => { console.log(`\n== ${title}`); for (const l of list) console.log("  " + l); };
print(`строб в беге/стойке (чередование двух поз), топ ${top}`, loop.filter((r) => r.v.строб >= 0.3).sort((a, b) => b.v.строб - a.v.строб).slice(0, top).map((r) => `${r.id.padEnd(34)} ${r.anim.padEnd(5)} строб ${r.v.строб} рывок ${r.v.рывок}%`));
print(`рывок в беге/стойке, топ ${top}`, loop.sort((a, b) => b.v.рывок - a.v.рывок).slice(0, top).map((r) => `${r.id.padEnd(34)} ${r.anim.padEnd(5)} рывок ${r.v.рывок}% строб ${r.v.строб}`));
print(`провал силуэта в беге/стойке (кадры пропадают), топ ${top}`, loop.filter((r) => r.v.провал >= 0.3).sort((a, b) => b.v.провал - a.v.провал).slice(0, top).map((r) => `${r.id.padEnd(34)} ${r.anim.padEnd(5)} провал ${Math.round(r.v.провал*100)}%`));
print(`рассыпается на куски (любой ряд, кусков ≥ 3)`, rows.filter((r) => r.v.куски >= 3).sort((a, b) => b.v.куски - a.v.куски).slice(0, top).map((r) => `${r.id.padEnd(34)} ${r.anim.padEnd(6)} кусков ${r.v.куски} (${r.v.где})`));
const sheets = Object.entries(all);
print(`самые тёмные (яркость силуэта в стойке), топ ${top}`, sheets.sort((a, b) => a[1].яркость - b[1].яркость).slice(0, top).map(([id, s]) => `${id.padEnd(34)} яркость ${s.яркость} насыщ ${s.насыщенность}`));
print(`самые серые (насыщенность силуэта), топ ${top}`, sheets.sort((a, b) => a[1].насыщенность - b[1].насыщенность).slice(0, top).map(([id, s]) => `${id.padEnd(34)} насыщ ${s.насыщенность} яркость ${s.яркость}`));
print(`пустые кадры (доля по листу)`, sheets.filter(([, s]) => s.пусто > 0.02).sort((a, b) => b[1].пусто - a[1].пусто).slice(0, top).map(([id, s]) => `${id.padEnd(34)} пусто ${Math.round(s.пусто*100)}%`));
console.log(`\nпроверено ${ids.length}`);
