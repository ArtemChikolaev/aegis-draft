export type OvrTier = "elite" | "strong" | "mid" | "low" | "weak";

/** Тир игрока по OVR — для окраски и эффектов номера в драфте/итоге.
 *  Пороги калиброваны по реальному распределению pack-player OVR (54–99, медиана 74,
 *  p90 85, p95 87, p99 91): большинство — mid/low, strong 82+ (~top 18%), elite 88+
 *  (~top 4%, «переливается»). НЕ путать со scoreTier КОМАНДЫ (диапазон 80–96) — там свои
 *  пороги: смешивать домены нельзя, иначе типовой 74-игрок красится как «weak». */
export function playerOvrTier(ovr: number): OvrTier {
  if (ovr >= 88) return "elite";
  if (ovr >= 82) return "strong";
  if (ovr >= 76) return "mid";
  if (ovr >= 70) return "low";
  return "weak";
}
