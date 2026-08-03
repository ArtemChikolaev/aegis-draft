import { useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { isCodexLocked, showsHeroTags, useRun } from "../../state/runStore.ts";
import { navigateBack } from "../../state/navigation.ts";
import { useTmaChrome } from "../../state/tmaChrome.ts";
import type { PlayerProfile } from "../../types/data.ts";
import { Banner, Button, Eyebrow, HeroThumb, PlayerPicker, Select, Surface, TagChips, TextField, type TagChip } from "../../ui/index.ts";
import { GAMEPLAY_TAGS, HERO_ATTRS, LORE_TAGS, heroTags } from "../../game/heroTags.ts";
import type { MessageKey } from "../../i18n/core.ts";
import { heroPopularity, sortHeroes, type HeroSort } from "./heroPopularity.ts";
import "./heroes.css";

export function HeroesScreen() {
  const backNative = useTmaChrome((state) => state.backNative);
  const data = useRun((state) => state.data);
  const { t } = useI18n();
  const [sort, setSort] = useState<HeroSort>("games");
  const [query, setQuery] = useState("");
  // Фильтр по тегу (R11.7): «покажи всех illusion». Пустая строка — фильтра нет.
  const [tag, setTag] = useState("");
  const [player, setPlayer] = useState<PlayerProfile | null>(null);
  const locked = isCodexLocked(useRun((state) => state.config), useRun((state) => state.phase), useRun((state) => state.resumable));
  // Теги — механика Roguelite Run (см. showsHeroTags): вне её ни чипов, ни фильтра по тегу.
  const withTags = showsHeroTags(useRun((state) => state.selectedMode), useRun((state) => state.resumable));
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
  // Забег мог смениться, пока страница открыта: без тегов фильтр по тегу не должен молча
  // продолжать сужать список — контрола, чтобы его снять, на экране уже нет.
  const activeTag = withTags ? tag : "";
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const byName = needle ? rows.filter((row) => row.name.toLowerCase().includes(needle)) : rows;
    const byTag = activeTag ? byName.filter((row) => heroHasTag(row.id, activeTag)) : byName;
    return sortHeroes(byTag, sort);
  }, [rows, sort, query, activeTag]);

  // Шкала бара — от лидера ТЕКУЩЕЙ сортировки, иначе при сортировке по винрейту
  // все бары схлопываются в одинаковые (винрейты жмутся к 50%).
  const peak = visible.length ? Math.max(...visible.map((row) => barValue(row, sort))) : 0;
  const note = shownPlayer ? "heroes.playerNote" : "heroes.note";

  return (
    <main className="heroes" data-testid="heroes-screen">
      {!backNative && <Button variant="back" onClick={navigateBack}>← {t("codex.back")}</Button>}
      <header className="screen-heading">
        <Eyebrow>{t("codex.eyebrow")}</Eyebrow>
        <h1>{shownPlayer ? shownPlayer.nickname : t("heroes.title")}</h1>
        <p>{shownPlayer ? t("heroes.playerSubtitle") : t("heroes.subtitle")}</p>
      </header>

      <Surface className={`heroes__controls${withTags ? "" : " heroes__controls--no-tags"}`}>
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
        {withTags && (
          <div className="heroes__tag">
            <Select
              label={t("heroes.tagFilter")}
              value={tag}
              options={tagOptions(t)}
              data-testid="heroes-tag-filter"
              onChange={setTag}
            />
          </div>
        )}
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

      <Surface className={`heroes__list${shownPlayer ? " heroes__list--player" : ""}${withTags ? "" : " heroes__list--no-tags"}`}>
        {visible.length === 0 ? <p className="muted">{t("common.empty")}</p> : (
          <ol>
            {visible.map((row, index) => (
              <li key={row.id}>
                <span className="heroes__rank">{index + 1}</span>
                <HeroThumb picture={row.picture} name={row.name} />
                {withTags && (
                  <TagChips
                    chips={heroChips(row.id, t)}
                    testId={`hero-tags-${row.id}`}
                    onSelect={setTag}
                    selectLabel={() => t("heroTag.showAll")}
                  />
                )}
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

/** Чипы тегов героя для справочника (R11.7): атрибут (объективный слой) + lore + gameplay.
 *  Здесь показываем ВЕСЬ набор — в отличие от узких карточек Буткемпа: справочник для того и
 *  существует, чтобы ответить на вопрос «какой это герой», а не «сработает ли карточка». */
function heroChips(
  heroId: number,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): TagChip[] {
  const tags = heroTags(heroId);
  if (!tags) return [];
  return [
    { key: tags.attr, label: t(`heroAttr.${tags.attr}` as MessageKey), tone: "attribute" },
    ...tags.lore.map((tag) => ({
      key: tag,
      label: t(`heroTag.${tag}` as MessageKey),
      tone: "lore" as const,
    })),
    ...tags.play.map((tag) => ({
      key: tag,
      label: t(`heroTag.${tag}` as MessageKey),
      tone: "gameplay" as const,
    })),
  ];
}

/** Есть ли у героя тег ИЛИ атрибут — для игрока это один вопрос, разница только в слое данных. */
function heroHasTag(heroId: number, tag: string): boolean {
  const tags = heroTags(heroId);
  if (!tags) return false;
  if (tags.attr === tag) return true;
  return (tags.lore as readonly string[]).includes(tag)
    || (tags.play as readonly string[]).includes(tag);
}

/** Опции фильтра: атрибуты, затем lore, затем gameplay — тремя группами, как устроены сами теги.
 *  Группы подписаны префиксом, а не `optgroup`: `Select` — общий примитив с плоским контрактом,
 *  и раздувать его ради одного экрана нельзя (frontend-architecture: переиспользуем, не форкаем). */
function tagOptions(t: (key: MessageKey, vars?: Record<string, string | number>) => string) {
  const group = (key: MessageKey, values: readonly string[], prefix: "heroAttr" | "heroTag") =>
    values.map((value) => ({
      value,
      label: `${t(key)} · ${t(`${prefix}.${value}` as MessageKey)}`,
    }));
  return [
    { value: "", label: t("heroes.tagAll") },
    ...group("heroes.tagGroupAttr", HERO_ATTRS, "heroAttr"),
    ...group("heroes.tagGroupLore", LORE_TAGS, "heroTag"),
    ...group("heroes.tagGroupPlay", GAMEPLAY_TAGS, "heroTag"),
  ];
}

function barValue(row: { games: number; players: number; winrate: number | null }, sort: HeroSort): number {
  if (sort === "players") return row.players;
  if (sort === "winrate") return row.winrate ?? 0;
  return row.games;
}
