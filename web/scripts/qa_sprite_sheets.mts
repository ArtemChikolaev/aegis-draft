// Проверка листов спрайтов Аркады без глаза: лист есть, кадры двигаются, силуэт разумного размера.
// Ловит то, что видно только на картинке: лист не отрендерился, клип оказался статичной позой
// («герой скользит по полу»), от сета приехало одно оружие без тела или наоборот гигантский меш.
// Запуск из web/: `npx tsx scripts/qa_sprite_sheets.mts [dota_px2] [id …]`  (без id — все листы вида `<hero>@<skin>`).
// Canvas — headless Chromium (Playwright в devDependencies). Скрипт страницы — строкой, не функцией:
// esbuild-хелпера `__name` в page.evaluate не существует.
import { chromium } from "playwright";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const WEB = fileURLToPath(new URL("..", import.meta.url));
const dir = process.argv[2] && !process.argv[2].includes("@") ? process.argv[2] : "dota_px2";
const ROOT = `${WEB}public/art/sprites/${dir}`;
const explicit = process.argv.slice(2).filter((a) => a !== dir);
const ids = explicit.length
  ? explicit
  : readdirSync(ROOT).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).filter((id) => id.includes("@")).sort();

// Какие ряды строка манифеста вообще просила: иначе «нет cast» ругается на крипов и пропсы,
// которым ряд каста не нужен по определению.
const manifest = new Map<string, Set<string>>();
{
  const file = `${WEB}scripts/blender/dota_manifest_${dir === "dota_px2" ? "px2" : "px"}.tsv`;
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line || line.startsWith("#")) continue;
      const cols = line.split("\t");
      const m = /--anims (\S+)/.exec(cols[2] ?? "");
      if (m) manifest.set(cols[0], new Set(m[1].split(",").map((pp) => pp.split("=")[0])));
    }
  }
}

const b64 = (p: string) => readFileSync(p).toString("base64");
const PAGE = `(async (png, meta, anim) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
  const f = meta.frame;
  const c = document.createElement('canvas'); c.width = f; c.height = f;
  const x = c.getContext('2d', { willReadFrequently: true });
  const grab = function (row, fr) { x.clearRect(0,0,f,f); x.drawImage(img, fr*f, row*f, f, f, 0, 0, f, f); return x.getImageData(0,0,f,f).data; };
  const opaque = function (d) { let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; return n; };
  // Верхний ряд кадра с непрозрачными пикселями: 0 = модель упирается в край и обрезана.
  const topRow = function (d) { for (let y = 0; y < f; y++) for (let x = 0; x < f; x++) if (d[(y * f + x) * 4 + 3] > 40) return y; return f; };
  const bottomRow = function (d) { for (let y = f - 1; y >= 0; y--) for (let x = 0; x < f; x++) if (d[(y * f + x) * 4 + 3] > 40) return y; return 0; };
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
  const idleFrame = grab(idle.row, 0);
  return { pixels: opaque(idleFrame), top: topRow(idleFrame), bottom: bottomRow(idleFrame) / f, motion: motion, frames: move.frames, anims: Object.keys(rows) };
})`;

const browser = await chromium.launch();
const page = await browser.newPage();
const measure = async (id: string) => {
  const meta = JSON.parse(readFileSync(`${ROOT}/${id}.json`, "utf8"));
  return (await page.evaluate(`${PAGE}(${JSON.stringify(b64(`${ROOT}/${id}.png`))}, ${JSON.stringify(meta)}, "walk")`)) as {
    pixels: number; top: number; bottom: number; motion: number; frames: number; anims: string[];
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
    const want = manifest.get(id);
    const missing = want ? [...want].filter((k) => !m.anims.includes(k)) : [];
    const flags = [
      // Ряд из одного-двух кадров сравнивать не с чем: у пропсов и Древнего это статичная поза.
      m.frames >= 3 && m.motion < 60 ? "ЗАСТЫЛ" : "",
      // Порог 0.35, а не 0.45: широкие модели (дракон Dragon Knight, волчица Crystal Maiden, крылья
      // Vengeful Spirit) честно занимают меньше кадра — камера кадрирует по самой большой стороне.
      ratio < 0.35 ? "СИЛУЭТ МЕЛКИЙ" : "",
      // Модель прижата к верху кадра и не достаёт до нижней половины — её увело за границу
      // (обычно компенсация root motion). Просто касание верха — норма: кадр подгоняется по силуэту.
      m.top === 0 && m.bottom < 0.55 ? "ОБРЕЗАН" : "",
      // Кадры пляшут сильнее, чем у базового героя, — обычно виновата симулируемая ткань в части
      // сета: плащ скачет от узкого к широкому, и бег читается дёрганым (Muerta, сет Deathcaster).
      // Базу с почти статичным листом (Io — парящая сфера) в знаменатель не берём: любое движение
      // облика выглядело бы «дёрганым».
      id !== hero && b.motion > 200 && m.motion > b.motion * 2.2 ? "ДЁРГАНО" : "",
      ratio > 2.2 ? "СИЛУЭТ ОГРОМНЫЙ" : "",
      missing.length ? `НЕТ РЯДОВ: ${missing.join(",")}` : "",
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
