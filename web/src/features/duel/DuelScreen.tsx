// Дуэль (M-DUEL, онлайн): комната по коду (relay-инфраструктура MP0) → лобби → драфт игроков
// змейкой из общего пула → на каждую игру серии капитанский драфт героев → серия bo1/bo3/bo5.
// Оба клиента применяют серверно-упорядоченный лог (duelProtocol) — свои кнопки активны только
// в свой ход, действия едут через sendAction и применяются с возвратом от сервера.
import { useEffect, useState } from "react";
import { useRun } from "../../state/runStore.ts";
import { selfSide, useDuel } from "../../state/duelStore.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { roleMessageKey, type MessageKey } from "../../i18n/core.ts";
import type { Format } from "../../types/data.ts";
import { ROLE_SEQUENCE } from "../../game/packs.ts";
import type { DuelSide } from "../../game/duel.ts";
import { isApiConfigured } from "../../data/api/index.ts";
import { Banner, Button, Eyebrow, HeroThumb, Modal, OptionGroup, RoleTag, Surface, TextField } from "../../ui/index.ts";
import { useHero, useHeroName } from "../draft/heroes.ts";
import "./duel.css";

const BEST_OF: { value: 1 | 3 | 5; label: string }[] = [
  { value: 1, label: "Bo1" },
  { value: 3, label: "Bo3" },
  { value: 5, label: "Bo5" },
];

const FORMATS: { value: Format; label: MessageKey }[] = [
  { value: "last_1y", label: "start.last1y" },
  { value: "last_2y", label: "start.last2y" },
  { value: "last_5y", label: "start.last5y" },
  { value: "valve_legacy", label: "start.valveLegacy" },
];

