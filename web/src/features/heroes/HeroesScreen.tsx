import { useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { isCodexLocked, useRun } from "../../state/runStore.ts";
import { useShell } from "../../state/shellStore.ts";
import type { PlayerProfile } from "../../types/data.ts";
import { Banner, Button, Eyebrow, HeroThumb, PlayerPicker, Select, Surface, TextField } from "../../ui/index.ts";
import { heroPopularity, sortHeroes, type HeroSort } from "./heroPopularity.ts";
import "./heroes.css";

export function HeroesScreen() {
  const setView = useShell((state) => state.setView);
  const data = useRun((state) => state.data);
  const { t } = useI18n();
  const [sort, setSort] = useState<HeroSort>("games");
  const [query, setQuery] = useState("");
  const [player, setPlayer] = useState<PlayerProfile | null>(null);
  const locked = isCodexLocked(useRun((state) => state.config), useRun((state) => state.phase), useRun((state) => state.resumable));
  // Забег в хардкоре мог начаться, пока страница открыта, — выбранного игрока сбрасываем.
  const shownPlayer = locked ? null : player;

  // Выбираем только тех, по кому вообще есть статистика: иначе можно ткнуть в игрока
  // и получить пустую страницу.
  const pickable = useMemo(() => {
    if (!data) return [];
    return Object.values(data.players)
      .filter((profile) => Object.values(data.careerPlayerHeroStats[String(profile.accountId)] ?? {})
        .some((stat) => stat.games > 0))
      .sort((left, right) => left.nickname.localeCompare(right.nickname) || left.accountId - right.accountId);
  }, [data]);

  // Одна и та же агрегация на оба режима: для игрока подаём срез из одного ключа.
  // Общий свод считаем один раз на датасет, не на каждый ввод в поиске.
  const rows = useMemo(() => {
    if (!data) return [];
    if (!shownPlayer) return heroPopularity(data.heroes, data.careerPlayerHeroStats);
    const own = data.careerPlayerHeroStats[String(shownPlayer.accountId)] ?? {};
    return heroPopularity(data.heroes, { [String(shownPlayer.accountId)]: own })
      .filter((row) => row.games > 0);
  }, [data, shownPlayer]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle ? rows.filter((row) => row.name.toLowerCase().includes(needle)) : rows;
    return sortHeroes(filtered, sort);
  }, [rows, sort, query]);

  // Шкала бара — от лидера ТЕКУЩЕЙ сортировки, иначе при сортировке по винрейту
  // все бары схлопываются в одинаковые (винрейты жмутся к 50%).
  const peak = visible.length ? Math.max(...visible.map((row) => barValue(row, sort))) : 0;
  const note = shownPlayer ? "heroes.playerNote" : "heroes.note";

  return (
    <main className="heroes" data-testid="heroes-screen">
      <Button variant="back" onClick={() => setView("settings")}>← {t("codex.back")}</Button>
      <header className="screen-heading">
        <Eyebrow>{t("codex.eyebrow")}</Eyebrow>
        <h1>{shownPlayer ? shownPlayer.nickname : t("heroes.title")}</h1>
        <p>{shownPlayer ? t("heroes.playerSubtitle") : t("heroes.subtitle")}</p>
      </header>

      <Surface className="heroes__controls">
        <TextField
          className="heroes__search"
          type="search"
          value={query}
          placeholder={t("heroes.search")}
          aria-label={t("heroes.search")}
          onChange={(event) => setQuery(event.target.value)}
        />
        <PlayerPicker
          className="heroes__player-picker"
          disabled={locked}
          players={pickable}
          value={player}
          onPick={(picked) => { setPlayer(picked); setSort("games"); setQuery(""); }}
          onClear={() => { setPlayer(null); setQuery(""); }}
          label={t("heroes.player")}
          placeholder={t("heroes.playerSearch")}
          clearLabel={t("heroes.playerClear")}
          shortQueryLabel={t("heroes.playerSearchHint")}
          noResultsLabel={t("heroes.playerNotFound")}
          accountLabel={t("heroes.playerAccountId")}
        />
        <div className="heroes__sort">
          <Select
            label={t("heroes.sort")}
            value={sort}
            options={[
              { value: "games", label: t("heroes.sortGames") },
              // «По числу игроков» осмысленно только в общем своде: у одного игрока там всегда 1.
              ...(shownPlayer ? [] : [{ value: "players", label: t("heroes.sortPlayers") }]),
              { value: "winrate", label: t("heroes.sortWinrate") },
            ]}
            onChange={(value) => setSort(value as HeroSort)}
          />
        </div>
      </Surface>
      {/* Пометка под полями, а не вместо них: поле видно и понятно, что оно закрыто. */}
      {locked && <Banner tone="locked" title={<>🔒 {t("codex.locked")}</>}>{t("codex.lockedHeroes")}</Banner>}

      <Surface className={`heroes__list${shownPlayer ? " heroes__list--player" : ""}`}>
        {visible.length === 0 ? <p className="muted">{t("common.empty")}</p> : (
          <ol>
            {visible.map((row, index) => (
              <li key={row.id}>
                <span className="heroes__rank">{index + 1}</span>
                <HeroThumb picture={row.picture} name={row.name} />
                <span className="heroes__bar" aria-hidden="true">
                  <span style={{ width: `${peak > 0 ? (barValue(row, sort) / peak) * 100 : 0}%` }} />
                </span>
                <span className="heroes__stat"><b>{row.games.toLocaleString()}</b>{t("heroes.games")}</span>
                {!shownPlayer && <span className="heroes__stat"><b>{row.players}</b>{t("heroes.players")}</span>}
                <span className="heroes__stat">
                  <b>{row.winrate == null ? "—" : `${(row.winrate * 100).toFixed(1)}%`}</b>{t("heroes.winrate")}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Surface>
      <p className="heroes__note">{t(note)}</p>
    </main>
  );
}

function barValue(row: { games: number; players: number; winrate: number | null }, sort: HeroSort): number {
  if (sort === "players") return row.players;
  if (sort === "winrate") return row.winrate ?? 0;
  return row.games;
}
