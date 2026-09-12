// Экспедиции (T13.77, аудит 2026-09-12 §6 «цели после Наследия»): короткие цепочки из трёх шагов, каждый шаг
// закрывается ДРУГИМ героем — причина играть разными героями. Шаги засчитываются в любом порядке, стрика и
// сброса после смерти нет. Награда — титул (косметика), не боевая сила: Наследие и так закрывается за 6–11 побед.
import type { ArcadeHistoryEntry } from "../../../state/arcadeStore.ts";

export type ExpeditionStepId =
  | "win_short" | "win_full" | "camp" | "outpost"
  | "contract" | "oath" | "win_with_contract"
  | "caravan" | "forge" | "win_trade"
  | "necro" | "win_wilds"
  | "win_cursed" | "rift_no_revive" | "flawless_dire";

export interface ExpeditionDef {
  id: string;
  steps: readonly [ExpeditionStepId, ExpeditionStepId, ExpeditionStepId];
}

export const EXPEDITIONS: readonly ExpeditionDef[] = [
  { id: "first_road", steps: ["win_short", "win_full", "camp"] },
  { id: "hunter", steps: ["contract", "oath", "win_with_contract"] },
  { id: "merchant", steps: ["caravan", "forge", "win_trade"] },
  { id: "wilds", steps: ["outpost", "necro", "win_wilds"] },
  { id: "trials", steps: ["win_cursed", "rift_no_revive", "flawless_dire"] },
];

export const EXPEDITION_BY_ID: Record<string, ExpeditionDef> = Object.fromEntries(EXPEDITIONS.map((e) => [e.id, e]));

/** Шаг закрыт этим забегом? Чистая функция от записи истории — старые записи без новых полей просто не считаются. */
export function expeditionStepDone(step: ExpeditionStepId, e: ArcadeHistoryEntry): boolean {
  const win = e.outcome === "victory";
  const full = e.act !== undefined && e.act !== "short";
  switch (step) {
    case "win_short": return win && (e.act ?? "short") === "short";
    case "win_full": return win && full;
    case "camp": return e.camp === true;
    case "outpost": return e.outpost === true;
    case "contract": return e.contract === true;
    case "oath": return e.oath === true;
    case "win_with_contract": return win && full && e.contract === true;
    case "caravan": return e.caravan === true;
    case "forge": return e.forged === true;
    case "win_trade": return win && e.composition === "trade";
    case "necro": return e.necro === true;
    case "win_wilds": return win && e.composition === "wilds";
    case "win_cursed": return win && full && (e.cursesTaken ?? 0) > 0;
    case "rift_no_revive": return e.rift === true && e.revived !== true;
    case "flawless_dire": return win && e.act === "dire" && e.revived !== true;
  }
}
