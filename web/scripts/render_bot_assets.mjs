// Рендер растровых ассетов бота Telegram из ЕДИНОГО источника — public/favicon.svg.
// Правило из docs/design-language.md: знак не рисуется заново под каждый носитель, иначе
// версии расходятся. Здесь тот же SVG кладётся на фирменный фон и снимается в нужном размере.
//
// Почему Playwright, а не sharp/resvg: он уже стоит как dev-зависимость под e2e, новых пакетов
// заводить не надо, и он единственный из троих умеет то, что нам реально нужно, — веб-шрифты
// (Space Grotesk/Manrope грузятся из Google Fonts, как и в самом приложении).
//
//   node scripts/render_bot_assets.mjs
//
// Выход в public/:
//   bot-avatar.png  512×512   аватар бота
//   bot-cover.png   640×360   обложка Direct Link и welcome-картинка в пустом чате
//   bot-splash.svg  512×512   Launch Screen у Mini App (один <path>, как требует BotFather)
//   bot-splash.webp 512×512   тот же splash растром — на случай, если SVG не принимается

import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(root, "public");

// Токены из design/tokens.css. Дублируются осознанно: скрипт рендерит вне приложения и не
// может прочитать CSS-переменные, но значения обязаны совпадать с --bg и --accent.
const BG = "#000000";
const GREEN = "#8ff0b5";
const MUTED = "#8a8a85";

const FONTS = "https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Space+Grotesk:wght@600;700&display=swap";

/**
 * Аватар: знак во всю площадь. Telegram обрежет в круг — буква вписана в безопасный круг.
 * Фон страницы ПРОЗРАЧНЫЙ (см. omitBackground у вызова): форму задаёт сам SVG со своим
 * `rx="14"`, иначе чёрная подложка заливает углы и скруглённый квадрат становится квадратом.
 */
function avatarHtml(mark) {
  return page(`<div style="width:512px;height:512px">${scaled(mark, 512)}</div>`, "transparent");
}

/**
 * Обложка 640×360: знак + вордмарк + подпись из docs/design-language.md («Тон и копирайт»).
 * Editorial-подача: много воздуха, зелёный — редкий акцент, а не заливка.
 */
function coverHtml(mark) {
  return page(`
    <div style="position:relative;width:640px;height:360px;overflow:hidden;background:${BG};display:flex;align-items:center;gap:34px;padding:0 56px">
      <div style="position:absolute;width:460px;height:460px;right:-150px;top:-190px;border-radius:50%;
                  background:radial-gradient(circle,rgba(114,231,155,.30),rgba(114,231,155,0) 62%)"></div>
      <div style="flex:none;width:112px;height:112px">${scaled(mark, 112)}</div>
      <div style="position:relative">
        <div style="font:700 13px/1 'Space Grotesk',sans-serif;letter-spacing:.16em;color:${GREEN};text-transform:uppercase">Dota 2 · Tournament roguelike</div>
        <div style="margin:14px 0 12px;font:700 58px/1 'Space Grotesk',sans-serif;letter-spacing:-.045em;color:#f7f7f5">Aegis&nbsp;Draft</div>
        <div style="font:500 19px/1.35 Manrope,sans-serif;color:${MUTED}">Draft a roster. Survive the tournament.</div>
      </div>
    </div>`);
}

/**
 * Splash-иконка для Launch Screen в BotFather: холст 512×512 и РОВНО один `<path>` внутри —
 * такое требование Telegram (он рисует силуэт, поэтому фон-квадрат знака здесь лишний).
 * Букву берём из того же favicon.svg и масштабируем 64 → 512, чтобы источник остался один.
 */
function splashSvg(mark) {
  const d = /<path d="([^"]+)"/.exec(mark)?.[1];
  if (!d) throw new Error("в favicon.svg не найден <path> буквы — знак изменили, поправь скрипт");
  const polygons = pathToPolygons(d).map((points) => points.map(([x, y]) => [x * 8, y * 8]));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">`
    + `<path d="${polygonsToPath(polygons)}"/></svg>\n`;
}

/**
 * Разбор `d` в абсолютные вершины. Нужен НЕ ради масштаба (при uniform scale хватило бы
 * умножить все числа), а ради НОРМАЛИЗАЦИИ записи: в favicon.svg путь использует сокращения
 * SVG — неявный lineto после `M`, относительные `h`/`l` и слитное `Zm`. Браузеры это едят,
 * а парсер splash-иконки в клиенте Telegram — нет: знак приезжал порванным (проверено на
 * живом BotFather 2026-07-20). Поэтому на выходе только `M`/`L`/`Z` в абсолютных координатах.
 *
 * Поддержаны команды прямых линий — ровно то, из чего состоит знак. Кривая или дуга уронят
 * скрипт: лучше явный отказ, чем молча испорченная иконка.
 */
