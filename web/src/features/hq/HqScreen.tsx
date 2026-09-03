// Штаб (T6.4, срез 1; PRD §5.10.1): постоянное пространство МЕЖДУ забегами — коллекция открытых
// карт, трофеи и мастерство ставок. Это мета-хаб, а не источник силы: ничего отсюда не переносится
// в забег (PRD запрещает постоянный +OVR), поэтому все данные — производные карьеры (careerStore),
// отдельного хранилища нет. Разбор карты — тот же BuildCardInspector, что в Буткемпе.
import { useState } from "react";
import { CAMP_ACTION_IDS } from "../../game/campActions.ts";
import { ITEM_IDS } from "../../game/items.ts";
import { itemArtSlug } from "../../game/itemArt.ts";
import { TACTIC_IDS } from "../../game/tactics.ts";
import { mutatorDescParams } from "../../game/dynastyMutators.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/core.ts";
import { navigateBack } from "../../state/navigation.ts";
import { useTmaChrome } from "../../state/tmaChrome.ts";
import { HQ_STAKE_ORDER, collectionStats, hqTrophies, useCareer, type CardCollectionStat } from "../../state/careerStore.ts";
import { Banner, Button, Eyebrow, ItemIcon, StatTile, Surface } from "../../ui/index.ts";
import { BuildCardInspector } from "../run/BuildCardInspector.tsx";
import "./hq.css";

type CardKind = "tactic" | "item" | "action";

const GROUPS: { kind: CardKind; title: MessageKey; ids: readonly string[] }[] = [
  { kind: "tactic", title: "camp.tactics", ids: TACTIC_IDS },
  { kind: "item", title: "hq.items", ids: ITEM_IDS },
  { kind: "action", title: "camp.campActions", ids: CAMP_ACTION_IDS },
];

export function HqScreen() {
  const { t } = useI18n();
  const backNative = useTmaChrome((state) => state.backNative);
  const entries = useCareer((state) => state.entries);
  const [inspected, setInspected] = useState<string | null>(null);
  const stats = collectionStats(entries);
  const trophies = hqTrophies(entries);
  const total = GROUPS.reduce((sum, group) => sum + group.ids.length, 0);
  const discovered = GROUPS.reduce((sum, group) => sum + group.ids.filter((id) => stats[id]).length, 0);
  const num = (value: number | null) => (value == null ? t("hq.none") : String(value));

  return (
    <main className="hq" data-testid="hq-screen">
      {!backNative && <Button variant="back" onClick={navigateBack}>← {t("codex.back")}</Button>}
      <header className="screen-heading">
        <Eyebrow>{t("hq.eyebrow")}</Eyebrow>
        <h1>{t("hq.title")}</h1>
        <p>{t("hq.subtitle")}</p>
      </header>

      <Surface className="hq__panel">
        <h2 className="hq__section">{t("hq.trophies")}</h2>
        <div className="hq__tiles">
          <StatTile label={t("hq.rogueliteRuns")} value={String(trophies.rogueliteRuns)} kind="base" />
          <StatTile label={t("hq.seasonsWon")} value={String(trophies.seasonsWon)} kind="synergy" />
          <StatTile label={t("hq.bestStage")} value={num(trophies.bestStage)} kind="base" />
          <StatTile label={t("hq.dynastyBest")} value={trophies.dynastyBest == null ? t("hq.none") : `+${trophies.dynastyBest}`} kind="synergy" />
          <StatTile label={t("hq.dailyPlayed")} value={String(trophies.dailyPlayed)} kind="chemistry" />
        </div>
      </Surface>

      <Surface className="hq__panel">
        <h2 className="hq__section">{t("hq.stakes")}</h2>
        {!trophies.stakesUnlocked && <Banner tone="locked" title={<>🔒 {t("hq.stakes")}</>}>{t("hq.stakesLocked")}</Banner>}
        <ul className="hq__stakes" data-testid="hq-stakes">
          {HQ_STAKE_ORDER.map((id) => {
            const wins = trophies.stakeWins[id] ?? 0;
            return (
              <li key={id} data-cleared={wins > 0}>
                <strong>☄ {t(`mutator.${id}` as MessageKey)}</strong>
                <span>{t(`mutator.desc.${id}` as MessageKey, mutatorDescParams(id))}</span>
                <em>{wins > 0 ? `✓ ${t("hq.stakeWins", { n: wins })}` : t("hq.stakeNoWins")}</em>
              </li>
            );
          })}
        </ul>
      </Surface>

      <Surface className="hq__panel">
        <h2 className="hq__section">{t("hq.collection")}</h2>
        <p className="hq__hint" data-testid="hq-collection-hint">{t("hq.collectionHint", { n: discovered, total })}</p>
        {GROUPS.map((group) => (
          <section key={group.kind} className="hq__group">
            <h3>{t(group.title)}</h3>
            <div className="hq__cards">
              {group.ids.map((id) => (
                <CardTile key={id} id={id} kind={group.kind} stat={stats[id]} onOpen={() => setInspected(id)} />
              ))}
            </div>
          </section>
        ))}
      </Surface>

      {inspected && (
        <BuildCardInspector cardId={inspected} rarity="common" activeHeroes={[]} cardRarity={{}} onClose={() => setInspected(null)} />
      )}
    </main>
  );
}

function CardTile({ id, kind, stat, onOpen }: { id: string; kind: CardKind; stat?: CardCollectionStat; onOpen: () => void }) {
  const { t } = useI18n();
  const label = t(`${kind}.${id}` as MessageKey);
  const slug = itemArtSlug(id);
  const discovered = Boolean(stat);
  return (
    <button
      type="button"
      className="hq-card"
      data-kind={kind}
      data-card-id={id}
      data-discovered={discovered}
      aria-label={`${label} · ${t("camp.offerDetails")}`}
      onClick={onOpen}
    >
      <span className="hq-card__art" aria-hidden="true">
        {slug ? <ItemIcon slug={slug} name={label} size="sm" /> : <b>{label.slice(0, 2)}</b>}
      </span>
      <strong className="hq-card__name">{label}</strong>
      <small className="hq-card__meta">
        {stat
          ? [t("hq.taken", { n: stat.taken }), stat.won > 0 ? t("hq.wonWith", { n: stat.won }) : null, stat.bestStage != null ? t("hq.bestWith", { n: stat.bestStage }) : null]
            .filter(Boolean).join(" · ")
          : t("hq.undiscovered")}
      </small>
    </button>
  );
}
