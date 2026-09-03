import { useEffect, useMemo, useState } from "react";
import { useRun } from "../../state/runStore.ts";
import { useShell } from "../../state/shellStore.ts";
import { usePlaybook } from "../../state/playbookStore.ts";
import { PLAYBOOK_MAX, PLAYBOOK_MIN, normalizePlaybook } from "../../game/playbook.ts";
import { useConnectivity } from "../../state/connectivity.ts";
import { useTmaChrome } from "../../state/tmaChrome.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/core.ts";
import type { RunConfig } from "../../game/packs.ts";
import type { Format } from "../../types/data.ts";
import { Button, Eyebrow, Modal, OptionGroup, type Option, Select, Surface } from "../../ui/index.ts";
import { createRunSeed } from "../../game/rng.ts";
import { mixedSupportsFormat } from "../../game/teamSuccess.ts";
import { realTournamentEvents } from "../../game/realTournament.ts";
import { validateRunLinkInput, type RunLinkInputValidation } from "../../state/runLink.ts";
import { BALANCE_CONFIG_VERSION } from "../../game/balance.ts";
import { mutatorDescParams, type MutatorId } from "../../game/dynastyMutators.ts";
import { multiStakesUnlocked, stakeWinsByRule, stakesUnlocked, useCareer } from "../../state/careerStore.ts";
import { SeedField } from "./SeedField.tsx";
import { VariantSelect } from "./VariantSelect.tsx";
import { ModeSelect } from "./ModeSelect.tsx";
import { ModePreview } from "./ModePreview.tsx";
import {
  ALLOCATION, CHEAT_MODE, DIFFICULTY, DRAFT, DRAFT_CONFIG_MODES, FORMAT, HARD_MODE, HARDCORE_REROLLS,
  MODES, ROGUELITE_REROLLS, SCORING, STAKE_CHOICES, type Opt,
} from "./startOptions.ts";
import "./start.css";


