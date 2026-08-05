import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { DraftStyle } from "../../game/packs.ts";
import "./scoring-legend.css";

/** Пояснение Base / Hero Synergy / Chemistry (как info-box в 322-0).
 *  Base описывается по стилю драфта: в Mixed он считается от успеха команды за окно, а не
 *  от формы на событии, и легенда обязана говорить то же, что делает движок. */
export function ScoringLegend({ draftStyle, roguelite = false }: {
  draftStyle: DraftStyle;
  /** Roguelite Run красит Hero Synergy фиолетовым: зелёный там занят силой забега. */
  roguelite?: boolean;
}) {
  const { t } = useI18n();
  return (
    <aside className={`scoring-legend${roguelite ? " scoring-legend--run" : ""}`}>
      <p>
        <strong className="scoring-legend__term scoring-legend__term--base">{t("draft.scoringLegendBaseTitle")}</strong>{" "}
        {t(draftStyle === "mixed" ? "draft.scoringLegendBaseMixed" : "draft.scoringLegendBase")}
      </p>
      <p><strong className="scoring-legend__term scoring-legend__term--synergy">{t("draft.scoringLegendSynergyTitle")}</strong> {t("draft.scoringLegendSynergy")}</p>
      <p><strong className="scoring-legend__term scoring-legend__term--chemistry">{t("draft.scoringLegendChemistryTitle")}</strong> {t("draft.scoringLegendChemistry")}</p>
    </aside>
  );
}
