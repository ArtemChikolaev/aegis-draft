import type { RosterSlot } from "../../game/engine.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { roleMessageKey } from "../../i18n/core.ts";
import { HeroThumb } from "../../ui/index.ts";
import { useHero } from "./heroes.ts";
import "./hero-allocation.css";

/** Карточки Hero Allocation — свап в Manual после драфта (322-0). */
export function HeroAllocation({ roster, assignmentByPlayer, swapSelectedId, onSelect }: {
  roster: RosterSlot[];
  assignmentByPlayer: Record<number, number>;
  swapSelectedId: number | null;
  onSelect: (accountId: number) => void;
}) {
  const { t } = useI18n();
  const hero = useHero();

  return (
    <section className="hero-allocation">
      <header>
        <h3>{t("draft.heroAllocation")}</h3>
        <p>{t("draft.heroAllocationHint")}</p>
      </header>
      <div className="hero-allocation__grid">
        {roster.map((slot, index) => {
          if (!slot.candidate) return null;
          const accountId = slot.candidate.player.accountId;
          const heroId = assignmentByPlayer[accountId];
          const h = heroId != null ? hero(heroId) : null;
          const selected = swapSelectedId === accountId;
          return (
            <button
              key={index}
              type="button"
              className={["hero-allocation__card", selected ? "hero-allocation__card--selected" : ""].filter(Boolean).join(" ")}
              onClick={() => onSelect(accountId)}
              aria-pressed={selected}
            >
              {h && <HeroThumb picture={h.picture} name={h.name} size="md" showName={false} />}
              <span className="hero-allocation__body">
                <strong>{slot.candidate.player.nickname}</strong>
                <span>{h?.name ?? t("draft.noHeroYet")}</span>
                <small>{t(roleMessageKey(slot.role))}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
