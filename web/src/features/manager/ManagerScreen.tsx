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
  type ManagerDifficulty,
  type ManagerRegion,
} from "../../game/manager/economy.ts";
import {
  HERO_PICKS_PER_ROUND,
  HERO_ROUNDS,
  TRYOUT_PICKS,
  slotMonth,
  type CalendarSlot,
  type ManagerEngine,
} from "../../game/manager/engine.ts";
import { Button, Eyebrow, HeroThumb, Modal, OptionGroup, RoleTag, StatTile, Surface, TextField } from "../../ui/index.ts";
import { useHero } from "../draft/heroes.ts";
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
  const hydrated = useManager((s) => s.hydrated);
  const resumable = useManager((s) => s.resumable);
  const resumeCareer = useManager((s) => s.resumeCareer);
  const data = useRun((s) => s.data);
  const backNative = useTmaChrome((state) => state.backNative);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Вход в режим с сейвом = продолжение карьеры, без промежуточного экрана:
  // карьера и есть состояние режима. Отдельный resume живёт баннером на старте.
  useEffect(() => {
    if (hydrated && !engine && resumable) void resumeCareer();
  }, [hydrated, engine, resumable, resumeCareer]);

  if (!data) return null;
  // До гидрации не ясно, онбординг это или продолжение — не мигаем онбордингом.
  if (!hydrated && !engine) return null;
  void version; // подписка: движок мутирует state, стор тикает версией

  return (
    <main className="manager" data-testid="manager-screen">
      {/* Назад к выбору режимов — как у остальных экранов. Выход безопасен: карьера
          пишется после каждого действия, вернёшься — предложит продолжить. */}
      {!backNative && (
        <Button variant="back" data-testid="manager-back" onClick={navigateBack}>← {t("start.backToModes")}</Button>
      )}
      {engine === null ? (
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
  const [orgName, setOrgName] = useState("");
  const [region, setRegion] = useState<ManagerRegion>("weu");
  const [difficulty, setDifficulty] = useState<ManagerDifficulty>("normal");

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
        <OptionGroup title={t("manager.region")} soonLabel={t("common.soon")} options={regionOptions} value={region} onChange={(v) => setRegion(v as ManagerRegion)} />
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
            onClick={() => startCareer(orgName, region, difficulty)}
          >
            {t("manager.found")} →
          </Button>
        </div>
      </Surface>
    </>
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
              <span className="manager__ovr">{offer.candidate.player.ovr}<em>OVR</em></span>
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
                <b className="manager__contract-ovr">{c.candidate.player.ovr}</b>
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
  const s = engine.state;
  // Без useMemo: движок мутирует state по ссылке (стор тикает версией), а scoreTeam на
  // пятёрке с пулом из 12 героев дёшев — стабильных зависимостей для мемо тут просто нет.
  const score = engine.score();
  const next = engine.nextSlot;
  const wages = engine.wagesK;
  const net = engine.incomeK - wages;
  const result = s.lastResult;
  const worldTop = [...s.world].sort((a, b) => b.elo - a.elo).slice(0, 8);

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
          <p className="manager__result-line">
            <b className="manager__result-place">{t("manager.placeOf", { p: result.placement, n: result.fieldSize })}</b>
            {result.prizeK > 0 && <span> · +${result.prizeK}k</span>}
            <span> · ELO {result.eloDelta >= 0 ? "+" : ""}{result.eloDelta}</span>
          </p>
          {result.advanced !== null && (
            <p className={`manager__gate ${result.advanced ? "is-advanced" : "is-eliminated"}`}>
              <strong>{t(result.advanced ? "manager.advanced" : "manager.eliminated")}</strong>{" "}
              {t(result.advanced ? "manager.advancedText" : "manager.eliminatedText")}
            </p>
          )}
          <ol className="manager__standings">
            {result.standings.map((row) => (
              <li key={row.name} className={row.isUser ? "is-user" : ""}>
                <span>{row.placement}</span> {row.name}
              </li>
            ))}
          </ol>
          <div>
            <Button variant="primary" data-testid="manager-continue" onClick={() => act((e) => e.continueSeason())}>
              {t("manager.continue")} →
            </Button>
          </div>
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
          {score && (
            <div className="manager__score">
              <StatTile label={t("common.base")} value={`${Math.round(score.base)}`} kind="base" />
              <StatTile label={t("common.heroSynergy")} value={`+${(Math.round(score.heroSynergy * 10) / 10)}`} kind="base" />
              <StatTile label={t("common.chemistry")} value={`+${(Math.round(score.chemistry * 10) / 10)}`} kind="base" />
              <StatTile label={t("common.teamOvr")} value={`${Math.round(score.teamOvr)}`} kind="base" />
            </div>
          )}
        </Surface>

        <Surface className="manager__panel">
          <h2 className="manager__section">{t("manager.worldTitle")}</h2>
          <ol className="manager__world">
            {worldTop.map((org, index) => (
              <li key={org.name}><span>{index + 1}</span> {org.name} <b>{org.elo}</b></li>
            ))}
            <li className="is-user"><span>{engine.worldRank()}</span> {s.config.orgName} <b>{s.elo}</b></li>
          </ol>
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
        <Button variant="leave" onClick={() => setConfirmAbandon(true)}>{t("manager.abandon")}</Button>
      </div>
      {confirmAbandon && <ManagerAbandonModal onConfirm={abandonCareer} onClose={() => setConfirmAbandon(false)} />}
    </>
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
            return (
              <div key={id} className={`manager__contract manager__contract--offseason${released ? " is-released" : ""}`}>
                <RoleTag role={p.candidate.player.role}>{t(roleMessageKey(p.candidate.player.role))}</RoleTag>
                <span className="manager__contract-name">
                  <strong>{p.candidate.player.nickname}</strong>
                  <small>
                    {p.candidate.player.ovr} → {Math.min(99, Math.max(55, p.candidate.player.ovr + drift))} OVR
                    {drift !== 0 && <em className={drift > 0 ? "is-up" : "is-down"}> ({drift > 0 ? "+" : ""}{drift})</em>}
                  </small>
                </span>
                <span className="manager__contract-salary">${p.salary}k → ${newSalary}k</span>
                <Button variant={released ? "primaryInvert" : "danger"} data-testid="manager-release" onClick={() => act((e) => e.toggleRelease(id))}>
                  {released ? t("manager.keep") : t("manager.release")}
                </Button>
              </div>
            );
          })}
        </div>
        <p className="manager__hint">{t("manager.releaseHint")}</p>
        <div>
          <Button variant="primary" data-testid="manager-offseason-confirm" onClick={() => act((e) => e.confirmOffseason())}>
            {t("manager.confirmContracts")} →
          </Button>
        </div>
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
        <div>
          <Button variant="primary" data-testid="manager-next-season" onClick={() => act((e) => e.startNextSeason())}>
            {t("manager.startSeason", { season: s.season + 1 })} →
          </Button>
        </div>
      </Surface>
    </>
  );
}
