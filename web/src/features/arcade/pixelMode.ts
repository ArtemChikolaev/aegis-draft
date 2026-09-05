// Пиксельный режим Аркады (решение владельца 2026-09-06, ориентир Dead Cells / Death Must Die): мир рисуется во внутреннем
// буфере в N CSS-пикселей на арт-пиксель и растягивается nearest, спрайты берутся из `dota_px2/` (128-px кадры) или `dota_px/`
// (64-px), иконки — из `items_px/`/`abilities_px/`.
// Фактор по умолчанию подбирается так, чтобы арт-пиксель занимал ~2 физических пикселя, как у Death Must Die на 1080p:
// на Retina/телефоне (DPR ≥ 1.5) — фактор 1 (буфер в CSS-разрешении, плотные листы 128 px), на обычном мониторе — 2.
// Владелец 2026-09-06: «оставить пиксельным, но вдвое поднять качество; SF мыльный» — раньше фактор 2 на Retina давал
// 4 физических пикселя на арт-пиксель. `?pixel=0` выключает режим, `?pixel=1..6` задаёт фактор явно (для сравнения).
export function pixelScale(): number {
  if (typeof window === "undefined") return 0;
  const q = new URLSearchParams(window.location.search).get("pixel");
  if (q === null || q === "") return (window.devicePixelRatio || 1) >= 1.5 ? 1 : 2;
  const n = Number(q);
  return n >= 1 && n <= 6 ? Math.floor(n) : 0;
}

/** Плотные листы (`dota_px2/`, кадр 128) нужны только при факторе 1: при 2+ хватает 64-px кадров `dota_px/`. */
export function densePixel(scale: number): boolean {
  return scale === 1;
}
