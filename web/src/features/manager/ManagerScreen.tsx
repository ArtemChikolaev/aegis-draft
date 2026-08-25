import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/core.ts";
import type { Role } from "../../types/data.ts";
import { roleMessageKey } from "../../i18n/core.ts";
import { useManager } from "../../state/managerStore.ts";
import { useRun } from "../../state/runStore.ts";
import { navigateBack } from "../../state/navigation.ts";
import { useTmaChrome } from "../../state/tmaChrome.ts";
import {
  MANAGER_INCOME,
  MANAGER_REGIONS,
  RIVAL_BONUS_K,
  TRANSFER_LIMIT,
  type ManagerDifficulty,
  type ManagerRegion,
  OFFSEASON_BOOTCAMP,
} from "../../game/manager/economy.ts";
import {
  HERO_PICKS_PER_ROUND,
  HERO_ROUNDS,
  TRYOUT_PICKS,
  slotMonth,
  type CalendarSlot,
  type ManagerEngine,
} from "../../game/manager/engine.ts";
import { Button, Eyebrow, HeroThumb, Modal, OptionGroup, RoleTag, StatTile, Surface, TextField, playerOvrTier } from "../../ui/index.ts";
import { sfxBuy } from "../../ui/sound.ts";
import { useHero, useHeroName } from "../draft/heroes.ts";
import { heroStatsForDisplay } from "../../game/score.ts";
import { FinaleReveal } from "./FinaleReveal.tsx";
import "./manager.css";

const KIND_LABEL: Record<CalendarSlot["kind"], MessageKey> = {
  tier2: "manager.kind.tier2",
  qualifier: "manager.kind.qualifier",
  online: "manager.kind.online",
  lan: "manager.kind.lan",
  finaleQual: "manager.kind.finaleQual",
  finale: "manager.kind.finale",
};

/** Esports Manager (T5.5, срез 1). Один экран, фазы ведёт движок: онбординг → трайауты →
 *  пул героев → контракты → сезон → оффсезон → итоги. Выход в меню безопасен: карьера —
 *  long-save и пишется после каждого действия. */
export function ManagerScreen() {
  const { t } = useI18n();
  const engine = useManager((s) => s.engine);
  const version = useManager((s) => s.version);
  const hydrate = useManager((s) => s.hydrate);
  const careerOpen = useManager((s) => s.careerOpen);
  const setCareerOpen = useManager((s) => s.setCareerOpen);
  const data = useRun((s) => s.data);
  const backNative = useTmaChrome((state) => state.backNative);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!data) return null;
  void version; // подписка: движок мутирует state, стор тикает версией

  // Как в classic: вход в режим — всегда настройка НОВОЙ карьеры; в открытую ведёт
  // только плашка resume (setCareerOpen). Выход из карьеры закрывает её (сейв цел).
  const inCareer = careerOpen && engine !== null;

  return (
    <main className="manager" data-testid="manager-screen">
      {!backNative && (
        <Button
          variant="back"
          data-testid="manager-back"
          onClick={() => {
            if (inCareer) setCareerOpen(false);
            navigateBack();
          }}
        >
          ← {t("start.backToModes")}
        </Button>
      )}
      {!inCareer ? (
        <Onboarding />
      ) : engine.state.phase === "tryouts" ? (
        <Tryouts engine={engine} />
      ) : engine.state.phase === "heroPool" ? (
        <HeroPool engine={engine} />
      ) : engine.state.phase === "contracts" ? (
        <Contracts engine={engine} />
      ) : engine.state.phase === "offseason" ? (
        <Offseason engine={engine} />
      ) : engine.state.phase === "review" ? (
        <Review engine={engine} />
      ) : (
        <Season engine={engine} />
      )}
    </main>
  );
}

function ManagerHeading({ engine, sub }: { engine: ManagerEngine | null; sub: string }) {
  const { t } = useI18n();
  return (
    <header className="screen-heading">
      <Eyebrow>{t("manager.eyebrow")}</Eyebrow>
      <h1>{engine ? engine.state.config.orgName : t("start.modeManager")}</h1>
      <p className="manager__sub">{sub}</p>
    </header>
  );
}

// ── Онбординг ────────────────────────────────────────────────────────────────

