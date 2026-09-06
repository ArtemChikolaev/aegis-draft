// Рендер Arcade на Canvas 2D (T13.2). Читает состояние сима и ничего в него не пишет. Цвета —
// только токены `--arcade-*` из design/tokens.css: снимаются раз в секунду через getComputedStyle
// (canvas не наследует CSS-переменные), поэтому смена темы подхватывается без перемонтирования.
// Тригонометрия здесь разрешена: рендер не участвует в детерминизме.
import type { ArcadeSim } from "../../game/arcade/sim.ts";
import { ARCADE, TICK_HZ } from "../../game/arcade/config.ts";
import type { AbilityKey, Enemy, Fx } from "../../game/arcade/types.ts";

/** Порядок слотов умений — тот же, что в симе (там он приватный). */
const ABILITY_KEYS: readonly AbilityKey[] = ["q", "w", "e", "r"];
import { heroArtSources } from "../../ui/artSource.ts";
import { COSMETIC_BY_ID } from "../../game/arcade/content/cosmetics.ts";
import type { CosmeticSlot } from "../../game/arcade/content/cosmetics.ts";
import { Terrain } from "./terrain.ts";
import { densePixel, pixelScale } from "./pixelMode.ts";
import { drawBurning, drawChilled, drawDust, drawEmberRing, drawFrostMist, drawHeroProjectile, drawHitSparks, drawPixelRing, drawProjectileTrail, drawSparks, drawWeather } from "./particles.ts";
import { drawRig, enemyRig, heroWeapon, type RigParams } from "./rig.ts";
import { FRAMES, HERO_PROJECTILE, HERO_TINT, attackAnim, charSheet, dirOf, dotaDir, dotaSheet, drawCharFrame, drawDotaFrame, drawMonsterFrame, enemyLook, enemySheet, heroLook, hueSheet, setPixelSheets, spriteVersion, type CharAnim } from "./sprites.ts";
import { KIND_BY_INDEX } from "../../game/arcade/sim.ts";
import { gearArt } from "../../game/arcade/content/gear.ts";
import { itemArtSources } from "../../ui/artSource.ts";
import { tileImage } from "./sprites.ts";
import { sec } from "../../game/arcade/config.ts";

