// Файл на компонент (T12.5, 2026-09-02): раньше всё жило одним ManagerScreen.tsx на 1005 строк.
// Подтверждение выхода из карьеры (используется и баннером resume на старт-экране).
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { Button, Modal } from "../../ui/index.ts";

/** Confirm-модалка роспуска организации: долгий сейв не удаляется одним кликом.
 *  Экспортируется для баннера resume на стартовом экране. */
export function ManagerAbandonModal({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal mark="A" title={t("manager.abandonTitle")} description={t("manager.abandonText")} labelledBy="manager-abandon-title" dismissLabel={t("common.close")} onClose={onClose}>
      {({ close }) => (
        <>
          <Button variant="primaryInvert" onClick={close}>{t("tournament.leaveCancel")}</Button>
          <Button variant="danger" data-testid="manager-abandon-confirm" onClick={() => { onConfirm(); close(); }}>{t("manager.abandon")}</Button>
        </>
      )}
    </Modal>
  );
}

// ── Трайауты ─────────────────────────────────────────────────────────────────
