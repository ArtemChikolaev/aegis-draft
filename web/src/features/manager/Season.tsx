// Файл на компонент (T12.5, 2026-09-02): раньше всё жило одним ManagerScreen.tsx на 1005 строк.
// Фаза сезона: календарь, матчи, финал; модалка назначения героя живёт здесь же — её
// единственный пользователь.
import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/core.ts";
import { roleMessageKey } from "../../i18n/core.ts";
import { useManager } from "../../state/managerStore.ts";
import { useRun } from "../../state/runStore.ts";
import {
  
  
  RIVAL_BONUS_K,
  
  
  
  
} from "../../game/manager/economy.ts";
import {
  
  
  
  slotMonth,
  type CalendarSlot,
  type ManagerEngine,
} from "../../game/manager/engine.ts";
import { Button, Eyebrow, Modal, OvrBadge, RoleTag, StatTile, Surface } from "../../ui/index.ts";
import { useHeroName } from "../draft/heroes.ts";
import { heroStatsForDisplay } from "../../game/score.ts";
import { FinaleReveal } from "./FinaleReveal.tsx";
import { ManagerHeading } from "./ManagerHeading.tsx";
import { HallModal } from "./HallModal.tsx";
import { ManagerAbandonModal } from "./ManagerAbandonModal.tsx";

const KIND_LABEL: Record<CalendarSlot["kind"], MessageKey> = {
  tier2: "manager.kind.tier2",
  qualifier: "manager.kind.qualifier",
  online: "manager.kind.online",
  lan: "manager.kind.lan",
  finaleQual: "manager.kind.finaleQual",
  finale: "manager.kind.finale",
};

