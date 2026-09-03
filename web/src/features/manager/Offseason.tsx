// Файл на компонент (T12.5, 2026-09-02): раньше всё жило одним ManagerScreen.tsx на 1005 строк.
// Оффсезон: продления, трансферы, тренировочный сбор.
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { roleMessageKey } from "../../i18n/core.ts";
import { useManager } from "../../state/managerStore.ts";
import {
  
  
  
  
  
  
  OFFSEASON_BOOTCAMP,
} from "../../game/manager/economy.ts";
import {
  
  
  
  
  
  type ManagerEngine,
} from "../../game/manager/engine.ts";
import { Button, RoleTag, Surface } from "../../ui/index.ts";
import { sfxBuy } from "../../ui/sound.ts";
import { ManagerHeading } from "./ManagerHeading.tsx";

export function Offseason({ engine }: { engine: ManagerEngine }) {
  const { t } = useI18n();
  const act = useManager((s) => s.act);
  const s = engine.state;
  return (
    <>
      <ManagerHeading engine={engine} sub={t("manager.offseasonSub", { season: s.season })} />
      <Surface className="manager__panel">
        <h2 className="manager__section">{t("manager.contractsReview")}</h2>
        <div className="manager__contract-list">
          {s.roster.map((p) => {
            const id = p.candidate.player.accountId;
            const drift = s.offseasonDrifts[id] ?? 0;
            const newSalary = s.offseasonSalaries[id] ?? p.salary;
            const released = s.released.includes(id);
            const departing = s.departures.includes(id);
            return (
              <div key={id} className={`manager__contract manager__contract--offseason${released || departing ? " is-released" : ""}`}>
                <RoleTag role={p.candidate.player.role}>{t(roleMessageKey(p.candidate.player.role))}</RoleTag>
                <span className="manager__contract-name">
                  <strong>{p.candidate.player.nickname}</strong>
                  <small>
                    {p.candidate.player.ovr} → {Math.min(99, Math.max(55, p.candidate.player.ovr + drift))} OVR
                    {drift !== 0 && <em className={drift > 0 ? "is-up" : "is-down"}> ({drift > 0 ? "+" : ""}{drift})</em>}
                    {" · "}{p.happiness < 30 ? "☹" : "♥"} {p.happiness}
                    {p.fame > 0 && <> · {p.fame}★</>}
                  </small>
                </span>
                <span className="manager__contract-salary">${p.salary}k → ${newSalary}k</span>
                {departing ? (
                  // Уходит сам (ретайр/несчастье) — это не выбор менеджера, тоггла нет.
                  <em className="manager__departing" data-testid="manager-departing">{t("manager.departing")}</em>
                ) : (
                  <Button variant={released ? "primaryInvert" : "danger"} data-testid="manager-release" onClick={() => act((e) => e.toggleRelease(id))}>
                    {released ? t("manager.keep") : t("manager.release")}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <p className="manager__hint">{t("manager.releaseHint")}</p>
        {/* Тренировочный сбор (m1.7.0): единственный способ конвертировать банк в форму.
            Одноразовый на оффсезон; в долг не продаётся; после покупки строка остаётся
            подтверждением («куплен»), чтобы дрифты в списке выше читались с контекстом. */}
        <div className="manager__signbar manager__bootcamp" data-testid="manager-bootcamp-bar">
          <span>
            {engine.bootcampLevel > 0 && (
              <b className="is-up">{t("manager.bootcampBought", { n: engine.bootcampLevel * OFFSEASON_BOOTCAMP.driftBonus })}{" · "}</b>
            )}
            {engine.bootcampNextCostK != null
              ? t(engine.bootcampLevel === 0 ? "manager.bootcampOfferText" : "manager.bootcampNextLevel", { cost: engine.bootcampNextCostK, n: OFFSEASON_BOOTCAMP.driftBonus })
              : engine.bootcampLevel > 0 ? t("manager.bootcampMaxed") : null}
          </span>
          {engine.bootcampNextCostK != null && (
            <Button
              variant="secondary"
              data-testid="manager-bootcamp-buy"
              disabled={engine.state.bankK < engine.bootcampNextCostK}
              onClick={() => { sfxBuy(); act((e) => e.buyOffseasonBootcamp()); }}
            >
              {t("manager.bootcampBuy", { cost: engine.bootcampNextCostK })}
            </Button>
          )}
        </div>
        {/* Бюджет нового сезона (m1.7.0): тот же кап, что на подписи, — виден до подтверждения. */}
        {(() => {
          const budget = engine.offseasonBudget();
          return (
            <div className="manager__signbar" data-testid="manager-offseason-budget" data-ok={budget.ok}>
              <span>
                {t("manager.offseasonBudget", { wages: budget.wagesK, income: budget.incomeK })}
                {!budget.ok && <b className="manager__over"> · {t("manager.offseasonOverBudget")}</b>}
              </span>
              <Button
                variant="primary"
                data-testid="manager-offseason-confirm"
                disabled={!budget.ok}
                onClick={() => act((e) => e.confirmOffseason())}
              >
                {t("manager.confirmContracts")} →
              </Button>
            </div>
          );
        })()}
      </Surface>
    </>
  );
}

// ── Итоги сезона ─────────────────────────────────────────────────────────────
