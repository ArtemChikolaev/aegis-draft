// Персонажи Аркады как «риги» (после фидбэка владельца 2026-09-06: «не кружочки, а анимированные
// герои и враги»): тело, голова, две руки, две ноги и оружие, с процедурными циклами ходьбы,
// удара, получения урона и смерти. Плоский векторный стиль — временный слой до спрайт-листов:
// у каждого рига те же состояния (idle/walk/attack/hit/die), что будут у спрайтовой анимации,
// поэтому замена — в одной функции, не в симе. Тригонометрия здесь допустима (рендер).
export type Weapon = "sword" | "axe" | "bow" | "staff" | "club" | "claws" | "dagger" | "none";

export interface RigParams {
  /** Масштаб относительно базового роста ~36 px. */
  size: number;
  body: string;
  limb: string;
  head: string;
  weapon: Weapon;
  horns?: boolean;
  ears?: boolean;
  /** Число «ног» визуально (кентавр — 4). */
  legs?: 2 | 4;
  /** Толстый силуэт (огр, медведь, голем). */
  bulk?: number;
}

export interface RigPose {
  facing: 1 | -1;
  /** Фаза ходьбы (радианы), растёт со временем, пока идёт. */
  walkPhase: number;
  moving: boolean;
  /** 0..1 — прогресс замаха, −1 — не бьёт. */
  attackT: number;
  /** Вспышка получения урона. */
  hit?: boolean;
  /** Оттенок статуса поверх тела (лёд/огонь), либо null. */
  statusTint?: string | null;
}