function pathToPolygons(d) {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  const polygons = [];
  let current = null;
  let cmd = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let i = 0;
  const num = () => Number(tokens[i++]);

  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    // Повтор координат без буквы: после moveto это неявный lineto (так работает SVG).
    else if (cmd === "M") cmd = "L";
    else if (cmd === "m") cmd = "l";

    switch (cmd) {
      case "M": x = num(); y = num(); startX = x; startY = y; polygons.push(current = [[x, y]]); break;
      case "m": x += num(); y += num(); startX = x; startY = y; polygons.push(current = [[x, y]]); break;
      case "L": x = num(); y = num(); current.push([x, y]); break;
      case "l": x += num(); y += num(); current.push([x, y]); break;
      case "H": x = num(); current.push([x, y]); break;
      case "h": x += num(); current.push([x, y]); break;
      case "V": y = num(); current.push([x, y]); break;
      case "v": y += num(); current.push([x, y]); break;
      case "Z": case "z": x = startX; y = startY; break;
      default: throw new Error(`в знаке команда ${cmd}, которую splash-генератор не умеет`);
    }
  }
  return polygons;
}

/** Внешний контур и внутренний просвет буквы идут разным обходом — дырка остаётся дыркой. */
function polygonsToPath(polygons) {
  const round = (n) => Number(n.toFixed(2));
  return polygons.map((points) => `M${points.map(([x, y]) => `${round(x)} ${round(y)}`).join("L")}Z`).join("");
}

/** SVG знака вставляем как есть, только задаём размер — сам файл остаётся источником правды. */
function scaled(mark, size) {
  return mark.replace("<svg", `<svg width="${size}" height="${size}"`);
}

function page(body, background = BG) {
  return `<!doctype html><html><head><meta charset="utf-8">
    <link rel="stylesheet" href="${FONTS}">
    <style>*{box-sizing:border-box}body{margin:0;background:${background}}</style>
    </head><body>${body}</body></html>`;
}

/**
 * Тот же splash-знак растром, 512×512 WEBP. Запасной путь: BotFather принимает SVG
 * (предпочтительно) либо WEBP/TGS — PNG в списке нет вовсе, поэтому его и не делаем.
 * Из растра Telegram сам достраивает контур и честно предупреждает, что качество ниже.
 *
 * Кодируем через canvas самого Chromium: Playwright умеет снимать только png/jpeg, а тащить
 * ради одного файла кодировщик в зависимости — не та цена. Фон прозрачный, знак чёрный.
 */
async function shootWebp(browser, svg, { size, file }) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  const dataUrl = await page.evaluate(async (px) => {
    const source = document.querySelector("svg").outerHTML;
    const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }));
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = px;
    canvas.height = px;
    canvas.getContext("2d").drawImage(image, 0, 0, px, px);
    URL.revokeObjectURL(url);
    return canvas.toDataURL("image/webp", 1);
  }, size);
  if (!dataUrl.startsWith("data:image/webp")) throw new Error("Chromium не отдал WEBP");
  const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
  await writeFile(file, bytes);
  await page.close();
  console.log(`${file}  ${size}×${size}  ${(bytes.length / 1024).toFixed(1)} KB`);
}

async function shoot(browser, html, { width, height, file, transparent = false }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle" });
  // Без этого текст снимается системным фоллбэком: networkidle означает «сеть затихла»,
  // а не «шрифты применены».
  await page.evaluate(() => document.fonts.ready);
  const shot = await page.screenshot({ type: "png", omitBackground: transparent });
  await writeFile(file, shot);
  await page.close();
  console.log(`${file}  ${width}×${height}  ${(shot.length / 1024).toFixed(1)} KB`);
}

const mark = await readFile(resolve(OUT_DIR, "favicon.svg"), "utf8");
const splash = splashSvg(mark);
await mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
try {
  await shoot(browser, avatarHtml(mark), { width: 512, height: 512, file: resolve(OUT_DIR, "bot-avatar.png"), transparent: true });
  await shoot(browser, coverHtml(mark), { width: 640, height: 360, file: resolve(OUT_DIR, "bot-cover.png") });
  await shootWebp(browser, splash, { size: 512, file: resolve(OUT_DIR, "bot-splash.webp") });
} finally {
  await browser.close();
}

const splashFile = resolve(OUT_DIR, "bot-splash.svg");
await writeFile(splashFile, splash);
console.log(`${splashFile}  512×512  single path`);
