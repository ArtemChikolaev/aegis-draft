// Звуки ударов героев из файлов Dota 2 (BACKLOG T13.16): `art/sfx/dota/index.json` → набор клипов на героя
// (attack/pre/impact и петля Blade Fury у Juggernaut). Нет клипов у героя — экран играет синтетический
// `sfxArcade`, как раньше. Загрузка ленивая: индекс один раз, буферы — при выборе героя (preloadHeroSfx).
import { preloadSample, sampleDuration, sfxLoop, sfxSample } from "../../ui/sound.ts";

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

/** Слой попадания поверх свиста удара героя (в Dota удар = замах + удар по плоти): клинок / тяжёлое / тупое; у стрелков — их impact. */
const IMPACT: Record<string, "blade" | "heavy" | "blunt" | "light" | "none"> = {
  juggernaut: "blade", phantom_assassin: "blade", anti_mage: "blade", faceless_void: "blunt", axe: "heavy", sven: "heavy", tidehunter: "heavy",
  ursa: "blunt", bristleback: "blunt",
  // Стрелки: у кого есть свой impact в файлах Dota — он (см. else-ветка), у остальных — лёгкий удар снаряда по плоти.
  crystal_maiden: "none", sniper: "none", lich: "none", lion: "none", pugna: "none", drow_ranger: "none", lina: "none",
  zeus: "light", windranger: "light", storm_spirit: "light", leshrac: "light", shadow_fiend: "light", invoker: "light", mirana: "light", clinkz: "light",
  wraith_king: "heavy", dragon_knight: "heavy", kunkka: "blade", necrophos: "light", razor: "light", venomancer: "light", witch_doctor: "light", luna: "light",
  earthshaker: "heavy", bloodseeker: "blade", riki: "blade", queen_of_pain: "light", viper: "light", ogre_magi: "blunt", huskar: "light", slardar: "blunt",
};

/** Удар героя: true — сыграли сэмпл Dota (или он на подходе), false — клипов нет, играй синтетику. Не чаще раза в 45 мс. */
export function heroHitSfx(hero: string, crit: boolean, now: number): boolean {
  loadIndex();
  const e = index?.[hero];
  const pool = e?.attack?.length ? e.attack : e?.impact?.length ? e.impact : null;
  const layer = IMPACT[hero] ?? "none";
  // У части героев в vpk нет свиста удара (Slardar, Ogre Magi): играем хотя бы слой попадания из Dota, а не синтетику.
  if (!pool && layer === "none") return false;
  if (now - lastHit < 45) return true;
  lastHit = now;
  if (!pool) {
    hitIndex = (hitIndex + 1) % 3;
    sfxSample(`${ROOT}shared/${layer}_${1 + hitIndex}.m4a`, crit ? 0.6 : 0.45, crit ? 0.9 : 0.97 + hitIndex * 0.03);
    return true;
  }
  hitIndex = (hitIndex + 1) % pool.length;
  sfxSample(url(hero, pool[hitIndex]), crit ? 0.7 : 0.55, crit ? 0.92 : 0.97 + (hitIndex % 3) * 0.03);
  if (layer !== "none") sfxSample(`${ROOT}shared/${layer}_${1 + (hitIndex % 3)}.m4a`, crit ? 0.5 : 0.35, crit ? 0.9 : 1, 0.03);
  else if (e?.impact?.length && pool !== e.impact) sfxSample(url(hero, e.impact[hitIndex % e.impact.length]), 0.4, 1, 0.05);
  return true;
}

// ---- Реплики героев (voice/<hero>/<cat>_N.mp3): один голосовой канал, категории с шансом и перезарядкой ----
export type VoiceCat = "spawn" | "move" | "attack" | "kill" | "level" | "death" | "pain" | "ability";
type VoiceIndex = Record<string, Partial<Record<VoiceCat, string[]>>>;
let voice: VoiceIndex | null = null;
let voiceJob: Promise<void> | null = null;
let voiceBusyUntil = 0;
const voiceCd: Partial<Record<VoiceCat, number>> = {};
const voiceIdx: Partial<Record<VoiceCat, number>> = {};
const vurl = (hero: string, file: string) => `${ROOT}voice/${hero}/${file}`;

function loadVoice(): void {
  if (voice || voiceJob || typeof fetch === "undefined") return;
  voiceJob = fetch(`${ROOT}voice/index.json`)
    .then((r) => (r.ok ? (r.json() as Promise<VoiceIndex>) : Promise.reject(new Error(String(r.status)))))
    .then((data) => { voice = data; }, () => { voice = {}; });
}

/** Ключ озвучки: скин со своими репликами (`hero@skin` в индексе) или базовый герой (арканы без отдельной озвучки). */
function voiceKey(hero: string): string {
  const has = (k: string) => { const e = voice?.[k]; return !!e && Object.values(e).some((files) => files && files.length > 0); };
  if (has(hero)) return hero;
  const base = hero.split("@")[0];
  return has(base) ? base : hero;
}

export function preloadHeroVoice(hero: string): void {
  loadVoice();
  const run = () => { const key = voiceKey(hero); const e = voice?.[key]; if (!e) return; for (const files of Object.values(e)) for (const f of files ?? []) preloadSample(vurl(key, f)); };
  if (voice) run(); else voiceJob?.then(run);
}

/**
 * Сказать реплику категории: не поверх другой реплики, не чаще `cooldownMs` на категорию, с вероятностью `chance`.
 * Случайность — UI-шная (Math.random), в сим и реплей не входит. Возвращает true, если реплика пошла.
 */
export function heroVoice(hero: string, cat: VoiceCat, now: number, chance = 1, cooldownMs = 0): boolean {
  loadVoice();
  const key = voiceKey(hero);
  const pool = voice?.[key]?.[cat];
  if (!pool?.length) return false;
  if (now < voiceBusyUntil || now < (voiceCd[cat] ?? 0)) return false;
  if (chance < 1 && Math.random() > chance) { voiceCd[cat] = now + cooldownMs * 0.5; return false; }
  const i = ((voiceIdx[cat] ?? -1) + 1 + Math.floor(Math.random() * Math.max(1, pool.length - 1))) % pool.length;
  voiceIdx[cat] = i;
  const u = vurl(key, pool[i]);
  if (!sfxSample(u, 0.9, 1, 0, "voice")) return false;
  const dur = sampleDuration(u) || 2;
  voiceBusyUntil = now + dur * 1000 + 250;
  voiceCd[cat] = now + cooldownMs;
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
  voiceBusyUntil = 0;
  for (const k of Object.keys(voiceCd) as VoiceCat[]) delete voiceCd[k];
}
