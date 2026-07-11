import { useState } from "react";
import { useRun, type RunMode } from "../state/runStore.ts";
import { useI18n } from "../i18n/I18nProvider.tsx";
import type { MessageKey } from "../i18n/core.ts";
import type { RunConfig, DraftStyle, Scoring, Allocation } from "../game/packs.ts";
import type { Format } from "../types/data.ts";

interface Opt<T> {
  value: T;
  label: MessageKey;
  hint?: MessageKey;
  soon?: boolean;
}

const MODES: { value: RunMode; label: MessageKey; hint: MessageKey; detail: MessageKey; available: boolean }[] = [
  { value: "classic", label: "start.modeClassic", hint: "start.modeClassicHint", detail: "start.modeClassicLong", available: true },
  { value: "manager", label: "start.modeManager", hint: "start.modeManagerHint", detail: "start.modeManagerLong", available: false },
  { value: "tournament", label: "start.modeTournament", hint: "start.modeTournamentHint", detail: "start.modeTournamentLong", available: false },
];

const DRAFT: Opt<DraftStyle>[] = [
  { value: "team", label: "start.teamPacks", hint: "start.teamPacksHint" },
  { value: "mixed", label: "start.mixedDraft", hint: "start.mixedDraftHint" },
];
const FORMAT: Opt<Format>[] = [
  { value: "last_1y", label: "start.last1y" },
  { value: "last_2y", label: "start.last2y", hint: "start.standard" },
  { value: "last_5y", label: "start.last5y" },
  { value: "valve_legacy", label: "start.valveLegacy", hint: "start.legacyHint" },
];
const DIFFICULTY: Opt<number>[] = [
  { value: 0, label: "start.hard", hint: "start.rerolls0" },
  { value: 1, label: "start.normal", hint: "start.rerolls1" },
  { value: 2, label: "start.smurfing", hint: "start.rerolls2" },
  { value: Infinity, label: "start.easy", hint: "start.rerollsInfinite" },
];
const SCORING: Opt<Scoring>[] = [
  { value: "event", label: "start.eventRating", hint: "start.eventRatingHint" },
  { value: "peak", label: "start.peakRating", hint: "start.peakRatingHint", soon: true },
];
const ALLOCATION: Opt<Allocation>[] = [
  { value: "auto", label: "start.automatic", hint: "start.automaticHint" },
  { value: "manual", label: "start.manual", hint: "start.manualHint", soon: true },
];

