import { useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useRun } from "../../state/runStore.ts";
import { useShell } from "../../state/shellStore.ts";
import { Button, Eyebrow, HeroThumb, Select, Surface } from "../../ui/index.ts";
import { heroPopularity, sortHeroes, type HeroSort } from "./heroPopularity.ts";
import "./heroes.css";

export function HeroesScreen() {
  const setView = useShell((state) => state.setView);
  const data = useRun((state) => state.data);
  const { t } = useI18n();
  const [sort, setSort] = useState<HeroSort>("games");
  const [query, setQuery] = useState("");

  // Агрегация по 5246 игрокам — считаем один раз на датасет, не на каждый ввод в поиске.
  const rows = useMemo(
    () => (data ? heroPopularity(data.heroes, data.careerPlayerHeroStats) : []),
    [data],
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle ? rows.filter((row) => row.name.toLowerCase().includes(needle)) : rows;
    return sortHeroes(filtered, sort);
  }, [rows, sort, query]);

  // Шкала бара — от лидера ТЕКУЩЕЙ сортировки, иначе при сортировке по винрейту
  // все бары схлопываются в одинаковые (винрейты жмутся к 50%).
  const peak = visible.length ? Math.max(...visible.map((row) => barValue(row, sort))) : 0;

  return (
    <main className="heroes" data-testid="heroes-screen">
      <Button variant="back" onClick={() => setView("settings")}>← {t("codex.back")}</Button>
      <header className="screen-heading">
        <Eyebrow>{t("codex.eyebrow")}</Eyebrow>
        <h1>{t("heroes.title")}</h1>
        <p>{t("heroes.subtitle")}</p>
      </header>

      <Surface className="heroes__controls">
        <input
          className="heroes__search"
          type="search"
          value={query}
          placeholder={t("heroes.search")}
          aria-label={t("heroes.search")}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select
          label={t("heroes.sort")}
          value={sort}
          options={[
            { value: "games", label: t("heroes.sortGames") },
            { value: "players", label: t("heroes.sortPlayers") },
            { value: "winrate", label: t("heroes.sortWinrate") },
          ]}
          onChange={(value) => setSort(value as HeroSort)}
        />
      </Surface>

      <Surface className="heroes__list">
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
                <span className="heroes__stat"><b>{row.players}</b>{t("heroes.players")}</span>
                <span className="heroes__stat">
                  <b>{row.winrate == null ? "—" : `${(row.winrate * 100).toFixed(1)}%`}</b>{t("heroes.winrate")}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Surface>
      <p className="heroes__note">{t("heroes.note")}</p>
    </main>
  );
}

function barValue(row: { games: number; players: number; winrate: number | null }, sort: HeroSort): number {
  if (sort === "players") return row.players;
  if (sort === "winrate") return row.winrate ?? 0;
  return row.games;
}
