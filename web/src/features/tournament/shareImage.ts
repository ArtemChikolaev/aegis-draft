// Шеринг-картинка забега (T7.1 / T3.9 «Save as image»). Карточка 1200×630 рисуется на canvas
// руками — без html2canvas и прочих зависимостей: DOM-скриншотер тянул бы ~50КБ ради одной
// карточки и спотыкался бы о кросс-доменные картинки.
//
// Карточка НАМЕРЕННО текстовая, без портретов героев. Steam CDN отдаёт
// `Access-Control-Allow-Origin: https://www.dota2.com` (замер 2026-08-11), то есть
// crossOrigin-портрет не грузится ни с одного нашего origin, а без crossOrigin drawImage
// «пачкает» canvas и toBlob падает. Зеркала с ACAO:* нет. Текст-first решает это честно
// и попадает в editorial-айдентику продукта.
//
// Цвета приходят из ЖИВЫХ design-токенов (resolveShareTheme читает computed style документа),
// поэтому карточка автоматически следует текущей теме и не заводит вторую палитру.
// Строки локализованы снаружи (ShareCardData несёт готовые подписи) — модуль не знает про i18n.
import type { Role } from "../../types/data.ts";
import type { RosterSlot } from "../../game/engine.ts";

export interface ShareCardPlayer {
  role: Role;
  roleLabel: string;
  nickname: string;
  /** Имя назначенного героя; "" — герой ещё не назначен. */
  heroName: string;
}

export interface ShareCardData {
  brand: string;
  /** «Valve Legacy · Easy · Event Rating · Team Packs» — конфиг забега одной строкой. */
  configLine: string;
  teamName: string;
  /** Локализованное место («1-е место») — заголовок карточки. */
  placement: string;
  ovrLabel: string;
  baseLabel: string;
  synergyLabel: string;
  chemistryLabel: string;
  teamOvr: number;
  base: number;
  heroSynergy: number;
  chemistry: number;
  players: ShareCardPlayer[];
  /** «Сид ABC123» — подпись воспроизводимости. */
  seedLine: string;
  /** Хост продукта в подвале (window.location.host). */
  host: string;
}

export interface ShareCardTheme {
  bg: string;
  surface: string;
  line: string;
  text: string;
  muted: string;
  accent: string;
}

/** Токены темы для canvas: читаем те же переменные, что использует вёрстка. */
export function resolveShareTheme(root: Element): ShareCardTheme {
  const style = getComputedStyle(root);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    bg: token("--bg", "#000"),
    surface: token("--surface", "#111"),
    line: token("--line", "rgba(255,255,255,.13)"),
    text: token("--text", "#f7f7f5"),
    muted: token("--muted", "#999"),
    accent: token("--accent", "#8ff0b5"),
  };
}

/** Ростер → строки карточки. Чистая функция (юнит-тест): слот без кандидата пропускается,
 *  герой берётся из назначения; неизвестный герой не роняет карточку. */
export function shareCardPlayers(
  roster: RosterSlot[],
  heroByPlayer: Record<number, number>,
  heroName: (id: number) => string,
  roleLabel: (role: Role) => string,
): ShareCardPlayer[] {
  const players: ShareCardPlayer[] = [];
  for (const slot of roster) {
    if (!slot.candidate) continue;
    const heroId = heroByPlayer[slot.candidate.player.accountId];
    players.push({
      role: slot.role,
      roleLabel: roleLabel(slot.role),
      nickname: slot.candidate.player.nickname,
      heroName: heroId === undefined ? "" : heroName(heroId),
    });
  }
  return players;
}

/** Имя файла: сид может быть любым пользовательским вводом — оставляем только безопасное. */
export function shareFileName(seed: string): string {
  const safe = seed.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  return `aegis-draft-${safe || "run"}.png`;
}

const W = 1200;
const H = 630;
const SCALE = 2; // ретина: рисуем 2400×1260
const MARGIN = 64;

const HEADING = '"Space Grotesk", Manrope, sans-serif';
const BODY = "Manrope, system-ui, sans-serif";

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

function roundedPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Знак продукта — как в шапке приложения (.brand__mark): квадратная плашка цвета текста,
 *  буква цвета фона. Не favicon: тот всегда чёрно-зелёный, а внутри продукта знак темовый. */
