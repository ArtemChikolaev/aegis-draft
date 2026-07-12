import { useI18n } from "../../i18n/I18nProvider.tsx";
import "./scoring-legend.css";

/** Пояснение Base / Hero Synergy / Chemistry (как info-box в 322-0). */
export function ScoringLegend() {
  const { t } = useI18n();
  return (
    <aside className="scoring-legend">
      <p><strong>{t("draft.scoringLegendBaseTitle")}</strong> {t("draft.scoringLegendBase")}</p>
      <p><strong>{t("draft.scoringLegendSynergyTitle")}</strong> {t("draft.scoringLegendSynergy")}</p>
      <p><strong>{t("draft.scoringLegendChemistryTitle")}</strong> {t("draft.scoringLegendChemistry")}</p>
    </aside>
  );
}
