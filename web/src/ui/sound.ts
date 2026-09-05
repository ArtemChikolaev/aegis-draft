// Звуковой слой v1 (R15.5). Полностью ПРОЦЕДУРНЫЙ WebAudio: ассетов нет вовсе (0 КБ против
// «десятки KB» из требования), лицензий нет, а эскалация питчем — естественное свойство синтеза
// (правило скилла game-feel-juice: питч и слои, не громкость).
//
// Правила слоя:
//  - До первого жеста — тишина и ноль ошибок в консоли (autoplay policy): AudioContext создаётся
//    лениво в unlock-слушателе, каждый вызов play дополнительно пытается resume.
//  - Игра полноценна в тишине: звук усиливает, но не несёт единственный сигнал (a11y). Поэтому
//    любой сбой WebAudio молча глотается — как tgSafe.
//  - Master-тумблер в Settings, persist тем же слоем, что тема/язык/тряска (state/persist.ts).
//    В TMA отдельного «мута клиента» Bot API не даёт (проверено по типам SDK) — управляет
//    только наш тумблер.
//  - Лестница эскалации: deal/buy/reroll — короткие тихие пипы; boss — редкий синг; победа/смерть
//    забега — единственные длинные секвенции (те же две кульминации, что у shake R15.4).
import { useSyncExternalStore } from "react";
import { readCached, writePersisted } from "../state/persist.ts";

const SOUND_KEY = "aegis-draft.sound";
const soundListeners = new Set<() => void>();

export function soundEnabled(): boolean {
  return readCached(SOUND_KEY) !== "off";
}

export function setSoundEnabled(enabled: boolean): void {
  void writePersisted(SOUND_KEY, enabled ? "on" : "off");
  for (const listener of soundListeners) listener();
}

/** Подписка для Settings — тот же паттерн, что useScreenShakeSetting. */
export function useSoundSetting(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(
    (listener) => {
      soundListeners.add(listener);
      return () => soundListeners.delete(listener);
    },
    soundEnabled,
    () => true,
  );
  return [enabled, setSoundEnabled];
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      // Общий уровень сознательно тихий: звук — подложка отклика, не саундтрек.
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return null; // WebAudio нет (старый webview) — играем в тишине
    }
  }
  return ctx;
}

/** Разлочить аудио первым жестом. Зовётся один раз из main.tsx; слушатели снимаются, как только
 *  контекст реально заиграл. `pointerdown` + `keydown`: жест мыши/тача/клавиатуры равноправны. */