function Onboarding() {
  const { t } = useI18n();
  const startCareer = useManager((s) => s.startCareer);
  const engine = useManager((s) => s.engine);
  const resumable = useManager((s) => s.resumable);
  const hall = useManager((s) => s.hall);
  const [orgName, setOrgName] = useState("");
  const [region, setRegion] = useState<ManagerRegion>("weu");
  const [difficulty, setDifficulty] = useState<ManagerDifficulty>("normal");
  const [confirmNew, setConfirmNew] = useState(false);
  const [showHall, setShowHall] = useState(false);

  // Новая карьера поверх существующей стирает долгий сейв — только через confirm.
  const existing = engine ? engine.state.config.orgName : resumable?.orgName ?? null;
  const found = () => startCareer(orgName, region, difficulty);

  const regionOptions = MANAGER_REGIONS.map((value) => ({
    value,
    label: value.toUpperCase(),
    hint: t(`manager.region.${value}` as MessageKey),
  }));

  return (
    <>
      <ManagerHeading engine={null} sub={t("manager.onboardingSub")} />
      <Surface className="manager__panel">
        <label className="manager__field">
          <span className="manager__section">{t("manager.orgName")}</span>
          <TextField
            value={orgName}
            placeholder={t("manager.orgNamePlaceholder")}
            onChange={(event) => setOrgName(event.target.value)}
            maxLength={28}
            data-testid="manager-org-name"
          />
        </label>
        <OptionGroup title={t("manager.region")} soonLabel={t("common.soon")} options={regionOptions} value={region} onChange={(v) => setRegion(v as ManagerRegion)} columns={3} />
        <OptionGroup
          title={t("manager.difficulty")}
          soonLabel={t("common.soon")}
          options={(["easy", "normal", "hard"] as ManagerDifficulty[]).map((value) => ({
            value,
            label: t(`start.${value === "normal" ? "normal" : value}` as MessageKey),
            hint: t("manager.incomeHint", { n: MANAGER_INCOME[value] }),
          }))}
          value={difficulty}
          onChange={(v) => setDifficulty(v as ManagerDifficulty)}
        />
        <div>
          <Button
            variant="primary"
            data-testid="manager-found"
            disabled={orgName.trim().length < 2}
            onClick={() => (existing ? setConfirmNew(true) : found())}
          >
            {t("manager.found")} →
          </Button>
        </div>
      </Surface>
      {/* Зал открыт и до первой карьеры: пустой зал объясняет, что тут будет копиться. */}
      {hall.careers > 0 && (
        <div>
          <Button variant="secondary" data-testid="manager-hall-open" onClick={() => setShowHall(true)}>
            {t("manager.hallTitle")}
          </Button>
        </div>
      )}
      {showHall && <HallModal onClose={() => setShowHall(false)} />}
      {confirmNew && existing && (
        <Modal
          mark="A"
          title={t("manager.newOverTitle")}
          description={t("manager.newOverText", { org: existing })}
          labelledBy="manager-new-over-title"
          dismissLabel={t("common.close")}
          onClose={() => setConfirmNew(false)}
        >
          {({ close }) => (
            <>
              <Button variant="primaryInvert" onClick={close}>{t("tournament.leaveCancel")}</Button>
              <Button variant="danger" data-testid="manager-new-over-confirm" onClick={() => { found(); close(); }}>
                {t("manager.found")}
              </Button>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

/** Hall of Legends (срез 4): межкарьерные рекорды орга и коллекция игроков. Без шардов и
 *  перков — трофейная комната, сила меты решается отдельно (T6.4). */
function HallModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const hall = useManager((s) => s.hall);
  const players = Object.values(hall.players).sort((a, b) => b.peakOvr - a.peakOvr);
  return (
    <Modal
      mark="A"
      title={t("manager.hallTitle")}
      description={t("manager.hallText")}
      labelledBy="manager-hall-title"
      dismissLabel={t("common.close")}
      onClose={onClose}
      layout="content"
    >
      {() => (
        <div className="manager__hall">
          <dl className="manager__hall-records">
            <div><dt>{t("manager.hallCareers")}</dt><dd>{hall.careers}</dd></div>
            <div><dt>{t("manager.hallSeasons")}</dt><dd>{hall.seasons}</dd></div>
            <div><dt>{t("manager.hallTitles")}</dt><dd>{hall.titles}</dd></div>
            <div><dt>{t("manager.hallFinaleTitles")}</dt><dd>{hall.finaleTitles}</dd></div>
            <div><dt>{t("manager.hallFinaleApps")}</dt><dd>{hall.finaleAppearances}</dd></div>
            <div><dt>{t("manager.hallBestElo")}</dt><dd>{hall.bestElo || "—"}</dd></div>
          </dl>
          {players.length === 0 ? (
            <p className="manager__hint">{t("manager.hallEmpty")}</p>
          ) : (
            <div className="manager__hall-list" data-testid="manager-hall-list">
              {players.map((p) => (
                <div key={`${p.nickname}:${p.role}`} className="manager__hall-row">
                  <RoleTag role={p.role}>{t(roleMessageKey(p.role))}</RoleTag>
                  <strong>{p.nickname}</strong>
                  <small>{t("manager.hallPlayerLine", { seasons: p.seasons, titles: p.titles })}</small>
                  <b className={`ovr-tier--${playerOvrTier(p.peakOvr)}`}>{p.peakOvr}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Confirm-модалка роспуска организации: долгий сейв не удаляется одним кликом.
 *  Экспортируется для баннера resume на стартовом экране. */
export function ManagerAbandonModal({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal mark="A" title={t("manager.abandonTitle")} description={t("manager.abandonText")} labelledBy="manager-abandon-title" dismissLabel={t("common.close")} onClose={onClose}>
      {({ close }) => (
        <>
          <Button variant="primaryInvert" onClick={close}>{t("tournament.leaveCancel")}</Button>
          <Button variant="danger" data-testid="manager-abandon-confirm" onClick={() => { onConfirm(); close(); }}>{t("manager.abandon")}</Button>
        </>
      )}
    </Modal>
  );
}

// ── Трайауты ─────────────────────────────────────────────────────────────────

function Tryouts({ engine }: { engine: ManagerEngine }) {
  const { t } = useI18n();
  const act = useManager((s) => s.act);
  const s = engine.state;
  return (
    <>
      <ManagerHeading engine={engine} sub={t("manager.tryoutsSub")} />
      <Surface className="manager__panel">
        <div className="manager__row">
          <h2 className="manager__section">{t("manager.tryoutsPick", { i: s.tryoutPick + 1, n: TRYOUT_PICKS })}</h2>
          <Button variant="secondary" data-testid="manager-reroll" disabled={s.tryoutRerollsLeft <= 0} onClick={() => act((e) => e.rerollTryouts())}>
            ↻ {t("manager.reroll", { n: s.tryoutRerollsLeft })}
          </Button>
        </div>
        <div className="manager__cards">
          {s.tryoutOffer.map((offer) => (
            <button
              key={offer.candidate.player.accountId}
              type="button"
              className="manager__card"
              data-testid="manager-tryout-card"
              onClick={() => act((e) => e.pickTryout(offer.candidate.player.accountId))}
            >
              <span className="manager__card-top">
                <RoleTag role={offer.candidate.player.role}>{t(roleMessageKey(offer.candidate.player.role))}</RoleTag>
                <b className="manager__band">{"$".repeat(offer.band)}</b>
              </span>
              <strong>{offer.candidate.player.nickname}</strong>
              <small>{offer.candidate.teamName}</small>
              <span className={`manager__ovr ovr-tier--${playerOvrTier(offer.candidate.player.ovr)}`}>{offer.candidate.player.ovr}<em>OVR</em></span>
            </button>
          ))}
        </div>
        <p className="manager__hint">{t("manager.tryoutsHint")}</p>
        {s.tryoutPicked.length > 0 && (
          <p className="manager__picked">{s.tryoutPicked.map((p) => p.candidate.player.nickname).join(" · ")}</p>
        )}
      </Surface>
    </>
  );
}

// ── Пул героев ───────────────────────────────────────────────────────────────

function HeroPool({ engine }: { engine: ManagerEngine }) {
  const { t } = useI18n();
  const act = useManager((s) => s.act);
  const hero = useHero();
  const [selected, setSelected] = useState<number[]>([]);
  const s = engine.state;

  const toggle = (id: number) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : current.length < HERO_PICKS_PER_ROUND ? [...current, id] : current,
    );

  return (
    <>
      <ManagerHeading engine={engine} sub={t("manager.heroPoolSub")} />
      <Surface className="manager__panel">
        <h2 className="manager__section">
          {t("manager.heroRound", { i: s.heroRound + 1, n: HERO_ROUNDS, picked: s.heroPool.length })}
        </h2>
        <div className="manager__cards manager__cards--heroes">
          {s.heroOffer.map((id) => {
            const info = hero(id);
            return (
              <button
                key={id}
                type="button"
                className={`manager__card manager__card--hero${selected.includes(id) ? " is-selected" : ""}`}
                data-testid="manager-hero-card"
                onClick={() => toggle(id)}
              >
                <HeroThumb picture={info.picture} name={info.name} layout="card" />
              </button>
            );
          })}
        </div>
        <div>
          <Button
            variant="primary"
            data-testid="manager-heroes-confirm"
            disabled={selected.length !== HERO_PICKS_PER_ROUND}
            onClick={() => { act((e) => e.pickHeroes(selected)); setSelected([]); }}
          >
            {t("manager.heroesConfirm", { n: selected.length, total: HERO_PICKS_PER_ROUND })}
          </Button>
        </div>
      </Surface>
    </>
  );
}

// ── Контракты ────────────────────────────────────────────────────────────────

function Contracts({ engine }: { engine: ManagerEngine }) {
  const { t } = useI18n();
  const act = useManager((s) => s.act);
  const [picked, setPicked] = useState<number[]>([]);
  const s = engine.state;
  const income = engine.incomeK;
  const wages = s.candidates.filter((c) => picked.includes(c.candidate.player.accountId)).reduce((sum, c) => sum + c.salary, 0);
  const verdict = engine.validateRoster(picked);

  const toggle = (id: number) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const sorted = useMemo(
    () => [...s.candidates].sort((a, b) => b.salary - a.salary),
    [s.candidates],
  );

  // Гейт ролей как в 322-0: заполненная квота (1C/1M/1O/2S) гасит остальных кандидатов
  // этой роли — перебрать роль нельзя по построению, а не по сообщению об ошибке.
  const ROLE_QUOTA: Record<Role, number> = { safelane: 1, mid: 1, offlane: 1, support: 2 };
  const pickedByRole = new Map<Role, number>();
  for (const c of s.candidates) {
    if (picked.includes(c.candidate.player.accountId)) {
      const role = c.candidate.player.role;
      pickedByRole.set(role, (pickedByRole.get(role) ?? 0) + 1);
    }
  }
  const roleFull = (role: Role) => (pickedByRole.get(role) ?? 0) >= ROLE_QUOTA[role];

  return (
    <>
      <ManagerHeading engine={engine} sub={t("manager.contractsSub", { n: income })} />
      <Surface className="manager__panel">
        <h2 className="manager__section">{t("manager.contractsTitle")}</h2>
        <div className="manager__contract-list">
          {sorted.map((c) => {
            const id = c.candidate.player.accountId;
            const isPicked = picked.includes(id);
            const blocked = !isPicked && roleFull(c.candidate.player.role);
            return (
              <button
                key={id}
                type="button"
                className={`manager__contract${isPicked ? " is-selected" : ""}`}
                data-testid="manager-contract-row"
                disabled={blocked}
                onClick={() => toggle(id)}
              >
                <RoleTag role={c.candidate.player.role}>{t(roleMessageKey(c.candidate.player.role))}</RoleTag>
                <span className="manager__contract-name">
                  <strong>{c.candidate.player.nickname}</strong>
                  <small>{c.filler ? t("manager.filler") : c.candidate.teamName}</small>
                </span>
                <b className={`manager__contract-ovr ovr-tier--${playerOvrTier(c.candidate.player.ovr)}`}>{c.candidate.player.ovr}</b>
                <span className="manager__contract-salary">${c.salary}k{t("manager.perMonth")}</span>
              </button>
            );
          })}
        </div>
        <div className="manager__signbar" data-testid="manager-signbar">
          <span>
            {t("manager.signCount", { n: picked.length })} · ${wages}k / ${income}k
            {!verdict.ok && picked.length === 5 && (
              <em className="manager__sign-issue"> · {t(verdict.reason === "budget" ? "manager.issueBudget" : "manager.issueRoles")}</em>
            )}
          </span>
          <Button variant="primary" data-testid="manager-sign" disabled={!verdict.ok} onClick={() => act((e) => e.signRoster(picked))}>
            {t("manager.sign")} →
          </Button>
        </div>
      </Surface>
    </>
  );
}

// ── Сезон ────────────────────────────────────────────────────────────────────

function Season({ engine }: { engine: ManagerEngine }) {
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
                  <b className={`ovr-tier--${playerOvrTier(p.candidate.player.ovr)}`}>{p.candidate.player.ovr}</b>
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

function Offseason({ engine }: { engine: ManagerEngine }) {
  const { t } = useI18n();
  const act = useManager((s) => s.act);
  const s = engine.state;
  return (
    <>
      <ManagerHeading engine={engine} sub={t("manager.offseasonSub", { season: s.season })} />
      <Surface className="manager__panel">
        <h2 className="manager__section">{t("manager.contractsReview")}</h2>
        <div className="manager__contract-list">
          {s.roster.map((p) => {
            const id = p.candidate.player.accountId;
            const drift = s.offseasonDrifts[id] ?? 0;
            const newSalary = s.offseasonSalaries[id] ?? p.salary;
            const released = s.released.includes(id);
            const departing = s.departures.includes(id);
            return (
              <div key={id} className={`manager__contract manager__contract--offseason${released || departing ? " is-released" : ""}`}>
                <RoleTag role={p.candidate.player.role}>{t(roleMessageKey(p.candidate.player.role))}</RoleTag>
                <span className="manager__contract-name">
                  <strong>{p.candidate.player.nickname}</strong>
                  <small>
                    {p.candidate.player.ovr} → {Math.min(99, Math.max(55, p.candidate.player.ovr + drift))} OVR
                    {drift !== 0 && <em className={drift > 0 ? "is-up" : "is-down"}> ({drift > 0 ? "+" : ""}{drift})</em>}
                    {" · "}{p.happiness < 30 ? "☹" : "♥"} {p.happiness}
                    {p.fame > 0 && <> · {p.fame}★</>}
                  </small>
                </span>
                <span className="manager__contract-salary">${p.salary}k → ${newSalary}k</span>
                {departing ? (
                  // Уходит сам (ретайр/несчастье) — это не выбор менеджера, тоггла нет.
                  <em className="manager__departing" data-testid="manager-departing">{t("manager.departing")}</em>
                ) : (
                  <Button variant={released ? "primaryInvert" : "danger"} data-testid="manager-release" onClick={() => act((e) => e.toggleRelease(id))}>
                    {released ? t("manager.keep") : t("manager.release")}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <p className="manager__hint">{t("manager.releaseHint")}</p>
        {/* Тренировочный сбор (m1.7.0): единственный способ конвертировать банк в форму.
            Одноразовый на оффсезон; в долг не продаётся; после покупки строка остаётся
            подтверждением («куплен»), чтобы дрифты в списке выше читались с контекстом. */}
        <div className="manager__signbar manager__bootcamp" data-testid="manager-bootcamp-bar">
          <span>
            {engine.bootcampLevel > 0 && (
              <b className="is-up">{t("manager.bootcampBought", { n: engine.bootcampLevel * OFFSEASON_BOOTCAMP.driftBonus })}{" · "}</b>
            )}
            {engine.bootcampNextCostK != null
              ? t(engine.bootcampLevel === 0 ? "manager.bootcampOfferText" : "manager.bootcampNextLevel", { cost: engine.bootcampNextCostK, n: OFFSEASON_BOOTCAMP.driftBonus })
              : engine.bootcampLevel > 0 ? t("manager.bootcampMaxed") : null}
          </span>
          {engine.bootcampNextCostK != null && (
            <Button
              variant="secondary"
              data-testid="manager-bootcamp-buy"
              disabled={engine.state.bankK < engine.bootcampNextCostK}
              onClick={() => { sfxBuy(); act((e) => e.buyOffseasonBootcamp()); }}
            >
              {t("manager.bootcampBuy", { cost: engine.bootcampNextCostK })}
            </Button>
          )}
        </div>
        {/* Бюджет нового сезона (m1.7.0): тот же кап, что на подписи, — виден до подтверждения. */}
        {(() => {
          const budget = engine.offseasonBudget();
          return (
            <div className="manager__signbar" data-testid="manager-offseason-budget" data-ok={budget.ok}>
              <span>
                {t("manager.offseasonBudget", { wages: budget.wagesK, income: budget.incomeK })}
                {!budget.ok && <b className="manager__over"> · {t("manager.offseasonOverBudget")}</b>}
              </span>
              <Button
                variant="primary"
                data-testid="manager-offseason-confirm"
                disabled={!budget.ok}
                onClick={() => act((e) => e.confirmOffseason())}
              >
                {t("manager.confirmContracts")} →
              </Button>
            </div>
          );
        })()}
      </Surface>
    </>
  );
}

// ── Итоги сезона ─────────────────────────────────────────────────────────────

function Review({ engine }: { engine: ManagerEngine }) {
  const { t } = useI18n();
  const act = useManager((s) => s.act);
  const s = engine.state;
  const finale = s.calendar.find((slot) => slot.kind === "finale");
  // Трансферное окно (срез 5): покупка оферa требует выбрать заменяемого той же роли.
  const [buying, setBuying] = useState<number | null>(null);
  const buyingOffer = buying !== null ? s.transferMarket.find((o) => o.player.candidate.player.accountId === buying) : undefined;
  const limitReached = s.transfersDone >= TRANSFER_LIMIT;
  return (
    <>
      <ManagerHeading engine={engine} sub={t("manager.reviewSub", { season: s.season })} />
      <Surface className="manager__panel">
        <div className="manager__strip">
          <StatTile
            label={t("manager.finaleFinish")}
            value={finale?.result ? `#${finale.result.placement}` : t("manager.dnq")}
            kind="base"
          />
          <StatTile label={t("manager.bank")} value={`$${Math.round(s.bankK)}k`} kind="base" />
          <StatTile label="ELO" value={`${s.elo}`} kind="base" />
        </div>
        <h2 className="manager__section">{t("manager.nextRoster", { season: s.season + 1 })}</h2>
        <div className="manager__roster">
          {s.roster.map((p) => (
            <div key={p.candidate.player.accountId} className="manager__roster-row">
              <RoleTag role={p.candidate.player.role}>{t(roleMessageKey(p.candidate.player.role))}</RoleTag>
              <strong>{p.candidate.player.nickname}</strong>
              <b>{p.candidate.player.ovr}</b>
              <span>${p.salary}k{t("manager.perMonth")}</span>
            </div>
          ))}
        </div>
        {s.transferMarket.length > 0 && (
          <>
            <h2 className="manager__section">
              {t("manager.transferTitle")} · {t("manager.transferLimit", { done: s.transfersDone, limit: TRANSFER_LIMIT })} · ${Math.round(s.bankK)}k
            </h2>
            <div className="manager__contract-list" data-testid="manager-transfer-market">
              {s.transferMarket.map((offer) => {
                const p = offer.player.candidate.player;
                const affordable = s.bankK >= offer.feeK && !limitReached;
                return (
                  <button
                    key={p.accountId}
                    type="button"
                    className="manager__contract"
                    data-testid="manager-transfer-offer"
                    disabled={!affordable}
                    onClick={() => setBuying(p.accountId)}
                  >
                    <RoleTag role={p.role}>{t(roleMessageKey(p.role))}</RoleTag>
                    <span className="manager__contract-name">
                      <strong>{p.nickname}</strong>
                      <small>{offer.player.candidate.teamName} · ${offer.player.salary}k{t("manager.perMonth")}</small>
                    </span>
                    <b className={`manager__contract-ovr ovr-tier--${playerOvrTier(p.ovr)}`}>{p.ovr}</b>
                    <span className="manager__contract-salary">{t("manager.transferFee", { n: offer.feeK })}</span>
                  </button>
                );
              })}
            </div>
            <p className="manager__hint">{t("manager.transferHint")}</p>
          </>
        )}
        <div>
          <Button variant="primary" data-testid="manager-next-season" onClick={() => act((e) => e.startNextSeason())}>
            {t("manager.startSeason", { season: s.season + 1 })} →
          </Button>
        </div>
      </Surface>
      {buyingOffer && (
        <Modal
          mark="A"
          title={t("manager.transferWho", { nick: buyingOffer.player.candidate.player.nickname })}
          description={t("manager.transferWhoText", { n: buyingOffer.feeK })}
          labelledBy="manager-transfer-title"
          dismissLabel={t("common.close")}
          onClose={() => setBuying(null)}
          layout="content"
        >
          {({ close }) => (
            <div className="manager__assign-list">
              {s.roster
                .filter((p) => p.candidate.player.role === buyingOffer.player.candidate.player.role)
                .map((p) => (
                  <button
                    key={p.candidate.player.accountId}
                    type="button"
                    className="manager__assign-row"
                    data-testid="manager-transfer-replace"
                    onClick={() => {
                      act((e) => e.buyTransfer(buyingOffer.player.candidate.player.accountId, p.candidate.player.accountId));
                      setBuying(null);
                      close();
                    }}
                  >
                    <strong>{p.candidate.player.nickname}</strong>
                    <small>{p.candidate.player.ovr} OVR · ${p.salary}k{t("manager.perMonth")} · {t("manager.transferLeaves")}</small>
                  </button>
                ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
