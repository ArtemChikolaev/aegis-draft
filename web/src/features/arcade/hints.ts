// Подсказки механик при первой встрече (M24, как советы Dota): аффиксы элиты и серия убийств объяснялись только
// всплывающей подсказкой под курсором — на телефоне и с пада её не увидеть. Карточка в HUD гаснет сама через `HINT_SEC`
// секунд забега (или по крестику); увиденное помнится на устройстве (persist: localStorage, в Telegram — ещё и облако).
import { AFFIX, AFFIX_IDS, type AffixId } from "../../game/arcade/content/enemies.ts";
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
