// Файл на компонент (T12.5, 2026-09-02): раньше всё жило одним ManagerScreen.tsx на 1005 строк.
// Зал легенд (межкарьерная память менеджера) — модалка.
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { roleMessageKey } from "../../i18n/core.ts";
import { useManager } from "../../state/managerStore.ts";
import { Modal, OvrBadge, RoleTag } from "../../ui/index.ts";

/** Hall of Legends (срез 4): межкарьерные рекорды орга и коллекция игроков. Без шардов и
 *  перков — трофейная комната, сила меты решается отдельно (T6.4). */
export function HallModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const hall = useManager((s) => s.hall);
  const players = Object.values(hall.players).sort((a, b) => b.peakOvr - a.peakOvr);
  return (
    <Modal
      mark="A"
      title={t("manager.hallTitle")}
      description={t("manager.hallText")}
      labelledBy="manager-hall-title"
      dismissLabel={t("common.close")}
      onClose={onClose}
      layout="content"
    >
      {() => (
        <div className="manager__hall">
          <dl className="manager__hall-records">
            <div><dt>{t("manager.hallCareers")}</dt><dd>{hall.careers}</dd></div>
            <div><dt>{t("manager.hallSeasons")}</dt><dd>{hall.seasons}</dd></div>
            <div><dt>{t("manager.hallTitles")}</dt><dd>{hall.titles}</dd></div>
            <div><dt>{t("manager.hallFinaleTitles")}</dt><dd>{hall.finaleTitles}</dd></div>
            <div><dt>{t("manager.hallFinaleApps")}</dt><dd>{hall.finaleAppearances}</dd></div>
            <div><dt>{t("manager.hallBestElo")}</dt><dd>{hall.bestElo || "—"}</dd></div>
          </dl>
          {players.length === 0 ? (
            <p className="manager__hint">{t("manager.hallEmpty")}</p>
          ) : (
            <div className="manager__hall-list" data-testid="manager-hall-list">
              {players.map((p) => (
                <div key={`${p.nickname}:${p.role}`} className="manager__hall-row">
                  <RoleTag role={p.role}>{t(roleMessageKey(p.role))}</RoleTag>
                  <strong>{p.nickname}</strong>
                  <small>{t("manager.hallPlayerLine", { seasons: p.seasons, titles: p.titles })}</small>
                  <OvrBadge ovr={p.peakOvr} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
