import { useEffect } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useManager } from "../../state/managerStore.ts";
import { useRun } from "../../state/runStore.ts";
import { navigateBack } from "../../state/navigation.ts";
import { useTmaChrome } from "../../state/tmaChrome.ts";
import { Button } from "../../ui/index.ts";
import { Onboarding } from "./Onboarding.tsx";
import { Tryouts } from "./Tryouts.tsx";
import { HeroPool } from "./HeroPool.tsx";
import { Contracts } from "./Contracts.tsx";
import { Season } from "./Season.tsx";
import { Offseason } from "./Offseason.tsx";
import { Review } from "./Review.tsx";
import "./manager.css";

/** Esports Manager (T5.5, срез 1). Один экран, фазы ведёт движок: онбординг → трайауты →
 *  пул героев → контракты → сезон → оффсезон → итоги. Выход в меню безопасен: карьера —
 *  long-save и пишется после каждого действия. */
export function ManagerScreen() {
  const { t } = useI18n();
  const engine = useManager((s) => s.engine);
  const version = useManager((s) => s.version);
  const hydrate = useManager((s) => s.hydrate);
  const careerOpen = useManager((s) => s.careerOpen);
  const setCareerOpen = useManager((s) => s.setCareerOpen);
  const data = useRun((s) => s.data);
  const backNative = useTmaChrome((state) => state.backNative);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!data) return null;
  void version; // подписка: движок мутирует state, стор тикает версией

  // Как в classic: вход в режим — всегда настройка НОВОЙ карьеры; в открытую ведёт
  // только плашка resume (setCareerOpen). Выход из карьеры закрывает её (сейв цел).
  const inCareer = careerOpen && engine !== null;

  return (
    <main className="manager" data-testid="manager-screen">
      {!backNative && (
        <Button
          variant="back"
          data-testid="manager-back"
          onClick={() => {
            if (inCareer) setCareerOpen(false);
            navigateBack();
          }}
        >
          ← {t("start.backToModes")}
        </Button>
      )}
      {!inCareer ? (
        <Onboarding />
      ) : engine.state.phase === "tryouts" ? (
        <Tryouts engine={engine} />
      ) : engine.state.phase === "heroPool" ? (
        <HeroPool engine={engine} />
      ) : engine.state.phase === "contracts" ? (
        <Contracts engine={engine} />
      ) : engine.state.phase === "offseason" ? (
        <Offseason engine={engine} />
      ) : engine.state.phase === "review" ? (
        <Review engine={engine} />
      ) : (
        <Season engine={engine} />
      )}
    </main>
  );
}
