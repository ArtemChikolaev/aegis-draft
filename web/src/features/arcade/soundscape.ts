// Звуковая картина Аркады из пакета Dota (BACKLOG T13.16 срез 3; scripts/dota_sfx_pack.py → art/sfx/dota/pack/).
// Владелец: «все возможные звуки — мобы, их удары, наши удары, эффекты; чтобы не было гробовой тишины».
// Источник правды о событиях — сим: счётчики `events` и лента `fx` (смерти с видом врага и позицией).
// Здесь только выбор клипа, затухание по расстоянию и лимиты частоты; в сим и реплей ничего не входит.
import type { ArcadeSim } from "../../game/arcade/sim.ts";
import { ENEMY_KINDS } from "../../game/arcade/content/enemies.ts";
import { preloadSample, sfxLoop, sfxSample } from "../../ui/sound.ts";

interface Pack {
  abilities: Record<string, Partial<Record<"q" | "w" | "e" | "r", string[]>>>;
  enemies: Record<string, { attack?: string[]; death?: string[]; aggro?: string[] }>;
  ui: Record<string, string[]>;
  fx: Record<string, string[]>;
}

const ROOT = `${import.meta.env.BASE_URL}art/sfx/dota/pack/`;
let pack: Pack | null = null;
let job: Promise<void> | null = null;
const KIND_IDS = Object.keys(ENEMY_KINDS);

function load(): void {
  if (pack || job || typeof fetch === "undefined") return;
  job = fetch(`${ROOT}index.json`).then((r) => (r.ok ? (r.json() as Promise<Pack>) : Promise.reject(new Error(String(r.status))))).then((d) => { pack = d; }, () => { pack = { abilities: {}, enemies: {}, ui: {}, fx: {} }; });
}

const url = (group: string, file: string) => `${ROOT}${group}/${file}`;
const pick = (pool: string[] | undefined, salt: number) => (pool && pool.length ? pool[salt % pool.length] : null);

/** Предзагрузка: умения героя, все враги, UI и эффекты — ~150 клипов по ~10 КБ, только при входе в забег. */
export function preloadSoundscape(hero: string): void {
  load();
  const run = () => {
    if (!pack) return;
    for (const files of Object.values(pack.abilities[hero] ?? {})) for (const f of files ?? []) preloadSample(url("abilities", f));
    for (const cats of Object.values(pack.enemies)) for (const files of Object.values(cats)) for (const f of files ?? []) preloadSample(url("enemies", f));
    for (const files of Object.values(pack.ui)) for (const f of files) preloadSample(url("ui", f));
    for (const files of Object.values(pack.fx)) for (const f of files) preloadSample(url("fx", f));
  };
  if (pack) run(); else job?.then(run);
}

/** Затухание по расстоянию от героя: рядом — полная громкость, за 700 px — тишина. */
function falloff(sim: ArcadeSim, x: number, y: number): number {
  const d = Math.hypot(x - sim.player.x, y - sim.player.y);
  return d > 700 ? 0 : Math.max(0.15, 1 - d / 700);
}

export class Soundscape {
  private lastBorn = -1;
  private seen = { castQ: 0, castW: 0, castE: 0, castR: 0, hurt: 0, crits: 0, items: 0, level: 1 };
  private last: Record<string, number> = {};
  private salt = 0;
  private radiance: (() => void) | null = null;
  private roshanAlive = false;
  private greedUntil = 0;
  private aegis = false;
  private nextGrunt = 0;
  private primed = false;

  constructor(private hero: string) { load(); preloadSoundscape(hero); }

  private gate(key: string, now: number, ms: number): boolean {
    if (now - (this.last[key] ?? -1e9) < ms) return false;
    this.last[key] = now;
    return true;
  }

  private play(group: string, pool: string[] | undefined, gain: number, rate = 1): boolean {
    const f = pick(pool, this.salt++);
    if (!f) return false;
    sfxSample(url(group, f), gain, rate);
    return true;
  }

