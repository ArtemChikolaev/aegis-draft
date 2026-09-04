// Рендер Arcade на Canvas 2D (T13.2). Читает состояние сима и ничего в него не пишет. Цвета —
// только токены `--arcade-*` из design/tokens.css: снимаются раз в секунду через getComputedStyle
// (canvas не наследует CSS-переменные), поэтому смена темы подхватывается без перемонтирования.
// Тригонометрия здесь разрешена: рендер не участвует в детерминизме.
import type { ArcadeSim } from "../../game/arcade/sim.ts";
import { ARCADE, TICK_HZ } from "../../game/arcade/config.ts";
import type { Enemy, Fx } from "../../game/arcade/types.ts";
import { heroArtSources } from "../../ui/artSource.ts";

const PALETTE_KEYS = [
  "ground", "groundLine", "bounds", "grunt", "brute", "swift", "elite", "boss", "creep", "player", "playerRing", "shard", "fire", "frost",
  "lightning", "hp", "hpBg", "text", "telegraph", "ward", "heal", "crit", "aegis", "joystick", "greed",
] as const;
type PaletteKey = (typeof PALETTE_KEYS)[number];
type Palette = Record<PaletteKey, string>;

const TONE_KEY: Record<Enemy["kind"]["tone"], PaletteKey> = { grunt: "grunt", brute: "brute", swift: "swift", elite: "elite", boss: "boss", creep: "creep" };

function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

export class ArcadeRenderer {
  private ctx: CanvasRenderingContext2D;
  private palette: Palette | null = null;
  private paletteAt = 0;
  private portrait: HTMLImageElement | null = null;
  private portraitReady = false;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private shakeX = 0;
  private shakeY = 0;

