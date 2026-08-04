import type { Candidate } from "../../game/packs.ts";
import type { GameData, Stat } from "../../types/data.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { heroGamesMessageKey } from "../../i18n/core.ts";
import { Button, HeroThumb, Modal, RemoteAvatar } from "../../ui/index.ts";

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
  const eventRows = statRows(data.eventHeroStats[candidate.eventId]?.[accountKey]);
  const careerRows = statRows(data.careerPlayerHeroStats?.[accountKey] ?? data.playerHeroStats[accountKey]);
  const heroes = new Map(data.heroes.map((hero) => [hero.id, hero]));

  return (
    <Modal
      /* Аватар — там, где игрок ОДИН. В паке он был бы рваным рядом: покрытие ~35% (источник
         перечисляет действующих про, а составы у нас исторические), и три карточки из пяти
         остались бы с монограммой. В профиле сравнивать не с чем, поэтому картинка только
         помогает. Нет аватара — монограмма из ника, место не пустует. */
      mark={(
        <RemoteAvatar
          src={data.players?.[accountKey]?.avatarUrl}
          name={candidate.player.nickname}
          shape="round"
          size="lg"
          fallback={candidate.player.nickname.slice(0, 2)}
        />
      )}
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
          <HeroStats title={t("draft.eventHeroStats", { event: event?.short ?? event?.name ?? candidate.eventId })} rows={eventRows} heroes={heroes} />
          <HeroStats title={t("draft.careerHeroStats")} rows={careerRows} heroes={heroes} />
          <Button variant="primaryInvert" onClick={close}>{t("draft.closePlayerStats")}</Button>
        </div>
      )}
    </Modal>
  );
}

function HeroStats({ title, rows, heroes }: {
  title: string;
  rows: HeroStatRow[];
  heroes: Map<number, GameData["heroes"][number]>;
}) {
  const { locale, t } = useI18n();
  return (
    <section className="player-inspector__section">
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="muted">{t("common.empty")}</p> : (
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
