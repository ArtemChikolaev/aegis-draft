import { useEffect, useRef } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { careerRunId, summarizeCareer, useCareer, type CareerPlacementBucket } from "../../state/careerStore.ts";
import { Eyebrow, StatTile, Surface } from "../../ui/index.ts";
import { CareerRunCard, placementLabels, sortRunsNewestFirst } from "../career/CareerRunCard.tsx";

const LAST_RUNS = 8;
export function CareerPanel() {
  const entries = useCareer((state) => state.entries);
  const summary = summarizeCareer(entries);
  const { t } = useI18n();
  // Здесь сознательно СРЕЗ: полная история живёт на своей странице (features/career).
  const recent = sortRunsNewestFirst(entries).slice(0, LAST_RUNS);

  // Список забегов — скролл-контейнер на 2 карточки. Свежий забег идёт первым (сверху), но
  // если контейнер оказался прокручен, верхняя карточка прячется. На появлении нового забега
  // возвращаем ленту наверх — только что сыгранный всегда виден.
  const runsListRef = useRef<HTMLDivElement>(null);
  const newestRunId = recent.length ? careerRunId(recent[0]) : "";
  useEffect(() => {
    runsListRef.current?.scrollTo({ top: 0 });
  }, [newestRunId]);

  const placementStats = (Object.keys(placementLabels) as CareerPlacementBucket[]).map((bucket, index) => ({
    label: t(placementLabels[bucket]), value: summary.placements[bucket], kind: (["base", "synergy", "chemistry"] as const)[index % 3],
  }));
  const performanceStats = [
    { label: t("career.runs"), value: summary.runs, kind: "base" as const },
    { label: t("career.undefeated"), value: summary.undefeated, kind: "synergy" as const },
    { label: t("career.flawlessGroup"), value: summary.flawlessGroups, kind: "synergy" as const },
    { label: t("career.gamesWon"), value: summary.gamesWon, kind: "base" as const },
    { label: t("career.gamesLost"), value: summary.gamesLost, kind: "chemistry" as const },
  ];

  return (
    <section className="career-panel">
      <header className="career-panel__heading">
        <Eyebrow>{t("career.eyebrow")}</Eyebrow>
        <h2>{t("career.title")}</h2>
        <p>{t("career.subtitle")}</p>
      </header>
      <Surface className="career-stats">
        <h3 className="bracket__side-title">{t("career.stats")}</h3>
        <div className="career-stats__grid">
          {[...performanceStats, ...placementStats].map((stat) => (
            <StatTile key={stat.label} label={stat.label} value={String(stat.value)} kind={stat.kind} />
          ))}
        </div>
      </Surface>
      <Surface className="career-runs">
        <h3 className="bracket__side-title">{t("career.lastRuns", { count: LAST_RUNS })}</h3>
        <div className="career-runs__list" ref={runsListRef}>
          {recent.map((entry) => <CareerRunCard key={careerRunId(entry)} entry={entry} />)}
        </div>
      </Surface>
    </section>
  );
}
