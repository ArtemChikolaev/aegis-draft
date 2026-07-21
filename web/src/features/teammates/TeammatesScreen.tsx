import { useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/core.ts";
import { isCodexLocked, useRun } from "../../state/runStore.ts";
import { useShell } from "../../state/shellStore.ts";
import { useTmaChrome } from "../../state/tmaChrome.ts";
import type { Format, PlayerProfile } from "../../types/data.ts";
import { Banner, Button, Eyebrow, PlayerPicker, Select, Surface } from "../../ui/index.ts";
import { buildTeammateIndex, nicknameIndex, teammateLinks, type TeammateLink } from "./teammateGraph.ts";
import "./teammates.css";

const WINDOWS: { value: Format; label: MessageKey }[] = [
  { value: "last_1y", label: "start.last1y" },
  { value: "last_2y", label: "start.last2y" },
  { value: "last_5y", label: "start.last5y" },
  { value: "valve_legacy", label: "start.valveLegacy" },
];

const SIZE = 460;
const CENTER = SIZE / 2;
const RING = 168;

export function TeammatesScreen() {
  const setView = useShell((state) => state.setView);
  const backNative = useTmaChrome((state) => state.backNative);
  const data = useRun((state) => state.data);
  const { t } = useI18n();
  const [format, setFormat] = useState<Format>("last_2y");
  const [centerId, setCenterId] = useState<number | null>(null);
  // Вся ценность страницы — «кто с кем в составе», то есть ровно то, что закрывает
  // хардкор. Прячем целиком, а не отдельные поля: иначе смысл блокировки теряется.
  const locked = isCodexLocked(useRun((state) => state.config), useRun((state) => state.phase), useRun((state) => state.resumable));

  const index = useMemo(
    () => (data ? buildTeammateIndex(data.packs, data.events, format) : null),
    [data, format],
  );
  const names = useMemo(() => (data ? nicknameIndex(data.packs) : new Map<number, string>()), [data]);

  // Выбирать можно только тех, у кого в ЭТОМ окне есть связи: иначе выбор ведёт в пустоту.
  const pickable = useMemo(() => {
    if (!data || !index) return [];
    const profiles: PlayerProfile[] = [];
    for (const accountId of index.keys()) {
      const profile = data.players[String(accountId)];
      profiles.push(profile ?? {
        accountId,
        nickname: names.get(accountId) ?? `#${accountId}`,
        primaryRole: "mid",
      });
    }
    return profiles.sort((left, right) => left.nickname.localeCompare(right.nickname));
  }, [data, index, names]);

  const links = useMemo(
    () => (index && centerId != null ? teammateLinks(index, names, centerId) : []),
    [index, names, centerId],
  );
  const centerName = centerId == null ? "" : names.get(centerId) ?? `#${centerId}`;
  // Чип пикера НЕ ищем в pickable: там только игроки со связями в текущем окне, и при
  // переключении на узкий период выбранный игрок оттуда пропадал — чип исчезал, а страница
  // оставалась в режиме «игрок выбран». Кто в центре, должно быть видно всегда.
  const centerProfile: PlayerProfile | null = useMemo(() => {
    if (centerId == null) return null;
    return data?.players[String(centerId)]
      ?? { accountId: centerId, nickname: centerName, primaryRole: "mid" };
  }, [data, centerId, centerName]);
  const maxShared = links.reduce((peak, link) => Math.max(peak, link.shared.length), 0);

  return (
    <main className="teammates" data-testid="teammates-screen">
      {!backNative && <Button variant="back" onClick={() => setView("settings")}>← {t("codex.back")}</Button>}
      <header className="screen-heading">
        <Eyebrow>{t("codex.eyebrow")}</Eyebrow>
        <h1>{t("teammates.title")}</h1>
        <p>{t("teammates.subtitle")}</p>
      </header>

      <Surface className="teammates__controls">
        <PlayerPicker
          className="teammates__picker"
          disabled={locked}
          players={pickable}
          value={centerProfile}
          onPick={(picked) => setCenterId(picked.accountId)}
          onClear={() => setCenterId(null)}
          label={t("teammates.player")}
          placeholder={t("teammates.playerSearch")}
          clearLabel={t("heroes.playerClear")}
          shortQueryLabel={t("heroes.playerSearchHint")}
          noResultsLabel={t("teammates.notInWindow")}
          accountLabel={t("heroes.playerAccountId")}
        />
        <Select
          label={t("teammates.window")}
          value={format}
          options={WINDOWS.map((window) => ({ value: window.value, label: t(window.label) }))}
          onChange={(value) => setFormat(value as Format)}
          disabled={locked}
        />
      </Surface>

      {/* Пометка под полями, а не вместо них. */}
      {locked && <Banner tone="locked" title={<>🔒 {t("codex.locked")}</>}>{t("codex.lockedTeammates")}</Banner>}

      {locked || centerId == null ? (
        <Surface className="teammates__empty">{t(locked ? "codex.lockedTeammates" : "teammates.pickFirst")}</Surface>
      ) : (
        <>
          <Surface className="teammates__web on-invert-surface">
            <TeammateWeb centerName={centerName} links={links} maxShared={maxShared} onSelect={setCenterId} />
          </Surface>
          <Surface className="teammates__list">
            <h2 className="settings__section">{t("teammates.list", { count: links.length })}</h2>
            {links.length === 0 ? <p className="muted">{t("teammates.none")}</p> : (
              <ul>
                {links.map((link) => (
                  <li key={link.accountId}>
                    <button type="button" onClick={() => setCenterId(link.accountId)} data-testid={`teammate-${link.accountId}`}>
                      <strong>{link.nickname}</strong>
                      <small>{link.shared.map((event) => event.teamName).filter(unique).join(" · ")}</small>
                    </button>
                    <span className="teammates__count">{t("teammates.events", { count: link.shared.length })}</span>
                  </li>
                ))}
              </ul>
            )}
          </Surface>
        </>
      )}
      <p className="teammates__note">{t("teammates.note")}</p>
    </main>
  );
}

function unique<T>(value: T, index: number, all: T[]): boolean {
  return all.indexOf(value) === index;
}

/** Радиальная паутина: выбранный игрок в центре, соседи кольцом. Толщина луча — сколько
 *  турниров вместе. При 20+ соседях подписи чередуются по радиусу, иначе они наезжают. */
function TeammateWeb({ centerName, links, maxShared, onSelect }: {
  centerName: string;
  links: TeammateLink[];
  maxShared: number;
  onSelect: (accountId: number) => void;
}) {
  const { t } = useI18n();
  if (links.length === 0) {
    return <p className="teammates__web-empty">{t("teammates.none")}</p>;
  }
  const dense = links.length > 18;
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="teammates__svg" role="img" aria-label={t("teammates.webLabel", { player: centerName })}>
      {links.map((link, i) => {
        const angle = (-90 + (360 / links.length) * i) * (Math.PI / 180);
        // Два радиуса вперемешку, когда соседей много: подписи перестают наезжать.
        const radius = dense && i % 2 === 1 ? RING - 34 : RING;
        const x = CENTER + radius * Math.cos(angle);
        const y = CENTER + radius * Math.sin(angle);
        const strength = maxShared > 0 ? link.shared.length / maxShared : 0;
        return (
          <g key={link.accountId} className="teammates__node">
            <line
              x1={CENTER}
              y1={CENTER}
              x2={x}
              y2={y}
              className="teammates__edge"
              strokeWidth={1 + strength * 3.5}
              opacity={0.35 + strength * 0.55}
            />
            <g
              transform={`translate(${x} ${y})`}
              role="button"
              tabIndex={0}
              aria-label={link.nickname}
              onClick={() => onSelect(link.accountId)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(link.accountId); }}
            >
              <circle r={dense ? 5 : 6.5} className="teammates__dot" />
              <text y={-12} className="teammates__name">{link.nickname}</text>
              <text y={18} className="teammates__events">{link.shared.length}</text>
            </g>
          </g>
        );
      })}
      <circle cx={CENTER} cy={CENTER} r={30} className="teammates__center-dot" />
      <text x={CENTER} y={CENTER + 5} className="teammates__center-name">{centerName}</text>
    </svg>
  );
}
