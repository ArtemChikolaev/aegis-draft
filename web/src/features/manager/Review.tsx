// Файл на компонент (T12.5, 2026-09-02): раньше всё жило одним ManagerScreen.tsx на 1005 строк.
// Итоги сезона и переход к следующему.
import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { roleMessageKey } from "../../i18n/core.ts";
import { useManager } from "../../state/managerStore.ts";
import {
  
  
  
  TRANSFER_LIMIT,
  
  
  
} from "../../game/manager/economy.ts";
import {
  
  
  
  
  
  type ManagerEngine,
} from "../../game/manager/engine.ts";
import { Button, Modal, OvrBadge, RoleTag, StatTile, Surface } from "../../ui/index.ts";
import { ManagerHeading } from "./ManagerHeading.tsx";

export function Review({ engine }: { engine: ManagerEngine }) {
  const { t } = useI18n();
  const act = useManager((s) => s.act);
  const s = engine.state;
  const finale = s.calendar.find((slot) => slot.kind === "finale");
  // Трансферное окно (срез 5): покупка оферa требует выбрать заменяемого той же роли.
  const [buying, setBuying] = useState<number | null>(null);
  const buyingOffer = buying !== null ? s.transferMarket.find((o) => o.player.candidate.player.accountId === buying) : undefined;
  const limitReached = s.transfersDone >= TRANSFER_LIMIT;
  return (
    <>
      <ManagerHeading engine={engine} sub={t("manager.reviewSub", { season: s.season })} />
      <Surface className="manager__panel">
        <div className="manager__strip">
          <StatTile
            label={t("manager.finaleFinish")}
            value={finale?.result ? `#${finale.result.placement}` : t("manager.dnq")}
            kind="base"
          />
          <StatTile label={t("manager.bank")} value={`$${Math.round(s.bankK)}k`} kind="base" />
          <StatTile label="ELO" value={`${s.elo}`} kind="base" />
        </div>
        <h2 className="manager__section">{t("manager.nextRoster", { season: s.season + 1 })}</h2>
        <div className="manager__roster">
          {s.roster.map((p) => (
            <div key={p.candidate.player.accountId} className="manager__roster-row">
              <RoleTag role={p.candidate.player.role}>{t(roleMessageKey(p.candidate.player.role))}</RoleTag>
              <strong>{p.candidate.player.nickname}</strong>
              <b>{p.candidate.player.ovr}</b>
              <span>${p.salary}k{t("manager.perMonth")}</span>
            </div>
          ))}
        </div>
        {s.transferMarket.length > 0 && (
          <>
            <h2 className="manager__section">
              {t("manager.transferTitle")} · {t("manager.transferLimit", { done: s.transfersDone, limit: TRANSFER_LIMIT })} · ${Math.round(s.bankK)}k
            </h2>
            <div className="manager__contract-list" data-testid="manager-transfer-market">
              {s.transferMarket.map((offer) => {
                const p = offer.player.candidate.player;
                const affordable = s.bankK >= offer.feeK && !limitReached;
                return (
                  <button
                    key={p.accountId}
                    type="button"
                    className="manager__contract"
                    data-testid="manager-transfer-offer"
                    disabled={!affordable}
                    onClick={() => setBuying(p.accountId)}
                  >
                    <RoleTag role={p.role}>{t(roleMessageKey(p.role))}</RoleTag>
                    <span className="manager__contract-name">
                      <strong>{p.nickname}</strong>
                      <small>{offer.player.candidate.teamName} · ${offer.player.salary}k{t("manager.perMonth")}</small>
                    </span>
                    <OvrBadge className="manager__contract-ovr" ovr={p.ovr} />
                    <span className="manager__contract-salary">{t("manager.transferFee", { n: offer.feeK })}</span>
                  </button>
                );
              })}
            </div>
            <p className="manager__hint">{t("manager.transferHint")}</p>
          </>
        )}
        <div>
          <Button variant="primary" data-testid="manager-next-season" onClick={() => act((e) => e.startNextSeason())}>
            {t("manager.startSeason", { season: s.season + 1 })} →
          </Button>
        </div>
      </Surface>
      {buyingOffer && (
        <Modal
          mark="A"
          title={t("manager.transferWho", { nick: buyingOffer.player.candidate.player.nickname })}
          description={t("manager.transferWhoText", { n: buyingOffer.feeK })}
          labelledBy="manager-transfer-title"
          dismissLabel={t("common.close")}
          onClose={() => setBuying(null)}
          layout="content"
        >
          {({ close }) => (
            <div className="manager__assign-list">
              {s.roster
                .filter((p) => p.candidate.player.role === buyingOffer.player.candidate.player.role)
                .map((p) => (
                  <button
                    key={p.candidate.player.accountId}
                    type="button"
                    className="manager__assign-row"
                    data-testid="manager-transfer-replace"
                    onClick={() => {
                      act((e) => e.buyTransfer(buyingOffer.player.candidate.player.accountId, p.candidate.player.accountId));
                      setBuying(null);
                      close();
                    }}
                  >
                    <strong>{p.candidate.player.nickname}</strong>
                    <small>{p.candidate.player.ovr} OVR · ${p.salary}k{t("manager.perMonth")} · {t("manager.transferLeaves")}</small>
                  </button>
                ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