const PALETTE_KEYS = [
  "ground", "groundLine", "bounds", "grunt", "brute", "swift", "elite", "boss", "creep", "player", "playerRing", "shard", "fire", "frost", "ember", "smoke", "ice",
  "lightning", "hp", "hpBg", "text", "telegraph", "ward", "heal", "crit", "aegis", "joystick", "greed", "shop", "bounty", "groundNight", "fog", "river", "pit",
  "grassA", "grassB", "dirt", "rock", "tree", "treeDark", "tuft", "limb", "grassNightA", "grassNightB", "dirtNight", "treeNight", "treeNightDark",
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
  /** Экип косметики: варианты по слотам (см. content/cosmetics.ts). Чисто визуально. */
  private cosmetic: Partial<Record<CosmeticSlot, string>> = {};
  /** Самоцвет надетой арканы: поворот тона листа героя в градусах (0 — без самоцвета). */
  private skinHue = 0;
  private trail: { x: number; y: number; t: number }[] = [];
  /** Ландшафт текущего забега (сид + акт) и слежение за движением героя для анимации ходьбы. */
  private terrain: Terrain | null = null;
  private terrainKey = "";
  /** Анимация каста (владелец 2026-09-06: «есть анимации — каст ульты SF, вызов энтов у NP»): до какого момента
   *  играть клип `cast` и с какого счётчика он начался. Считаем по событиям сима, а не по вводу. */
  private castUntil = 0;
  private castFrom = 0;
  private seenCasts = -1;
  /** Пыль рывка: откуда и до какого момента её рисовать (см. drawDust). */
  private dashFrom: { x: number; y: number } | null = null;
  private dashUntil = 0;
  private prevX = 0;
  private prevY = 0;
  private walkPhase = 0;
  private lastNow = 0;
  private movingUntil = 0;

  setCosmetics(equipped: Partial<Record<CosmeticSlot, string>>, styles: Readonly<Record<string, string>> = {}): void {
    const next: Partial<Record<CosmeticSlot, string>> = {};
    let hue = 0;
    for (const [slot, id] of Object.entries(equipped)) {
      const def = id ? COSMETIC_BY_ID[id] : undefined;
      if (!def) continue;
      const style = def.styles?.find((st) => st.id === styles[def.id]);
      // Стиль-текстура — отдельный лист `~<style>` (нет такого листа — heroSheet откатится на базовый),
      // самоцвет — поворот тона готового листа.
      next[slot as CosmeticSlot] = style?.sheet ? `${def.variant}~${style.id}` : def.variant;
      if (slot === "skin" && style?.hue) hue = style.hue;
    }
    this.cosmetic = next;
    this.skinHue = hue;
  }

  /** Лист героя с учётом скина (`<hero>@<skin>`), с падением на базовый лист, пока скин не загрузился или не для этого героя. */
  /** Лист героя: альтернативная форма (Metamorphosis) важнее скина, скин важнее базовой модели. */
  private heroSheet(hero: string, form = false) {
    if (form) { const ds = dotaSheet(`${hero}@meta`); if (ds) return ds; }
    const skin = this.cosmetic.skin;
    if (skin && skin.startsWith(`${hero}@`)) {
      const ds = dotaSheet(skin);
      if (ds) return hueSheet(ds, this.skinHue);
      const bare = skin.split("~")[0];
      if (bare !== skin) { const b = dotaSheet(bare); if (b) return hueSheet(b, this.skinHue); }
    }
    return dotaSheet(hero);
  }

  private tintKey(pal: Palette): string {
    const t = this.cosmetic.tint;
    return t === "fire" ? pal.fire : t === "frost" ? pal.frost : t === "lightning" ? pal.lightning : pal.playerRing;
  }

  /** Пиксельный режим (`pixelMode.ts`): 0 — выключен, N ≥ 1 — CSS-пикселей на арт-пиксель; мир рисуется в буфер 1/N без сглаживания и растягивается nearest. */
  private pixel = 0;
  private pixelCanvas: HTMLCanvasElement | null = null;
  private pixelCtx: CanvasRenderingContext2D | null = null;
  private mainCtx: CanvasRenderingContext2D;
  /** Надписи (урон, SHOP, T1, $) в пиксельном режиме рисуются поверх буфера на полном разрешении — иначе текст мылится. */
  private labels: { text: string; x: number; y: number; font: string; fill: string; alpha: number; align: CanvasTextAlign }[] = [];
  private camSnapX = 0;
  private camSnapY = 0;

  /** Зерно частиц в мировых единицах: два арт-пикселя (как крупные искры Death Must Die), без пиксельного режима — 2. */
  private artPx(): number { return this.pixel >= 1 ? this.pixel * 2 : 2; }

  private text(c: CanvasRenderingContext2D, text: string, x: number, y: number): void {
    if (this.pixel >= 1) this.labels.push({ text, x, y, font: c.font, fill: String(c.fillStyle), alpha: c.globalAlpha, align: c.textAlign });
    else c.fillText(text, x, y);
  }

  constructor(private readonly canvas: HTMLCanvasElement, heroPicture: string) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("canvas 2d unavailable");
    this.ctx = ctx;
    this.mainCtx = ctx;
    this.pixel = pixelScale();
    setPixelSheets(this.pixel >= 1, densePixel(this.pixel));
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
    // Пиксельный проход: подменяем контекст на буфер 1/N CSS-размера без DPR (при факторе 1 — ровно CSS-размер: на Retina это
    // 2 физических пикселя на арт-пиксель), после мира растягиваем nearest.
    if (this.pixel >= 1) {
      const pw = Math.max(1, Math.ceil(this.w / this.pixel)), ph = Math.max(1, Math.ceil(this.h / this.pixel));
      if (!this.pixelCanvas) { this.pixelCanvas = document.createElement("canvas"); this.pixelCtx = this.pixelCanvas.getContext("2d", { alpha: false }); }
      if (this.pixelCanvas.width !== pw || this.pixelCanvas.height !== ph) { this.pixelCanvas.width = pw; this.pixelCanvas.height = ph; }
      if (this.pixelCtx) { this.ctx = this.pixelCtx; this.ctx.setTransform(1 / this.pixel, 0, 0, 1 / this.pixel, 0, 0); this.ctx.imageSmoothingEnabled = false; }
    }
    this.ctx.fillStyle = sim.night ? pal.groundNight : pal.ground;
    this.ctx.fillRect(0, 0, this.w, this.h);
    this.ctx.save();
    if (this.pixel >= 1) {
      // Камера по целым внутренним пикселям: иначе чанки земли и спрайты дрожат и дают швы на полупикселях.
      const P = this.pixel;
      this.camSnapX = Math.round((camX - this.shakeX) / P) * P; this.camSnapY = Math.round((camY - this.shakeY) / P) * P;
      this.labels.length = 0;
      this.ctx.translate(-this.camSnapX, -this.camSnapY);
    } else this.ctx.translate(-camX + this.shakeX, -camY + this.shakeY);
    this.drawGround(sim, camX, camY, pal);
    if (sim.pit) this.drawRiverAndPit(pal);
    this.drawShards(sim, pal);
    this.drawFx(sim, pal, "ground");
    this.drawWard(sim, pal);
    this.drawAegis(sim, pal, now);
    this.drawShrine(sim, pal, now);
    this.drawSpots(sim, pal, now);
    this.drawLoot(sim, pal, now);
    this.drawEnemies(sim, pal);
    this.drawPets(sim, pal);
    this.drawProjectiles(sim, pal);
    this.drawPlayer(sim, pal, now);
    this.drawFx(sim, pal, "top");
    if (sim.night) {
      // Пепел в воздухе (T13.22): рисуем ДО тумана, иначе дальние искры светятся сквозь темноту.
      const camX = Math.max(0, Math.min(sim.player.x - this.w / 2, ARCADE.world.w - this.w));
      const camY = Math.max(0, Math.min(sim.player.y - this.h / 2, ARCADE.world.h - this.h));
      drawWeather(c, camX, camY, this.w, this.h, sim.tick, this.artPx(), pal, 90);
      this.drawNight(sim, pal);
    }
    this.ctx.restore();
    if (this.pixel >= 1 && this.pixelCanvas) {
      this.ctx = this.mainCtx;
      const m = this.mainCtx;
      m.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      m.imageSmoothingEnabled = false;
      m.drawImage(this.pixelCanvas, 0, 0, this.pixelCanvas.width, this.pixelCanvas.height, 0, 0, this.pixelCanvas.width * this.pixel, this.pixelCanvas.height * this.pixel);
      m.imageSmoothingEnabled = true;
      // Надписи — на полном разрешении, в тех же мировых координатах.
      m.save(); m.translate(-this.camSnapX, -this.camSnapY);
      for (const l of this.labels) { m.font = l.font; m.fillStyle = l.fill; m.globalAlpha = l.alpha; m.textAlign = l.align; m.fillText(l.text, l.x, l.y); }
      m.globalAlpha = 1; m.restore();
    }
    if (joystick) this.drawJoystick(joystick, pal);
  }

  private drawGround(sim: ArcadeSim, camX: number, camY: number, pal: Palette): void {
    const c = this.ctx;
    const key = `${sim.seed}:${sim.act}`;
    if (!this.terrain || this.terrainKey !== key) { this.terrain = new Terrain(sim.seed, sim.act); this.terrainKey = key; }
    const night = sim.night;
    this.terrain.spriteVersion = spriteVersion();
    this.terrain.draw(c, camX, camY, this.w, this.h, night
      ? { grassA: pal.grassNightA, grassB: pal.grassNightB, dirt: pal.dirtNight, rock: pal.rock, tree: pal.treeNight, treeDark: pal.treeNightDark, tuft: pal.treeNight }
      : { grassA: pal.grassA, grassB: pal.grassB, dirt: pal.dirt, rock: pal.rock, tree: pal.tree, treeDark: pal.treeDark, tuft: pal.tuft });
    c.strokeStyle = pal.bounds;
    c.lineWidth = 6;
    c.strokeRect(0, 0, ARCADE.world.w, ARCADE.world.h);
  }

  private drawRiverAndPit(pal: Palette): void {
    const c = this.ctx;
    const R = ARCADE.river, P = ARCADE.pit;
    c.fillStyle = pal.river; c.globalAlpha = 0.85;
    c.fillRect(0, R.y - R.halfWidth, ARCADE.world.w, R.halfWidth * 2);
    c.globalAlpha = 1;
    c.fillStyle = pal.pit;
    c.beginPath(); c.arc(P.x, P.y, P.radius, 0, Math.PI * 2); c.fill();
    c.strokeStyle = pal.telegraph; c.lineWidth = 2; c.setLineDash([8, 6]); c.globalAlpha = 0.6;
    c.beginPath(); c.arc(P.x, P.y, P.leash, 0, Math.PI * 2); c.stroke();
    c.setLineDash([]); c.globalAlpha = 1;
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

  /**
   * Призыв на земле. Владелец 2026-09-06: «Terrorblade должен звать иллюзии, а он ставит на пол шарик».
   * Сим остался прежним (один источник урона в точке), меняется только картинка: иллюзии рисуются
   * листом самого героя вполупрозрачно, звери — своим листом (`wolf`, `bear`, `treant`, `hawk`).
   * Умения без `summon` (варды, надгробие, ловушка) остаются кружком с кольцом радиуса.
   */
  private drawWard(sim: ArcadeSim, pal: Palette): void {
    const p = sim.player;
    if (sim.tick >= p.wardUntil) return;
    const c = this.ctx;
    const pulse = 0.5 + 0.5 * Math.sin(sim.tick / 6);
    // Ward-умения бывают двух видов: `damage_ward` (призыв, который бьёт) и `ward` (лечащий тотем).
    // Оба ставят точку в wardX/wardY, поэтому и картинку ищем по обоим.
    const key = ABILITY_KEYS.find((k) => sim.hero.abilities[k].kind === "damage_ward")
      ?? ABILITY_KEYS.find((k) => sim.hero.abilities[k].kind === "ward");
    const ab = key ? sim.hero.abilities[key] : sim.hero.abilities.w;
    c.strokeStyle = pal.ward;
    c.globalAlpha = 0.25 + 0.2 * pulse;
    c.lineWidth = 2;
    c.beginPath(); c.arc(p.wardX, p.wardY, ab.radius ?? 170, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 1;
    const art = ab.summon;
    if (!art) {
      c.fillStyle = pal.ward;
      c.beginPath(); c.arc(p.wardX, p.wardY, 7 + pulse * 2, 0, Math.PI * 2); c.fill();
      return;
    }
    const illusion = art.art === "illusion";
    const ds = illusion ? this.heroSheet(sim.hero.id) : dotaSheet(art.art);
    const n = art.count ?? 1;
    // Цель зова: ближайший враг в радиусе — призыв повёрнут к нему и бьёт, иначе стоит лицом к игроку.
    let tx = p.x, ty = p.y, attacking = false;
    let best = Infinity;
    for (const e of sim.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - p.wardX, e.y - p.wardY);
      if (d < best && d <= (ab.radius ?? 200)) { best = d; tx = e.x; ty = e.y; attacking = true; }
    }
    for (let i = 0; i < n; i++) {
      // Ставим призывы веером вокруг точки зова: иначе они слипаются в один силуэт и прячутся
      // под самим героем (точку зова сим ставит ровно в игрока — трогать её нельзя, это сид и лог).
      const ang = n === 1 ? Math.PI : (i / n) * Math.PI * 2 + Math.PI * 0.75;
      const off = 30;
      const x = p.wardX + Math.cos(ang) * off;
      const y = p.wardY + Math.sin(ang) * off * 0.55;
      if (!ds) {
        c.fillStyle = pal.ward;
        c.beginPath(); c.arc(x, y, 8, 0, Math.PI * 2); c.fill();
        continue;
      }
      const anim = attacking ? "attack" : "idle";
      const frames = ds.meta.anims[anim]?.frames ?? 1;
      const frame = Math.floor(((sim.tick + i * 7) / 60) * ds.meta.fps) % Math.max(1, frames);
      const dir = dotaDir(tx - x, ty - y, ds.meta.dirs);
      // Иллюзия — тот же герой, только полупрозрачный и чуть мельче: тинт превращал её в зелёное пятно.
      drawDotaFrame(c, ds, anim, dir, frame, x, y, illusion ? 0.62 : 1, illusion ? 0.86 : 1);
    }
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

  private drawSpots(sim: ArcadeSim, pal: Palette, now: number): void {
    const c = this.ctx;
    const pulse = 0.5 + 0.5 * Math.sin(now / 200);
    if (sim.shopkeeper.alive) {
      const s = sim.shopkeeper;
      c.fillStyle = pal.shop;
      c.beginPath(); c.arc(s.x, s.y, 16 + pulse * 2, 0, Math.PI * 2); c.fill();
      c.strokeStyle = pal.text; c.lineWidth = 2; c.globalAlpha = 0.6;
      c.beginPath(); c.arc(s.x, s.y, 40, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1;
      c.fillStyle = pal.text; c.font = "800 11px var(--font-display, sans-serif)"; c.textAlign = "center";
      this.text(c, "SHOP", s.x, s.y - 26);
    }
    if (sim.neutralToken.alive) {
      const n = sim.neutralToken;
      c.strokeStyle = pal.text; c.lineWidth = 2; c.setLineDash([3, 3]); c.globalAlpha = 0.9;
      c.beginPath(); c.moveTo(n.x, n.y - 14 - pulse * 2); c.lineTo(n.x + 12, n.y); c.lineTo(n.x, n.y + 14 + pulse * 2); c.lineTo(n.x - 12, n.y); c.closePath(); c.stroke();
      c.setLineDash([]); c.globalAlpha = 1;
      c.fillStyle = pal.text; c.font = "800 10px var(--font-display, sans-serif)"; c.textAlign = "center";
      this.text(c, `T${n.value}`, n.x, n.y - 20);
    }
    if (sim.bounty.alive) {
      const b = sim.bounty;
      c.fillStyle = pal.bounty;
      c.beginPath(); c.arc(b.x, b.y, 12 + pulse * 2, 0, Math.PI * 2); c.fill();
      c.fillStyle = pal.player; c.font = "800 12px var(--font-display, sans-serif)"; c.textAlign = "center";
      this.text(c, "$", b.x, b.y + 4);
    }
  }

  private iconCache = new Map<string, HTMLImageElement>();
  private icon(slug: string): HTMLImageElement | null {
    let el = this.iconCache.get(slug);
    if (!el) { el = new Image(); el.src = itemArtSources(slug)[0]; this.iconCache.set(slug, el); }
    return el.complete && el.naturalWidth > 0 ? el : null;
  }

  /** Сундук (тайл LPC) и предметы на земле — иконка Dota с ореолом редкости. */
  private drawLoot(sim: ArcadeSim, pal: Palette, now: number): void {
    const c = this.ctx;
    const pulse = 0.5 + 0.5 * Math.sin(now / 220);
    if (sim.chest.alive) {
      const ch = tileImage("chests");
      const { x, y } = sim.chest;
      if (ch) { c.imageSmoothingEnabled = false; c.drawImage(ch, 0, 0, 32, 32, x - 24, y - 30, 48, 48); c.imageSmoothingEnabled = true; }
      else { c.fillStyle = pal.aegis; c.fillRect(x - 14, y - 12, 28, 22); }
      c.strokeStyle = pal.aegis; c.globalAlpha = 0.35 + 0.35 * pulse; c.lineWidth = 2;
      c.beginPath(); c.ellipse(x, y + 10, 30 + pulse * 4, 12, 0, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
    }
    for (const g of sim.groundLoot) {
      if (g.until <= 0) continue;
      const color = g.item.rarity === "arcana" ? pal.aegis : g.item.rarity === "exotic" ? pal.lightning : g.item.rarity === "refined" ? pal.frost : pal.text;
      c.strokeStyle = color; c.lineWidth = 2; c.globalAlpha = 0.5 + 0.4 * pulse;
      c.beginPath(); c.ellipse(g.x, g.y + 8, 16, 7, 0, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
      const img = this.icon(gearArt(g.item));
      const bob = Math.sin(now / 200 + g.x) * 2;
      if (img) c.drawImage(img, g.x - 14, g.y - 12 + bob, 28, 20);
      else { c.fillStyle = color; c.fillRect(g.x - 8, g.y - 8 + bob, 16, 12); }
    }
  }

  /** Питомцы «Зверинца»: листы dota_px/{hawk,wolf,bear}; без листа — цветной кружок с обводкой героя. */
  private drawPets(sim: ArcadeSim, pal: Palette): void {
    const c = this.ctx;
    const tick = sim.tick;
    for (const pet of sim.pets) {
      const ds = dotaSheet(pet.kind);
      const attacking = tick - pet.hitAt < 14;
      if (ds) {
        const anim = attacking ? "attack" : "walk";
        const frames = ds.meta.anims[anim]?.frames ?? ds.meta.anims.idle?.frames ?? 1;
        const frame = attacking ? Math.floor(((tick - pet.hitAt) / 14) * frames) : Math.floor((tick / 60) * ds.meta.fps);
        drawDotaFrame(c, ds, anim, dotaDir(pet.facingX, pet.facingY, ds.meta.dirs), frame, pet.x, pet.y + (pet.kind === "hawk" ? -18 : 6));
      } else {
        c.fillStyle = pal.player; c.globalAlpha = 0.9;
        c.beginPath(); c.arc(pet.x, pet.y, pet.kind === "bear" ? 14 : 9, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
      }
    }
  }

  private drawEnemies(sim: ArcadeSim, pal: Palette): void {
    const c = this.ctx;
    const tick = sim.tick;
    for (const e of sim.enemies) {
      if (!e.alive) continue;
      const r = e.kind.r;
      const flash = tick - e.hitAt < 4;
      const tone = pal[TONE_KEY[e.kind.tone]];
      const staticSheet = e.kind.structure || e.kind.id === "tormentor" ? enemySheet(e.kind.id) : null;
      if (staticSheet) {
        // Древний/Tormentor из модели Dota — один кадр idle; размер от радиуса, как у остальных.
        drawDotaFrame(c, staticSheet, "idle", 0, 0, e.x, e.y + r * 0.6, flash ? 0.55 : 1, (e.kind.r * 2) / staticSheet.meta.world > 1.2 ? (e.kind.r * 2) / staticSheet.meta.world : 1);
      } else if (e.kind.structure) {
        c.fillStyle = flash ? pal.text : tone;
        c.fillRect(e.x - r, e.y - r, r * 2, r * 2);
        c.strokeStyle = pal.text; c.lineWidth = 3; c.strokeRect(e.x - r + 6, e.y - r + 6, r * 2 - 12, r * 2 - 12);
      } else if (e.kind.id === "tormentor") {
        c.fillStyle = flash ? pal.text : tone;
        c.beginPath(); c.moveTo(e.x, e.y - r); c.lineTo(e.x + r, e.y); c.lineTo(e.x, e.y + r); c.lineTo(e.x - r, e.y); c.closePath(); c.fill();
      } else {
        const frozen = tick < e.freezeUntil || tick < e.stunUntil;
        const facing: 1 | -1 = sim.player.x >= e.x ? 1 : -1;
        const cd = e.kind.ranged ? e.shotCd : e.contactCd;
        const total = e.kind.ranged ? sec(e.kind.ranged.every) : sec(ARCADE.player.contactEvery);
        const attackT = cd > 0 && total - cd < total * 0.45 ? (total - cd) / (total * 0.45) : -1;
        const speedK = e.kind.speed / 90;
        const moving = !frozen && e.kind.speed > 0;
        const look = enemyLook(e.kind.id);
        let drawn = false;
        const dir = dirOf(sim.player.x - e.x, sim.player.y - e.y);
        // Лист из модели Dota — главнее всего остального.
        const ds = enemySheet(e.kind.id);
        if (ds) {
          const anim = attackT >= 0 ? "attack" : moving ? "walk" : "idle";
          const frames = ds.meta.anims[anim]?.frames ?? ds.meta.anims.walk?.frames ?? 1;
          const frame = attackT >= 0 ? Math.floor(attackT * frames) : Math.floor((tick / 60) * ds.meta.fps * (moving ? speedK : 0.6) + e.id);
          drawn = drawDotaFrame(c, ds, anim, dotaDir(sim.player.x - e.x, sim.player.y - e.y, ds.meta.dirs), frame, e.x, e.y + r * 0.6, flash ? 0.55 : 1, (e.kind.r * 2) / ds.meta.world > 1.2 ? (e.kind.r * 2) / ds.meta.world : 1);
        }
        if (!drawn && look.kind === "char") {
          const anim: CharAnim = attackT >= 0 ? attackAnim(look.spec) : "walk";
          const sheet = charSheet(e.kind.id, look.spec, anim);
          if (sheet) {
            const frame = anim === "walk" ? (moving ? 1 + Math.floor((tick / 60) * 9 * speedK + e.id) % 8 : 0) : Math.floor(attackT * FRAMES[anim]);
            drawCharFrame(c, sheet, frame, dir, e.x, e.y + r * 0.6, look.spec.scale, flash ? 0.55 : 1);
            drawn = true;
          }
        } else if (!drawn && look.kind === "monster") {
          drawn = drawMonsterFrame(c, look.name, moving ? Math.floor((tick / 60) * 6 * speedK + e.id) : 1, dir, e.x, e.y + r * 0.6, flash ? 0.55 : 1);
        }
        if (!drawn) drawRig(c, e.x, e.y + r * 0.6, enemyRig(e.kind.id, tone, pal.limb), {
          facing, walkPhase: (tick / 60) * 7 * speedK + e.id * 1.7, moving, attackT,
          hit: flash, statusTint: tick < e.freezeUntil ? pal.frost : tick < e.burnUntil ? pal.fire : tick < e.chillUntil ? pal.frost : null,
        });
        // Статус поверх спрайта — пиксельные частицы (particles.ts): горение — языки пламени, холод — ледяная крошка;
        // заморозка — ещё и кольцо у ног. Спрайт не перекрашиваем.
        if (drawn) {
          const apx = this.artPx();
          const h = ds ? ds.meta.world * 0.7 : r * 3; // видимый рост силуэта (кадр Dota занят моделью примерно на 70%)
          if (tick < e.burnUntil) drawBurning(c, e.x, e.y + r * 0.6, h, tick, e.id, apx, pal);
          if (tick < e.freezeUntil || tick < e.chillUntil) drawChilled(c, e.x, e.y + r * 0.6, h, tick, e.id, apx, pal);
          if (tick < e.freezeUntil) {
            c.strokeStyle = pal.frost; c.lineWidth = 2; c.globalAlpha = 0.8;
            c.beginPath(); c.ellipse(e.x, e.y + r * 0.6, r * 1.1, r * 0.45, 0, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
          }
        }
      }
      if (e.kind.reflect) { c.strokeStyle = pal.telegraph; c.lineWidth = 2; c.setLineDash([4, 4]); c.beginPath(); c.arc(e.x, e.y, r + 8, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); }
      if (e.kind.elite || e.kind.boss || e.kind.structure) {
        c.strokeStyle = pal.text; c.lineWidth = e.kind.boss || e.kind.structure ? 3 : 2;
        c.beginPath(); c.arc(e.x, e.y, r + 5, 0, Math.PI * 2); c.stroke();
        const w = e.kind.boss || e.kind.structure ? 120 : 48;
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
      // Снаряд автоатаки — свой у героя: лучники шлют стрелу, метатели клинок, стрелки́ пулю, остальные сгусток
      // в цвете героя (владелец 2026-09-06). За огнём/льдом/молнией/ядром — пиксельный хвост (particles.ts).
      if (pr.kind !== "arrow") drawProjectileTrail(c, pr.x, pr.y, pr.vx, pr.vy, pr.r, pr.kind, sim.tick, this.artPx(), pal);
      const tint = pr.kind === "fire" ? pal.fire : pr.kind === "shard" ? pal.frost : pr.kind === "zap" ? pal.lightning : pr.kind === "arrow" ? (pr.fromEnemy ? pal.brute : HERO_TINT[sim.hero.id] ?? pal.playerRing) : pal.brute;
      if (pr.kind === "arrow" && !pr.fromEnemy) {
        drawHeroProjectile(c, pr.x, pr.y, pr.vx, pr.vy, HERO_PROJECTILE[sim.hero.id] ?? "bolt", tint, pal.text, this.artPx());
      } else {
        c.fillStyle = tint;
        c.beginPath(); c.arc(pr.x, pr.y, pr.r, 0, Math.PI * 2); c.fill();
      }
    }
  }

  private drawPlayer(sim: ArcadeSim, pal: Palette, now: number): void {
    const c = this.ctx;
    const p = sim.player;
    const R = ARCADE.player.r + 4;
    const ring = this.tintKey(pal);
    // Альтернативная форма (Metamorphosis и родня): другой лист и красное кольцо у ног — видно, что ульт сработал.
    const inForm = sim.tick < p.formUntil;
    // Клип каста запускаем по счётчику умений сима: он растёт и от автокаста, и от нажатия.
    const castsNow = sim.events.casts + sim.events.ults;
    if (this.seenCasts < 0) this.seenCasts = castsNow;
    else if (castsNow > this.seenCasts) { this.seenCasts = castsNow; this.castUntil = now + 420; this.castFrom = now; }
    this.drawTrail(p.x, p.y, now, pal);
    // Ауры школ — частицами под героем: угольки Radiance, ледяная крошка Skadi, искры Maelstrom (плотность — от ранга).
    {
      const apx = this.artPx();
      const rad = sim.upgradePower("rad_aura");
      if (rad > 0) drawEmberRing(c, p.x, p.y + R * 0.75, 110 * (1 + 0.1 * sim.upgradePower("rad_inferno")), sim.tick, apx, pal, 10 + 6 * rad);
      const ska = sim.upgradePower("ska_aura");
      if (ska > 0) drawFrostMist(c, p.x, p.y + R * 0.75, 120, sim.tick, apx, pal, 8 + 5 * ska);
      const mae = sim.upgradePower("mae_static");
      if (mae > 0) drawSparks(c, p.x, p.y, R * 2.2, sim.tick, apx, pal, 2 + mae);
    }
    const spinning = sim.tick < p.spinUntil;
    const invuln = sim.tick < p.invulnUntil || (p.burstLeft > 0 && sim.hero.abilities.r.kind === "omni");
    const spinR = sim.hero.abilities.q.radius ?? 104;
    if (spinning) {
      c.save();
      c.translate(p.x, p.y);
      c.rotate((now / 60) % (Math.PI * 2));
      c.strokeStyle = ring; c.lineWidth = 4; c.globalAlpha = 0.85;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(0, 0, spinR - 6, i * 2.1, i * 2.1 + 1.2); c.stroke(); }
      c.globalAlpha = 0.12; c.fillStyle = ring;
      c.beginPath(); c.arc(0, 0, spinR, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    // Freezing Field / Shrapnel / Berserker's Call — зоны и бафы других героев.
    if (sim.tick < p.fieldUntil) {
      c.strokeStyle = pal.frost; c.lineWidth = 2; c.globalAlpha = 0.5;
      c.beginPath(); c.arc(p.x, p.y, sim.hero.abilities.r.radius ?? 270, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1;
    }
    if (sim.tick < p.zoneUntil) {
      c.fillStyle = pal.fire; c.globalAlpha = 0.12;
      c.beginPath(); c.arc(p.zoneX, p.zoneY, sim.hero.abilities.q.radius ?? 180, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 0.6; c.strokeStyle = pal.fire; c.lineWidth = 1.5; c.stroke();
      c.globalAlpha = 1;
    }
    if (sim.tick < p.armorBuffUntil) {
      c.strokeStyle = pal.telegraph; c.lineWidth = 3; c.globalAlpha = 0.7;
      c.beginPath(); c.arc(p.x, p.y, R + 8, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1;
    }
    c.globalAlpha = invuln ? 0.55 + 0.45 * Math.abs(Math.sin(now / 80)) : 1;
    // Кольцо выбора у ног (как в Dota) — цвет оттенка косметики / Aegis.
    c.strokeStyle = p.aegis ? pal.aegis : inForm ? pal.crit : ring; c.lineWidth = p.aegis || inForm ? 3 : 2;
    c.beginPath(); c.ellipse(p.x, p.y + R * 0.75, R * 1.05, R * 0.42, 0, 0, Math.PI * 2); c.stroke();
    // Ходьба: движение определяем по смещению между кадрами (сим ввод не отдаёт).
    const dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 0;
    this.lastNow = now;
    const moved = Math.hypot(p.x - this.prevX, p.y - this.prevY);
    // Рывок (Blink, Phantom Strike, Rolling Boulder) сим не помечает отдельно — ловим скачок позиции
    // между кадрами: обычный бег даёт единицы пикселей, телепорт — сотню.
    if (moved > 70) { this.dashFrom = { x: this.prevX, y: this.prevY }; this.dashUntil = now + 280; }
    if (moved > 0.5) this.movingUntil = now + 120;
    const moving = now < this.movingUntil;
    if (moving) this.walkPhase += dt * 11;
    this.prevX = p.x; this.prevY = p.y;
    if (this.dashFrom && now < this.dashUntil) {
      const k = 1 - (this.dashUntil - now) / 280;
      drawDust(c, p.x, p.y + R * 0.75, p.x - this.dashFrom.x, p.y - this.dashFrom.y, k, this.artPx(), pal);
    }
    const atkTotal = sec(p.stats.attackInterval);
    const atkT = p.attackCd > 0 && atkTotal - p.attackCd < atkTotal * 0.45 ? (atkTotal - p.attackCd) / (atkTotal * 0.45) : -1;
    const look = heroLook(sim.hero.kit, HERO_TINT[sim.hero.id] ?? pal.playerRing);
    const heroAnim: CharAnim = spinning || atkT >= 0 ? attackAnim(look) : "walk";
    // Куда смотрит спрайт: в цель, пока идёт удар/выстрел, иначе — по движению (Dead Cells/DMD: ноги бегут, корпус целится).
    const aiming = sim.tick < p.aimUntil;
    const lookX = aiming ? p.aimX : p.facingX, lookY = aiming ? p.aimY : p.facingY;
    const heroDota = this.heroSheet(sim.hero.id, inForm);
    const heroSheet = heroDota ? null : charSheet(`hero:${sim.hero.id}`, look, heroAnim);
    if (heroDota) {
      // Вихрь: свой клип `spin` (attack_spin у Juggernaut) в темпе листа; без него — клип удара, но не
      // чаще 2.4 цикла/с (фидбэк владельца: «крутится слишком быстро» при цикле 90 мс).
      const hasSpin = spinning && !!heroDota.meta.anims.spin;
      const casting = !spinning && now < this.castUntil && !!heroDota.meta.anims.cast;
      const anim = hasSpin ? "spin" : casting ? "cast" : spinning || atkT >= 0 ? "attack" : moving ? "walk" : "idle";
      const frames = heroDota.meta.anims[anim]?.frames ?? heroDota.meta.anims.walk?.frames ?? 1;
      const frame = anim === "spin" ? Math.floor((now / 1000) * heroDota.meta.fps)
        : anim === "cast" ? Math.min(frames - 1, Math.floor(((now - this.castFrom) / 420) * frames))
        : anim === "attack" ? Math.floor((spinning ? (now / 420) % 1 : atkT) * frames)
        : anim === "walk" ? Math.floor(this.walkPhase * 1.6)
        : Math.floor((now / 1000) * heroDota.meta.fps * 0.6);
      drawDotaFrame(c, heroDota, anim, dotaDir(lookX, lookY, heroDota.meta.dirs), frame, p.x, p.y + R * 0.75);
    } else if (heroSheet) {
      const frame = heroAnim === "walk" ? (moving ? 1 + Math.floor(this.walkPhase * 1.3) % 8 : 0) : Math.floor((spinning ? (now / 420) % 1 : atkT) * FRAMES[heroAnim]);
      drawCharFrame(c, heroSheet, frame, dirOf(lookX, lookY), p.x, p.y + R * 0.75, look.scale);
    } else {
      const rig: RigParams = { size: 1.15, body: pal.player, limb: pal.limb, head: pal.player, weapon: heroWeapon(sim.hero.kit) };
      drawRig(c, p.x, p.y + R * 0.75, rig, { facing: lookX >= 0 ? 1 : -1, walkPhase: this.walkPhase, moving, attackT: spinning ? (now / 420) % 1 : atkT, hit: false }, this.portraitReady ? this.portrait : null);
    }
    // Рамка (косметика) — второе кольцо у ног: бронза/серебро одно, золото и immortal — двойное с сиянием.
    const frame = this.cosmetic.frame;
    if (frame) {
      c.strokeStyle = frame === "bronze" ? pal.grunt : frame === "silver" ? pal.text : frame === "gold" ? pal.aegis : pal.lightning;
      c.lineWidth = 2; c.globalAlpha = frame === "immortal" ? 0.5 + 0.5 * Math.abs(Math.sin(now / 300)) : 0.9;
      c.beginPath(); c.ellipse(p.x, p.y + R * 0.75, R * 1.3, R * 0.55, 0, 0, Math.PI * 2); c.stroke();
      if (frame === "gold" || frame === "immortal") { c.beginPath(); c.ellipse(p.x, p.y + R * 0.75, R * 1.5, R * 0.65, 0, 0, Math.PI * 2); c.stroke(); }
    }
    c.globalAlpha = 1;

  }

  private drawTrail(x: number, y: number, now: number, pal: Palette): void {
    const kind = this.cosmetic.trail;
    if (!kind) { this.trail.length = 0; return; }
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - x, last.y - y) > 6) this.trail.push({ x, y, t: now });
    while (this.trail.length && now - this.trail[0].t > 500) this.trail.shift();
    const c = this.ctx;
    const color = kind === "fire" ? pal.fire : kind === "frost" ? pal.frost : kind === "lightning" ? pal.lightning : pal.aegis;
    c.fillStyle = color;
    for (const pt of this.trail) {
      const k = 1 - (now - pt.t) / 500;
      c.globalAlpha = k * 0.5;
      const r = kind === "aegis" ? 3 + 3 * k : 2 + 4 * k;
      c.beginPath(); c.arc(pt.x + (kind === "lightning" ? (Math.random() - 0.5) * 8 : 0), pt.y, r, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
  }

  /** Эффекты, которые лежат НА ЗЕМЛЕ: кольца, круги зон, оседающие тела. Рисуются до сущностей —
   *  иначе кольцо просвечивает сквозь героя (фидбэк владельца 2026-09-06). Остальные (числа урона,
   *  искры попаданий, вспышки) — поверх. */
  private static readonly GROUND_FX = new Set(["nova", "spin", "die", "levelup", "revive"]);

  private drawFx(sim: ArcadeSim, pal: Palette, layer: "ground" | "top"): void {
    const c = this.ctx;
    const tick = sim.tick;
    c.font = "700 13px var(--font-display, sans-serif)";
    c.textAlign = "center";
    for (const f of sim.fx) {
      const age = tick - f.born;
      if (age >= f.dur) continue;
      if (ArcadeRenderer.GROUND_FX.has(f.kind) !== (layer === "ground")) continue;
      const k = age / f.dur;
      switch (f.kind) {
        case "hit": case "crit": case "heal": {
          if (f.value <= 0) break;
          if (f.kind !== "heal") drawHitSparks(c, f.x, f.y, k, f.kind === "crit", f.born, this.artPx(), pal);
          c.globalAlpha = 1 - k;
          c.fillStyle = f.kind === "heal" ? pal.heal : f.kind === "crit" ? pal.crit : pal.text;
          c.font = f.kind === "crit" ? "800 16px var(--font-display, sans-serif)" : "700 12px var(--font-display, sans-serif)";
          this.text(c, String(f.value), f.x, f.y - 10 - k * 26);
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
          const rr = Math.max(1, f.x2 * (0.3 + 0.7 * k));
          c.globalAlpha = (1 - k) * 0.5; c.strokeStyle = f.kind === "burst" ? pal.fire : HERO_TINT[sim.hero.id] ?? pal.lightning; c.lineWidth = 2;
          c.beginPath(); c.arc(f.x, f.y, rr, 0, Math.PI * 2); c.stroke();
          // Нова — в цвете героя (Shadowraze тёмно-красная, Frost Nova ледяная), взрыв — огонь.
          const novaMain = f.kind === "burst" ? pal.fire : HERO_TINT[sim.hero.id] ?? pal.lightning;
          drawPixelRing(c, f.x, f.y, rr, k, f.born, this.artPx(), novaMain, f.kind === "burst" ? pal.ember : pal.text);
          break;
        }
        case "die": {
          const death = this.cosmetic.death;
          c.globalAlpha = (1 - k) * 0.7; c.strokeStyle = death === "nova" ? pal.lightning : pal.text; c.lineWidth = death ? 2 : 1.5;
          const rr = f.x2 + k * f.x2 * (death === "ring" ? 3 : death === "nova" ? 4 : 1.6);
          c.beginPath(); c.arc(f.x, f.y, rr, 0, Math.PI * 2); c.stroke();
          // Смерть: у LPC-персонажей — кадры «hurt» (падение), у остальных — оседающий силуэт.
          const kindId = KIND_BY_INDEX[f.y2];
          const look = kindId ? enemyLook(kindId) : null;
          const dsDeath = kindId ? enemySheet(kindId) : null;
          const hurt = look?.kind === "char" ? charSheet(kindId!, look.spec, "hurt") : null;
          if (dsDeath && dsDeath.meta.anims.death) {
            const fr = dsDeath.meta.anims.death.frames;
            drawDotaFrame(c, dsDeath, "death", 0, Math.min(fr - 1, Math.floor(k * fr)), f.x, f.y + f.x2 * 0.6, 1 - k * 0.3);
          } else if (hurt && look?.kind === "char") {
            drawCharFrame(c, hurt, Math.min(5, Math.floor(k * 6)), 2, f.x, f.y + f.x2 * 0.6, look.spec.scale, 1 - k * 0.3);
          } else {
            c.globalAlpha = (1 - k) * 0.6; c.fillStyle = pal.limb;
            c.beginPath(); c.ellipse(f.x, f.y + f.x2 * 0.5, f.x2 * (1 + k * 0.6), Math.max(1, f.x2 * (0.6 - k * 0.5)), 0, 0, Math.PI * 2); c.fill();
          }
          if (death === "shatter") {
            c.fillStyle = pal.frost;
            for (let i = 0; i < 6; i++) { const a = i * 1.047 + k; c.beginPath(); c.arc(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr, 2, 0, Math.PI * 2); c.fill(); }
          }
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

  /** Ночь: радиальный туман вокруг героя — за радиусом обзора сцена почти чёрная. */
  private drawNight(sim: ArcadeSim, pal: Palette): void {
    const c = this.ctx;
    const p = sim.player;
    const r = ARCADE.night.visibility;
    const grad = c.createRadialGradient(p.x, p.y, r * 0.55, p.x, p.y, r);
    grad.addColorStop(0, "transparent");
    grad.addColorStop(1, pal.fog);
    c.fillStyle = grad;
    c.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    c.fillStyle = pal.fog;
    // Четыре прямоугольника вокруг квадрата обзора — заливка без дорогого evenodd.
    const camX = Math.max(0, Math.min(p.x - this.w / 2, ARCADE.world.w - this.w)), camY = Math.max(0, Math.min(p.y - this.h / 2, ARCADE.world.h - this.h));
    c.fillRect(camX - 20, camY - 20, this.w + 40, Math.max(0, p.y - r - camY + 20));
    c.fillRect(camX - 20, p.y + r, this.w + 40, Math.max(0, camY + this.h - (p.y + r) + 20));
    c.fillRect(camX - 20, p.y - r, Math.max(0, p.x - r - camX + 20), r * 2);
    c.fillRect(p.x + r, p.y - r, Math.max(0, camX + this.w - (p.x + r) + 20), r * 2);
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
