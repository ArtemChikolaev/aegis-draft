import { useState } from "react";
import { useRun, type RunMode } from "../../state/runStore.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/core.ts";
import type { RunConfig, DraftStyle, Scoring, Allocation } from "../../game/packs.ts";
import type { Format } from "../../types/data.ts";
import { Button, Eyebrow, Modal, OptionGroup, type Option, Surface } from "../../ui/index.ts";
import { createRunSeed } from "../../game/rng.ts";
import "./start.css";

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
const HARD_MODE: Opt<boolean>[] = [
  { value: false, label: "hard.off", hint: "hard.offHint" },
  { value: true, label: "hard.on", hint: "hard.onHint" },
];
const ALLOCATION: Opt<Allocation>[] = [
  { value: "auto", label: "start.automatic", hint: "start.automaticHint" },
  { value: "manual", label: "start.manual", hint: "start.manualHint" },
];

export function StartScreen() {
  const start = useRun((state) => state.start);
  const formats = useRun((state) => state.data?.manifest.formats ?? []);
  const { t } = useI18n();
  const mode = useRun((state) => state.selectedMode);
  const setMode = useRun((state) => state.setSelectedMode);
  // Хардкор включается только осознанно: сперва правила, затем чекбокс, затем кнопка.
  // Закрыть модалку (крестик/Esc/свайп) можно всегда — режим тогда просто не включится.
  const [hardGate, setHardGate] = useState(false);
  const [hardAck, setHardAck] = useState(false);
  const [config, setConfig] = useState<RunConfig>({
    draftStyle: "team",
    format: "last_2y",
    rerolls: 1,
    scoring: "event",
    allocation: "auto",
    hardMode: false,
  });
  const set = <K extends keyof RunConfig>(key: K, value: RunConfig[K]) => setConfig((current) => ({ ...current, [key]: value }));
  const formatAvailable = (format: Format) => formats.includes(format);

  // Перевод Opt<MessageKey> → Option<string> для UIkit OptionGroup.
  const toOptions = <T,>(items: Opt<T>[]): Option<T>[] =>
    items.map((item) => ({ value: item.value, label: t(item.label), hint: item.hint ? t(item.hint) : undefined, soon: item.soon }));

  const selectedLabels: MessageKey[] = [
    DRAFT.find((option) => option.value === config.draftStyle)?.label ?? "start.teamPacks",
    FORMAT.find((option) => option.value === config.format)?.label ?? "start.last2y",
    DIFFICULTY.find((option) => option.value === config.rerolls)?.label ?? "start.normal",
    ALLOCATION.find((option) => option.value === config.allocation)?.label ?? "start.automatic",
  ];

  const onStart = () => {
    start(config, createRunSeed());
  };

  if (mode === null) {
    return (
      <main className="mode-select">
        <header className="mode-select__heading">
          <Eyebrow className="ms-eyebrow">{t("start.chooseModeEyebrow")}</Eyebrow>
          <h1>{t("start.chooseModeTitle")}</h1>
          <p>{t("start.chooseModeText")}</p>
        </header>
        <div className="mode-grid">
          {MODES.map((item, index) => (
            <button key={item.value} className={`mode-card mode-card--${item.value}`} data-testid={`mode-${item.value}`} onClick={() => setMode(item.value)}>
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
        <Button variant="back" onClick={() => setMode(null)}>← {t("start.backToModes")}</Button>
        <Eyebrow className="mp-eyebrow">{t(selectedMode.label)}</Eyebrow>
        <h1>{t("start.comingSoon")}</h1>
        <p className="mp-text">{t(selectedMode.detail)}</p>
        <div className="mode-preview__art"><strong>{t(selectedMode.label)}</strong><span>{t("start.comingSoonText")}</span></div>
      </main>
    );
  }

  return (
    <main className="start">
      <Button variant="back" onClick={() => setMode(null)}>← {t("start.backToModes")}</Button>
      <section className="hero-copy">
        <div className="hero-copy__lead">
          <Eyebrow className="hero-eyebrow">{t("start.eyebrow")}</Eyebrow>
          <h1>{t("start.title")}</h1>
        </div>
        <div className="hero-art">
          <div className="classic-art__copy"><strong>{t("start.classicArtTitle")}</strong><p>{t("start.classicArtText")}</p></div>
          <span><strong>TEAM PACKS</strong><small>{t("start.teamPacksHint")}</small></span>
          <span><strong>MIXED DRAFT</strong><small>{t("start.mixedDraftHint")}</small></span>
          <span><strong>GROUPS → PLAYOFFS → FINAL</strong><small>{t("start.description")}</small></span>
        </div>
      </section>
      <div className="start__layout">
        <Surface className="config-panel">
          <OptionGroup title={t("start.draftStyle")} soonLabel={t("common.soon")} options={toOptions(DRAFT)} value={config.draftStyle} onChange={(value) => set("draftStyle", value)} />
          <OptionGroup title={t("start.format")} soonLabel={t("common.soon")} options={toOptions(FORMAT.map((option) => ({ ...option, soon: !formatAvailable(option.value) })))} value={config.format} onChange={(value) => set("format", value)} />
          <OptionGroup title={t("start.difficulty")} soonLabel={t("common.soon")} options={toOptions(DIFFICULTY)} value={config.rerolls} onChange={(value) => set("rerolls", value)} />
          <OptionGroup title={t("start.scoring")} soonLabel={t("common.soon")} options={toOptions(SCORING)} value={config.scoring} onChange={(value) => set("scoring", value)} />
          <OptionGroup title={t("start.allocation")} soonLabel={t("common.soon")} options={toOptions(ALLOCATION)} value={config.allocation} onChange={(value) => set("allocation", value)} />
          <OptionGroup
            title={t("hard.title")}
            soonLabel={t("common.soon")}
            options={toOptions(HARD_MODE)}
            value={config.hardMode ?? false}
            // Выключение — сразу; включение — через окно с правилами.
            onChange={(value) => { if (value) { setHardAck(false); setHardGate(true); } else set("hardMode", false); }}
          />
        </Surface>
        <Surface as="aside" className="launch-panel">
          <span className="launch-panel__glow" aria-hidden="true" />
          <span className="launch-panel__icon" aria-hidden="true">A</span>
          <h2>{t("start.launchTitle")}</h2>
          <p>{t("start.launchText")}</p>
          <ul>{selectedLabels.map((label) => <li key={label}>{t(label)}</li>)}</ul>
          <Button variant="primaryInvert" data-testid="start-run" onClick={onStart} disabled={!formatAvailable(config.format)}>{t("start.launch")}<span>→</span></Button>
          {!formatAvailable(config.format) && <p className="notice">{t("start.unavailable")}</p>}
        </Surface>
      </div>
      {hardGate && (
        <Modal
          mark="!"
          title={t("hard.gateTitle")}
          description={t("hard.gateText")}
          labelledBy="hard-gate-title"
          dismissLabel={t("common.close")}
          layout="content"
          onClose={() => setHardGate(false)}
        >
          {({ close }) => (
            <div className="hard-gate">
              <ul className="hard-gate__rules">
                <li>{t("hard.rule1")}</li>
                <li>{t("hard.rule2")}</li>
                <li>{t("hard.rule3")}</li>
                <li>{t("hard.rule4")}</li>
              </ul>
              <label className="hard-gate__ack">
                <input
                  type="checkbox"
                  checked={hardAck}
                  data-testid="hard-gate-ack"
                  onChange={(event) => setHardAck(event.target.checked)}
                />
                <span>{t("hard.gateAck")}</span>
              </label>
              <Button
                variant="danger"
                disabled={!hardAck}
                data-testid="hard-gate-confirm"
                onClick={() => { set("hardMode", true); close(); }}
              >
                {t("hard.gateConfirm")}
              </Button>
            </div>
          )}
        </Modal>
      )}
    </main>
  );
}