export function Season({ engine }: { engine: ManagerEngine }) {
  const { t } = useI18n();
  const act = useManager((s) => s.act);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const abandonCareer = useManager((s) => s.abandonCareer);
  const heroName = useHeroName();
  const data = useRun((st) => st.data);
  const s = engine.state;
  const assignment = engine.assignmentByPlayer();
  // Manual-своп (срез 3): клик по строке ростера открывает пикер героя из пула орга.
  const [assignFor, setAssignFor] = useState<number | null>(null);
  const [showHall, setShowHall] = useState(false);
  // Live-reveal финала (срез 6): пока идёт раскадровка, итоговые строки и Continue скрыты.
  const [finaleRevealed, setFinaleRevealed] = useState(false);
  const resultSlotId = s.lastResult?.slotId ?? null;
  useEffect(() => setFinaleRevealed(false), [resultSlotId]);
  // Без useMemo: движок мутирует state по ссылке (стор тикает версией), а scoreTeam на
  // пятёрке с пулом из 12 героев дёшев — стабильных зависимостей для мемо тут просто нет.
  const score = engine.score();
  const next = engine.nextSlot;
  const wages = engine.wagesK;
  const net = engine.incomeK - wages;
  const result = s.lastResult;
  // Рейтинг единым списком (баг плейтеста 2026-08-15: юзер с рангом #1 висел ПОД топ-8).
  // Юзер в топ-8 встаёт на своё место; ниже — топ-8 ботов + его строка с настоящим рангом.
  const ranked = [...s.world.map((org) => ({ name: org.name, elo: org.elo, isUser: false })), { name: s.config.orgName, elo: s.elo, isUser: true }]
    .sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name));
  const userRankIndex = ranked.findIndex((row) => row.isUser);
  const worldRows = userRankIndex < 8
    ? ranked.slice(0, 8).map((row, index) => ({ ...row, rank: index + 1 }))
    : [...ranked.slice(0, 8).map((row, index) => ({ ...row, rank: index + 1 })), { ...ranked[userRankIndex], rank: userRankIndex + 1 }];

  return (
    <>
      <ManagerHeading engine={engine} sub={t("manager.seasonSub", { season: s.season })} />

      <div className="manager__strip">
        <StatTile label={t("manager.bank")} value={`$${Math.round(s.bankK)}k`} kind="base" />
        <StatTile label={t("manager.net")} value={`${net >= 0 ? "+" : "−"}$${Math.abs(net)}k`} kind={net >= 0 ? "synergy" : "chemistry"} />
        <StatTile label="ELO" value={`${s.elo}`} kind="base" />
        <StatTile label={t("manager.worldRank")} value={`#${engine.worldRank()}`} kind="base" />
      </div>

      {result ? (
        <Surface className="manager__panel manager__result" data-testid="manager-result">
          <h2 className="manager__section">{result.name}</h2>
          {result.finale && (
            <FinaleReveal
              finale={result.finale}
              orgName={s.config.orgName}
              done={finaleRevealed}
              onDone={() => setFinaleRevealed(true)}
            />
          )}
          {(!result.finale || finaleRevealed) && (
          <>
          <p className="manager__result-line">
            <b className="manager__result-place">{t("manager.placeOf", { p: result.placement, n: result.fieldSize })}</b>
            {result.prizeK > 0 && <span> · +${result.prizeK}k</span>}
            <span> · ELO {result.eloDelta >= 0 ? "+" : ""}{result.eloDelta}</span>
          </p>
          {result.rivalBonusK > 0 && (
            <p className="manager__gate is-advanced">
              <strong>{t("manager.rivalBeaten")}</strong> {t("manager.rivalBeatenText", { n: result.rivalBonusK })}
            </p>
          )}
          {result.advanced !== null && (
            <p className={`manager__gate ${result.advanced ? "is-advanced" : "is-eliminated"}`}>
              <strong>{t(result.advanced ? "manager.advanced" : "manager.eliminated")}</strong>{" "}
              {t(result.advanced ? "manager.advancedText" : "manager.eliminatedText")}
            </p>
          )}
          {result.bracket.length === 3 && (
            <div className="manager__bracket" data-testid="manager-bracket">
              {result.bracket.map((round, index) => (
                <div key={index} className="manager__bracket-round">
                  <em>{t(index === 0 ? "manager.bracketQF" : index === 1 ? "manager.bracketSF" : "manager.bracketF")}</em>
                  {round.map((match) => (
                    <div key={`${match.a}·${match.b}`} className="manager__bracket-match">
                      <span className={`${match.winner === match.a ? "is-winner" : ""}${match.a === s.config.orgName ? " is-user" : ""}`}>{match.a}</span>
                      <span className={`${match.winner === match.b ? "is-winner" : ""}${match.b === s.config.orgName ? " is-user" : ""}`}>{match.b}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          <ol className="manager__standings">
            {result.standings.map((row) => (
              <li key={row.name} className={row.isUser ? "is-user" : ""}>
                <span>{row.placement}</span> {row.name}
                {row.isRival && <em className="manager__rival-tag">{t("manager.rivalTag")}</em>}
              </li>
            ))}
          </ol>
          {/* Пара кнопок в фиксированном месте (плейтест: одиночная «Дальше» сменялась
              «Play» на другой высоте — быстрые клики промахивались). «Сыграть следующее»
              не запускает событие, если выпала модалка random event. */}
          <div className="manager__result-actions">
            <Button variant="secondary" data-testid="manager-continue" onClick={() => act((e) => e.continueSeason())}>
              {t("manager.continue")} →
            </Button>
            {s.calendar.some((slot) => !slot.result && !slot.dnq && slot.id !== result.slotId) && (
              <Button
                variant="primary"
                data-testid="manager-play-next"
                onClick={() => act((e) => {
                  e.continueSeason();
                  if (!e.state.pendingRandomEvent && e.state.phase === "season") e.playNextEvent();
                })}
              >
                {t("manager.playNext")} →
              </Button>
            )}
          </div>
          </>
          )}
        </Surface>
      ) : next ? (
        <Surface className="manager__panel manager__next" data-testid="manager-next">
          <Eyebrow>{t("manager.nextUp")} · {t(KIND_LABEL[next.kind])}</Eyebrow>
          <h2 className="manager__next-name">{next.name}</h2>
          <p className="manager__hint">{t("manager.fieldLine", { n: score ? Math.round(score.teamOvr) : 0 })}</p>
          <div>
            <Button variant="primary" data-testid="manager-play" onClick={() => act((e) => e.playNextEvent())}>
              {t("manager.play")} →
            </Button>
          </div>
        </Surface>
      ) : null}

      <div className="manager__grid">
        <Surface className="manager__panel">
          <h2 className="manager__section">{t("manager.rosterTitle")} · ${wages}k / ${engine.incomeK}k</h2>
          {engine.sponsorK > 0 && <p className="manager__hint">{t("manager.sponsorLine", { n: engine.sponsorK })}</p>}
          <div className="manager__roster">
            {s.roster.map((p) => {
              const id = p.candidate.player.accountId;
              const heroId = assignment[id];
              const pinned = s.manualAssignment[id] !== undefined;
              const unhappy = p.happiness < 30;
              return (
                <button
                  key={id}
                  type="button"
                  className="manager__roster-row manager__roster-row--wide"
                  data-testid="manager-roster-row"
                  title={t("manager.assignHint")}
                  onClick={() => setAssignFor(id)}
                >
                  <RoleTag role={p.candidate.player.role}>{t(roleMessageKey(p.candidate.player.role))}</RoleTag>
                  <span className="manager__roster-id">
                    <strong>{p.candidate.player.nickname}</strong>
                    <small>{heroId !== undefined ? heroName(heroId) : "—"}{pinned && <em className="manager__pin"> ✎</em>}</small>
                  </span>
                  <span className="manager__roster-mood" title={t("manager.moodTitle", { n: p.happiness })}>
                    {p.fame > 0 && <em className="manager__fame">{p.fame}★</em>}
                    <em className={`manager__mood${unhappy ? " is-unhappy" : ""}`}>{unhappy ? "☹" : p.happiness >= 70 ? "♥" : "♡"} {p.happiness}</em>
                  </span>
                  <OvrBadge ovr={p.candidate.player.ovr} />
                  <span>${p.salary}k{t("manager.perMonth")}</span>
                </button>
              );
            })}
          </div>
          {score && (
            <div className="manager__score">
              <StatTile label={t("common.base")} value={`${Math.round(score.base)}`} kind="base" />
              <StatTile label={t("common.heroSynergy")} value={`+${(Math.round(score.heroSynergy * 10) / 10)}`} kind="synergy" />
              <StatTile label={t("common.chemistry")} value={`+${(Math.round(score.chemistry * 10) / 10)}`} kind="chemistry" />
              <StatTile label={t("common.teamOvr")} value={`${Math.round(score.teamOvr)}`} kind="base" />
            </div>
          )}
        </Surface>

        <Surface className="manager__panel">
          <h2 className="manager__section">{t("manager.worldTitle")}</h2>
          <ol className="manager__world">
            {worldRows.map((row) => (
              <li key={row.name} className={row.isUser ? "is-user" : ""}>
                <span>{row.rank}</span> {row.name}
                {!row.isUser && row.name === s.rival && <em className="manager__rival-tag">{t("manager.rivalTag")}</em>}
                <b>{row.elo}</b>
              </li>
            ))}
          </ol>
          <p className="manager__hint">{t("manager.rivalHint", { org: s.rival, n: RIVAL_BONUS_K })}</p>
        </Surface>
      </div>

      <Surface className="manager__panel">
        <h2 className="manager__section">{t("manager.outlineTitle")}</h2>
        <div className="manager__outline">
          {s.calendar.map((slot) => (
            <span
              key={slot.id}
              className={`manager__slot${slot.result ? " is-done" : slot.dnq ? " is-dnq" : ""}${slot.kind === "finale" || slot.kind === "finaleQual" ? " is-finale" : ""}`}
              title={slot.name}
            >
              <em>{t(KIND_LABEL[slot.kind])}</em>
              <b>{slot.result ? `#${slot.result.placement}` : slot.dnq ? "—" : slotMonth(slot)}</b>
            </span>
          ))}
        </div>
      </Surface>

      {s.feed.length > 0 && (
        <Surface className="manager__panel">
          <h2 className="manager__section">{t("manager.feedTitle")}</h2>
          <ul className="manager__feed">
            {s.feed.slice(0, 10).map((item) => (
              <li key={item.slotId}>
                {item.dnq
                  ? t("manager.feedDnq", { name: item.name })
                  : t("manager.feedResult", { name: item.name, p: item.placement })}
                {item.prizeK > 0 && <b> +${item.prizeK}k</b>}
              </li>
            ))}
          </ul>
        </Surface>
      )}

      <div className="manager__footer-actions">
        <Button variant="secondary" data-testid="manager-hall-open" onClick={() => setShowHall(true)}>{t("manager.hallTitle")}</Button>
        <Button variant="leave" onClick={() => setConfirmAbandon(true)}>{t("manager.abandon")}</Button>
      </div>
      {showHall && <HallModal onClose={() => setShowHall(false)} />}
      {confirmAbandon && <ManagerAbandonModal onConfirm={abandonCareer} onClose={() => setConfirmAbandon(false)} />}
      {assignFor !== null && data && (
        <HeroAssignModal
          engine={engine}
          accountId={assignFor}
          data={data}
          onPick={(heroId) => { act((e) => e.setHeroAssignment(assignFor, heroId)); setAssignFor(null); }}
          onClose={() => setAssignFor(null)}
        />
      )}
      {s.pendingRandomEvent && (
        <Modal
          mark="A"
          title={t(`manager.re.${s.pendingRandomEvent.kind}` as MessageKey)}
          description={t(`manager.re.${s.pendingRandomEvent.kind}Text` as MessageKey)}
          subhead={t("manager.reEyebrow")}
          labelledBy="manager-random-event"
          dismissLabel={t("common.close")}
          onClose={() => act((e) => e.dismissRandomEvent())}
        >
          {({ close }) => {
            const pending = s.pendingRandomEvent!;
            return (
              <>
                <p className="manager__re-effect" data-testid="manager-re-effect">
                  {pending.cashK !== 0 && <b>+${pending.cashK}k</b>}
                  {pending.happiness !== 0 && (
                    <b>{pending.happiness > 0 ? "+" : ""}{pending.happiness} {t("manager.reMood")}</b>
                  )}
                  {/* Срез 7: превью выбора собирается из разрешённых чисел — оно обязано
                      совпасть с эффектом accept, включая конкретного героя heroClinic. */}
                  {pending.choice && (
                    <b>
                      {[
                        pending.choice.costK > 0 ? `−$${pending.choice.costK}k` : null,
                        pending.choice.cashK > 0 ? `+$${pending.choice.cashK}k` : null,
                        pending.choice.happiness !== 0
                          ? `${pending.choice.happiness > 0 ? "+" : ""}${pending.choice.happiness} ${t("manager.reMood")}`
                          : null,
                        pending.choice.heroId !== undefined
                          ? `+${data?.heroes.find((h) => h.id === pending.choice!.heroId)?.name ?? "?"} ${t("manager.reHeroPool")}`
                          : null,
                      ].filter(Boolean).join(" · ")}
                    </b>
                  )}
                </p>
                {pending.choice ? (
                  <>
                    <Button variant="secondaryInvert" data-testid="manager-re-decline" onClick={() => { act((e) => e.resolveRandomEvent(false)); close(); }}>
                      {t("manager.reDecline")}
                    </Button>
                    <Button
                      variant="primaryInvert"
                      data-testid="manager-re-accept"
                      disabled={s.bankK < pending.choice.costK}
                      onClick={() => { act((e) => e.resolveRandomEvent(true)); close(); }}
                    >
                      {pending.choice.costK > 0 ? t("manager.reAccept", { n: pending.choice.costK }) : t("manager.reAcceptDeal")}
                    </Button>
                  </>
                ) : (
                  <Button variant="primaryInvert" data-testid="manager-re-dismiss" onClick={() => { act((e) => e.dismissRandomEvent()); close(); }}>
                    {t("manager.reOk")}
                  </Button>
                )}
              </>
            );
          }}
        </Modal>
      )}
    </>
  );
}

/** Пикер героя для игрока (Manual, срез 3): пул орга с career-играми игрока на каждом герое.
 *  Герой у другого игрока — забирается (авто-matching дораздаёт остальным). */
function HeroAssignModal({ engine, accountId, data, onPick, onClose }: {
  engine: ManagerEngine;
  accountId: number;
  data: NonNullable<ReturnType<typeof useRun.getState>["data"]>;
  onPick: (heroId: number | null) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const heroName = useHeroName();
  const s = engine.state;
  const player = s.roster.find((p) => p.candidate.player.accountId === accountId);
  const assignment = engine.assignmentByPlayer();
  const phs = heroStatsForDisplay(data);
  if (!player) return null;
  const nickOf = (id: number | undefined) =>
    s.roster.find((p) => p.candidate.player.accountId === id)?.candidate.player.nickname;

  return (
    <Modal
      mark="A"
      title={t("manager.assignTitle", { nick: player.candidate.player.nickname })}
      description={t("manager.assignText")}
      labelledBy="manager-assign-title"
      dismissLabel={t("common.close")}
      onClose={onClose}
      layout="content"
    >
      {() => (
        <div className="manager__assign-list">
          <button type="button" className="manager__assign-row" data-testid="manager-assign-auto" onClick={() => onPick(null)}>
            <strong>{t("manager.assignAuto")}</strong>
            <small>{t("manager.assignAutoHint")}</small>
          </button>
          {s.heroPool.map((heroId) => {
            const games = phs[String(accountId)]?.[String(heroId)]?.games ?? 0;
            const holder = Object.entries(assignment).find(([, hero]) => hero === heroId)?.[0];
            const holderNick = holder !== undefined ? nickOf(Number(holder)) : undefined;
            const mine = assignment[accountId] === heroId;
            return (
              <button
                key={heroId}
                type="button"
                className={`manager__assign-row${mine ? " is-selected" : ""}`}
                data-testid="manager-assign-hero"
                onClick={() => onPick(heroId)}
              >
                <strong>{heroName(heroId)}</strong>
                <small>
                  {t("manager.assignGames", { n: games })}
                  {holderNick && !mine && <> · {t("manager.assignHeldBy", { nick: holderNick })}</>}
                  {mine && <> · {t("manager.assignCurrent")}</>}
                </small>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

// ── Оффсезон ─────────────────────────────────────────────────────────────────