export function DuelScreen() {
  const { t } = useI18n();
  const data = useRun((s) => s.data);
  const setMode = useRun((s) => s.setSelectedMode);
  const status = useDuel((s) => s.status);
  const code = useDuel((s) => s.code);
  const membersList = useDuel((s) => s.members);
  const errorCode = useDuel((s) => s.errorCode);
  const match = useDuel((s) => s.match);
  useDuel((s) => s.serial); // подписка на мутации движка
  const selfId = useDuel((s) => s.selfId);
  const createRoom = useDuel((s) => s.createRoom);
  const joinRoom = useDuel((s) => s.joinRoom);
  const startMatch = useDuel((s) => s.startMatch);
  const sendAction = useDuel((s) => s.sendAction);
  const rematch = useDuel((s) => s.rematch);
  const turnDeadline = useDuel((s) => s.turnDeadline);
  const leaveRoom = useDuel((s) => s.leaveRoom);
  const dismissError = useDuel((s) => s.dismissError);
  const heroName = useHeroName();
  const hero = useHero();

  const [bestOf, setBestOf] = useState<1 | 3 | 5>(3);
  const [format, setFormat] = useState<Format>("last_2y");
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [exitGate, setExitGate] = useState(false);
  // Отсчёт хода — чисто индикативный тик; авто-ход по истечении шлёт стор актора.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (turnDeadline === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [turnDeadline]);

  if (!data) return null;

  const mySide = selfSide({ match, selfId });
  const engine = match?.engine ?? null;
  const sideName = (side: DuelSide): string => engine?.names[side] ?? "";
  const myName = playerName.trim() || t("duel.defaultName");

  // ── Setup / лобби ────────────────────────────────────────────────────────────
  if (!engine) {
    const captains = membersList.slice(0, 2);
    const isCaptain = captains.some((member) => member.id === selfId);
    const canStart = status === "lobby" && isCaptain && captains.length === 2 && captains.every((member) => member.connected);
    return (
      <main className="duel">
        <header className="duel__head">
          <Button variant="back" data-testid="duel-back" onClick={() => { leaveRoom(); setMode(null); }}>
            ← {t("start.backToModes")}
          </Button>
          <Eyebrow>{t("start.modeDuel")}</Eyebrow>
          <h1>{t("duel.setupTitle")}</h1>
          <p className="duel__lead">{t("duel.setupLead")}</p>
        </header>
        {!isApiConfigured() && <Banner tone="locked" title={t("duel.noApiTitle")}>{t("duel.noApi")}</Banner>}
        {errorCode && (
          <Banner tone="locked" title={t("duel.errorTitle")} data-testid="duel-error">
            {t(`duel.error.${errorCode}` as MessageKey) || errorCode}{" "}
            <Button variant="secondary" onClick={dismissError}>{t("duel.errorDismiss")}</Button>
          </Banner>
        )}
        {status === "idle" || status === "error" ? (
          <Surface className="duel__setup">
            <label className="duel__field">
              <span>{t("duel.yourName")}</span>
              <TextField value={playerName} placeholder={t("duel.defaultName")}
                onChange={(event) => setPlayerName(event.target.value)} data-testid="duel-name" />
            </label>
            <div className="duel__entry">
              <Button variant="primary" data-testid="duel-create" disabled={!isApiConfigured()}
                onClick={() => void createRoom(myName)}>
                {t("duel.createRoom")}
              </Button>
              <span className="duel__or">{t("duel.or")}</span>
              <TextField value={joinCode} placeholder={t("duel.codePlaceholder")}
                onChange={(event) => setJoinCode(event.target.value)} data-testid="duel-code" />
              <Button variant="secondary" data-testid="duel-join"
                disabled={!isApiConfigured() || joinCode.trim().length === 0}
                onClick={() => joinRoom(joinCode, myName)}>
                {t("duel.joinRoom")}
              </Button>
            </div>
          </Surface>
        ) : status === "connecting" ? (
          <Surface className="duel__setup"><p className="duel__lead">{t("duel.connecting")}</p></Surface>
        ) : (
          <Surface className="duel__setup" data-testid="duel-lobby">
            <p className="duel__code-label">{t("duel.shareCode")}</p>
            <p className="duel__code" data-testid="duel-lobby-code">{code}</p>
            <ul className="duel__members">
              {membersList.map((member, index) => (
                <li key={member.id} className={member.connected ? "" : "duel__member--offline"}>
                  {index < 2 ? "⚔" : "👁"} {member.name}{member.id === selfId ? ` · ${t("duel.you")}` : ""}
                  {!member.connected && ` · ${t("duel.offline")}`}
                </li>
              ))}
            </ul>
            {membersList.length < 2 && <p className="duel__lead">{t("duel.waitingOpponent")}</p>}
            {isCaptain && (
              <>
                <OptionGroup
                  title={t("duel.bestOf")}
                  soonLabel={t("common.soon")}
                  options={BEST_OF.map((option) => ({ value: option.value, label: option.label }))}
                  value={bestOf}
                  onChange={setBestOf}
                />
                <OptionGroup
                  title={t("start.format")}
                  soonLabel={t("common.soon")}
                  options={FORMATS.map((option) => ({ value: option.value, label: t(option.label) }))}
                  value={format}
                  onChange={setFormat}
                />
                <Button variant="primary" data-testid="duel-start" disabled={!canStart}
                  onClick={() => startMatch({ format, bestOf })}>
                  {t("duel.start")}
                </Button>
              </>
            )}
            <Button variant="leave" data-testid="duel-leave-lobby" onClick={leaveRoom}>{t("duel.exit")}</Button>
          </Surface>
        )}
      </main>
    );
  }

  // ── Активная партия ──────────────────────────────────────────────────────────
  const rosterPanel = (side: DuelSide) => (
    <Surface className={`duel__roster ${engine.phase === "players" && engine.currentPicker === side ? "duel__roster--active" : ""}`} data-testid={`duel-roster-${side}`}>
      <h3>{sideName(side)}{mySide === side ? ` · ${t("duel.you")}` : ""}</h3>
      <ul>
        {engine.rosters[side].map((slot, index) => (
          <li key={index}>
            <RoleTag role={ROLE_SEQUENCE[index]}>{t(roleMessageKey(ROLE_SEQUENCE[index]))}</RoleTag>
            {slot ? <><b>{slot.player.nickname}</b> <span className="duel__ovr">{slot.player.ovr}</span></> : <span className="duel__empty">—</span>}
          </li>
        ))}
      </ul>
      {engine.phase !== "players" && (
        <p className="duel__picked-heroes">
          {engine.heroPicks[side].map((heroId) => heroName(heroId)).join(" · ")}
        </p>
      )}
    </Surface>
  );

  const exitButton = (
    <Button variant="leave" data-testid="duel-exit" onClick={() => setExitGate(true)}>{t("duel.exit")}</Button>
  );

  const exitModal = exitGate && (
    <Modal title={t("duel.exitTitle")} description={t("duel.exitText")} onClose={() => setExitGate(false)}>
      <Button variant="secondary" onClick={() => setExitGate(false)}>{t("duel.exitStay")}</Button>
      <Button variant="danger" data-testid="duel-exit-confirm" onClick={() => { leaveRoom(); setExitGate(false); }}>
        {t("duel.exitConfirm")}
      </Button>
    </Modal>
  );

  const turnLabel = (actor: DuelSide, key: MessageKey): string =>
    mySide === actor ? `${t(key, { name: sideName(actor) })} — ${t("duel.yourMove")}` : t(key, { name: sideName(actor) });

  const secondsLeft = turnDeadline === null ? null : Math.max(0, Math.ceil((turnDeadline - now) / 1000));
  const turnCountdown = secondsLeft !== null && (
    <span className="duel__timer" data-testid="duel-timer" data-low={secondsLeft <= 10}>
      {t("duel.turnTimer", { s: secondsLeft })}
    </span>
  );

  // Фаза 1: драфт игроков.
  if (engine.phase === "players") {
    const picker = engine.currentPicker;
    const myTurn = mySide === picker;
    return (
      <main className="duel">
        <header className="duel__head">
          {exitButton}
          <Eyebrow>{t("start.modeDuel")} · {code}</Eyebrow>
          <h1>{t("duel.playerDraftTitle")}</h1>
          <p className="duel__turn" data-testid="duel-turn">{turnLabel(picker, "duel.turnPick")} {turnCountdown}</p>
        </header>
        <div className="duel__board">
          {rosterPanel(0)}
          <Surface className="duel__pack">
            <h3>{engine.currentPack.label}</h3>
            <ul className="duel__candidates">
              {engine.currentPack.candidates.map((candidate, index) => (
                <li key={`${candidate.player.accountId}-${index}`}>
                  <button
                    type="button"
                    className="duel__candidate"
                    data-testid={`duel-candidate-${index}`}
                    disabled={!myTurn || !engine.canPickPlayer(index)}
                    onClick={() => sendAction({ kind: "pickPlayer", index })}
                  >
                    <RoleTag role={candidate.player.role}>{t(roleMessageKey(candidate.player.role))}</RoleTag>
                    <b>{candidate.player.nickname}</b>
                    <span className="duel__ovr">{candidate.player.ovr}</span>
                    <small>{candidate.teamName}</small>
                  </button>
                </li>
              ))}
            </ul>
            <Button
              variant="secondary"
              data-testid="duel-reroll"
              disabled={!myTurn || engine.rerollsLeft[picker] <= 0}
              onClick={() => sendAction({ kind: "reroll" })}
            >
              ↻ {t("duel.reroll", { n: engine.rerollsLeft[picker] })}
            </Button>
          </Surface>
          {rosterPanel(1)}
        </div>
        {exitModal}
      </main>
    );
  }

  // Фаза 2: хиро-драфт.
  if (engine.phase === "heroes") {
    const step = engine.currentStep!;
    const myTurn = mySide === step.side;
    return (
      <main className="duel">
        <header className="duel__head">
          {exitButton}
          <Eyebrow>{t("duel.game", { n: engine.games.length + 1 })} · {engine.seriesScore.join(" : ")}</Eyebrow>
          <h1>{t("duel.heroDraftTitle")}</h1>
          <p className={`duel__turn ${step.kind === "ban" ? "duel__turn--ban" : ""}`} data-testid="duel-hero-turn">
            {turnLabel(step.side, step.kind === "ban" ? "duel.turnBan" : "duel.turnHeroPick")} {turnCountdown}
          </p>
        </header>
        <div className="duel__board">
          {rosterPanel(0)}
          <Surface className="duel__heroes">
            <ul className="duel__hero-grid">
              {engine.heroPool().map((cell) => (
                <li key={cell.heroId}>
                  <button
                    type="button"
                    className={`duel__hero duel__hero--${cell.state}`}
                    data-testid={`duel-hero-${cell.heroId}`}
                    disabled={!myTurn || cell.state !== "open"}
                    onClick={() => sendAction({ kind: "actHero", heroId: cell.heroId })}
                  >
                    <HeroThumb picture={hero(cell.heroId).picture} name={hero(cell.heroId).name} showName={false} />
                    <span className="duel__hero-name">{heroName(cell.heroId)}</span>
                    <small>{cell.games[0]} · {cell.games[1]}</small>
                  </button>
                </li>
              ))}
            </ul>
          </Surface>
          {rosterPanel(1)}
        </div>
        {exitModal}
      </main>
    );
  }

  // Результат игры / серии.
  const lastGame = engine.games[engine.games.length - 1];
  const [scoreA, scoreB] = engine.seriesScore;
  const done = engine.phase === "done";
  return (
    <main className="duel">
      <header className="duel__head">
        {exitButton}
        <Eyebrow>{done ? t("duel.seriesOver") : t("duel.game", { n: lastGame.index + 1 })}</Eyebrow>
        <h1 data-testid="duel-result-title">
          {done
            ? t("duel.seriesWinner", { name: sideName(engine.seriesWinner!), a: scoreA, b: scoreB })
            : t("duel.gameWinner", { name: sideName(lastGame.winner) })}
        </h1>
      </header>
      <Surface className="duel__result">
        <table className="duel__games" data-testid="duel-games">
          <thead>
            <tr><th /><th>{sideName(0)}</th><th>{sideName(1)}</th></tr>
          </thead>
          <tbody>
            {engine.games.map((game) => (
              <tr key={game.index}>
                <td>{t("duel.game", { n: game.index + 1 })}</td>
                <td className={game.winner === 0 ? "duel__won" : ""}>{game.score[0].teamOvr.toFixed(1)}</td>
                <td className={game.winner === 1 ? "duel__won" : ""}>{game.score[1].teamOvr.toFixed(1)}</td>
              </tr>
            ))}
            <tr className="duel__series-row">
              <td>{t("duel.series")}</td>
              <td className={done && engine.seriesWinner === 0 ? "duel__won" : ""}>{scoreA}</td>
              <td className={done && engine.seriesWinner === 1 ? "duel__won" : ""}>{scoreB}</td>
            </tr>
          </tbody>
        </table>
        <p className="duel__prob">{t("duel.probability", { pct: Math.round(lastGame.pSideA * 100), name: sideName(0) })}</p>
        <div className="duel__actions">
          {done ? (
            <>
              {mySide !== null && (
                <Button variant="primary" data-testid="duel-rematch" onClick={rematch}>
                  {t("duel.rematch")}
                </Button>
              )}
              <Button variant="secondary" data-testid="duel-new" onClick={leaveRoom}>{t("duel.newDuel")}</Button>
            </>
          ) : mySide !== null && (
            <Button variant="primary" data-testid="duel-next" onClick={() => sendAction({ kind: "next" })}>
              {engine.seriesWinner !== null ? t("duel.finishSeries") : t("duel.nextGame")}
            </Button>
          )}
        </div>
        {done && mySide !== null && <p className="duel__prob">{t("duel.rematchHint")}</p>}
      </Surface>
      {exitModal}
    </main>
  );
}