/** Нарисовать риг центром в (x, y) — точка у ног. */
export function drawRig(c: CanvasRenderingContext2D, x: number, y: number, p: RigParams, pose: RigPose, portrait?: HTMLImageElement | null): void {
  const s = 36 * p.size;
  const bulk = p.bulk ?? 1;
  const bob = pose.moving ? Math.abs(Math.sin(pose.walkPhase)) * s * 0.06 : Math.sin(pose.walkPhase * 0.5) * s * 0.02;
  const swing = pose.moving ? Math.sin(pose.walkPhase) : 0;
  const hipY = y - s * 0.42 - bob;
  const shoulderY = y - s * 0.78 - bob;
  const headY = y - s * 0.98 - bob;
  const headR = s * 0.2;
  const f = pose.facing;
  const bodyColor = pose.hit ? "#ffffff" : p.body;
  const limbColor = pose.hit ? "#ffffff" : p.limb;
  // Тень.
  c.fillStyle = "rgba(0,0,0,.35)";
  c.beginPath(); c.ellipse(x, y + 2, s * 0.32 * bulk, s * 0.12, 0, 0, Math.PI * 2); c.fill();
  // Ноги (дальняя, ближняя; у четвероногих — две пары).
  c.strokeStyle = limbColor; c.lineWidth = Math.max(2, s * 0.11); c.lineCap = "round";
  const legLen = s * 0.42;
  const legPairs = p.legs === 4 ? [-s * 0.28, s * 0.2] : [0];
  for (const off of legPairs) {
    const lx = x + off * f;
    c.beginPath(); c.moveTo(lx - s * 0.09, hipY); c.lineTo(lx - s * 0.09 + swing * legLen * 0.5 * f, y); c.stroke();
    c.beginPath(); c.moveTo(lx + s * 0.09, hipY); c.lineTo(lx + s * 0.09 - swing * legLen * 0.5 * f, y); c.stroke();
  }
  // Дальняя рука.
  const armLen = s * 0.36;
  c.beginPath(); c.moveTo(x - s * 0.16 * f, shoulderY); c.lineTo(x - s * 0.16 * f - swing * armLen * 0.4 * f, shoulderY + armLen); c.stroke();
  // Тело.
  c.fillStyle = bodyColor;
  const bw = s * 0.26 * bulk, bh = s * 0.4;
  c.beginPath(); c.ellipse(x, (hipY + shoulderY) / 2, bw, bh, 0, 0, Math.PI * 2); c.fill();
  if (pose.statusTint && !pose.hit) { c.fillStyle = pose.statusTint; c.globalAlpha = 0.45; c.beginPath(); c.ellipse(x, (hipY + shoulderY) / 2, bw, bh, 0, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
  // Голова: портрет героя или голова врага (с рогами/ушами).
  if (portrait && portrait.complete && portrait.naturalWidth > 0) {
    c.save();
    c.beginPath(); c.arc(x, headY, headR * 1.15, 0, Math.PI * 2); c.clip();
    const iw = portrait.naturalWidth, ih = portrait.naturalHeight, side = Math.min(iw, ih);
    c.drawImage(portrait, (iw - side) / 2, (ih - side) / 2, side, side, x - headR * 1.15, headY - headR * 1.15, headR * 2.3, headR * 2.3);
    c.restore();
    c.strokeStyle = limbColor; c.lineWidth = 2; c.beginPath(); c.arc(x, headY, headR * 1.15, 0, Math.PI * 2); c.stroke();
  } else {
    c.fillStyle = pose.hit ? "#ffffff" : p.head;
    c.beginPath(); c.arc(x, headY, headR, 0, Math.PI * 2); c.fill();
    if (p.horns) {
      c.strokeStyle = limbColor; c.lineWidth = Math.max(2, s * 0.07);
      c.beginPath(); c.moveTo(x - headR * 0.6, headY - headR * 0.6); c.lineTo(x - headR * 1.1, headY - headR * 1.5); c.moveTo(x + headR * 0.6, headY - headR * 0.6); c.lineTo(x + headR * 1.1, headY - headR * 1.5); c.stroke();
    }
    if (p.ears) {
      c.fillStyle = pose.hit ? "#ffffff" : p.head;
      c.beginPath(); c.moveTo(x - headR * 0.7, headY - headR * 0.4); c.lineTo(x - headR * 1.6, headY - headR * 0.9); c.lineTo(x - headR * 0.6, headY + headR * 0.1); c.fill();
      c.beginPath(); c.moveTo(x + headR * 0.7, headY - headR * 0.4); c.lineTo(x + headR * 1.6, headY - headR * 0.9); c.lineTo(x + headR * 0.6, headY + headR * 0.1); c.fill();
    }
    // Глаза — точка света в сторону взгляда: читается направление даже у мелких.
    c.fillStyle = "#ffffff"; c.beginPath(); c.arc(x + headR * 0.45 * f, headY - headR * 0.1, Math.max(1, headR * 0.16), 0, Math.PI * 2); c.fill();
  }
  // Ближняя рука + оружие: замах — поворот от плеча.
  const swingAngle = pose.attackT >= 0 ? attackCurve(pose.attackT) : 0;
  const baseAngle = (Math.PI / 2) * 0.9 + swing * 0.5;
  const angle = baseAngle - swingAngle * f * 1.6;
  const hx = x + s * 0.16 * f, hy = shoulderY;
  const ex = hx + Math.cos(angle) * armLen * f, ey = hy + Math.sin(angle) * armLen;
  c.strokeStyle = limbColor; c.lineWidth = Math.max(2, s * 0.11);
  c.beginPath(); c.moveTo(hx, hy); c.lineTo(ex, ey); c.stroke();
  drawWeapon(c, ex, ey, angle, f, s, p, limbColor);
}

/** Кривая замаха: быстрый удар вперёд, медленный возврат. */
function attackCurve(t: number): number {
  return t < 0.35 ? Math.sin((t / 0.35) * Math.PI / 2) : Math.cos(((t - 0.35) / 0.65) * Math.PI / 2);
}

function drawWeapon(c: CanvasRenderingContext2D, x: number, y: number, angle: number, f: 1 | -1, s: number, p: RigParams, ink: string): void {
  const dirX = Math.cos(angle) * f, dirY = Math.sin(angle);
  const nx = -dirY, ny = dirX * f;
  c.strokeStyle = ink; c.lineCap = "round";
  switch (p.weapon) {
    case "sword": {
      c.lineWidth = Math.max(2, s * 0.08);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + dirX * s * 0.55, y + dirY * s * 0.55); c.stroke();
      c.lineWidth = Math.max(2, s * 0.06);
      c.beginPath(); c.moveTo(x - nx * s * 0.1, y - ny * s * 0.1); c.lineTo(x + nx * s * 0.1, y + ny * s * 0.1); c.stroke();
      break;
    }
    case "dagger": {
      c.lineWidth = Math.max(2, s * 0.07);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + dirX * s * 0.3, y + dirY * s * 0.3); c.stroke();
      break;
    }
    case "axe": case "club": {
      c.lineWidth = Math.max(2, s * 0.08);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + dirX * s * 0.5, y + dirY * s * 0.5); c.stroke();
      c.fillStyle = ink;
      c.beginPath(); c.ellipse(x + dirX * s * 0.5, y + dirY * s * 0.5, s * (p.weapon === "axe" ? 0.16 : 0.13), s * 0.1, Math.atan2(dirY, dirX), 0, Math.PI * 2); c.fill();
      break;
    }
    case "bow": {
      c.lineWidth = Math.max(2, s * 0.07);
      c.beginPath(); c.arc(x, y, s * 0.3, Math.atan2(dirY, dirX) - 1.1, Math.atan2(dirY, dirX) + 1.1); c.stroke();
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(x + Math.cos(Math.atan2(dirY, dirX) - 1.1) * s * 0.3, y + Math.sin(Math.atan2(dirY, dirX) - 1.1) * s * 0.3); c.lineTo(x + Math.cos(Math.atan2(dirY, dirX) + 1.1) * s * 0.3, y + Math.sin(Math.atan2(dirY, dirX) + 1.1) * s * 0.3); c.stroke();
      break;
    }
    case "staff": {
      c.lineWidth = Math.max(2, s * 0.07);
      c.beginPath(); c.moveTo(x - dirX * s * 0.2, y - dirY * s * 0.2); c.lineTo(x + dirX * s * 0.6, y + dirY * s * 0.6); c.stroke();
      c.fillStyle = p.body;
      c.beginPath(); c.arc(x + dirX * s * 0.6, y + dirY * s * 0.6, s * 0.1, 0, Math.PI * 2); c.fill();
      break;
    }
    case "claws": {
      c.lineWidth = Math.max(1.5, s * 0.05);
      for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + dirX * s * 0.2 + nx * i * s * 0.06, y + dirY * s * 0.2 + ny * i * s * 0.06); c.stroke(); }
      break;
    }
    default: break;
  }
}