function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, theme: ShareCardTheme) {
  ctx.fillStyle = theme.text;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = theme.bg;
  ctx.font = `800 ${Math.round(size * 0.5)}px ${BODY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("A", x + size / 2, y + size / 2 + size * 0.03);
  ctx.textBaseline = "alphabetic";
}

const fmtBonus = (value: number) => {
  const rounded = Math.round(value * 10) / 10;
  return rounded >= 0 ? `+${rounded}` : `${rounded}`;
};

/** Рисует карточку и отдаёт PNG. */
export async function renderShareCard(data: ShareCardData, theme: ShareCardTheme): Promise<Blob> {
  // Шрифты страницы уже используются вёрсткой; ждём готовности, чтобы canvas не упал на фолбэк.
  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  ctx.scale(SCALE, SCALE);

  // Фон и рамка.
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 1;
  ctx.strokeRect(24.5, 24.5, W - 49, H - 49);

  // Шапка: знак + бренд слева, конфиг справа.
  const markSize = 44;
  drawMark(ctx, MARGIN, MARGIN - 6, markSize, theme);
  ctx.textAlign = "left";
  ctx.fillStyle = theme.text;
  ctx.font = `700 24px ${HEADING}`;
  ctx.fillText(data.brand, MARGIN + markSize + 18, MARGIN + 25);
  ctx.textAlign = "right";
  ctx.fillStyle = theme.muted;
  ctx.font = `600 15px ${BODY}`;
  ctx.fillText(fitText(ctx, data.configLine, W / 2), W - MARGIN, MARGIN + 24);

  // Команда и место.
  ctx.textAlign = "left";
  ctx.fillStyle = theme.text;
  ctx.font = `700 56px ${HEADING}`;
  ctx.fillText(fitText(ctx, data.teamName, W - MARGIN * 2), MARGIN, 218);
  ctx.fillStyle = theme.accent;
  ctx.font = `700 27px ${HEADING}`;
  ctx.fillText(data.placement.toUpperCase(), MARGIN, 266);

  // Пятёрка: текстовые плитки «роль / ник / герой».
  const cells = Math.max(data.players.length, 1);
  const gap = 18;
  const cellW = (W - MARGIN * 2 - gap * (cells - 1)) / cells;
  const cellH = 168;
  const rowY = 306;
  data.players.forEach((player, i) => {
    const x = MARGIN + i * (cellW + gap);
    roundedPath(ctx, x, rowY, cellW, cellH, 12);
    ctx.fillStyle = theme.surface;
    ctx.fill();
    roundedPath(ctx, x + 0.5, rowY + 0.5, cellW - 1, cellH - 1, 12);
    ctx.strokeStyle = theme.line;
    ctx.stroke();

    const pad = 18;
    const innerW = cellW - pad * 2;
    ctx.textAlign = "left";
    ctx.fillStyle = theme.muted;
    ctx.font = `700 11px ${BODY}`;
    ctx.fillText(player.roleLabel.toUpperCase(), x + pad, rowY + 34);
    ctx.fillStyle = theme.text;
    // Ник — главный элемент плитки; длинные вроде «Nicky`Cool» ужимаются, но не режут плитку.
    ctx.font = `700 22px ${HEADING}`;
    ctx.fillText(fitText(ctx, player.nickname, innerW), x + pad, rowY + 74);
    if (player.heroName) {
      ctx.fillStyle = theme.accent;
      ctx.font = `600 15px ${BODY}`;
      ctx.fillText(fitText(ctx, player.heroName, innerW), x + pad, rowY + 106);
    }
    // Тонкая опорная линия под ником — editorial-ритм вместо портрета.
    ctx.strokeStyle = theme.line;
    ctx.beginPath();
    ctx.moveTo(x + pad, rowY + cellH - 26);
    ctx.lineTo(x + pad + innerW, rowY + cellH - 26);
    ctx.stroke();
  });

  // Нижняя полоса: счёт слева, сид/хост справа.
  const bandY = 522;
  ctx.strokeStyle = theme.line;
  ctx.beginPath();
  ctx.moveTo(MARGIN, bandY);
  ctx.lineTo(W - MARGIN, bandY);
  ctx.stroke();

  ctx.fillStyle = theme.muted;
  ctx.font = `700 12px ${BODY}`;
  ctx.fillText(data.ovrLabel.toUpperCase(), MARGIN, bandY + 34);
  ctx.fillStyle = theme.accent;
  ctx.font = `700 44px ${HEADING}`;
  const ovrText = `${Math.round(data.teamOvr)}`;
  ctx.fillText(ovrText, MARGIN, bandY + 78);
  const ovrWidth = ctx.measureText(ovrText).width;

  ctx.fillStyle = theme.text;
  ctx.font = `600 16px ${BODY}`;
  const breakdown = [
    `${data.baseLabel} ${Math.round(data.base)}`,
    `${data.synergyLabel} ${fmtBonus(data.heroSynergy)}`,
    `${data.chemistryLabel} ${fmtBonus(data.chemistry)}`,
  ].join("   ·   ");
  ctx.fillText(fitText(ctx, breakdown, W - MARGIN * 2 - ovrWidth - 340), MARGIN + ovrWidth + 28, bandY + 72);

  ctx.textAlign = "right";
  ctx.fillStyle = theme.muted;
  ctx.font = `600 14px ${BODY}`;
  ctx.fillText(data.host, W - MARGIN, bandY + 44);
  ctx.fillText(fitText(ctx, data.seedLine, 280), W - MARGIN, bandY + 70);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
  });
}
