// Обрезка рядов клипов, которые игра рисует в одном направлении (2026-09-19, вес GitHub Pages): клип `death` из листов
// рисуется в одном месте — эффект гибели врага (renderer.ts, ветка "die") — и всегда в направлении 0; смерть героя с листа
// не проигрывается вовсе. Семь из восьми рядов смерти у ~1300 листов героев, обликов, форм и слоёв никто не рисовал: ~17%
// веса каждого листа. Инструмент перекладывает ряды готового листа без перерендера: у клипа остаётся ряд направления 0,
// в мете он получает `dirs: 1`, следующие клипы сдвигаются вверх. Пиксели оставшихся рядов не меняются (lossless WebP).
// Новые рендеры выходят сразу в этом формате (`--single-dir death` в render_dota_sprites.py, по умолчанию включён).
//
//   npx tsx scripts/sheet_single_dir.mts [dota_px2 dota_px] [--anims death] [--dry] [--jobs 4]
//
// Идемпотентно: лист, у которого клип уже с `dirs`, пропускается. Читатели рядов (`a.dirs ?? meta.dirs`): sprites.ts
// (drawDotaFrame, frameGeometry, композит), dota_part_layers.mts (замер порядка спины), qa_sheet_health/frame_gaps/frame_drift.
import { readdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const run = promisify(execFile);
const argv = process.argv.slice(2);
const opt = (k: string, d: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const dirs = argv.filter((a, i) => !a.startsWith("--") && !["--anims", "--jobs"].includes(argv[i - 1] ?? ""));
const anims = new Set(opt("--anims", "death").split(",").filter(Boolean));
const dry = argv.includes("--dry");
const jobs = Math.max(1, Number(opt("--jobs", "4")));

interface Meta { frame: number; dirs: number; anims: Record<string, { row: number; frames: number; dirs?: number }>; [k: string]: unknown }

/** PAM (P7, RGBA) от `dwebp -pam`: заголовок до `ENDHDR\n`, дальше сырые байты. Без canvas: браузер премультиплицирует альфу
 *  и портит полупрозрачные края (проверено: тысячи отличающихся пикселей на лист), а ряды должны остаться побайтно теми же. */
function parsePam(buf: Buffer): { w: number; h: number; data: Buffer } {
  const end = buf.indexOf("ENDHDR\n") + 7;
  const head = buf.subarray(0, end).toString("latin1");
  const num = (k: string) => Number(new RegExp(`${k} (\\d+)`).exec(head)?.[1]);
  if (num("DEPTH") !== 4 || num("MAXVAL") !== 255) throw new Error("ожидался RGBA PAM");
  return { w: num("WIDTH"), h: num("HEIGHT"), data: buf.subarray(end) };
}

let before = 0, after = 0, done = 0, skipped = 0;
for (const d of dirs.length ? dirs : ["dota_px2", "dota_px"]) {
  const root = d.startsWith("/") ? d : `public/art/sprites/${d}`;
  const ids = readdirSync(root).filter((f) => f.endsWith(".json") && f !== "index.json").map((f) => f.slice(0, -5));
  let next = 0;
  const worker = async () => {
    for (;;) {
      const id = ids[next++];
      if (id === undefined) break;
      const jp = join(root, `${id}.json`), wp = join(root, `${id}.webp`);
      let meta: Meta;
      try { meta = JSON.parse(readFileSync(jp, "utf8")) as Meta; statSync(wp); } catch { continue; }
      const target = Object.entries(meta.anims ?? {}).filter(([n, a]) => anims.has(n) && (a.dirs ?? meta.dirs) > 1);
      if (!meta.anims || meta.dirs <= 1 || !target.length) { skipped++; continue; }
      // Новая раскладка: клипы в порядке рядов; у целевых остаётся один ряд (направление 0).
      const plan: [number, number, number][] = [];
      let row = 0;
      const nextAnims: Meta["anims"] = {};
      for (const [n, a] of Object.entries(meta.anims).sort((p, q) => p[1].row - q[1].row)) {
        const keep = anims.has(n) ? 1 : a.dirs ?? meta.dirs;
        plan.push([a.row, row, keep]);
        nextAnims[n] = keep === meta.dirs ? { row, frames: a.frames } : { row, frames: a.frames, dirs: keep };
        row += keep;
      }
      const size0 = statSync(wp).size;
      before += size0;
      if (dry) { after += Math.round(size0 * row / Object.values(meta.anims).reduce((s2, a) => s2 + (a.dirs ?? meta.dirs), 0)); done++; continue; }
      const pamIn = join(root, `.${id}.in.pam`), pamOut = join(root, `.${id}.out.pam`);
      await run("dwebp", ["-quiet", "-pam", wp, "-o", pamIn]);
      const src = parsePam(readFileSync(pamIn));
      const stride = src.w * 4, band = meta.frame * stride;
      const out = Buffer.alloc(row * band);
      for (const [from, to, n] of plan) src.data.copy(out, to * band, from * band, (from + n) * band);
      writeFileSync(pamOut, Buffer.concat([Buffer.from(`P7\nWIDTH ${src.w}\nHEIGHT ${row * meta.frame}\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n`, "latin1"), out]));
      await run("cwebp", ["-lossless", "-z", "6", "-exact", "-quiet", pamOut, "-o", wp]);
      unlinkSync(pamIn); unlinkSync(pamOut);
      writeFileSync(jp, JSON.stringify({ ...meta, anims: nextAnims }));
      after += statSync(wp).size;
      if (++done % 100 === 0) console.log(`${d}: ${done} листов…`);
    }
  };
  await Promise.all(Array.from({ length: jobs }, worker));
}
console.log(`${dry ? "ПРОБА: " : ""}листов ${done}, без изменений ${skipped}; ${(before / 1e6).toFixed(0)} МБ → ${(after / 1e6).toFixed(0)} МБ (−${((before - after) / 1e6).toFixed(0)} МБ)`);
