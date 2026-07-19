import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { DraftStyle } from "../../game/packs.ts";
import "./scoring-legend.css";

/** Пояснение Base / Hero Synergy / Chemistry (как info-box в 322-0).
 *  Base описывается по стилю драфта: в Mixed он считается от успеха команды за окно, а не
 *  от формы на событии, и легенда обязана говорить то же, что делает движок. */
export function ScoringLegend({ draftStyle }: { draftStyle: DraftStyle }) {
  const { t } = useI18n();
  return (
    <aside className="scoring-legend">
      <p>
        <strong>{t("draft.scoringLegendBaseTitle")}</strong>{" "}
        {t(draftStyle === "mixed" ? "draft.scoringLegendBaseMixed" : "draft.scoringLegendBase")}
      </p>
      <p><strong>{t("draft.scoringLegendSynergyTitle")}</strong> {t("draft.scoringLegendSynergy")}</p>
      <p><strong>{t("draft.scoringLegendChemistryTitle")}</strong> {t("draft.scoringLegendChemistry")}</p>
    </aside>
  );
}
