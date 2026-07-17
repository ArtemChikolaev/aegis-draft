import { useEffect, useRef } from "react";
import { roleMessageKey, type MessageKey } from "../../i18n/core.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import {
  careerRunId,
  summarizeCareer,
  useCareer,
  type CareerConfigLabel,
  type CareerPlacementBucket,
} from "../../state/careerStore.ts";
import { Eyebrow, HeroThumb, RoleTag, StatTile, Surface } from "../../ui/index.ts";
import { useHero } from "../draft/heroes.ts";

const LAST_RUNS = 8;
const placementLabels: Record<CareerPlacementBucket, MessageKey> = {
  "1": "career.place.1", "2": "career.place.2", "3": "career.place.3", "4": "career.place.4",
  "5-6": "career.place.5-6", "7-8": "career.place.7-8", rest: "career.place.rest",
};

function configKeys(config: CareerConfigLabel): MessageKey[] {
  const format: Record<CareerConfigLabel["format"], MessageKey> = {
    last_1y: "start.last1y", last_2y: "start.last2y", last_5y: "start.last5y", valve_legacy: "start.valveLegacy",
  };
  const difficulty: Record<CareerConfigLabel["difficulty"], MessageKey> = {
    hard: "start.hard", normal: "start.normal", smurfing: "start.smurfing", easy: "start.easy",
  };
  const scoring: Record<CareerConfigLabel["scoring"], MessageKey> = { event: "start.eventRating", peak: "start.peakRating" };
  const draft: Record<CareerConfigLabel["draftStyle"], MessageKey> = { team: "start.teamPacks", mixed: "start.mixedDraft" };
  return [format[config.format], difficulty[config.difficulty], scoring[config.scoring], draft[config.draftStyle]];
}

export function CareerPanel() {
  const entries = useCareer((state) => state.entries);
  const summary = summarizeCareer(entries);
  const hero = useHero();
  const { locale, t } = useI18n();
  const recent = [...entries]
    .sort((left, right) => right.finishedAt.localeCompare(left.finishedAt))
    .slice(0, LAST_RUNS);

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
          {recent.map((entry) => (
            <article className="career-run" key={careerRunId(entry)}>
              <header className="career-run__heading">
                <strong>{t(`tournament.place.${entry.placement}` as MessageKey)}</strong>
                <span>{t("career.teamOvr", { value: Math.round(entry.score.teamOvr) })}</span>
                <small>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(entry.finishedAt))}</small>
              </header>
              <p className="career-run__config">{configKeys(entry.configLabel).map((key) => t(key)).join(" · ")}</p>
              <ul className="career-run__roster">
                {entry.roster.map((player) => {
                  const info = hero(player.heroId);
                  return (
                    <li key={player.accountId}>
                      <RoleTag role={player.role}>{t(roleMessageKey(player.role))}</RoleTag>
                      <strong>{player.nickname}</strong>
                      <HeroThumb picture={info.picture} name={info.name} showName={false} />
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
      </Surface>
    </section>
  );
}
