// Фоновая музыка Аркады из треков Dota 2 (BACKLOG T13.16 срез 3; владелец: «фоновую музыку в тему»).
// Три боевые темы по кругу с кроссфейдом, тема Рошана — пока он жив. HTMLAudio, а не WebAudio: треки длинные,
// стримятся и не декодируются в память; громкость подстроена под тихий master игры. Уважает общий тумблер звука.
import { getVolume, soundEnabled } from "../../ui/sound.ts";

const ROOT = `${import.meta.env.BASE_URL}art/sfx/dota/music/`;
const BATTLE = ["battle_01.mp3", "battle_02.mp3", "battle_03.mp3"];
const BASE_VOLUME = 0.28;
const vol = () => BASE_VOLUME * getVolume("music");
const FADE_MS = 1500;

type Mode = "off" | "battle" | "roshan";
let mode: Mode = "off";
let current: HTMLAudioElement | null = null;
let fading: HTMLAudioElement | null = null;
let battleIndex = -1;
let raf = 0;

function make(file: string, loop: boolean): HTMLAudioElement {
  const a = new Audio(`${ROOT}${file}`);
  a.loop = loop;
  a.preload = "auto";
  a.volume = 0;
  return a;
}

function fadeSwap(next: HTMLAudioElement): void {
  if (fading) { fading.pause(); fading = null; }
  fading = current;
  current = next;
  const start = performance.now();
  cancelAnimationFrame(raf);
  const step = () => {
    const k = Math.min(1, (performance.now() - start) / FADE_MS);
    if (current) current.volume = vol() * k;
    if (fading) fading.volume = vol() * (1 - k);
    if (k < 1) raf = requestAnimationFrame(step);
    else if (fading) { fading.pause(); fading = null; }
  };
  step();
  void next.play().catch(() => { /* автоплей заблокирован до жеста — сыграем при следующем ensure */ });
}

function nextBattle(): void {
  battleIndex = (battleIndex + 1) % BATTLE.length;
  const a = make(BATTLE[battleIndex], false);
  a.addEventListener("ended", () => { if (mode === "battle" && current === a) nextBattle(); });
  fadeSwap(a);
}

/** Держать нужную музыку: зовётся каждый кадр из цикла экрана — дёшево, реагирует на паузу, Рошана и тумблер звука. */
export function ensureMusic(want: Mode): void {
  if (typeof Audio === "undefined") return;
  if (!soundEnabled()) want = "off";
  if (want === mode) {
    if (current && current.paused && want !== "off") void current.play().catch(() => {});
    if (current && !fading && Math.abs(current.volume - vol()) > 0.005) current.volume = vol(); // ползунок в настройках
    return;
  }
  mode = want;
  if (want === "off") { stopMusic(true); return; }
  if (want === "roshan") fadeSwap(make("roshan.mp3", true));
  else nextBattle();
}

export function stopMusic(keepMode = false): void {
  cancelAnimationFrame(raf);
  for (const a of [current, fading]) if (a) { a.pause(); a.src = ""; }
  current = null; fading = null;
  if (!keepMode) mode = "off";
}
