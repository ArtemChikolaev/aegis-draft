// Звуки ударов героев из файлов Dota 2 (BACKLOG T13.16): `art/sfx/dota/index.json` → набор клипов на героя
// (attack/pre/impact и петля Blade Fury у Juggernaut). Нет клипов у героя — экран играет синтетический
// `sfxArcade`, как раньше. Загрузка ленивая: индекс один раз, буферы — при выборе героя (preloadHeroSfx).
import { preloadSample, sfxLoop, sfxSample } from "../../ui/sound.ts";

interface HeroSfxEntry { attack?: string[]; pre?: string[]; impact?: string[]; spinLoop?: string; spinStop?: string }

const ROOT = `${import.meta.env.BASE_URL}art/sfx/dota/`;
let index: Record<string, HeroSfxEntry> | null = null;
let indexJob: Promise<void> | null = null;

function loadIndex(): void {
  if (index || indexJob || typeof fetch === "undefined") return;
  indexJob = fetch(`${ROOT}index.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, HeroSfxEntry>>) : Promise.reject(new Error(String(r.status)))))
    .then((data) => { index = data; }, () => { index = {}; });
}

const url = (hero: string, file: string) => `${ROOT}${hero}/${file}`;

export function preloadHeroSfx(hero: string): void {
  loadIndex();
  const run = () => {
    const e = index?.[hero];
    if (!e) return;
    for (const f of [...(e.attack ?? []), ...(e.pre ?? []), ...(e.impact ?? [])]) preloadSample(url(hero, f));
    if (e.spinLoop) preloadSample(url(hero, e.spinLoop));
    if (e.spinStop) preloadSample(url(hero, e.spinStop));
  };
  if (index) run(); else indexJob?.then(run);
}

let lastHit = 0;
let hitIndex = 0;

/** Удар героя: true — сыграли сэмпл Dota (или он на подходе), false — клипов нет, играй синтетику. Не чаще раза в 45 мс. */
export function heroHitSfx(hero: string, crit: boolean, now: number): boolean {
  loadIndex();
  const e = index?.[hero];
  const pool = e?.attack?.length ? e.attack : e?.impact?.length ? e.impact : null;
  if (!pool) return false;
  if (now - lastHit < 45) return true;
  lastHit = now;
  hitIndex = (hitIndex + 1) % pool.length;
  sfxSample(url(hero, pool[hitIndex]), crit ? 0.55 : 0.4, crit ? 0.92 : 0.97 + (hitIndex % 3) * 0.03);
  return true;
}

let spinStop: (() => void) | null = null;
let spinHero = "";

/** Петля вихря: включить при старте Blade Fury, выключить по концу; идемпотентно, зовётся каждый кадр. */
export function heroSpinSfx(hero: string, spinning: boolean): void {
  const e = index?.[hero];
  if (spinning && !spinStop && e?.spinLoop) {
    spinStop = sfxLoop(url(hero, e.spinLoop), 0.28);
    spinHero = hero;
  } else if (!spinning && spinStop) {
    spinStop();
    spinStop = null;
    const stop = index?.[spinHero]?.spinStop;
    if (stop) sfxSample(url(spinHero, stop), 0.35);
  }
}

export function resetHeroSfx(): void {
  if (spinStop) { spinStop(); spinStop = null; }
}
