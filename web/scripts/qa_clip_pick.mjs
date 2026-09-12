// Аудит выбора клипов (2026-09-12, Alchemist бегал с мечами: ряд walk получил ability_4_run — бег Chemical Rage).
// Для каждой строки манифеста реплицирует pick_action из scripts/blender/render_dota_sprites.py по клипам
// экспортированного glb (~/dota-export/<id>/models/…/*.glb) и печатает, какой клип попадёт в каждый ряд.
// Подозрительные — с токенами состояния способности/вариаций (ability, haste, injured, versus, taunt, @…).
//   node scripts/qa_clip_pick.mjs [manifest.tsv] [--all]   (--all печатает все ряды, без него — только подозрительные и отсутствующие)
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const argv = process.argv.slice(2);
const manifest = argv.find((a) => !a.startsWith("--")) ?? "scripts/blender/dota_manifest_px2.tsv";
const all = argv.includes("--all");
// Списки — копия pick_action; менять синхронно с render_dota_sprites.py.
const SOFT = ["ability", "haste", "injured", "showoff", "_alt", "versus", "turns", "taunt", "spawn", "agg", "green", "copy", "slide", "gesture", "sidestep", "loop_end", "_end", "_to_", "stop", "start", "heavy"];
const HARD = ["portrait", "loadout", "lookframe", "_faces_dup", "_cc_20", "basher", "ward", "pact", "effigy", "channel", "debut", "mvp", "screen", "_dig", "burrow"];
const SUSPECT = /ability|haste|injured|versus|taunt|showoff|loadout|portrait|spawn|death|die/i;

function pick(names, key) {
  key = key.toLowerCase();
  const exact = names.find((n) => n.toLowerCase() === key); if (exact) return exact;
  let cands = names.filter((n) => n.toLowerCase().includes(key) && !HARD.some((h) => n.toLowerCase().includes(h)));
  if (!cands.length) cands = names.filter((n) => n.toLowerCase().includes(key));
  if (!cands.length) return null;
  const score = (n0) => { const n = n0.toLowerCase(); return [SOFT.filter((t) => n.includes(t)).length, n.startsWith("@") ? 1 : 0, n.startsWith(key) ? 0 : 1, n.length]; };
  cands.sort((a, b) => { const x = score(a), y = score(b); for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
  return cands[0];
}
function anims(glb) { const b = readFileSync(glb); const len = b.readUInt32LE(12); const j = JSON.parse(b.toString("utf8", 20, 20 + len)); return (j.animations || []).map((a) => a.name); }
function findGlb(id, vmdl) {
  const base = vmdl.replace(/\.vmdl_c$/, "").split("/").pop();
  const dir = join(homedir(), "dota-export", id);
  const walk = (d) => { let out = []; for (const f of readdirSync(d, { withFileTypes: true })) { const p = join(d, f.name); if (f.isDirectory()) { if (f.name !== "parts") out = out.concat(walk(p)); } else if (f.name === base + ".glb") out.push(p); } return out; };
  try { return walk(dir)[0] ?? null; } catch { return null; }
}

const rows = readFileSync(manifest, "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t"));
let flagged = 0, missing = 0;
for (const [id, vmdl, args] of rows) {
  const m = /--anims (\S+)/.exec(args ?? ""); if (!m) continue;
  const glb = findGlb(id, vmdl);
  if (!glb) { missing++; if (all) console.log(`${id}: нет экспорта`); continue; }
  const names = anims(glb);
  const out = [];
  for (const spec of m[1].split(",")) {
    const [row, clip] = spec.split("="); if (!clip) continue;
    // Альтернативы `a|b` (spin=tricks|trade) — первая, что нашлась; death без клипа ищет die; cast без клипа берёт
    // фолбэк конвейера (любой не служебный клип) — это не подозрительно.
    const keys = clip.split("@")[0].split("|");
    if (row === "death" && !keys.includes("die")) keys.push("die");
    let chosen = null, key = keys[0];
    for (const k of keys) { const c = pick(names, k); if (c) { chosen = c; key = k; break; } }
    if (!chosen && row === "cast") { chosen = "(фолбэк каста)"; }
    const bad = !chosen || (chosen.toLowerCase() !== key && SUSPECT.test(chosen) && !SUSPECT.test(key) && !chosen.startsWith("("));
    if (bad) flagged++;
    if (all || bad) out.push(`${row}=${clip} → ${chosen ?? "НЕТ"}${bad ? " ⚠" : ""}`);
  }
  if (out.length) console.log(`${id}: ${out.join(" · ")}`);
}
console.error(`строк ${rows.length}, без экспорта ${missing}, подозрительных рядов ${flagged}`);
