// Источники игрового арта (T11.2, ADR 0003). Правило одно: сначала СВОЁ зеркало, потом чужой
// CDN, потом честное «без картинки».
//
// Почему зеркало первое: только своя статика попадает в офлайн-кэш (чужие ответы приходят opaque
// и кэшировать их нельзя — см. sw.ts), весит в разы меньше и не «пачкает» canvas шеринг-карточки.
// Почему CDN всё-таки остаётся: зеркало пополняется отдельным прогоном `npm run gen:art`, и между
// появлением новой команды в датасете и запуском скрипта её знак берётся с CDN, как раньше.
// Файла нет ни там, ни там — компонент показывает свой фолбэк (монограмму или просто имя).
import { useState } from "react";

const CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react";

/** База приложения: `/` в корне, `/aegis-draft/` под сабпутём Pages. Всегда со слэшем на конце. */
const local = (path: string) => `${import.meta.env.BASE_URL}art/${path}`;

/** Портрет героя по слагу из `heroes.json` (`picture`). */
export function heroArtSources(picture: string): string[] {
  if (!picture) return [];
  return [local(`heroes/${picture}.webp`), `${CDN}/heroes/${picture}.png`];
}

/** Знак команды. `logoUrl` из датасета — абсолютная ссылка на CDN; схему ради зеркала не меняли,
 *  поэтому локальный путь собирается по `teamId`, а `logoUrl` остаётся запасным вариантом. */
export function teamArtSources(teamId: number | undefined, logoUrl: string | undefined): string[] {
  const sources: string[] = [];
  if (teamId !== undefined) sources.push(local(`teams/${teamId}.webp`));
  if (logoUrl) sources.push(logoUrl);
  return sources;
}

/** Иконка предмета по внутреннему имени Dota (значения `ITEM_ART`, см. game/itemArt.ts). */
export function itemArtSources(slug: string, pixel = false): string[] {
  if (!slug) return [];
  // Пиксельная Аркада (Dead Cells-стиль): 32×24 с палитрой из `items_px/`, дальше обычная цепочка.
  return [...(pixel ? [local(`items_px/${slug}.png`)] : []), local(`items/${slug}.webp`), `${CDN}/items/${slug}.png`];
}

/**
 * Первый ещё не сломавшийся источник из списка. `null` — кончились, пора показывать фолбэк.
 *
 * Состояние — список СЛОМАВШИХСЯ адресов, а не индекс: при смене пропса (тот же компонент, другой
 * герой) индекс пришлось бы сбрасывать эффектом, а список сам собой перестаёт совпадать с новыми
 * адресами. Длина списка максимум 2, поэтому include по массиву дешевле Set.
 */
export function useArtSource(sources: string[]): { src: string | null; onError: () => void } {
  const [failed, setFailed] = useState<readonly string[]>([]);
  const src = sources.find((candidate) => !failed.includes(candidate)) ?? null;
  return {
    src,
    onError: () => setFailed((previous) => (src !== null && !previous.includes(src) ? [...previous, src] : previous)),
  };
}
