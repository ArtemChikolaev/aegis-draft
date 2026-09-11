// Список файлов pak01_dir.vpk без Source2Viewer (память dota-vpk-source-of-truth): формат VPK v2 — заголовок 28 байт,
// затем дерево «расширение → папка → файл» из null-terminated строк; у записи 18 байт + preload.
//   npx tsx scripts/dota_vpk_list.mts [префикс-фильтр] [--ext vmdl_c]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const DOTA = process.env.DOTA ?? join(homedir(), "Library/Application Support/Steam/steamapps/common/dota 2 beta/game/dota");
const args = process.argv.slice(2);
const extFilter = args.includes("--ext") ? args[args.indexOf("--ext") + 1] : "";
const prefix = args.find((a) => !a.startsWith("--") && a !== extFilter) ?? "";

export function listVpk(vpk = join(DOTA, "pak01_dir.vpk")): string[] {
  const buf = readFileSync(vpk);
  const sig = buf.readUInt32LE(0), ver = buf.readUInt32LE(4);
  if (sig !== 0x55aa1234 || ver !== 2) throw new Error(`не VPK v2: ${vpk}`);
  let p = 28;
  const str = () => { const e = buf.indexOf(0, p); const s = buf.toString("latin1", p, e); p = e + 1; return s; };
  const out: string[] = [];
  for (;;) {
    const ext = str(); if (!ext) break;
    for (;;) {
      const dir = str(); if (!dir) break;
      for (;;) {
        const name = str(); if (!name) break;
        const preload = buf.readUInt16LE(p + 4); p += 18 + preload; // CRC(4) PreloadBytes(2) ArchiveIndex(2) Offset(4) Length(4) 0xffff(2)
        out.push(`${dir === " " ? "" : dir + "/"}${name}.${ext}`);
      }
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = listVpk();
  const hit = all.filter((f) => f.startsWith(prefix) && (!extFilter || f.endsWith("." + extFilter)));
  for (const f of hit) console.log(f);
  console.error(`всего ${all.length}, подходит ${hit.length}`);
}