/** Ролевые параметры врагов по виду: силуэт читается размером, толщиной, оружием и рогами/ушами. */
export function enemyRig(kindId: string, body: string, limb: string): RigParams {
  const base = { body, limb, head: body };
  switch (kindId) {
    case "kobold": return { ...base, size: 0.7, weapon: "dagger", ears: true };
    case "kobold_foreman": return { ...base, size: 0.85, weapon: "axe", ears: true };
    case "hill_troll": return { ...base, size: 0.95, weapon: "claws", ears: true };
    case "satyr": return { ...base, size: 1.0, weapon: "staff", horns: true };
    case "ogre": return { ...base, size: 1.35, weapon: "club", bulk: 1.5 };
    case "centaur": return { ...base, size: 1.3, weapon: "axe", legs: 4 };
    case "wildwing": return { ...base, size: 1.05, weapon: "claws", horns: true };
    case "lane_creep": return { ...base, size: 0.9, weapon: "sword" };
    case "siege_creep": return { ...base, size: 1.2, weapon: "none", bulk: 1.8 };
    case "golem": return { ...base, size: 1.6, weapon: "none", bulk: 1.7 };
    case "roshan": return { ...base, size: 2.3, weapon: "claws", horns: true, bulk: 1.6 };
    case "dark_troll": return { ...base, size: 0.95, weapon: "bow", ears: true };
    case "hellbear": return { ...base, size: 1.4, weapon: "claws", bulk: 1.6, ears: true };
    default: return { ...base, size: 1, weapon: "none" };
  }
}

/** Оружие героя по киту. */
export function heroWeapon(kit: string): Weapon {
  switch (kit) {
    case "juggernaut": case "blademaster": return "sword";
    case "axe": case "warlord": return "axe";
    case "sniper": case "marksman": return "bow";
    default: return "staff";
  }
}
