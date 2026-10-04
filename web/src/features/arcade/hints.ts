// Подсказки механик при первой встрече (M24, как советы Dota): аффиксы элиты и серия убийств объяснялись только
// всплывающей подсказкой под курсором — на телефоне и с пада её не увидеть. Карточка в HUD гаснет сама через `HINT_SEC`
// секунд забега (или по крестику); увиденное помнится на устройстве (persist: localStorage, в Telegram — ещё и облако).
import { AFFIX, AFFIX_IDS, type AffixId } from "../../game/arcade/content/enemies.ts";
import { ARCADE } from "../../game/arcade/config.ts";
import type { ArcadeSim } from "../../game/arcade/sim.ts";
import type { NeutralCastId, RuneKind } from "../../game/arcade/types.ts";
import { readCached, writePersisted } from "../../state/persist.ts";

export type ArcadeHint = { kind: "affix"; ids: AffixId[] } | { kind: "streak" };

/** Сколько секунд забега карточка висит в HUD. */
export const HINT_SEC = 8;
const KEY = "aegis-draft.arcade.hints";

/** Увиденные подсказки (`affix.<id>`, `streak`). Битая запись — как пустая: худшее, что будет, — подсказка ещё раз. */
export function loadSeenHints(): Set<string> {
  try {
    const raw: unknown = JSON.parse(readCached(KEY) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveSeenHints(seen: ReadonlySet<string>): void {
  void writePersisted(KEY, JSON.stringify([...seen]));
}

/** Ключи «увиденного» для подсказки: у элиты — по аффиксу, чтобы новый аффикс объяснялся и после знакомых. */
export function hintKeys(hint: ArcadeHint): string[] {
  return hint.kind === "affix" ? hint.ids.map((id) => `affix.${id}`) : ["streak"];
}

/** Что объяснить сейчас: новые аффиксы элиты в строке HUD (все сразу), иначе первую ступень серии; нечего — null. */
export function nextHint(seen: ReadonlySet<string>, affixMask: number, streakTier: number): ArcadeHint | null {
  const ids = AFFIX_IDS.filter((id) => (affixMask & AFFIX[id]) !== 0 && !seen.has(`affix.${id}`));
  if (ids.length > 0) return { kind: "affix", ids };
  if (streakTier > 0 && !seen.has("streak")) return { kind: "streak" };
  return null;
}

// ---- Справочник механик (M25): те же «увиденные», что у подсказок, плюс встречи без карточки ----

/** Умения нейтралов, руны и Древние для справочника — в порядке показа. */
export const CODEX_CASTS: readonly NeutralCastId[] = ["stomp", "clap", "purge", "frost_armor", "fireball"];
export const CODEX_RUNES: readonly RuneKind[] = ["dd", "shield", "arcane", "illusion"];
export const CODEX_ANCIENTS: readonly string[] = ARCADE.ancients.pack;
const ANCIENT_SET = new Set(CODEX_ANCIENTS);

/**
 * Встречи прямо сейчас (ключи «увиденного»): каст нейтрала и Древний в кадре, действующая руна, мульти-убийство. Аффиксы и
 * серию сюда не кладём — их открывает карточка подсказки (nextHint), иначе она бы не показалась.
 */
export function encounterKeys(sim: ArcadeSim): string[] {
  const keys = new Set<string>();
  const p = sim.player, view = 560;
  for (const e of sim.enemies) {
    if (!e.alive || Math.abs(e.x - p.x) > view || Math.abs(e.y - p.y) > view) continue;
    if (e.castT > 0 && e.kind.cast) keys.add(`cast.${e.kind.cast}`);
    if (ANCIENT_SET.has(e.kind.id)) keys.add(`ancient.${e.kind.id}`);
  }
  for (const r of CODEX_RUNES) if (sim.runesTaken[r]) keys.add(`rune.${r}`);
  if (sim.multiKillShown > 0) keys.add("multi");
  return [...keys];
}
