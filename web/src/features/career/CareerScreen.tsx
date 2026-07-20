import { useI18n } from "../../i18n/I18nProvider.tsx";
import { isCodexLocked, useRun } from "../../state/runStore.ts";
import { useShell } from "../../state/shellStore.ts";
import { careerRunId, summarizeCareer, useCareer, type CareerPlacementBucket } from "../../state/careerStore.ts";
import { Banner, Button, Eyebrow, StatTile, Surface } from "../../ui/index.ts";
import { CareerRunCard, placementLabels, sortRunsNewestFirst } from "./CareerRunCard.tsx";
import "./career.css";

/**
 * Полная история забегов. Сводка на экране итога показывает только последние 8 — здесь
 * лежат ВСЕ записи; ради этого страница и заведена.
 */
export function CareerScreen() {
  const { t } = useI18n();
  const setView = useShell((state) => state.setView);
  const entries = useCareer((state) => state.entries);
  // Тот же замок, что на справочнике: карточка забега показывает, на каком герое играл
  // конкретный игрок, — ровно то, что хардкор прячет. Своя история тут не исключение,
  // иначе режим обходится через настройки.
  const locked = isCodexLocked(useRun((state) => state.config), useRun((state) => state.phase), useRun((state) => state.resumable));

  const summary = summarizeCareer(entries);
  const runs = sortRunsNewestFirst(entries);

  const stats = [
    { label: t("career.runs"), value: summary.runs, kind: "base" as const },
    { label: t("career.undefeated"), value: summary.undefeated, kind: "synergy" as const },
    { label: t("career.flawlessGroup"), value: summary.flawlessGroups, kind: "synergy" as const },
    { label: t("career.gamesWon"), value: summary.gamesWon, kind: "base" as const },
    { label: t("career.gamesLost"), value: summary.gamesLost, kind: "chemistry" as const },
    ...(Object.keys(placementLabels) as CareerPlacementBucket[]).map((bucket, index) => ({
      label: t(placementLabels[bucket]),
      value: summary.placements[bucket],
      kind: (["base", "synergy", "chemistry"] as const)[index % 3],
    })),
  ];

  return (
    <main className="career-page" data-testid="career-screen">
      <Button variant="back" onClick={() => setView("settings")}>← {t("codex.back")}</Button>
      <header className="screen-heading">
        <Eyebrow>{t("career.eyebrow")}</Eyebrow>
        <h1>{t("career.title")}</h1>
        <p>{t("career.subtitle")}</p>
      </header>

      {locked ? (
        <Banner tone="locked" title={<>🔒 {t("codex.locked")}</>}>{t("career.lockedHistory")}</Banner>
      ) : (
        <>
          <Surface className="career-page__stats">
            <h2>{t("career.stats")}</h2>
            <div className="career-page__grid">
              {stats.map((stat) => (
                <StatTile key={stat.label} label={stat.label} value={String(stat.value)} kind={stat.kind} />
              ))}
            </div>
          </Surface>

          <Surface className="career-page__runs">
            <h2>{t("career.allRuns", { count: runs.length })}</h2>
            {runs.length ? (
              <div className="career-page__list">
                {runs.map((entry) => <CareerRunCard key={careerRunId(entry)} entry={entry} />)}
              </div>
            ) : (
              <p className="career-page__empty">{t("career.empty")}</p>
            )}
          </Surface>
        </>
      )}
    </main>
  );
}
