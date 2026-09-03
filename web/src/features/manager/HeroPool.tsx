// Файл на компонент (T12.5, 2026-09-02): раньше всё жило одним ManagerScreen.tsx на 1005 строк.
// Фаза пула героев: закрепление героев за игроками.
import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useManager } from "../../state/managerStore.ts";
import {
  HERO_PICKS_PER_ROUND,
  HERO_ROUNDS,
  
  
  
  type ManagerEngine,
} from "../../game/manager/engine.ts";
import { Button, HeroThumb, Surface } from "../../ui/index.ts";
import { useHero } from "../draft/heroes.ts";
import { ManagerHeading } from "./ManagerHeading.tsx";

export function HeroPool({ engine }: { engine: ManagerEngine }) {
  const { t } = useI18n();
  const act = useManager((s) => s.act);
  const hero = useHero();
  const [selected, setSelected] = useState<number[]>([]);
  const s = engine.state;

  const toggle = (id: number) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : current.length < HERO_PICKS_PER_ROUND ? [...current, id] : current,
    );

  return (
    <>
      <ManagerHeading engine={engine} sub={t("manager.heroPoolSub")} />
      <Surface className="manager__panel">
        <h2 className="manager__section">
          {t("manager.heroRound", { i: s.heroRound + 1, n: HERO_ROUNDS, picked: s.heroPool.length })}
        </h2>
        <div className="manager__cards manager__cards--heroes">
          {s.heroOffer.map((id) => {
            const info = hero(id);
            return (
              <button
                key={id}
                type="button"
                className={`manager__card manager__card--hero${selected.includes(id) ? " is-selected" : ""}`}
                data-testid="manager-hero-card"
                onClick={() => toggle(id)}
              >
                <HeroThumb picture={info.picture} name={info.name} layout="card" />
              </button>
            );
          })}
        </div>
        <div>
          <Button
            variant="primary"
            data-testid="manager-heroes-confirm"
            disabled={selected.length !== HERO_PICKS_PER_ROUND}
            onClick={() => { act((e) => e.pickHeroes(selected)); setSelected([]); }}
          >
            {t("manager.heroesConfirm", { n: selected.length, total: HERO_PICKS_PER_ROUND })}
          </Button>
        </div>
      </Surface>
    </>
  );
}

// ── Контракты ────────────────────────────────────────────────────────────────
