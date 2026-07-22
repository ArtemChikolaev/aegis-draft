import { roleMessageKey, type MessageKey } from "../../i18n/core.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { type CareerConfigLabel, type CareerEntry, type CareerPlacementBucket } from "../../state/careerStore.ts";
import { HeroThumb, playerOvrTier, RoleTag } from "../../ui/index.ts";
import { useHero } from "../draft/heroes.ts";
import "./career.css";

/** Общий словарь мест — нужен и сводке на итоге, и странице истории. */
export const placementLabels: Record<CareerPlacementBucket, MessageKey> = {
  "1": "career.place.1", "2": "career.place.2", "3": "career.place.3", "4": "career.place.4",
  "5-6": "career.place.5-6", "7-8": "career.place.7-8", rest: "career.place.rest",
};

export function configKeys(config: CareerConfigLabel): MessageKey[] {
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

/** Свежие сверху. Общая сортировка: и сводка на итоге, и страница истории читают один порядок. */
export function sortRunsNewestFirst(entries: CareerEntry[]): CareerEntry[] {
  return [...entries].sort((left, right) => right.finishedAt.localeCompare(left.finishedAt));
}

/**
 * Карточка одного забега. Живёт здесь, а не в features/tournament: её показывают ДВЕ
 * поверхности — сводка на экране итога и страница истории в настройках. Разъехавшиеся
 * копии карточки были бы худшим вариантом из возможных.
 */
export function CareerRunCard({ entry }: { entry: CareerEntry }) {
  const hero = useHero();
  const { locale, t } = useI18n();

  return (
    <article className={`career-run${entry.configLabel.hardMode ? " career-run--hardcore" : ""}`}>
      <header className="career-run__heading">
        <strong>{t(`tournament.place.${entry.placement}` as MessageKey)}</strong>
        <span>
          {t("career.teamOvr", { value: Math.round(entry.score.teamOvr) })}
          {entry.configLabel.mode === "run" && entry.rogueliteStage && (
            <> · <em className="career-run__stage">{t("ante.stage", { n: entry.rogueliteStage.index + 1, count: entry.rogueliteStage.count })}</em></>
          )}
        </span>
        <small>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(entry.finishedAt))}</small>
      </header>
      <p className="career-run__config">
        {entry.configLabel.mode === "run" && <><em className="career-run__mode">{t("career.roguelite")}</em> · </>}
        {configKeys(entry.configLabel).map((key) => t(key)).join(" · ")}
        {entry.configLabel.hardMode && <> · <em className="career-run__hard">{t("hard.badge")}</em></>}
      </p>
      <ul className="career-run__roster">
        {entry.roster.map((player) => {
          const info = hero(player.heroId);
          return (
            <li
              key={player.accountId}
              className={player.ovr != null ? `card-edge--gold card-tint--${playerOvrTier(player.ovr)}` : undefined}
            >
              <RoleTag role={player.role}>{t(roleMessageKey(player.role))}</RoleTag>
              <strong>{player.nickname}</strong>
              <HeroThumb picture={info.picture} name={info.name} showName={false} />
            </li>
          );
        })}
      </ul>
    </article>
  );
}
