// Пиксельный режим Аркады (решение владельца 2026-09-06, ориентир Dead Cells): мир рисуется во внутреннем буфере
// в N раз меньше и растягивается nearest, спрайты берутся из `dota_px/`, иконки — из `items_px/`/`abilities_px/`.
// По умолчанию включён (масштаб 2); `?pixel=0` выключает, `?pixel=3` — крупнее пиксель (для сравнения).
export function pixelScale(): number {
  if (typeof window === "undefined") return 0;
  const q = new URLSearchParams(window.location.search).get("pixel");
  if (q === null || q === "") return 2;
  const n = Number(q);
  return n >= 2 && n <= 6 ? Math.floor(n) : 0;
}
