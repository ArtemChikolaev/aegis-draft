// Файл на компонент (T12.5, 2026-09-02): раньше всё жило одним ManagerScreen.tsx на 1005 строк.
// Фаза трайаутов: выбор кандидатов в ростер.
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { roleMessageKey } from "../../i18n/core.ts";
import { useManager } from "../../state/managerStore.ts";
import {
  
  
  TRYOUT_PICKS,
  
  
  type ManagerEngine,
} from "../../game/manager/engine.ts";
import { Button, OvrBadge, RoleTag, Surface } from "../../ui/index.ts";
import { ManagerHeading } from "./ManagerHeading.tsx";

export function Tryouts({ engine }: { engine: ManagerEngine }) {
  const { t } = useI18n();
  const act = useManager((s) => s.act);
  const s = engine.state;
  return (
    <>
      <ManagerHeading engine={engine} sub={t("manager.tryoutsSub")} />
      <Surface className="manager__panel">
        <div className="manager__row">
          <h2 className="manager__section">{t("manager.tryoutsPick", { i: s.tryoutPick + 1, n: TRYOUT_PICKS })}</h2>
          <Button variant="secondary" data-testid="manager-reroll" disabled={s.tryoutRerollsLeft <= 0} onClick={() => act((e) => e.rerollTryouts())}>
            ↻ {t("manager.reroll", { n: s.tryoutRerollsLeft })}
          </Button>
        </div>
        <div className="manager__cards">
          {s.tryoutOffer.map((offer) => (
            <button
              key={offer.candidate.player.accountId}
              type="button"
              className="manager__card"
              data-testid="manager-tryout-card"
              onClick={() => act((e) => e.pickTryout(offer.candidate.player.accountId))}
            >
              <span className="manager__card-top">
                <RoleTag role={offer.candidate.player.role}>{t(roleMessageKey(offer.candidate.player.role))}</RoleTag>
                <b className="manager__band">{"$".repeat(offer.band)}</b>
              </span>
              <strong>{offer.candidate.player.nickname}</strong>
              <small>{offer.candidate.teamName}</small>
              <OvrBadge as="span" className="manager__ovr" ovr={offer.candidate.player.ovr} unit />
            </button>
          ))}
        </div>
        <p className="manager__hint">{t("manager.tryoutsHint")}</p>
        {s.tryoutPicked.length > 0 && (
          <p className="manager__picked">{s.tryoutPicked.map((p) => p.candidate.player.nickname).join(" · ")}</p>
        )}
      </Surface>
    </>
  );
}

// ── Пул героев ───────────────────────────────────────────────────────────────
