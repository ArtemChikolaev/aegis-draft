// Единая проверка «сейв/комната сделаны на этом же датасете». Раньше три копии (runPersist,
// managerStore, relay-комнаты) сравнивали одни и те же оси по-разному: у менеджера не было
// legacy-фолбэка по builtAt, у забега был. Здесь одно правило на всех:
//   1. есть dataHash с обеих сторон — сравниваем его (builtAt-only refresh сейв не ломает);
//   2. dataHash у сейва нет (эпоха до T11.1) — сверяем builtAt, если он есть у обоих;
//   3. иначе несовместимо.
// Ссылка на забег (runLink) сюда намеренно НЕ входит: она долгоживущая и dataHash не пинит.
import type { GameData } from "../types/data.ts";
import { BALANCE_CONFIG_VERSION } from "../game/balance.ts";

type Manifest = GameData["manifest"];

/** Штамп датасета, который кладут в сейв/ссылку/пин комнаты. */
export interface DatasetStamp {
  schemaVersion: number;
  ratingModelVersion: string;
  dataHash?: string;
  /** Legacy (сейвы до dataHash): manifest.builtAt на момент сохранения. */
  dataBuiltAt?: string;
}

export function sameDataset(saved: DatasetStamp, manifest: Pick<Manifest, "schemaVersion" | "ratingModelVersion" | "dataHash" | "builtAt">): boolean {
  if (saved.schemaVersion !== manifest.schemaVersion || saved.ratingModelVersion !== manifest.ratingModelVersion) return false;
  if (saved.dataHash) return saved.dataHash === manifest.dataHash;
  return Boolean(saved.dataBuiltAt && manifest.builtAt && saved.dataBuiltAt === manifest.builtAt);
}

/** Версии клиента для пина relay-комнаты и сейвов: те же оси + версия баланса. */
export function clientVersionsOf(manifest: Manifest): { schemaVersion: number; ratingModelVersion: string; dataHash: string; balanceConfigVersion: string } {
  return {
    schemaVersion: manifest.schemaVersion,
    ratingModelVersion: manifest.ratingModelVersion,
    dataHash: manifest.dataHash,
    balanceConfigVersion: BALANCE_CONFIG_VERSION,
  };
}
