// Генерируется scripts/gen_sheet_index.mjs (npm run gen:sheets-index) — руками не править.
// Хеш содержимого `public/art/sprites/<набор>/index.json`: уходит в адрес запроса индекса, чтобы кэш service worker'а
// не отдавал индекс прошлой сборки.
export const SHEET_INDEX_REV: Readonly<Record<string, string>> = {
  "dota_px": "a16df661c1",
  "dota_px2": "4220cfab12"
};
