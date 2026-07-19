import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useRun } from "../../state/runStore.ts";
import { Button, Modal } from "../../ui/index.ts";
import type { MessageKey } from "../../i18n/core.ts";

/** Предложение сыграть забег из присланной ссылки.
 *
 *  Ссылка НЕ стартует сама: у игрока может идти свой забег, а CLAUDE.md требует confirm на
 *  любую потерю прогресса. Поэтому три исхода — «версии разошлись» (объясняем, не запускаем),
 *  «идёт свой забег» (предупреждаем, что он потеряется) и обычное предложение. */
export function RunLinkPrompt() {
  const { t } = useI18n();
  const link = useRun((s) => s.pendingLink);
  const issue = useRun((s) => s.pendingLinkIssue);
  const phase = useRun((s) => s.phase);
  const resumable = useRun((s) => s.resumable);
  const accept = useRun((s) => s.acceptPendingLink);
  const dismiss = useRun((s) => s.dismissPendingLink);

  if (!link) return null;

  // Прогресс, который будет потерян: активный забег или предложенный к продолжению сейв.
  const losesProgress = phase === "draft" || phase === "tournament" || resumable != null;
  const configLine = [
    t(link.config.draftStyle === "mixed" ? "start.mixedDraft" : "start.teamPacks"),
    t(`start.${link.config.format === "valve_legacy" ? "valveLegacy" : link.config.format === "last_1y" ? "last1y" : link.config.format === "last_5y" ? "last5y" : "last2y"}` as MessageKey),
    ...(link.config.hardMode ? [t("hard.title")] : []),
  ].join(" · ");

  const description = issue
    ? t(issue === "schema" ? "link.issueSchema" : "link.issueModel")
    : losesProgress
      ? t("link.replaceWarning")
      : t("link.description");

  return (
    <Modal
      mark="A"
      title={t(issue ? "link.issueTitle" : "link.title")}
      description={description}
      labelledBy="run-link-title"
      dismissLabel={t("common.close")}
      onClose={dismiss}
    >
      {() => (
        <>
          <p className="run-link__config">{configLine}</p>
          {issue
            ? <Button variant="primaryInvert" data-testid="run-link-dismiss" onClick={dismiss}>{t("common.close")}</Button>
            : (
              <>
                <Button variant="primaryInvert" data-testid="run-link-accept" onClick={accept}>{t("link.play")}</Button>
                <Button variant="secondaryInvert" data-testid="run-link-dismiss" onClick={dismiss}>{t("link.cancel")}</Button>
              </>
            )}
        </>
      )}
    </Modal>
  );
}
