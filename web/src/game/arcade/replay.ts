// Реплей и дейлик Аркады (T13.11). Реплей = сид + герой + ранг + акт + версия баланса + упакованный
// input-лог: сим детерминирован, поэтому этого достаточно, чтобы проиграть забег бит-в-бит без
// сервера. Формат — строка `A1~<seed>~<hero>~<rank>~<act>~<ver>~<base64url лог>` (разделитель `~`:
// версия баланса содержит точки, base64url тильды не содержит, в сиде она экранируется); лог пакуется
// байтами (дельта шага varint, mx/my со сдвигом +16, cast, choose+1, act) — ~4 байта на запись.
import { ARCADE_CONFIG_VERSION } from "./config.ts";
import { HEROES, HERO_IDS, type HeroId } from "./content/heroes.ts";
import { MAX_RANK_STEP } from "./content/ranks.ts";
import type { ActId, InputLogEntry } from "./types.ts";
import type { GearItem } from "./content/gear.ts";

export interface ArcadeReplay {
  seed: string;
  hero: HeroId;
  rank: number;
  act: ActId;
  version: string;
  log: InputLogEntry[];
  /** Надетая экипировка на старте (входит в детерминизм). */
  gear: GearItem[];
}

const PREFIX = "A1";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array | null {
  try {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

export function packLog(log: readonly InputLogEntry[]): Uint8Array {
  const out: number[] = [];
  let last = 0;
  for (const [step, mx, my, cast, choose, act] of log) {
    let delta = step - last;
    last = step;
    while (delta >= 0x80) { out.push((delta & 0x7f) | 0x80); delta >>>= 7; }
    out.push(delta);
    out.push(mx + 16, my + 16, cast & 0xff, (choose + 1) & 0xff, (act ?? 0) & 0xff);
  }
  return Uint8Array.from(out);
}

export function unpackLog(bytes: Uint8Array): InputLogEntry[] | null {
  const log: InputLogEntry[] = [];
  let i = 0, step = 0;
  while (i < bytes.length) {
    let delta = 0, shift = 0, byte = 0;
    do {
      if (i >= bytes.length) return null;
      byte = bytes[i++];
      delta |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80);
    if (i + 5 > bytes.length) return null;
    step += delta;
    log.push([step, bytes[i] - 16, bytes[i + 1] - 16, bytes[i + 2], bytes[i + 3] - 1, bytes[i + 4]]);
    i += 5;
  }
  return log;
}

const SEP = "~";
/** Тильда в сиде ломает разделитель — экранируем (encodeURIComponent её не трогает). */
const encodeSeed = (seed: string) => encodeURIComponent(seed).replace(/~/g, "%7E");

export function encodeReplay(replay: ArcadeReplay): string {
  const gear = replay.gear?.length ? toBase64Url(new TextEncoder().encode(JSON.stringify(replay.gear))) : "";
  return [PREFIX, encodeSeed(replay.seed), replay.hero, replay.rank, replay.act, replay.version, toBase64Url(packLog(replay.log)), gear].join(SEP);
}

/** Разбор кода реплея. Кривой ввод → null; чужая версия баланса возвращается как есть — решает вызывающий. */
export function decodeReplay(text: string): ArcadeReplay | null {
  const raw = text.trim().replace(/^.*#arcade=/, "");
  const parts = raw.split(SEP);
  if ((parts.length !== 7 && parts.length !== 8) || parts[0] !== PREFIX) return null;
  const [, seedRaw, hero, rankRaw, act, version, logRaw, gearRaw] = parts;
  if (!HERO_IDS.includes(hero as HeroId)) return null;
  const rank = Number(rankRaw);
  if (!Number.isInteger(rank) || rank < 0 || rank > MAX_RANK_STEP) return null;
  if (act !== "short" && act !== "full" && act !== "dire" && act !== "river") return null;
  const bytes = fromBase64Url(logRaw);
  if (!bytes) return null;
  const log = unpackLog(bytes);
  if (!log) return null;
  let seed: string;
  try { seed = decodeURIComponent(seedRaw); } catch { return null; }
  if (!seed) return null;
  let gear: GearItem[] = [];
  if (gearRaw) {
    const bytes = fromBase64Url(gearRaw);
    if (!bytes) return null;
    try { gear = JSON.parse(new TextDecoder().decode(bytes)) as GearItem[]; } catch { return null; }
    if (!Array.isArray(gear)) return null;
  }
  return { seed, hero: hero as HeroId, rank, act, version, log, gear };
}

export function replayUrl(code: string, origin: string, pathname: string): string {
  return `${origin}${pathname}#arcade=${code}`;
}

export function replayCompatible(replay: ArcadeReplay): boolean {
  return replay.version === ARCADE_CONFIG_VERSION;
}

/** Дейлик Аркады (по §5.14): общий сид дня по UTC, герой дня — детерминированно из даты, полный
 *  акт на Herald. Записи узнаются по префиксу сида. */
export const ARCADE_DAILY_PREFIX = "arcade-daily-";

export function arcadeDailyDateKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function arcadeDaily(now: Date = new Date()): { seed: string; hero: HeroId; rank: number; act: ActId; dateKey: string } {
  const dateKey = arcadeDailyDateKey(now);
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) h = (h * 31 + dateKey.charCodeAt(i)) >>> 0;
  const hero = HERO_IDS[h % HERO_IDS.length];
  void HEROES;
  return { seed: `${ARCADE_DAILY_PREFIX}${dateKey}`, hero, rank: 0, act: "full", dateKey };
}

export function isArcadeDailySeed(seed: string): boolean {
  return seed.startsWith(ARCADE_DAILY_PREFIX);
}
