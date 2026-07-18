/**
 * Канонические breakpoints (px). Единый источник с design/breakpoints.css.
 * В CSS @media копируй эти числа — var() в media queries не работает.
 *
 * sm — phone; md — узкий; lg — tablet / слом двух колонок.
 */
export const BP = { sm: 430, md: 680, lg: 980 } as const;

export type Breakpoint = keyof typeof BP;

/** Ширина, на которой раскладка уже схлопнута в одну колонку (совпадает с `@media max-width: lg`). */
export function isNarrowViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia(`(max-width: ${BP.lg}px)`).matches;
}
