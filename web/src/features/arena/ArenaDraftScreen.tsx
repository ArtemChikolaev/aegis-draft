// Экран общего драфта Arena (MP2): пул по центру (игроки — колонками по ролям, герои — сеткой),
// посадка раунда сбоку, своя команда рядом, таймер раунда сверху. Все выбирают одновременно:
// клик — пик, второй клик — запасной, «Отправить» шлёт заявку в relay-лог; раунд резолвится,
// когда сдал последний человек, либо по таймеру хоста. Всё из ui/-примитивов; гамма режима —
// красный акцент арены (data-accent вешает App).
import { useEffect, useMemo, useState } from "react";
import { useArena } from "../../state/arenaStore.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { roleMessageKey } from "../../i18n/core.ts";
import { ROLE_SEQUENCE } from "../../game/packs.ts";
import type { ArenaResolvedPick } from "../../game/arenaDraft.ts";
import type { Role } from "../../types/data.ts";
import { Button, Eyebrow, HeroThumb, Modal, RoleTag, Surface } from "../../ui/index.ts";
import { useHero, useHeroName } from "../draft/heroes.ts";
import "./arena.css";

const ROLES: readonly Role[] = ["safelane", "mid", "offlane", "support"];

export function ArenaDraftScreen() {
  const { t } = useI18n();
  const match = useArena((s) => s.match);
  useArena((s) => s.serial);
  const selfId = useArena((s) => s.selfId);
  const deadline = useArena((s) => s.roundDeadline);
  const sendPick = useArena((s) => s.sendPick);
  const closeRound = useArena((s) => s.closeRound);
  const syncTournament = useArena((s) => s.syncTournament);
  const leaveRoom = useArena((s) => s.leaveRoom);
  const heroName = useHeroName();
  const hero = useHero();

  const engine = match?.engine ?? null;
  const round = engine?.round ?? 0;
  const phase = engine?.phase ?? "done";

  const [main, setMain] = useState<number | null>(null);
  const [backup, setBackup] = useState<number | null>(null);
  const [leaveGate, setLeaveGate] = useState(false);
  // Отсчёт до конца раунда — чисто индикативный: резолвит лог (последний человек либо host).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  // Новый раунд — чистый выбор.
  useEffect(() => {
    setMain(null);
    setBackup(null);
  }, [round]);
  // Драфт завершён, а runStore мог быть не готов в момент резолва — идемпотентный ретрай.
  useEffect(() => {
    if (phase === "done") syncTournament();
  }, [phase, syncTournament]);

  // Имена всех уже взятых игроков — для ленты резолвов (из пула они уже удалены).
  const playerNames = useMemo(() => {
    const names = new Map<number, string>();
    if (!engine) return names;
    for (const roster of engine.rosters) {
      for (const slot of roster) if (slot) names.set(slot.player.accountId, slot.player.nickname);
    }
    for (const candidate of engine.openPlayers()) names.set(candidate.player.accountId, candidate.player.nickname);
    return names;
  }, [engine, round]);

  if (!engine || !match || !selfId) return null;
  const seatIndex = engine.seatOf(selfId);
  if (seatIndex === null) return null;

  if (phase === "done") {
    return (
      <main className="arena-draft">
        <Surface className="arena-draft__panel">
          <Eyebrow>{t("arena.draftEyebrow")}</Eyebrow>
          <p>{t("arena.buildingTournament")}</p>
        </Surface>
      </main>
    );
  }

  const isHost = match.hostId === selfId;
  const submitted = engine.pending.has(seatIndex);
  const humans = engine.seats.filter((seat) => !seat.isBot);
  const humansSubmitted = engine.seats.filter((seat, index) => !seat.isBot && engine.pending.has(index)).length;
  const order = engine.roundOrder();
  const myPos = order.indexOf(seatIndex) + 1;
  const secondsLeft = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
  const lastRound = engine.history.length > 0 ? engine.history[engine.history.length - 1] : null;

  const select = (id: number) => {
    if (submitted) return;
    if (main === id) {
      setMain(backup);
      setBackup(null);
    } else if (backup === id) {
      setBackup(null);
    } else if (main === null) {
      setMain(id);
    } else {
      setBackup(id);
    }
  };

  const selectionTag = (id: number) =>
    main === id ? <em className="arena-draft__tag">{t("arena.mainLabel")}</em>
      : backup === id ? <em className="arena-draft__tag arena-draft__tag--backup">{t("arena.backupLabel")}</em>
        : null;

  const resolvedLine = (pick: ArenaResolvedPick) => {
    const seat = engine.seats[pick.seatIndex];
    const target = pick.kind === "players" ? (playerNames.get(pick.id) ?? String(pick.id)) : heroName(pick.id);
    const source = pick.source === "main" ? t("arena.srcMain") : pick.source === "backup" ? t("arena.srcBackup") : t("arena.srcAuto");
    return `${seat.name}: ${target} (${source})`;
  };

  const myRoster = engine.rosters[seatIndex];

  return (
    <main className="arena-draft" data-testid="arena-draft">
      <header className="arena-draft__head">
        <Eyebrow>{t("arena.draftEyebrow")}</Eyebrow>
        <h1 data-testid="arena-draft-round">
          {t(phase === "players" ? "arena.draftPlayersTitle" : "arena.draftHeroesTitle", {
            n: round + 1,
            total: engine.totalRounds,
          })}
        </h1>
        <p className="arena-draft__meta">
          <span data-testid="arena-priority">{t("arena.priority", { pos: myPos, size: engine.seats.length })}</span>
          {secondsLeft !== null && (
            <span className="arena-draft__timer" data-testid="arena-timer">
              {secondsLeft > 0 ? t("arena.timerS", { s: secondsLeft }) : t("arena.timerHost")}
            </span>
          )}
        </p>
      </header>

      <div className="arena-draft__board">
        <Surface className="arena-draft__timeline" data-testid="arena-timeline">
          <h3>{t("arena.timelineTitle")}</h3>
          <ol>
            {order.map((index, position) => {
              const seat = engine.seats[index];
              const picks = phase === "players"
                ? engine.rosters[index].filter((slot) => slot !== null).length
                : engine.heroPicks[index].length;
              const target = ROLE_SEQUENCE.length;
              return (
                <li key={seat.id} className={index === seatIndex ? "is-self" : ""}>
                  <b>{position + 1}.</b> {seat.name}
                  {index === seatIndex && <small> · {t("arena.you")}</small>}
                  {seat.isBot ? <small> · {t("arena.botTag")}</small>
                    : engine.pending.has(index) && <small> · {t("arena.pickedTag")}</small>}
                  <span className="arena-draft__count">{picks}/{target}</span>
                </li>
              );
            })}
          </ol>
        </Surface>

        <Surface className="arena-draft__pool">
          {submitted ? (
            <p className="arena-draft__submitted" data-testid="arena-submitted">
              {t("arena.submittedNote", { n: humansSubmitted, m: humans.length })}
            </p>
          ) : (
            <p className="arena-draft__hint">{t("arena.pickHint")}</p>
          )}
          {phase === "players" ? (
            <div className="arena-draft__roles">
              {ROLES.map((role) => (
                <section key={role}>
                  <RoleTag role={role}>{t(roleMessageKey(role))}</RoleTag>
                  <ul>
                    {engine.openPlayers()
                      .filter((candidate) => candidate.player.role === role)
                      .sort((a, b) => b.player.ovr - a.player.ovr || a.player.accountId - b.player.accountId)
                      .map((candidate) => (
                        <li key={candidate.player.accountId}>
                          <button
                            type="button"
                            className="arena-draft__candidate"
                            data-selected={main === candidate.player.accountId || backup === candidate.player.accountId}
                            data-testid={`arena-candidate-${candidate.player.accountId}`}
                            disabled={submitted || !engine.canPick(seatIndex, candidate.player.accountId)}
                            onClick={() => select(candidate.player.accountId)}
                          >
                            <b>{candidate.player.nickname}</b>
                            <span className="arena-draft__ovr">{candidate.player.ovr}</span>
                            <small>{candidate.teamName}</small>
                            {selectionTag(candidate.player.accountId)}
                          </button>
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <ul className="arena-draft__hero-grid">
              {engine.openHeroes()
                .sort((a, b) => a - b)
                .map((heroId) => (
                  <li key={heroId}>
                    <button
                      type="button"
                      className="arena-draft__hero"
                      data-selected={main === heroId || backup === heroId}
                      data-testid={`arena-hero-${heroId}`}
                      disabled={submitted}
                      onClick={() => select(heroId)}
                    >
                      <HeroThumb picture={hero(heroId).picture} name={hero(heroId).name} showName={false} />
                      <span>{heroName(heroId)}</span>
                      {selectionTag(heroId)}
                    </button>
                  </li>
                ))}
            </ul>
          )}
          <div className="arena-draft__actions">
            <Button
              variant="primary"
              data-testid="arena-send-pick"
              disabled={submitted || main === null}
              onClick={() => {
                if (main !== null) sendPick(main, backup ?? undefined);
              }}
            >
              {t("arena.confirmPick")}
            </Button>
            {isHost && (
              <Button variant="secondary" data-testid="arena-close-round" onClick={closeRound}>
                {t("arena.closeRound")}
              </Button>
            )}
            <Button variant="leave" data-testid="arena-draft-leave" onClick={() => setLeaveGate(true)}>
              {t("arena.leave")}
            </Button>
          </div>
        </Surface>

        <div className="arena-draft__side">
          <Surface className="arena-draft__team" data-testid="arena-my-team">
            <h3>{t("arena.yourTeam")}</h3>
            <ul>
              {myRoster.map((slot, index) => (
                <li key={index}>
                  <RoleTag role={ROLE_SEQUENCE[index]}>{t(roleMessageKey(ROLE_SEQUENCE[index]))}</RoleTag>
                  {slot ? <><b>{slot.player.nickname}</b> <span className="arena-draft__ovr">{slot.player.ovr}</span></>
                    : <span className="arena-draft__empty">—</span>}
                </li>
              ))}
            </ul>
            {engine.heroPicks[seatIndex].length > 0 && (
              <p className="arena-draft__my-heroes">
                {engine.heroPicks[seatIndex].map((heroId) => heroName(heroId)).join(" · ")}
              </p>
            )}
          </Surface>
          {lastRound && (
            <Surface className="arena-draft__log" data-testid="arena-last-round">
              <h3>{t("arena.lastRound", { n: engine.history.length })}</h3>
              <ol>
                {lastRound.map((pick) => (
                  <li key={pick.seatIndex} data-source={pick.source}>{resolvedLine(pick)}</li>
                ))}
              </ol>
            </Surface>
          )}
        </div>
      </div>

      {leaveGate && (
        <Modal title={t("arena.leaveDraftTitle")} description={t("arena.leaveDraftText")} onClose={() => setLeaveGate(false)}>
          <Button variant="secondary" onClick={() => setLeaveGate(false)}>{t("duel.exitStay")}</Button>
          <Button variant="danger" data-testid="arena-draft-leave-confirm" onClick={() => { leaveRoom(); setLeaveGate(false); }}>
            {t("arena.leave")}
          </Button>
        </Modal>
      )}
    </main>
  );
}
