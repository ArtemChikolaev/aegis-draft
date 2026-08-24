import { useState, type CSSProperties } from "react";
import { useRun, type PrepOptionView } from "../../state/runStore.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { roleMessageKey } from "../../i18n/core.ts";
import { Button, Eyebrow, HeroThumb, Modal, StatTile, Surface, TeamName } from "../../ui/index.ts";
import { sfxBuy } from "../../ui/sound.ts";
import { Pentagon } from "../draft/Pentagon.tsx";
import { useHero } from "../draft/heroes.ts";
import { chemistryPairEdges, chemistryPlayersFromRoster, heroSynergyTier, pairKey } from "../../game/score.ts";
import { PREP, type PrepAction } from "../../game/prep.ts";
import "../draft/draft.css";
import "./prep.css";

const fmt = (value: number) => (value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1));

/** Подготовка к событию (Real Tournament, RT-E срез 1): одна фаза между драфтом и посевом.
 *  Слева — тот же радар, что в драфте (связки растут на глазах), справа — бюджет недель сборов
 *  и два списка: сыгровка пар (Chemistry) и тренировка героя (Hero Synergy). Каждая строка
 *  показывает «+N к Team OVR», посчитанный стором тем же scoreFor, что боевой счёт. */
export function PrepScreen() {
  const snapshot = useRun((state) => state.snapshot);
  const prep = useRun((state) => state.prep);
  const data = useRun((state) => state.data);
  const realField = useRun((state) => state.realField);
  const teamName = useRun((state) => state.teamName);
  const setTeamName = useRun((state) => state.setTeamName);
  const addPrep = useRun((state) => state.addPrep);
  const undoPrep = useRun((state) => state.undoPrep);
  const confirmPrep = useRun((state) => state.confirmPrep);
  const reset = useRun((state) => state.reset);
  const [confirmLeave, setConfirmLeave] = useState(false);
  /** Вспышка потраченной недели: ключ строки + серийник траты, чтобы повторный клик по той же
   *  строке переигрывал анимацию (overlay ремоунтится по key), а сама строка не перемонтировалась. */
  const [spentFlash, setSpentFlash] = useState<{ row: string; serial: number } | null>(null);
  const hero = useHero();
  const { t } = useI18n();
  if (!snapshot || !prep || !data) return null;

  const { roster, score } = snapshot;
  const chemistryEdges = chemistryPairEdges(chemistryPlayersFromRoster(roster), data.squadSynergy, data.teammates, prep.overlay.pairGames);
  const nick = new Map(roster.flatMap((slot) => (slot.candidate ? [[slot.candidate.player.accountId, slot.candidate.player] as const] : [])));
  const gained = score ? score.teamOvr - prep.baseline.teamOvr : 0;
  const spentWeeks = prep.budget - prep.pointsLeft;
  const synergyTier = score ? heroSynergyTier(score.heroSynergy) : null;
  const synergySublabel = synergyTier === "insane" ? t("draft.synergyInsane") : synergyTier === "great" ? t("draft.synergyGreat") : undefined;
  // Плитки поля считаем от ЭФФЕКТИВНЫХ сил (разобранные составы уже ослаблены) — то же, что
  // увидит посев; сортировка заново, потому что разбор мог сместить лидера.
  const effective = [...prep.scouts]
    .map((option) => ({ name: option.name, strength: option.scouted ? option.scoutedStrength : option.strength }))
    .sort((a, b) => b.strength - a.strength);
  const fieldTop = effective[0];
  const fieldMedian = effective[Math.floor(effective.length / 2)];

  // Звук на клике намеренно: неудачная трата = disabled-кнопка, клик ≈ успех (как в рынке Кампа).
  const spend = (action: PrepAction, row: string) => {
    sfxBuy();
    setSpentFlash({ row, serial: (spentFlash?.serial ?? 0) + 1 });
    addPrep(action);
  };
  const flashOverlay = (row: string) => (spentFlash?.row === row
    ? <span key={spentFlash.serial} className="prep__spent-flash" aria-hidden="true" />
    : null);
  const scrimLabel = (view: PrepOptionView) => {
    if (view.action.kind !== "scrim") return "";
    return `${nick.get(view.action.a)?.nickname ?? view.action.a} + ${nick.get(view.action.b)?.nickname ?? view.action.b}`;
  };
  const pairGames = (a: number, b: number) => chemistryEdges.find((edge) => pairKey(edge.a, edge.b) === pairKey(a, b))?.games ?? 0;

  return (
    <main className="draft prep" data-testid="prep-screen">
      <header className="screen-heading draft__heading">
        <div>
          <Eyebrow>{t("prep.eyebrow", { event: realField?.eventName ?? "" })}</Eyebrow>
          <h1><TeamName value={teamName} placeholder={t("team.placeholder")} editLabel={t("team.edit")} onChange={setTeamName} /></h1>
        </div>
        <div className="draft__heading-actions">
          <Button variant="leave" onClick={() => setConfirmLeave(true)}>{t("draft.leave")}</Button>
        </div>
      </header>

      <Surface className="draft__radar on-invert-surface enter">
        <span className="draft__radar-glow" aria-hidden="true" />
        <Pentagon
          roster={roster}
          centerValue={score?.teamOvr ?? null}
          chemistryEdges={chemistryEdges}
          assignmentByPlayer={score?.assignment.byPlayer ?? {}}
        />
        <div className="score-strip">
          <StatTile label={t("common.base")} value={score ? Math.round(score.base).toString() : "0"} kind="base" />
          <StatTile label={t("common.heroSynergy")} value={score ? fmt(score.heroSynergy) : "+0.0"} kind="synergy" sublabel={synergySublabel} />
          <StatTile label={t("common.chemistry")} value={score ? fmt(score.chemistry) : "+0.0"} kind="chemistry" />
        </div>
        {/* Разведка: поле известно заранее — ориентир, до кого тянуться. */}
        {fieldTop && fieldMedian && (
          <dl className="prep__field" data-testid="prep-field">
            <div><dt>{t("prep.fieldTop")}</dt><dd>{fieldTop.name} · <b>{Math.round(fieldTop.strength)}</b></dd></div>
            <div><dt>{t("prep.fieldMedian")}</dt><dd><b>{Math.round(fieldMedian.strength)}</b></dd></div>
            <div><dt>{t("prep.yourPower")}</dt><dd><b>{score ? Math.round(score.teamOvr) : "—"}</b> <small className={gained > 0 ? "prep__gain" : undefined}>{gained > 0 ? `(${fmt(gained)})` : ""}</small></dd></div>
          </dl>
        )}
      </Surface>

      <Surface className="pack-panel on-invert-surface enter prep__panel" style={{ "--enter-i": 1 } as CSSProperties}>
        <div className="prep__head">
          <div>
            <Eyebrow>{t("prep.title")}</Eyebrow>
            <p className="prep__lead">{t("prep.lead")}</p>
          </div>
          <div className="prep__budget" data-testid="prep-budget" aria-label={t("prep.weeksLeft", { n: prep.pointsLeft, total: prep.budget })}>
            {Array.from({ length: prep.budget }, (_, i) => (
              <span key={i} className={`prep__week${i < spentWeeks ? " prep__week--spent" : ""}`} aria-hidden="true" />
            ))}
            <strong>{t("prep.weeksLeft", { n: prep.pointsLeft, total: prep.budget })}</strong>
          </div>
        </div>

        <section className="prep__section">
          <h3>{t("prep.scrims")}</h3>
          <p className="prep__hint">{t("prep.scrimsHint", { games: PREP.scrimGames })}</p>
          <ul className="prep__list">
            {prep.scrims.map((view) => {
              const { a, b } = view.action as Extract<PrepAction, { kind: "scrim" }>;
              const disabled = prep.pointsLeft <= 0 || view.delta <= 0.001;
              return (
                <li key={`${a}:${b}`}>
                  <button
                    type="button"
                    className="prep__option"
                    data-testid="prep-scrim"
                    disabled={disabled}
                    onClick={() => spend(view.action, `s:${a}:${b}`)}
                  >
                    {flashOverlay(`s:${a}:${b}`)}
                    <span className="prep__who">
                      <strong>{scrimLabel(view)}</strong>
                      <small>{t("prep.pairGames", { n: Math.round(pairGames(a, b)) })}{view.spent > 0 ? ` · ${t("prep.weeksSpent", { n: view.spent })}` : ""}</small>
                    </span>
                    <em className={`prep__delta${view.delta > 0.001 ? " prep__delta--up" : ""}`}>{fmt(view.delta)}</em>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="prep__section">
          <h3>{t("prep.practice")}</h3>
          <p className="prep__hint">{t("prep.practiceHint", { games: PREP.practiceGames })}</p>
          <ul className="prep__list">
            {/* 5 игроков × 5 героев = 25 строк, из них полезных обычно 5–8: показываем только те, где
                есть прирост (игрок не на потолке по герою), остальное — одной строкой-итогом. */}
            {prep.practices.filter((view) => view.delta > 0.001).map((view) => {
              const { accountId, heroId } = view.action as Extract<PrepAction, { kind: "practice" }>;
              const player = nick.get(accountId);
              const assigned = score?.assignment.byPlayer[accountId] === heroId;
              const disabled = prep.pointsLeft <= 0 || view.delta <= 0.001;
              const h = hero(heroId);
              return (
                <li key={`${accountId}:${heroId}`}>
                  <button
                    type="button"
                    className="prep__option"
                    data-testid="prep-practice"
                    disabled={disabled}
                    onClick={() => spend(view.action, `p:${accountId}:${heroId}`)}
                  >
                    {flashOverlay(`p:${accountId}:${heroId}`)}
                    <span className="prep__who prep__who--hero">
                      <HeroThumb name={h.name} picture={h.picture} showName={false} />
                      <span>
                        <strong>{player?.nickname ?? accountId} · {h.name}</strong>
                        <small>{player ? t(roleMessageKey(player.role)) : ""}{assigned ? ` · ${t("prep.assigned")}` : ""}{view.spent > 0 ? ` · ${t("prep.weeksSpent", { n: view.spent })}` : ""}</small>
                      </span>
                    </span>
                    <em className={`prep__delta${view.delta > 0.001 ? " prep__delta--up" : ""}`}>{fmt(view.delta)}</em>
                  </button>
                </li>
              );
            })}
            {prep.practices.every((view) => view.delta <= 0.001) && (
              <li className="prep__empty">{t("prep.practiceCapped")}</li>
            )}
          </ul>
        </section>

        <section className="prep__section">
          <h3>{t("prep.scout")}{prep.scoutsLeft < PREP.scoutMax ? ` · ${t("prep.scoutLeft", { n: prep.scoutsLeft })}` : ""}</h3>
          <p className="prep__hint">{t("prep.scoutHint", { total: PREP.scoutMax })}</p>
          <ul className="prep__list prep__list--scout">
            {prep.scouts.map((option) => {
              const disabled = option.scouted || prep.scoutsLeft <= 0 || prep.pointsLeft <= 0 || option.loss < 0.05;
              return (
                <li key={option.teamId}>
                  <button
                    type="button"
                    className="prep__option"
                    data-testid="prep-scout"
                    data-scouted={option.scouted ? "true" : undefined}
                    disabled={disabled}
                    onClick={() => spend({ kind: "scout", teamId: option.teamId }, `t:${option.teamId}`)}
                  >
                    {flashOverlay(`t:${option.teamId}`)}
                    <span className="prep__who">
                      <strong>{option.name}</strong>
                      <small>{option.scouted
                        ? t("prep.scouted", { n: Math.round(option.scoutedStrength) })
                        : `${Math.round(option.strength)} → ${Math.round(option.scoutedStrength)}`}</small>
                    </span>
                    <em className={`prep__delta${!option.scouted && option.loss >= 0.05 ? " prep__delta--down" : ""}`}>
                      {option.scouted ? "✓" : `−${option.loss.toFixed(1)}`}
                    </em>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="prep__actions">
          <Button variant="secondaryInvert" data-testid="prep-undo" disabled={spentWeeks === 0} onClick={undoPrep}>↶ {t("prep.undo")}</Button>
          <Button variant="primaryInvert" data-testid="prep-confirm" onClick={confirmPrep}>
            {t(prep.pointsLeft > 0 ? "prep.confirmEarly" : "prep.confirm")} →
          </Button>
        </div>
      </Surface>

      {confirmLeave && (
        <Modal
          mark="!"
          title={t("draft.leaveTitle")}
          description={t("draft.leaveText")}
          labelledBy="prep-leave-title"
          dismissLabel={t("common.close")}
          onClose={() => setConfirmLeave(false)}
        >
          {({ close }) => (
            <>
              <Button variant="secondaryInvert" onClick={close}>{t("draft.leaveCancel")}</Button>
              <Button variant="danger" data-testid="confirm-leave" onClick={reset}>{t("draft.leaveConfirm")}</Button>
            </>
          )}
        </Modal>
      )}
    </main>
  );
}