  constructor(private readonly canvas: HTMLCanvasElement, heroPicture: string) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("canvas 2d unavailable");
    this.ctx = ctx;
    const [src] = heroArtSources(heroPicture);
    if (src) {
      this.portrait = new Image();
      this.portrait.onload = () => { this.portraitReady = true; };
      this.portrait.src = src;
    }
  }

  /** Подогнать буфер под CSS-размер и DPR (зовётся из ResizeObserver). */
  resize(width: number, height: number): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, Math.floor(width));
    this.h = Math.max(1, Math.floor(height));
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
  }

  private readPalette(now: number): Palette {
    if (this.palette && now - this.paletteAt < 1000) return this.palette;
    const style = getComputedStyle(document.documentElement);
    const palette = {} as Palette;
    for (const key of PALETTE_KEYS) palette[key] = style.getPropertyValue(`--arcade-${kebab(key)}`).trim() || "#f0f";
    this.palette = palette;
    this.paletteAt = now;
    return palette;
  }

  draw(sim: ArcadeSim, now: number, joystick: { ox: number; oy: number; x: number; y: number } | null, shakeEnabled: boolean): void {
    const c = this.ctx;
    const pal = this.readPalette(now);
    const p = sim.player;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Камера: игрок в центре, мир не выезжает за край.
    const camX = clamp(p.x - this.w / 2, 0, Math.max(0, ARCADE.world.w - this.w));
    const camY = clamp(p.y - this.h / 2, 0, Math.max(0, ARCADE.world.h - this.h));
    if (shakeEnabled && sim.shake > 0) {
      const k = Math.min(1, sim.shake / 12) * 6;
      this.shakeX = (Math.random() - 0.5) * k;
      this.shakeY = (Math.random() - 0.5) * k;
    } else { this.shakeX = 0; this.shakeY = 0; }
    c.fillStyle = pal.ground;
    c.fillRect(0, 0, this.w, this.h);
    c.save();
    c.translate(-camX + this.shakeX, -camY + this.shakeY);
    this.drawGround(camX, camY, pal);
    this.drawShards(sim, pal);
    this.drawWard(sim, pal);
    this.drawAegis(sim, pal, now);
    this.drawShrine(sim, pal, now);
    this.drawEnemies(sim, pal);
    this.drawProjectiles(sim, pal);
    this.drawPlayer(sim, pal, now);
    this.drawFx(sim, pal);
    c.restore();
    if (joystick) this.drawJoystick(joystick, pal);
  }

  private drawGround(camX: number, camY: number, pal: Palette): void {
    const c = this.ctx;
    const step = 128;
    c.strokeStyle = pal.groundLine;
    c.lineWidth = 1;
    c.beginPath();
    for (let x = Math.floor(camX / step) * step; x <= camX + this.w; x += step) { c.moveTo(x, camY); c.lineTo(x, camY + this.h); }
    for (let y = Math.floor(camY / step) * step; y <= camY + this.h; y += step) { c.moveTo(camX, y); c.lineTo(camX + this.w, y); }
    c.stroke();
    c.strokeStyle = pal.bounds;
    c.lineWidth = 6;
    c.strokeRect(0, 0, ARCADE.world.w, ARCADE.world.h);
  }

  private drawShards(sim: ArcadeSim, pal: Palette): void {
    const c = this.ctx;
    c.fillStyle = pal.shard;
    for (const s of sim.shards) {
      if (!s.alive) continue;
      const r = s.xp >= 20 ? 7 : s.xp >= 6 ? 5 : 3.5;
      c.beginPath();
      c.moveTo(s.x, s.y - r); c.lineTo(s.x + r * 0.7, s.y); c.lineTo(s.x, s.y + r); c.lineTo(s.x - r * 0.7, s.y);
      c.closePath();
      c.fill();
    }
  }

  private drawWard(sim: ArcadeSim, pal: Palette): void {
    const p = sim.player;
    if (sim.tick >= p.wardUntil) return;
    const c = this.ctx;
    const pulse = 0.5 + 0.5 * Math.sin(sim.tick / 6);
    c.strokeStyle = pal.ward;
    c.globalAlpha = 0.25 + 0.2 * pulse;
    c.lineWidth = 2;
    c.beginPath(); c.arc(p.wardX, p.wardY, ARCADE.juggernaut.w.radius, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = pal.ward;
    c.beginPath(); c.arc(p.wardX, p.wardY, 7 + pulse * 2, 0, Math.PI * 2); c.fill();
  }

  private drawAegis(sim: ArcadeSim, pal: Palette, now: number): void {
    if (!sim.aegisDrop) return;
    const c = this.ctx;
    const { x, y } = sim.aegisDrop;
    const bob = Math.sin(now / 180) * 4;
    c.fillStyle = pal.aegis;
    c.beginPath();
    c.moveTo(x, y - 16 + bob); c.lineTo(x + 12, y - 8 + bob); c.lineTo(x + 10, y + 8 + bob); c.lineTo(x, y + 16 + bob); c.lineTo(x - 10, y + 8 + bob); c.lineTo(x - 12, y - 8 + bob);
    c.closePath(); c.fill();
    c.strokeStyle = pal.text; c.lineWidth = 1.5; c.stroke();
  }

  private drawShrine(sim: ArcadeSim, pal: Palette, now: number): void {
    const s = sim.shrine;
    if (!s.alive) return;
    const c = this.ctx;
    const pulse = 0.5 + 0.5 * Math.sin(now / 220);
    const left = (s.until - sim.tick) / TICK_HZ;
    c.strokeStyle = pal.greed; c.lineWidth = 2; c.globalAlpha = 0.35 + 0.35 * pulse;
    c.beginPath(); c.arc(s.x, s.y, 34 + pulse * 6, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = left < 8 ? 0.4 + 0.6 * pulse : 1;
    c.fillStyle = pal.greed;
    c.beginPath(); c.moveTo(s.x, s.y - 18); c.lineTo(s.x + 13, s.y); c.lineTo(s.x, s.y + 18); c.lineTo(s.x - 13, s.y); c.closePath(); c.fill();
    c.globalAlpha = 1;
  }

  private drawEnemies(sim: ArcadeSim, pal: Palette): void {
    const c = this.ctx;
    const tick = sim.tick;
    for (const e of sim.enemies) {
      if (!e.alive) continue;
      const r = e.kind.r;
      const flash = tick - e.hitAt < 4;
      c.fillStyle = flash ? pal.text : tick < e.freezeUntil ? pal.frost : pal[TONE_KEY[e.kind.tone]];
      c.beginPath(); c.arc(e.x, e.y, r, 0, Math.PI * 2); c.fill();
      if (tick < e.burnUntil) { c.strokeStyle = pal.fire; c.lineWidth = 2; c.beginPath(); c.arc(e.x, e.y, r + 2.5, 0, Math.PI * 2); c.stroke(); }
      else if (tick < e.chillUntil) { c.strokeStyle = pal.frost; c.lineWidth = 2; c.beginPath(); c.arc(e.x, e.y, r + 2.5, 0, Math.PI * 2); c.stroke(); }
      if (e.kind.elite || e.kind.boss) {
        c.strokeStyle = pal.text; c.lineWidth = e.kind.boss ? 3 : 2;
        c.beginPath(); c.arc(e.x, e.y, r + 5, 0, Math.PI * 2); c.stroke();
        const w = e.kind.boss ? 120 : 48;
        c.fillStyle = pal.hpBg; c.fillRect(e.x - w / 2, e.y - r - 16, w, 5);
        c.fillStyle = pal.hp; c.fillRect(e.x - w / 2, e.y - r - 16, w * Math.max(0, e.hp / e.maxHp), 5);
      }
      if (e.kind.boss && e.slamT > 0) {
        const k = 1 - e.slamT / ARCADE.boss.slamTelegraph;
        c.strokeStyle = pal.telegraph; c.lineWidth = 3; c.globalAlpha = 0.9;
        c.beginPath(); c.arc(e.slamX, e.slamY, ARCADE.boss.slamRadius, 0, Math.PI * 2); c.stroke();
        c.fillStyle = pal.telegraph; c.globalAlpha = 0.18 + 0.3 * k;
        c.beginPath(); c.arc(e.slamX, e.slamY, ARCADE.boss.slamRadius * k, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
      }
    }
  }

  private drawProjectiles(sim: ArcadeSim, pal: Palette): void {
    const c = this.ctx;
    for (const pr of sim.projectiles) {
      if (!pr.alive) continue;
      c.fillStyle = pr.kind === "fire" ? pal.fire : pr.kind === "shard" ? pal.frost : pr.kind === "zap" ? pal.lightning : pal.brute;
      c.beginPath(); c.arc(pr.x, pr.y, pr.r, 0, Math.PI * 2); c.fill();
    }
  }

  private drawPlayer(sim: ArcadeSim, pal: Palette, now: number): void {
    const c = this.ctx;
    const p = sim.player;
    const R = ARCADE.player.r + 4;
    const spinning = sim.tick < p.spinUntil;
    const invuln = sim.tick < p.invulnUntil || p.omniLeft > 0;
    if (spinning) {
      c.save();
      c.translate(p.x, p.y);
      c.rotate((now / 60) % (Math.PI * 2));
      c.strokeStyle = pal.playerRing; c.lineWidth = 4; c.globalAlpha = 0.85;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(0, 0, ARCADE.juggernaut.q.radius - 6, i * 2.1, i * 2.1 + 1.2); c.stroke(); }
      c.globalAlpha = 0.12; c.fillStyle = pal.playerRing;
      c.beginPath(); c.arc(0, 0, ARCADE.juggernaut.q.radius, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    c.globalAlpha = invuln ? 0.55 + 0.45 * Math.abs(Math.sin(now / 80)) : 1;
    c.fillStyle = pal.player;
    c.beginPath(); c.arc(p.x, p.y, R, 0, Math.PI * 2); c.fill();
    if (this.portrait && this.portraitReady) {
      c.save();
      c.beginPath(); c.arc(p.x, p.y, R - 3, 0, Math.PI * 2); c.clip();
      // Портрет Dota — 256×144, берём центральный квадрат.
      const iw = this.portrait.naturalWidth, ih = this.portrait.naturalHeight, side = Math.min(iw, ih);
      c.drawImage(this.portrait, (iw - side) / 2, (ih - side) / 2, side, side, p.x - R + 3, p.y - R + 3, (R - 3) * 2, (R - 3) * 2);
      c.restore();
    }
    c.strokeStyle = p.aegis ? pal.aegis : pal.playerRing;
    c.lineWidth = p.aegis ? 4 : 3;
    c.beginPath(); c.arc(p.x, p.y, R, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 1;
    // Направление взгляда — короткий штрих.
    c.strokeStyle = pal.playerRing; c.lineWidth = 3;
    c.beginPath(); c.moveTo(p.x + p.facingX * (R + 2), p.y + p.facingY * (R + 2)); c.lineTo(p.x + p.facingX * (R + 10), p.y + p.facingY * (R + 10)); c.stroke();
  }

  private drawFx(sim: ArcadeSim, pal: Palette): void {
    const c = this.ctx;
    const tick = sim.tick;
    c.font = "700 13px var(--font-display, sans-serif)";
    c.textAlign = "center";
    for (const f of sim.fx) {
      const age = tick - f.born;
      if (age >= f.dur) continue;
      const k = age / f.dur;
      switch (f.kind) {
        case "hit": case "crit": case "heal": {
          if (f.value <= 0) break;
          c.globalAlpha = 1 - k;
          c.fillStyle = f.kind === "heal" ? pal.heal : f.kind === "crit" ? pal.crit : pal.text;
          c.font = f.kind === "crit" ? "800 16px var(--font-display, sans-serif)" : "700 12px var(--font-display, sans-serif)";
          c.fillText(String(f.value), f.x, f.y - 10 - k * 26);
          break;
        }
        case "slash": {
          c.globalAlpha = 1 - k; c.strokeStyle = pal.playerRing; c.lineWidth = 2.5;
          c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(f.x2, f.y2); c.stroke();
          break;
        }
        case "zap": {
          c.globalAlpha = 1 - k; c.strokeStyle = pal.lightning; c.lineWidth = 2;
          c.beginPath(); c.moveTo(f.x, f.y);
          const mx = (f.x + f.x2) / 2 + (Math.random() - 0.5) * 18, my = (f.y + f.y2) / 2 + (Math.random() - 0.5) * 18;
          c.lineTo(mx, my); c.lineTo(f.x2, f.y2); c.stroke();
          break;
        }
        case "nova": case "burst": {
          c.globalAlpha = (1 - k) * 0.8; c.strokeStyle = f.kind === "burst" ? pal.fire : pal.lightning; c.lineWidth = 3;
          c.beginPath(); c.arc(f.x, f.y, Math.max(1, f.x2 * (0.3 + 0.7 * k)), 0, Math.PI * 2); c.stroke();
          break;
        }
        case "levelup": case "revive": {
          c.globalAlpha = (1 - k); c.strokeStyle = f.kind === "revive" ? pal.aegis : pal.playerRing; c.lineWidth = 4;
          c.beginPath(); c.arc(sim.player.x, sim.player.y, 24 + k * 90, 0, Math.PI * 2); c.stroke();
          break;
        }
        default: break;
      }
    }
    c.globalAlpha = 1;
  }

  private drawJoystick(j: { ox: number; oy: number; x: number; y: number }, pal: Palette): void {
    const c = this.ctx;
    const rect = this.canvas.getBoundingClientRect();
    const ox = j.ox - rect.left, oy = j.oy - rect.top;
    let dx = j.x - j.ox, dy = j.y - j.oy;
    const l = Math.hypot(dx, dy);
    if (l > 56) { dx = dx / l * 56; dy = dy / l * 56; }
    c.strokeStyle = pal.joystick; c.fillStyle = pal.joystick; c.lineWidth = 2;
    c.globalAlpha = 0.5; c.beginPath(); c.arc(ox, oy, 56, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 0.7; c.beginPath(); c.arc(ox + dx, oy + dy, 22, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
  }
}

export function formatClock(tick: number): string {
  const s = Math.floor(tick / TICK_HZ);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export type { Fx };
