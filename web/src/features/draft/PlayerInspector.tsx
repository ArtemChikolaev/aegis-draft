import { useEffect, useState } from "react";
import type { Candidate } from "../../game/packs.ts";
import type { GameData, Stat } from "../../types/data.ts";
import { useRun } from "../../state/runStore.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { heroGamesMessageKey } from "../../i18n/core.ts";
import { Button, HeroThumb, Modal } from "../../ui/index.ts";

interface HeroStatRow {
  heroId: number;
  stat: Stat;
}

export function PlayerInspector({ candidate, data, onClose }: {
  candidate: Candidate;
  data: GameData;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const accountKey = String(candidate.player.accountId);
  const event = data.events.find((item) => item.id === candidate.eventId);
  // Турнирная статистика — отложенный файл (см. types/data.ts): дотягиваем по первому открытию.
  const loadEventHeroStats = useRun((state) => state.loadEventHeroStats);
  const [eventStats, setEventStats] = useState(data.eventHeroStats ?? null);
  useEffect(() => {
    if (eventStats) return;
    let alive = true;
    loadEventHeroStats()
      .then(() => { if (alive) setEventStats(data.eventHeroStats ?? {}); })
      .catch(() => { if (alive) setEventStats({}); });
    return () => { alive = false; };
  }, [eventStats, loadEventHeroStats, data]);
  const eventRows = statRows(eventStats?.[candidate.eventId]?.[accountKey]);
  const careerRows = statRows(data.careerPlayerHeroStats?.[accountKey] ?? data.playerHeroStats[accountKey]);
  const heroes = new Map(data.heroes.map((hero) => [hero.id, hero]));

  return (
    <Modal
      title={candidate.player.nickname}
      description={`${candidate.teamName} · ${event?.name ?? candidate.eventId}`}
      subhead={(
        <a
          className="player-inspector__external"
          href={`https://datdota.com/players/${candidate.player.accountId}`}
          target="_blank"
          rel="noreferrer"
        >
          {t("draft.openDatdota")} ↗
        </a>
      )}
      labelledBy="player-inspector-title"
      onClose={onClose}
      dismissLabel={t("common.close")}
      layout="content"
    >
      {({ close }) => (
        <div className="player-inspector">
          {/* T7.3: карточка кандидата показывает IMP/ECO/REL голыми аббревиатурами, а hover-title
              не существует на тапе — расшифровка живёт здесь видимым текстом. */}
          <section className="player-inspector__section">
            <h3>{t("draft.statsTitle")}</h3>
            <ul className="player-inspector__stat-list">
              <li><b>{candidate.player.impact}</b><span>{t("draft.statImpHint")}</span></li>
              <li><b>{candidate.player.economy}</b><span>{t("draft.statEcoHint")}</span></li>
              <li><b>{candidate.player.reliability}</b><span>{t("draft.statRelHint")}</span></li>
            </ul>
            <p className="player-inspector__stat-note">{t("draft.statsLegend")}</p>
          </section>
          <HeroStats
            title={t("draft.eventHeroStats", { event: event?.short ?? event?.name ?? candidate.eventId })}
            rows={eventRows}
            heroes={heroes}
            emptyText={eventStats ? undefined : t("draft.eventHeroStatsLoading")}
          />
          <HeroStats title={t("draft.careerHeroStats")} rows={careerRows} heroes={heroes} />
          <Button variant="primaryInvert" onClick={close}>{t("draft.closePlayerStats")}</Button>
        </div>
      )}
    </Modal>
  );
}

function HeroStats({ title, rows, heroes, emptyText }: {
  title: string;
  rows: HeroStatRow[];
  heroes: Map<number, GameData["heroes"][number]>;
  /** Подпись пустого списка вместо «нет данных» — пока отложенный файл ещё едет. */
  emptyText?: string;
}) {
  const { locale, t } = useI18n();
  return (
    <section className="player-inspector__section">
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="muted">{emptyText ?? t("common.empty")}</p> : (
        <div className="player-inspector__grid">
          {rows.map(({ heroId, stat }) => {
            const hero = heroes.get(heroId);
            return (
              <div className="player-inspector__row" key={heroId}>
                <HeroThumb picture={hero?.picture ?? ""} name={hero?.name ?? `#${heroId}`} />
                <span>{t(heroGamesMessageKey(locale, stat.games), { count: stat.games })}</span>
                <strong>{Math.round(stat.winrate * 100)}%</strong>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function statRows(stats?: Record<string, Stat>): HeroStatRow[] {
  return Object.entries(stats ?? {})
    .map(([heroId, stat]) => ({ heroId: Number(heroId), stat }))
    .sort((left, right) => right.stat.games - left.stat.games || left.heroId - right.heroId);
}