function Group<T>({ title, options, value, onChange }: {
  title: MessageKey;
  options: Opt<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="config-group">
      <legend>{t(title)}</legend>
      <div className="option-grid">
        {options.map((option) => (
          <button
            type="button"
            key={String(option.value)}
            className={`option ${option.value === value ? "option--active" : ""}`}
            disabled={option.soon}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            <span className="option__label">{t(option.label)}{option.soon && <em>{t("common.soon")}</em>}</span>
            {option.hint && <span className="option__hint">{t(option.hint)}</span>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function StartScreen() {
  const start = useRun((state) => state.start);
  const formats = useRun((state) => state.data?.manifest.formats ?? []);
  const { t } = useI18n();
  const mode = useRun((state) => state.selectedMode);
  const setMode = useRun((state) => state.setSelectedMode);
  const [config, setConfig] = useState<RunConfig>({
    draftStyle: "team",
    format: "last_2y",
    rerolls: 1,
    scoring: "event",
    allocation: "auto",
  });
  const set = <K extends keyof RunConfig>(key: K, value: RunConfig[K]) => setConfig((current) => ({ ...current, [key]: value }));
  const formatAvailable = (format: Format) => formats.includes(format);
  const selectedLabels: MessageKey[] = [
    DRAFT.find((option) => option.value === config.draftStyle)?.label ?? "start.teamPacks",
    FORMAT.find((option) => option.value === config.format)?.label ?? "start.last2y",
    DIFFICULTY.find((option) => option.value === config.rerolls)?.label ?? "start.normal",
  ];

  const onStart = () => {
    const seed = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    start(config, seed);
  };

  if (mode === null) {
    return (
      <main className="mode-select">
        <header className="mode-select__heading">
          <p className="eyebrow">{t("start.chooseModeEyebrow")}</p>
          <h1>{t("start.chooseModeTitle")}</h1>
          <p>{t("start.chooseModeText")}</p>
        </header>
        <div className="mode-grid">
          {MODES.map((item, index) => (
            <button key={item.value} className={`mode-card mode-card--${item.value}`} onClick={() => setMode(item.value)}>
              <span className="mode-card__index">0{index + 1}</span>
              <span className="mode-card__body"><strong>{t(item.label)}</strong><small>{t(item.hint)}</small><span>{t(item.detail)}</span></span>
              {!item.available && <em>{t("common.soon")}</em>}
              <span className="mode-card__action">{t("start.selectMode")} →</span>
            </button>
          ))}
        </div>
      </main>
    );
  }

  if (mode !== "classic") {
    const selectedMode = MODES.find((item) => item.value === mode)!;
    return (
      <main className={`mode-preview mode-preview--${mode}`}>
        <button className="back-button" onClick={() => setMode(null)}>← {t("start.backToModes")}</button>
        <p className="eyebrow">{t(selectedMode.label)}</p>
        <h1>{t("start.comingSoon")}</h1>
        <p>{t(selectedMode.detail)}</p>
        <div className="mode-preview__art"><strong>{t(selectedMode.label)}</strong><span>{t("start.comingSoonText")}</span></div>
      </main>
    );
  }

  return (
    <main className="start">
      <button className="back-button" onClick={() => setMode(null)}>← {t("start.backToModes")}</button>
      <section className="hero-copy">
        <p className="eyebrow">{t("start.eyebrow")}</p>
        <h1>{t("start.title")}</h1>
        <p>{t("start.description")}</p>
        <div className="hero-art">
          <div className="classic-art__copy"><strong>{t("start.classicArtTitle")}</strong><p>{t("start.classicArtText")}</p></div>
          <span><strong>TEAM PACKS</strong><small>{t("start.teamPacksHint")}</small></span>
          <span><strong>MIXED DRAFT</strong><small>{t("start.mixedDraftHint")}</small></span>
          <span><strong>GROUPS → PLAYOFFS → FINAL</strong><small>{t("start.description")}</small></span>
        </div>
      </section>
      <div className="start__layout">
        <section className="surface config-panel">
          <Group title="start.draftStyle" options={DRAFT} value={config.draftStyle} onChange={(value) => set("draftStyle", value)} />
          <Group title="start.format" options={FORMAT.map((option) => ({ ...option, soon: !formatAvailable(option.value) }))} value={config.format} onChange={(value) => set("format", value)} />
          <Group title="start.difficulty" options={DIFFICULTY} value={config.rerolls} onChange={(value) => set("rerolls", value)} />
          <Group title="start.scoring" options={SCORING} value={config.scoring} onChange={(value) => set("scoring", value)} />
          <Group title="start.allocation" options={ALLOCATION} value={config.allocation} onChange={(value) => set("allocation", value)} />
        </section>
        <aside className="surface launch-panel">
          <span className="launch-panel__icon" aria-hidden="true">A</span>
          <h2>{t("start.launchTitle")}</h2>
          <p>{t("start.launchText")}</p>
          <ul>{selectedLabels.map((label) => <li key={label}>{t(label)}</li>)}</ul>
          <button className="primary-button" data-testid="start-run" onClick={onStart} disabled={!formatAvailable(config.format)}>{t("start.launch")}<span>→</span></button>
          {!formatAvailable(config.format) && <p className="notice">{t("start.unavailable")}</p>}
        </aside>
      </div>
    </main>
  );
}
