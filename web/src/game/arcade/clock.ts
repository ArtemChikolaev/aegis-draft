// Часы забега Аркады «м:сс» по тикам сима. Отдельным модулем, а не в рендерере: их показывают Штаб и Карьера,
// и ради одной функции форматирования туда не должен тянуться весь canvas-рендер Аркады.
import { TICK_HZ } from "./config.ts";

export function formatClock(tick: number): string {
  const s = Math.floor(tick / TICK_HZ);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