export function initSoundUnlock(): void {
  if (typeof window === "undefined") return;
  const unlock = () => {
    const audio = ensureContext();
    if (!audio) {
      remove();
      return;
    }
    void audio.resume().then(() => {
      if (audio.state === "running") remove();
    }).catch(() => {});
  };
  const remove = () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

/** Готовый к игре контекст либо null (выключено тумблером / не разлочен / нет WebAudio). */
function readyContext(): AudioContext | null {
  if (!soundEnabled() || !ctx || !master) return null;
  if (ctx.state !== "running") {
    void ctx.resume().catch(() => {});
    return null; // этот вызов пропускаем — resume асинхронный, следующий сыграет
  }
  return ctx;
}

interface Voice {
  /** Форма волны; "noise" — буфер белого шума через bandpass. */
  wave: OscillatorType | "noise";
  freq: number;
  /** Конечная частота (глиссандо/свип); по умолчанию — freq. */
  freqTo?: number;
  /** Пиковая громкость голоса. */
  gain: number;
  /** Длительность до полного затухания, сек. */
  duration: number;
  /** Смещение старта от «сейчас», сек. */
  at?: number;
  /** Полоса bandpass для шума (Q); для осцилляторов не используется. */
  q?: number;
}

let noiseBuffer: AudioBuffer | null = null;
function noise(audio: AudioContext): AudioBuffer {
  if (!noiseBuffer || noiseBuffer.sampleRate !== audio.sampleRate) {
    noiseBuffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
    const channel = noiseBuffer.getChannelData(0);
    for (let i = 0; i < channel.length; i += 1) channel[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/** Сыграть один голос. Все звуки собраны из таких голосов — экспоненциальный спад без щелчков. */
function voice(v: Voice): void {
  const audio = readyContext();
  if (!audio || !master) return;
  try {
    const start = audio.currentTime + (v.at ?? 0);
    const stop = start + v.duration;
    const envelope = audio.createGain();
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(v.gain, start + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, stop);
    envelope.connect(master);

    if (v.wave === "noise") {
      const source = audio.createBufferSource();
      source.buffer = noise(audio);
      source.loop = true;
      const band = audio.createBiquadFilter();
      band.type = "bandpass";
      band.Q.value = v.q ?? 1.4;
      band.frequency.setValueAtTime(v.freq, start);
      if (v.freqTo) band.frequency.exponentialRampToValueAtTime(v.freqTo, stop);
      source.connect(band);
      band.connect(envelope);
      source.start(start);
      source.stop(stop + 0.02);
    } else {
      const osc = audio.createOscillator();
      osc.type = v.wave;
      osc.frequency.setValueAtTime(v.freq, start);
      if (v.freqTo) osc.frequency.exponentialRampToValueAtTime(v.freqTo, stop);
      osc.connect(envelope);
      osc.start(start);
      osc.stop(stop + 0.02);
    }
  } catch {
    /* звук — не сигнал: любой сбой WebAudio глотаем */
  }
}

/** Полтона вверх от базовой частоты — эскалация питчем (приём Balatro). */
const semitone = (base: number, n: number) => base * 2 ** (n / 12);

/* ─── Набор v1 — маленький и семантичный ─── */

/** Шелест раздачи: пип на карту, питч растёт с индексом. `delayMs` — задержка входа карты
 *  (совпадает с CSS-стаггером Dealt): звук и движение — один ритм. */
export function sfxDeal(index: number, delayMs: number): void {
  voice({ wave: "noise", freq: semitone(950, index), gain: 0.05, duration: 0.06, q: 2.2, at: delayMs / 1000 });
}

/** Покупка: короткий щелчок + тональный подтверждающий блип. */
export function sfxBuy(): void {
  voice({ wave: "noise", freq: 2400, gain: 0.05, duration: 0.03, q: 1 });
  voice({ wave: "triangle", freq: 660, freqTo: 880, gain: 0.07, duration: 0.09, at: 0.015 });
}

/** Реролл: свип шума вверх — «перетасовали». */
export function sfxReroll(): void {
  voice({ wave: "noise", freq: 500, freqTo: 1900, gain: 0.055, duration: 0.16, q: 1.1 });
}

/** Короткие стинги reveal-строк своей команды и синг босса. Win/loss — два тона (вверх/вниз);
 *  boss — низкий расстроенный интервал, редкое событие по лестнице эскалации. */
export function sfxSting(kind: "win" | "loss" | "boss"): void {
  if (kind === "win") {
    voice({ wave: "sine", freq: 523.25, gain: 0.06, duration: 0.1 });
    voice({ wave: "sine", freq: 659.25, gain: 0.06, duration: 0.14, at: 0.08 });
  } else if (kind === "loss") {
    voice({ wave: "sine", freq: 392, gain: 0.055, duration: 0.1 });
    voice({ wave: "sine", freq: 311.13, gain: 0.055, duration: 0.16, at: 0.08 });
  } else {
    voice({ wave: "sawtooth", freq: 98, gain: 0.05, duration: 0.45 });
    voice({ wave: "sawtooth", freq: 103.8, gain: 0.05, duration: 0.45 });
  }
}

/* ─── Аркада (T13.10): бой в реальном времени — звуки короткие, тихие и с троттлингом на вид,
   иначе 20 ударов в секунду превращаются в шум. Питч удара «плавает» по индексу — живее, чем
   один и тот же пип. ─── */
const arcadeLast: Record<string, number> = {};
const ARCADE_MIN_GAP_MS: Record<string, number> = { hit: 70, crit: 120, cast: 60, ult: 200, hurt: 160, levelup: 300, kill: 90, elite: 300, pickup: 50 };
let arcadeHitIndex = 0;

export function sfxArcade(kind: "hit" | "crit" | "cast" | "ult" | "hurt" | "levelup" | "kill" | "elite" | "pickup"): void {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - (arcadeLast[kind] ?? -1e9) < ARCADE_MIN_GAP_MS[kind]) return;
  arcadeLast[kind] = now;
  switch (kind) {
    case "hit": arcadeHitIndex = (arcadeHitIndex + 1) % 5; voice({ wave: "noise", freq: semitone(1500, arcadeHitIndex * 2), gain: 0.03, duration: 0.035, q: 1.6 }); break;
    case "crit": voice({ wave: "noise", freq: 900, freqTo: 2600, gain: 0.05, duration: 0.07, q: 1.2 }); voice({ wave: "square", freq: 1046.5, gain: 0.03, duration: 0.05 }); break;
    case "cast": voice({ wave: "triangle", freq: 440, freqTo: 880, gain: 0.05, duration: 0.09 }); break;
    case "ult": voice({ wave: "sawtooth", freq: 110, freqTo: 55, gain: 0.06, duration: 0.35 }); voice({ wave: "triangle", freq: 660, freqTo: 1320, gain: 0.05, duration: 0.18, at: 0.05 }); break;
    case "hurt": voice({ wave: "noise", freq: 260, freqTo: 120, gain: 0.06, duration: 0.12, q: 0.8 }); break;
    case "levelup": [659.25, 783.99, 1046.5].forEach((freq, i) => voice({ wave: "triangle", freq, gain: 0.06, duration: 0.14, at: i * 0.07 })); break;
    case "kill": voice({ wave: "noise", freq: 700, freqTo: 300, gain: 0.025, duration: 0.05, q: 1.5 }); break;
    case "elite": voice({ wave: "sawtooth", freq: 196, freqTo: 98, gain: 0.06, duration: 0.3 }); voice({ wave: "noise", freq: 1200, freqTo: 400, gain: 0.05, duration: 0.2, q: 1 }); break;
    case "pickup": voice({ wave: "sine", freq: 1760, gain: 0.02, duration: 0.03 }); break;
    default: break;
  }
}

/** Тик выплаты в секвенции «этап пройден» (R15.2): питч растёт со строкой. */
export function sfxCashTick(step: number, delayMs: number): void {
  voice({ wave: "sine", freq: semitone(720, step * 2), gain: 0.06, duration: 0.07, at: delayMs / 1000 });
}

/** Кульминации забега — те же две, что у shake (R15.4): Aegis взят / смерть. Единственные
 *  «длинные» звуки слоя. */
export function sfxVerdict(kind: "won" | "lost"): void {
  if (kind === "won") {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      voice({ wave: "triangle", freq, gain: 0.07, duration: 0.22, at: i * 0.11 });
    });
  } else {
    voice({ wave: "triangle", freq: 220, freqTo: 174.61, gain: 0.07, duration: 0.5 });
    voice({ wave: "triangle", freq: 146.83, freqTo: 110, gain: 0.06, duration: 0.7, at: 0.3 });
  }
}

// ---- Сэмплы (AAC/m4a из файлов Dota 2, см. web/scripts/dota_sounds.sh) ----
// Кэш декодированных буферов по URL; первый вызов только запускает загрузку и молчит — выстрел не
// ждёт сети, а следующий удар уже звучит. Отсутствующий файл (404/ошибка декодирования) помечается
// null и больше не запрашивается.
const samples = new Map<string, AudioBuffer | null | Promise<void>>();

export function preloadSample(url: string): void {
  const audio = ensureContext();
  if (!audio || samples.has(url)) return;
  const job = fetch(url)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((buf) => audio.decodeAudioData(buf))
    .then((decoded) => { samples.set(url, decoded); }, () => { samples.set(url, null); });
  samples.set(url, job);
}

/** Сыграть сэмпл; `rate` — лёгкая вариация тона, чтобы серия ударов не звучала как один файл. Вернёт false, если буфер ещё не готов. */
export function sfxSample(url: string, gain = 0.4, rate = 1, at = 0): boolean {
  if (!soundEnabled()) return true;
  const audio = ensureContext();
  if (!audio || !master) return true;
  const buf = samples.get(url);
  if (buf === undefined) { preloadSample(url); return false; }
  if (!buf || buf instanceof Promise) return buf === null;
  const src = audio.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = audio.createGain();
  g.gain.value = gain;
  src.connect(g); g.connect(master);
  src.start(audio.currentTime + at);
  return true;
}

/** Длительность декодированного сэмпла в секундах (0, если ещё не загружен): нужна голосовому каналу, чтобы реплики не накладывались. */
export function sampleDuration(url: string): number {
  const buf = samples.get(url);
  return buf && !(buf instanceof Promise) ? buf.duration : 0;
}

/** Зацикленный сэмпл (Blade Fury): вернёт stop() с коротким затуханием; null, если буфер не готов. */
export function sfxLoop(url: string, gain = 0.3): (() => void) | null {
  if (!soundEnabled()) return () => {};
  const audio = ensureContext();
  if (!audio || !master) return () => {};
  const buf = samples.get(url);
  if (buf === undefined) { preloadSample(url); return null; }
  if (!buf || buf instanceof Promise) return null;
  const src = audio.createBufferSource();
  src.buffer = buf; src.loop = true;
  const g = audio.createGain();
  g.gain.value = gain;
  src.connect(g); g.connect(master);
  src.start();
  return () => { const t = audio.currentTime; g.gain.setValueAtTime(gain, t); g.gain.linearRampToValueAtTime(0.0001, t + 0.12); src.stop(t + 0.13); };
}
