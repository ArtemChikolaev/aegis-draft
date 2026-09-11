// Регистрация обликов после рендера (2026-09-12): строки манифестов px2/px (если их ещё нет), запись в COSMETICS
// (exotic, `skin_<hero>_<set>`) и строки RU/EN в i18n. Идемпотентно: уже заведённое пропускается.
//   npx tsx scripts/dota_register_skins.mts <rows_px2.tsv> <rows_px.tsv>
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const [px2Rows, pxRows] = process.argv.slice(2);
const MAN2 = "scripts/blender/dota_manifest_px2.tsv", MAN1 = "scripts/blender/dota_manifest_px.tsv";
const COS = "src/game/arcade/content/cosmetics.ts", I18N = "src/i18n/core.ts";
const SPR2 = "public/art/sprites/dota_px2", SPR1 = "public/art/sprites/dota_px";

const rows = (f: string) => readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#"));
const appendRows = (man: string, add: string[]) => {
  const cur = readFileSync(man, "utf8");
  const have = new Set(cur.split("\n").map((l) => l.split("\t")[0]));
  const fresh = add.filter((l) => !have.has(l.split("\t")[0]));
  if (fresh.length) writeFileSync(man, cur.replace(/\n?$/, "\n") + fresh.join("\n") + "\n");
  return fresh.length;
};
const title = (s: string) => s.split("_").filter(Boolean).map((w) => (/^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1))).join(" ");

const r2 = rows(px2Rows), r1 = rows(pxRows);
const ids = r2.map((l) => l.split("\t")[0]);
const missing = ids.filter((id) => !existsSync(`${SPR2}/${id}.webp`) || !existsSync(`${SPR1}/${id}.webp`));
if (missing.length) { console.error(`нет листов (px2+px) у: ${missing.join(" ")} — сначала рендер`); process.exit(1); }
console.log(`манифест px2: +${appendRows(MAN2, r2)}, px: +${appendRows(MAN1, r1)}`);

let cos = readFileSync(COS, "utf8");
let i18n = readFileSync(I18N, "utf8");
const cosLines: string[] = [], ru: string[] = [], en: string[] = [];
for (const id of ids) {
  const [hero, skin] = id.split("@");
  const cid = `skin_${hero}_${skin}`.replace(/[^a-z0-9_]/g, "_");
  if (cos.includes(`id: "${cid}"`)) continue;
  cosLines.push(`  { id: "${cid}", slot: "skin", rarity: "exotic", variant: "${id}", hero: "${hero}" },`);
  if (!i18n.includes(`"arcade.cosmetic.${cid}"`)) {
    ru.push(`  "arcade.cosmetic.${cid}": "Сет «${title(skin)}»",`);
    en.push(`  "arcade.cosmetic.${cid}": "${title(skin)} set",`);
  }
}
if (cosLines.length) {
  const start = cos.indexOf("export const COSMETICS");
  const end = cos.indexOf("\n];", start);
  cos = cos.slice(0, end) + "\n" + cosLines.join("\n") + cos.slice(end);
  writeFileSync(COS, cos);
}
if (ru.length) {
  const lines = i18n.split("\n");
  const idx = lines.map((l, i) => (l.includes('"arcade.cosmetic.skin_') ? i : -1)).filter((i) => i >= 0);
  const mid = Math.floor(lines.length / 2);
  const ruAnchor = idx.filter((i) => i < mid).pop()!, enAnchor = idx[idx.length - 1];
  lines.splice(enAnchor + 1, 0, ...en);
  lines.splice(ruAnchor + 1, 0, ...ru);
  writeFileSync(I18N, lines.join("\n"));
}
console.log(`косметика: +${cosLines.length}, строк i18n: +${ru.length}×2`);