export function StartScreen() {
  const start = useRun((state) => state.start);
  const data = useRun((state) => state.data);
  const formats = data?.manifest.formats ?? [];
  const teamSuccess = data?.teamSuccess;
  const { t } = useI18n();
  const mode = useRun((state) => state.selectedMode);
  const setMode = useRun((state) => state.setSelectedMode);
  const startStep = useRun((state) => state.startStep);
  const setStartStep = useRun((state) => state.setStartStep);
  const config = useRun((state) => state.startConfig);
  const setConfig = useRun((state) => state.setStartConfig);
  const seedInput = useRun((state) => state.startSeedInput);
  const setSeedInput = useRun((state) => state.setStartSeedInput);
  // Real Tournament (T5.6): выбранное событие — часть mode-shell-состояния (переживает reset).
  const realEventId = useRun((state) => state.realEventId);
  const setRealEventId = useRun((state) => state.setRealEventId);
  // Каталог — группировка всех паков по событию; StartScreen перерисовывается на каждый клик по
  // опции и символ сида, поэтому считаем его один раз на датасет, а не на рендер.
  const rtEvents = useMemo(() => (mode === "tournament" && data ? realTournamentEvents(data) : []), [mode, data]);
  // Дефолт — свежайшее событие; выбор, выпавший из каталога после data-refresh, честно сбрасываем.
  useEffect(() => {
    if (rtEvents.length === 0) return;
    if (!realEventId || !rtEvents.some((option) => option.eventId === realEventId)) {
      setRealEventId(rtEvents[0].eventId);
    }
  }, [realEventId, rtEvents, setRealEventId]);
  // В TMA «назад» в выбор режимов даёт телеграмная кнопка — свою прячем (нативный хром).
  const backNative = useTmaChrome((state) => state.backNative);
  // Связность (T11.3): гейтим только режимы с `needsNetwork`. `unknown` («проверить нечем»)
  // намеренно НЕ считается офлайном — иначе гейт срабатывал бы на пустом VITE_API_BASE.
  const checkConnectivity = useConnectivity((state) => state.check);
  const modeNeedsNetwork = MODES.find((item) => item.value === mode)?.needsNetwork === true;
  // Свежая проверка ровно там, где вердикт что-то решает: на входе в такой режим.
  useEffect(() => {
    if (modeNeedsNetwork) void checkConnectivity();
  }, [modeNeedsNetwork, checkConnectivity]);
  // Хардкор включается только осознанно: сперва правила, затем чекбокс, затем кнопка.
  // Закрыть модалку (крестик/Esc/свайп) можно всегда — режим тогда просто не включится.
  const [hardGate, setHardGate] = useState(false);
  const [hardAck, setHardAck] = useState(false);
  const [cheatGate, setCheatGate] = useState(false);
  // Stakes (T6.4): открываются первой честной победой сезона — до неё выбор показан, но заперт.
  const stakesOpen = useCareer((state) => stakesUnlocked(state.entries));
  const multiStakesOpen = useCareer((state) => multiStakesUnlocked(state.entries));
  const stakeWins = useCareer((state) => stakeWinsByRule(state.entries));
  const selectedStakes: readonly MutatorId[] = config.stakes ?? [];
  // Playbook (T6.4-2): черновик собирается в Штабе; сюда попадает канонической копией в конфиг.
  const setView = useShell((state) => state.setView);
  const draftPlaybook = usePlaybook((state) => state.cards);
  const normalizedPlaybook = normalizePlaybook(draftPlaybook);
  const set = <K extends keyof RunConfig>(key: K, value: RunConfig[K]) => setConfig((current) => ({ ...current, [key]: value }));
  // Mixed оценивает игроков по успеху команды за окно, поэтому окно без team-success
  // в нём неиграбельно — гасим так же, как форматы, которых нет в датасете.
  const formatAvailable = (format: Format) =>
    formats.includes(format)
    && (config.draftStyle !== "mixed" || !teamSuccess || mixedSupportsFormat(teamSuccess, format));

  // Перевод Opt<MessageKey> → Option<string> для UIkit OptionGroup.
  const toOptions = <T,>(items: Opt<T>[]): Option<T>[] =>
    items.map((item) => ({
      value: item.value,
      label: t(item.label),
      hint: item.hint ? t(item.hint) : undefined,
      soon: item.soon,
      disabled: item.disabled,
    }));

  const selectedLabels: MessageKey[] = [
    DRAFT.find((option) => option.value === config.draftStyle)?.label ?? "start.teamPacks",
    FORMAT.find((option) => option.value === config.format)?.label ?? "start.last2y",
    // Roguelite Run фиксирует рероллы → сложность не показываем в сводке.
    ...(mode === "run" ? [] : [DIFFICULTY.find((option) => option.value === config.rerolls)?.label ?? "start.normal"] as MessageKey[]),
    ALLOCATION.find((option) => option.value === config.allocation)?.label ?? "start.automatic",
  ];
  // Stakes — часть сводки запуска: правила сезона видны до старта, как остальные оси.
  const stakeSummary = mode === "run" && (config.stakes?.length ?? 0) > 0
    ? config.stakes!.map((id) => t(`mutator.${id}` as MessageKey)).join(" + ")
    : null;
  const playbookSummary = mode === "run" && config.playbook?.length ? t("start.playbookOn", { n: config.playbook.length }) : null;

  const seedValidation: RunLinkInputValidation = data && mode
    ? validateRunLinkInput(
      seedInput,
      mode,
      config,
      data.manifest.schemaVersion,
      data.manifest.ratingModelVersion,
      BALANCE_CONFIG_VERSION,
      mode === "tournament" ? realEventId ?? undefined : undefined,
    )
    : { link: null, issue: seedInput.trim() ? "invalid" : null };
  const seedConfig = seedValidation.link?.config;
  const seedExpectedSettings = seedValidation.issue === "config" && seedConfig
    ? [
      DRAFT.find((option) => option.value === seedConfig.draftStyle)?.label,
      FORMAT.find((option) => option.value === seedConfig.format)?.label,
      DIFFICULTY.find((option) => option.value === seedConfig.rerolls)?.label,
      SCORING.find((option) => option.value === seedConfig.scoring)?.label,
      ALLOCATION.find((option) => option.value === seedConfig.allocation)?.label,
      HARD_MODE.find((option) => option.value === (seedConfig.hardMode ?? false))?.label,
    ].filter((label): label is MessageKey => Boolean(label)).map((label) => t(label)).join(" · ")
    : undefined;

  const onStart = () => {
    if (seedValidation.issue) return;
    start(config, seedValidation.link?.seed ?? createRunSeed());
  };



  if (startStep === "variants") return <VariantSelect />;
  if (mode === null) return <ModeSelect />;
  if (!DRAFT_CONFIG_MODES.includes(mode)) return <ModePreview mode={mode} />;

  const heroRows: { label: MessageKey; hint: MessageKey }[] = mode === "tournament"
    ? [
        { label: "real.ruleField", hint: "real.ruleFieldHint" },
        { label: "real.ruleLock", hint: "real.ruleLockHint" },
        { label: "real.ruleSim", hint: "real.ruleSimHint" },
      ]
    : mode === "run"
    ? [
        { label: "start.runRuleDraft", hint: "start.runRuleDraftHint" },
        { label: "start.runRuleTargets", hint: "start.runRuleTargetsHint" },
        { label: "start.runRuleDeath", hint: "start.runRuleDeathHint" },
      ]
    : [
        { label: "start.teamPacks", hint: "start.teamPacksHint" },
        { label: "start.mixedDraft", hint: "start.mixedDraftHint" },
        { label: "start.classicPath", hint: "start.description" },
      ];

  return (
    <main className="start">
      {!backNative && (mode === "tournament"
        ? <Button variant="back" onClick={() => { setMode(null); setStartStep("modes"); }}>← {t("start.backToModes")}</Button>
        : <Button variant="back" onClick={() => { setMode(null); setStartStep("variants"); }}>← {t("start.backChoice")}</Button>)}
      <section className="hero-copy">
        <div className="hero-copy__lead">
          <Eyebrow className="hero-eyebrow">{t(mode === "run" ? "start.runEyebrow" : mode === "tournament" ? "start.modeTournament" : "start.eyebrow")}</Eyebrow>
          <h1>{t(mode === "run" ? "start.runTitle" : mode === "tournament" ? "real.launchTitle" : "start.title")}</h1>
        </div>
        <div className={`hero-art hero-art--${mode === "run" ? "run" : mode === "tournament" ? "tournament" : "quick"}`}>
          <div className="classic-art__copy"><strong>{t(mode === "run" ? "start.runArtTitle" : mode === "tournament" ? "real.artTitle" : "start.classicArtTitle")}</strong><p>{t(mode === "run" ? "start.runArtText" : mode === "tournament" ? "real.artText" : "start.classicArtText")}</p></div>
          {heroRows.map((row) => (
            <span key={row.label}><strong>{t(row.label)}</strong><small>{t(row.hint)}</small></span>
          ))}
        </div>
      </section>
      <div className="start__layout">
        <Surface className="config-panel">
          {/* Real Tournament: главная ось — событие; draftStyle/scoring зафиксированы на входе
              (mixed-механика + event-скоринг, RT-B) и не показываются. */}
          {mode === "tournament" && (
            <div className="config-panel__event">
              <Select
                label={t("real.eventLabel")}
                keepLabel
                data-testid="real-event-select"
                value={realEventId ?? ""}
                options={rtEvents.map((option) => ({
                  value: option.eventId,
                  // Год — только если его нет в самом имени («TI 2023» не превращаем в «TI 2023 · 2023»).
                  label: option.year && !option.name.includes(String(option.year))
                    ? `${option.name} · ${option.year}`
                    : option.name,
                }))}
                onChange={(value) => setRealEventId(value)}
              />
              <p className="config-panel__hint">{t("real.eventHint")}</p>
              {/* Сила поля выбранного события — это и есть выбор сложности режима (RT-D): без
                  подписи игрок не отличил бы EWC от региональной лиги до самого посева. */}
              {(() => {
                const selected = rtEvents.find((option) => option.eventId === realEventId);
                return selected
                  ? <p className="config-panel__hint config-panel__hint--strong" data-testid="real-field-strength">{t("real.fieldStrength", { median: Math.round(selected.fieldMedian), top: Math.round(selected.fieldTop) })}</p>
                  : null;
              })()}
            </div>
          )}
          {mode !== "tournament" && (
            <OptionGroup title={t("start.draftStyle")} soonLabel={t("common.soon")} options={toOptions(DRAFT)} value={config.draftStyle} onChange={(value) => set("draftStyle", value)} />
          )}
          <OptionGroup title={t(mode === "tournament" ? "real.poolFormat" : "start.format")} soonLabel={t("common.soon")} options={toOptions(FORMAT.map((option) => ({ ...option, soon: !formatAvailable(option.value) })))} value={config.format} onChange={(value) => set("format", value)} />
          {/* Roguelite Run фиксирует рероллы (всегда максимум 2) → выбор сложности убран. */}
          {mode !== "run" && (
            <OptionGroup title={t("start.difficulty")} soonLabel={t("common.soon")} options={toOptions(DIFFICULTY.map((option) => ({
              ...option,
              // Не просто ставим Hard при включении, а держим: иначе игрок вернул бы Easy
              // сразу после окна, и забег уехал бы в историю «хардкорным» с рероллами.
              disabled: (config.hardMode ?? false) && option.value !== HARDCORE_REROLLS,
            })))} value={config.rerolls} onChange={(value) => set("rerolls", value)} />
          )}
          {mode !== "tournament" && (
            <OptionGroup title={t("start.scoring")} soonLabel={t("common.soon")} options={toOptions(SCORING)} value={config.scoring} onChange={(value) => set("scoring", value)} />
          )}
          <OptionGroup title={t("start.allocation")} soonLabel={t("common.soon")} options={toOptions(ALLOCATION)} value={config.allocation} onChange={(value) => set("allocation", value)} />
          {mode !== "tournament" && (
          <OptionGroup
            title={t("hard.title")}
            soonLabel={t("common.soon")}
            // В Roguelite Run хардкор не трогает рероллы (их 2) — подсказка «вслепую», без «no rerolls».
            // Cheat Mode и хардкор взаимоисключающи: интерфейс не должен одновременно обещать
            // соревновательный и читерский забег. Блокируем с понятной подсказкой, а не молча.
            options={toOptions(HARD_MODE.map((option) => {
              const runHint = option.value === true && mode === "run" ? { ...option, hint: "hard.onHintRun" as MessageKey } : option;
              return option.value === true && (config.cheatMode ?? false)
                ? { ...runHint, disabled: true, hint: "hard.blockedByCheat" as MessageKey }
                : runHint;
            }))}
            value={config.hardMode ?? false}
            // Повторный тап по выбранной опции — no-op. Выключение — сразу; только реальный
            // переход Off → On требует повторно принять правила.
            onChange={(value) => {
              if (value === (config.hardMode ?? false)) return;
              if (value) {
                setHardAck(false);
                setHardGate(true);
              } else {
                set("hardMode", false);
              }
            }}
          />
          )}
          {/* Special rules — отдельная визуально отделённая секция и только для Roguelite Run:
              Cheat Mode это правило КОНКРЕТНОГО забега (привязано к seed и сейву), поэтому в
              глобальные Settings оно не переносится. */}
          {mode === "run" && (
            <div className="config-panel__special" data-testid="special-rules">
              <Eyebrow>{t("cheat.section")}</Eyebrow>
              <OptionGroup
                title={t("cheat.title")}
                soonLabel={t("common.soon")}
                options={toOptions(CHEAT_MODE)}
                value={config.cheatMode ?? false}
                // Выключение — сразу; только переход Off → On требует подтверждения.
                onChange={(value) => {
                  if (value === (config.cheatMode ?? false)) return;
                  if (value) setCheatGate(true);
                  else set("cheatMode", false);
                }}
              />
              {/* Stakes (T6.4): те же правила, что мутаторы кругов Династии, но добровольно и на
                  весь сезон. Заперты до первой честной победы сезона; с Cheat Mode не совместимы
                  (несоревновательный забег не носит соревновательную метку). Лестница прогрессии
                  T6.4-2: победа со ставкой открывает КОМБИНАЦИИ (клик добавляет правило), до
                  того клик заменяет выбранное — прежняя одиночная семантика. ✓ ×N в hint —
                  награда сверх карьерной метки: производная карьеры, не хранилище. */}
              <OptionGroup
                title={t("stake.title")}
                soonLabel={t("common.soon")}
                options={[
                  { value: null as MutatorId | null, label: t("stake.none"), hint: t("stake.noneHint") },
                  ...STAKE_CHOICES.map(({ id, severity }) => {
                    const wins = stakeWins[id] ?? 0;
                    const parts = [
                      ...(wins > 0 ? [t("stake.won", { n: wins })] : []),
                      t(severity),
                      t(`mutator.desc.${id}` as MessageKey, mutatorDescParams(id)),
                      t(multiStakesOpen ? "stake.canCombine" : "stake.combineLocked"),
                    ];
                    return {
                      value: id as MutatorId | null,
                      label: t(`mutator.${id}` as MessageKey),
                      hint: stakesOpen && !(config.cheatMode ?? false)
                        ? parts.join(" · ")
                        : t(!stakesOpen ? "stake.locked" : "stake.blockedByCheat"),
                      disabled: !stakesOpen || (config.cheatMode ?? false),
                    };
                  }),
                ]}
                value={null as MutatorId | null}
                activeValues={selectedStakes.length ? selectedStakes : [null as MutatorId | null]}
                onChange={(value) => {
                  if (value === null) { set("stakes", undefined); return; }
                  const next = selectedStakes.includes(value)
                    ? selectedStakes.filter((id) => id !== value)
                    : multiStakesOpen ? [...selectedStakes, value] : [value];
                  set("stakes", next.length ? next : undefined);
                }}
              />
              {/* Playbook (T6.4-2) — как Stakes: добровольно, на весь забег, в сид и сейв. Сам набор
                  собирается в Штабе; здесь только включение. Дейлик Playbook не носит. */}
              <OptionGroup
                title={t("playbook.title")}
                soonLabel={t("common.soon")}
                options={[
                  { value: false, label: t("start.playbookOff"), hint: t("start.playbookOffHint") },
                  {
                    value: true,
                    label: normalizedPlaybook ? t("start.playbookOn", { n: normalizedPlaybook.length }) : t("playbook.title"),
                    hint: normalizedPlaybook
                      ? t("start.playbookOnHint")
                      : t("start.playbookInvalid", { min: PLAYBOOK_MIN, max: PLAYBOOK_MAX, n: draftPlaybook.length }),
                    disabled: !normalizedPlaybook,
                  },
                ]}
                value={Boolean(config.playbook)}
                onChange={(value) => set("playbook", value && normalizedPlaybook ? normalizedPlaybook : undefined)}
              />
              <Button variant="back" data-testid="open-hq-from-start" onClick={() => setView("hq")}>{t("start.playbookEdit")} →</Button>
            </div>
          )}
        </Surface>
        <Surface as="aside" className="launch-panel">
          <span className="launch-panel__glow" aria-hidden="true" />
          <span className="launch-panel__icon" aria-hidden="true">A</span>
          <h2>{t(mode === "run" ? "start.runLaunchTitle" : mode === "tournament" ? "real.launchPanelTitle" : "start.launchTitle")}</h2>
          <p>{t(mode === "run" ? "start.runLaunchText" : mode === "tournament" ? "real.launchText" : "start.launchText")}</p>
          <ul>
            {mode === "tournament" && realEventId && (
              <li key="event">{rtEvents.find((option) => option.eventId === realEventId)?.name ?? realEventId}</li>
            )}
            {selectedLabels.map((label) => <li key={label}>{t(label)}</li>)}
            {stakeSummary && <li key="stake">☄ {stakeSummary}</li>}
            {playbookSummary && <li key="playbook">📖 {playbookSummary}</li>}
          </ul>
          <Button
            variant="primaryInvert"
            data-testid="start-run"
            onClick={onStart}
            disabled={!formatAvailable(config.format) || seedValidation.issue !== null || (mode === "tournament" && (rtEvents.length === 0 || !realEventId))}
          >
            {t("start.launch")}<span>→</span>
          </Button>
          <SeedField
            value={seedInput}
            validation={seedValidation}
            expectedSettings={seedExpectedSettings}
            onChange={setSeedInput}
          />
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
                {/* Правила про рероллы — только Classic: в Roguelite Run соперники и число
                    рероллов уже фиксированы самим режимом, а не включением хардкора. */}
                {mode !== "run" && (
                  <>
                    <li>{t("hard.rule2")}</li>
                    <li>{t("hard.rule3")}</li>
                  </>
                )}
                <li>{t("hard.rule4")}</li>
                <li>{t("hard.rule5")}</li>
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
                // Хардкор в Classic = 0 рероллов + закрытый справочник. В Roguelite Run рероллы
                // фиксированы (2), поэтому там хардкор запирает только справочник («вслепую»),
                // а число рероллов не трогает.
                onClick={() => { setConfig((current) => ({ ...current, hardMode: true, rerolls: mode === "run" ? ROGUELITE_REROLLS : HARDCORE_REROLLS })); close(); }}
              >
                {t("hard.gateConfirm")}
              </Button>
            </div>
          )}
        </Modal>
      )}
      {cheatGate && (
        <Modal
          mark="∞"
          title={t("cheat.gateTitle")}
          description={t("cheat.gateText")}
          labelledBy="cheat-gate-title"
          dismissLabel={t("common.close")}
          layout="content"
          onClose={() => setCheatGate(false)}
        >
          {({ close }) => (
            <div className="hard-gate">
              <ul className="hard-gate__rules">
                <li>{t("cheat.rule1")}</li>
                <li>{t("cheat.rule2")}</li>
                <li>{t("cheat.rule3")}</li>
              </ul>
              <Button
                variant="danger"
                data-testid="cheat-gate-confirm"
                // Включение Cheat Mode само гасит хардкор — иначе забег обещал бы одновременно
                // «вслепую и соревновательно» и «бесконечное золото».
                onClick={() => { setConfig((current) => ({ ...current, cheatMode: true, hardMode: false, stakes: undefined })); close(); }}
              >
                {t("cheat.gateConfirm")}
              </Button>
            </div>
          )}
        </Modal>
      )}
    </main>
  );
}