  /** Зовётся каждый кадр после шагов сима. Возвращает, какие синтетические звуки экран может не играть. */
  frame(sim: ArcadeSim, now: number, running: boolean): { crit: boolean; hurt: boolean; levelup: boolean; kill: boolean } {
    const handled = { crit: false, hurt: false, levelup: false, kill: false };
    const ev = sim.events;
    if (!this.primed) {
      // Первый кадр: не «догонять» события, случившиеся до подключения (реплей/резюм).
      this.primed = true;
      this.seen = { castQ: ev.castQ, castW: ev.castW, castE: ev.castE, castR: ev.castR, hurt: ev.hurt, crits: ev.crits, items: sim.player.items.length, level: sim.player.level };
      this.lastBorn = sim.tick; this.roshanAlive = !!sim.roshan?.alive; this.greedUntil = sim.greedUntil; this.aegis = sim.player.aegis;
      return handled;
    }
    if (!pack) return handled;
    // Умения героя по кнопкам.
    const ab = pack.abilities[this.hero] ?? {};
    for (const key of ["q", "w", "e", "r"] as const) {
      const counter = `cast${key.toUpperCase()}` as "castQ" | "castW" | "castE" | "castR";
      if (ev[counter] > this.seen[counter]) { this.seen[counter] = ev[counter]; if (this.gate(`ab:${key}`, now, 120)) this.play("abilities", ab[key], key === "r" ? 0.8 : 0.6); }
    }
    // Смерти врагов — из ленты fx (вид и позиция).
    for (const f of sim.fx) {
      if (f.born <= this.lastBorn || f.kind !== "die") continue;
      const id = KIND_IDS[f.value] ?? "_generic";
      const g = falloff(sim, f.x, f.y);
      if (g <= 0) continue;
      const pool = pack.enemies[id]?.death ?? pack.enemies._generic?.death;
      if (this.gate("death", now, 70)) { this.play("enemies", pool, 0.45 * g, 0.94 + (this.salt % 5) * 0.03); handled.kill = true; }
    }
    this.lastBorn = sim.tick;
    // Удар по герою — звук оружия ударившего врага.
    if (ev.hurt > this.seen.hurt) {
      this.seen.hurt = ev.hurt;
      const id = ev.hurtBy >= 0 ? KIND_IDS[ev.hurtBy] : "_generic";
      const pool = pack.enemies[id]?.attack ?? pack.enemies._generic?.attack;
      if (this.gate("hurt", now, 110) && this.play("enemies", pool, id === "roshan" ? 0.8 : 0.5)) handled.hurt = true;
    }
    // Крит героя — брызги.
    if (ev.crits > this.seen.crits) { this.seen.crits = ev.crits; if (this.gate("crit", now, 120)) handled.crit = this.play("fx", pack.fx.crit, 0.45); }
    // Уровень, покупка, руна, Aegis, Рошан.
    if (sim.player.level > this.seen.level) { this.seen.level = sim.player.level; handled.levelup = this.play("ui", pack.ui.levelup, 0.7); }
    if (sim.player.items.length > this.seen.items) { this.play("ui", pack.ui.buy, 0.7); }
    this.seen.items = sim.player.items.length;
    if (sim.greedUntil > this.greedUntil && sim.tick < sim.greedUntil) this.play("ui", pack.ui.rune, 0.7);
    this.greedUntil = sim.greedUntil;
    if (sim.player.aegis && !this.aegis) this.play("ui", pack.ui.itemPickup, 0.8);
    this.aegis = sim.player.aegis;
    const rosh = !!sim.roshan?.alive;
    if (rosh && !this.roshanAlive) { this.play("fx", pack.fx.roshanRoar, 0.9); this.nextGrunt = now + 5000; }
    if (rosh && sim.roshan && now > this.nextGrunt) { this.nextGrunt = now + 6000 + (this.salt % 4) * 1200; this.play("enemies", pack.enemies.roshan?.aggro, 0.6 * falloff(sim, sim.roshan.x, sim.roshan.y)); }
    this.roshanAlive = rosh;
    // Аура Radiance — петля, пока школа взята и забег идёт.
    const wantRadiance = running && !sim.over && sim.upgradePower("rad_aura") > 0;
    if (wantRadiance && !this.radiance) { const f = pick(pack.fx.radianceLoop, 0); if (f) this.radiance = sfxLoop(url("fx", f), 0.12); }
    else if (!wantRadiance && this.radiance) { this.radiance(); this.radiance = null; }
    return handled;
  }

  dispose(): void {
    if (this.radiance) { this.radiance(); this.radiance = null; }
  }
}
