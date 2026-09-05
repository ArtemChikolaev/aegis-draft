// Arcade (PRD §5.15): экран режима — настройка → сцена (canvas + HUD) → итог. Сим тикает в rAF-цикле
// сцены с фиксированным шагом (config.TICK_HZ), React рисует только HUD и оверлеи; сам мир — в
// renderer.ts. Пауза по Esc/Space, кнопке и visibilitychange; выход из забега — через confirm.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRun } from "../../state/runStore.ts";
import { bestArcadeEntry, getArcadeSim, maxUnlockedRank, useArcade } from "../../state/arcadeStore.ts";
import { useTmaChrome } from "../../state/tmaChrome.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/core.ts";
import { ARCADE, DT, TICK_HZ } from "../../game/arcade/config.ts";
import { SCHOOL_ART, UPGRADE_BY_ID } from "../../game/arcade/content/schools.ts";
import { RANK_TIERS, STARS, rankOf, rankStep } from "../../game/arcade/content/ranks.ts";
import { ARCADE_ITEM_BY_ID } from "../../game/arcade/content/items.ts";
import { HEROES, HERO_IDS, type HeroId } from "../../game/arcade/content/heroes.ts";
import { SHOP_ACT } from "../../game/arcade/types.ts";
import type { AbilityKey, Offer } from "../../game/arcade/types.ts";
import { Button, Chip, Eyebrow, HeroThumb, ItemIcon, Modal, Surface, TextField, prefersReducedMotion, screenShakeEnabled, sfxArcade, sfxBuy, sfxSting, sfxVerdict } from "../../ui/index.ts";
import { useHero } from "../draft/heroes.ts";
import { ArcadeInputController } from "./input.ts";
import { ArcadeRenderer, formatClock } from "./renderer.ts";
import "./arcade.css";

const ABILITY_MASK: Record<AbilityKey, number> = { q: 1, w: 2, e: 4, r: 8 };

export function ArcadeScreen() {
  const status = useArcade((s) => s.status);
  return status === "setup" ? <ArcadeSetup /> : <ArcadeStage />;
}

function ArcadeSetup() {
  const { t } = useI18n();
  const setMode = useRun((s) => s.setSelectedMode);
  const backNative = useTmaChrome((s) => s.backNative);
  const history = useArcade((s) => s.history);
  const start = useArcade((s) => s.start);
  const rank = useArcade((s) => s.rank);
  const setRank = useArcade((s) => s.setRank);
  const heroId = useArcade((s) => s.hero);
  const setHero = useArcade((s) => s.setHero);
  const act = useArcade((s) => s.act);
  const setAct = useArcade((s) => s.setAct);
  const heroOf = useHero();
  const [seed, setSeed] = useState("");
  const best = bestArcadeEntry(history);
  const unlocked = maxUnlockedRank(history);
  const current = rankOf(rank);
  return (
    <main className="arcade-setup">
      {!backNative && <Button variant="back" onClick={() => setMode(null)}>← {t("start.backToModes")}</Button>}
      <header className="screen-heading">
        <Eyebrow>{t("arcade.eyebrow")}</Eyebrow>
        <h1>{t(act === "full" ? "arcade.titleFull" : "arcade.title")}</h1>
        <p>{t(act === "full" ? "arcade.leadFull" : "arcade.lead")}</p>
      </header>
      <div className="arcade-setup__grid">
        <Surface className="arcade-setup__hero" data-testid="arcade-hero">
          <span className="arcade-setup__label">{t("arcade.hero")}</span>
          <div className="arcade-heroes" data-testid="arcade-heroes">
            {HERO_IDS.map((id) => {
              const def = HEROES[id];
              const info = heroOf(def.dotaId);
              return (
                <button key={id} type="button" className="arcade-heroes__pick" data-active={id === heroId ? "true" : undefined} data-testid={`arcade-hero-${id}`} onClick={() => setHero(id)}>
                  <HeroThumb picture={info.picture || def.picture} name={info.name} size="md" layout="card" />
                  <small>{t(def.ranged ? "arcade.hero.ranged" : "arcade.hero.melee")}</small>
                </button>
              );
            })}
          </div>
          <ul className="arcade-setup__kit">
            {(["q", "w", "e", "r"] as const).map((key) => (
              <li key={key}><b>{key.toUpperCase()}</b> <span>{t(`arcade.ab.${heroId}.${key}` as MessageKey)}</span><small>{t(`arcade.ab.${heroId}.${key}.desc` as MessageKey)}</small></li>
            ))}
          </ul>
        </Surface>
        <Surface className="arcade-setup__run">
          <div className="arcade-act" data-testid="arcade-act">
            {(["full", "short"] as const).map((id) => (
              <button key={id} type="button" className="arcade-rank__tier" data-active={act === id ? "true" : undefined} data-testid={`arcade-act-${id}`} onClick={() => setAct(id)}>{t(`arcade.act.${id}` as MessageKey)}</button>
            ))}
          </div>
          <p className="arcade-setup__goal">{t(act === "full" ? "arcade.goalFull" : "arcade.goal")}</p>
          <p className="arcade-setup__controls">{t("arcade.controls")}</p>
          <div className="arcade-rank" data-testid="arcade-rank">
            <span className="arcade-setup__label">{t("arcade.rank")} · {t(`arcade.tier.${current.tier}` as MessageKey)} {"★".repeat(current.stars)}</span>
            <div className="arcade-rank__tiers">
              {RANK_TIERS.map((tier) => {
                const first = rankStep(tier, 1);
                const locked = first > unlocked;
                return (
                  <button key={tier} type="button" className="arcade-rank__tier" data-active={current.tier === tier ? "true" : undefined} data-locked={locked ? "true" : undefined} disabled={locked} onClick={() => setRank(rankStep(tier, 1))}>
                    {t(`arcade.tier.${tier}` as MessageKey)}
                  </button>
                );
              })}
            </div>
            <div className="arcade-rank__stars">
              {Array.from({ length: STARS }, (_, i) => {
                const step = rankStep(current.tier, i + 1);
                return <button key={i} type="button" className="arcade-rank__star" data-active={step <= rank ? "true" : undefined} disabled={step > unlocked} onClick={() => setRank(step)} aria-label={`${i + 1}★`}>★</button>;
              })}
            </div>
            <ul className="arcade-rank__rules">
              <li>{t("arcade.rank.mult", { hp: Math.round((current.hpMult - 1) * 100), dmg: Math.round((current.dmgMult - 1) * 100), spawn: Math.round((current.spawnMult - 1) * 100) })}</li>
              {current.doubleGolems && <li>{t("arcade.rank.doubleGolems")}</li>}
              {current.bigWaves && <li>{t("arcade.rank.bigWaves")}</li>}
              {current.trollPacks && <li>{t("arcade.rank.trollPacks")}</li>}
              {current.siegeOften && <li>{t("arcade.rank.siegeOften")}</li>}
              {current.earlyRoshan && <li>{t("arcade.rank.earlyRoshan")}</li>}
              {current.resistStatus && <li>{t("arcade.rank.resistStatus")}</li>}
              {current.lessXp && <li>{t("arcade.rank.lessXp")}</li>}
            </ul>
            <p className="arcade-rank__unlock">{t("arcade.rank.unlock")}</p>
          </div>
          <label className="arcade-setup__seed"><span className="arcade-setup__label">{t("common.seed")}</span><TextField value={seed} onChange={(e) => setSeed(e.target.value)} placeholder={t("arcade.seedRandom")} data-testid="arcade-seed" /></label>
          <Button variant="primary" data-testid="arcade-play" onClick={() => start(seed)}>{t("arcade.play")} →</Button>
          <div className="arcade-setup__best">
            <span className="arcade-setup__label">{t("arcade.best")}</span>
            {best
              ? <span data-testid="arcade-best">{heroOf(HEROES[(best.hero as HeroId) in HEROES ? (best.hero as HeroId) : "juggernaut"].dotaId).name} · {t(best.outcome === "victory" ? "arcade.over.victory" : "arcade.over.dead")} · {t(`arcade.tier.${rankOf(best.rank ?? 0).tier}` as MessageKey)} {"★".repeat(rankOf(best.rank ?? 0).stars)} · {formatClock(best.seconds * TICK_HZ)} · {t("arcade.hud.level")} {best.level} · {best.kills} {t("arcade.hud.kills").toLowerCase()}</span>
              : <span>{t("arcade.noHistory")}</span>}
          </div>
        </Surface>
      </div>
    </main>
  );
}

function ArcadeStage() {
  const { t } = useI18n();
  const status = useArcade((s) => s.status);
  const serial = useArcade((s) => s.serial);
  const outcome = useArcade((s) => s.outcome);
  const seed = useArcade((s) => s.seed);
  const pause = useArcade((s) => s.pause);
  const resume = useArcade((s) => s.resume);
  const choose = useArcade((s) => s.choose);
  const shopAct = useArcade((s) => s.shopAct);
  const finish = useArcade((s) => s.finish);
  const quit = useArcade((s) => s.quit);
  const start = useArcade((s) => s.start);
  const bump = useArcade((s) => s.bump);
  const heroId = useArcade((s) => s.hero);
  const heroDef = HEROES[heroId];
  const hero = useHero()(heroDef.dotaId);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<ArcadeInputController | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const statusRef = useRef(status);
  statusRef.current = status;
  void serial;

  useEffect(() => {
    const canvas = canvasRef.current, stage = stageRef.current;
    if (!canvas || !stage) return;
    const renderer = new ArcadeRenderer(canvas, hero.picture || heroDef.picture);
    // Dev-хук для headless-QA (телепорт к торговцу/Рошану без ожидания): в прод-сборке его нет.
    if (import.meta.env.DEV) (window as unknown as { __arcadeSim?: typeof getArcadeSim }).__arcadeSim = getArcadeSim;
    const controller = new ArcadeInputController(stage);
    controllerRef.current = controller;
    controller.onPause = () => {
      const s = useArcade.getState();
      if (s.status === "running") s.pause(); else if (s.status === "paused") s.resume();
    };
    const ro = new ResizeObserver(() => renderer.resize(stage.clientWidth, stage.clientHeight));
    ro.observe(stage);
    renderer.resize(stage.clientWidth, stage.clientHeight);
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let frame = 0;
    let wasPending = false;
    let wasShop = false;
    let wasBoss = false;
    let seen = { hits: 0, crits: 0, casts: 0, ults: 0, hurt: 0, kills: 0, eliteKills: 0, pickups: 0 };
    let hitStop = 0;
    let hurtUntil = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const sim = getArcadeSim();
      if (!sim) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // Hit-stop (R15-лестница): смерть элиты/босса замораживает мир на несколько кадров — только
      // здесь, в цикле экрана; сим о паузе не знает, детерминизм не трогается.
      if (hitStop > 0) { hitStop--; acc = 0; }
      else if (statusRef.current === "running" && !sim.pending && !sim.shopOpen && !sim.over) {
        acc += dt;
        let steps = 0;
        while (acc >= DT && steps < 5) {
          sim.step(controller.read());
          acc -= DT;
          steps++;
        }
        if (steps === 5) acc = 0;
      }
      // Дельты счётчиков сима → звук и juice.
      const ev = sim.events;
      if (ev.eliteKills > seen.eliteKills) { sfxArcade("elite"); if (!prefersReducedMotion()) hitStop = 6; }
      else if (ev.kills > seen.kills) sfxArcade("kill");
      if (ev.crits > seen.crits) sfxArcade("crit");
      else if (ev.hits > seen.hits) sfxArcade("hit");
      if (ev.ults > seen.ults) sfxArcade("ult");
      else if (ev.casts > seen.casts) sfxArcade("cast");
      if (ev.hurt > seen.hurt) { sfxArcade("hurt"); hurtUntil = now + 140; }
      if (ev.pickups > seen.pickups) sfxArcade("pickup");
      seen = { ...ev };
      stage.dataset.hurt = now < hurtUntil ? "true" : "";
      stage.dataset.lowhp = sim.player.hp / sim.player.stats.maxHp < 0.3 && !sim.over ? "true" : "";
      if (sim.pending && !wasPending) { sfxArcade("levelup"); bump(); }
      if (sim.shopOpen && !wasShop) { sfxBuy(); bump(); }
      wasPending = sim.pending !== null;
      wasShop = sim.shopOpen;
      if (sim.over) { finish(); }
      const bossAlive = sim.roshan?.alive === true || sim.ancient?.alive === true;
      if (bossAlive && !wasBoss) sfxSting("boss");
      wasBoss = bossAlive;
      if (++frame % 6 === 0) bump();
      renderer.draw(sim, now, controller.joystick, screenShakeEnabled());
    };
    raf = requestAnimationFrame(loop);
    const onVisibility = () => { if (document.hidden) useArcade.getState().pause(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controller.dispose();
      controllerRef.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hero.picture, heroDef.picture, bump, finish]);

  useEffect(() => {
    if (status === "over" && outcome) sfxVerdict(outcome.outcome === "victory" ? "won" : "lost");
  }, [status, outcome]);

  const cast = useCallback((key: AbilityKey) => controllerRef.current?.cast(ABILITY_MASK[key]), []);
  const sim = getArcadeSim();
  const p = sim?.player;
  const boss = sim?.roshan?.alive ? sim.roshan : sim?.ancient?.alive ? sim.ancient : null;

  return (
    <main className="arcade" data-testid="arcade-stage">
      <div className="arcade__stage" ref={stageRef}>
        <canvas ref={canvasRef} className="arcade__canvas" />
        {sim && p && (
          <div className="arcade-hud" aria-live="off">
            <div className="arcade-hud__upper">
            <div className="arcade-hud__top">
              <span className="arcade-hud__clock" data-testid="arcade-clock">{formatClock(sim.tick)}</span>
              <span className="arcade-hud__stats">
                <span>{t("arcade.hud.kills")} <b>{p.kills}</b></span>
                <span>{t("arcade.hud.gold")} <b>{p.gold}</b></span>
                {p.aegis && <Chip>{t("arcade.hud.aegis")}</Chip>}
                {sim.tick < sim.greedUntil && <Chip>{t("arcade.hud.greed")} {formatClock(sim.greedUntil - sim.tick)}</Chip>}
                <span className="arcade-hud__rank">{t(`arcade.tier.${sim.rank.tier}` as MessageKey)} {"★".repeat(sim.rank.stars)}</span>
              </span>
              <Button variant="secondary" className="arcade-hud__pause" onClick={() => (status === "paused" ? resume() : pause())}>{status === "paused" ? t("arcade.hud.resume") : t("arcade.hud.pauseBtn")}</Button>
            </div>
            {boss && (
              <div className="arcade-hud__boss">
                <span>{t(boss.kind.structure ? "arcade.hud.ancient" : "arcade.hud.roshan")}</span>
                <div className="arcade-bar arcade-bar--boss"><i style={{ width: `${Math.max(0, boss.hp / boss.maxHp) * 100}%` }} /></div>
              </div>
            )}
            </div>
            <div className="arcade-hud__bottom">
              <div className="arcade-hud__bars">
                <div className="arcade-bar arcade-bar--hp" title="HP"><i style={{ width: `${Math.max(0, p.hp / p.stats.maxHp) * 100}%` }} /><span>{Math.ceil(p.hp)} / {p.stats.maxHp}</span></div>
                <div className="arcade-bar arcade-bar--xp"><i style={{ width: `${Math.min(1, p.xp / p.xpNext) * 100}%` }} /><span>{t("arcade.hud.level")} {p.level}</span></div>
              </div>
              {p.items.length > 0 && (
                <div className="arcade-hud__items" data-testid="arcade-items">
                  {p.items.map((it, i) => <span key={i} className="arcade-hud__item" data-rarity={it.rarity} title={t(`arcade.item.${it.id}` as MessageKey)}><ItemIcon slug={ARCADE_ITEM_BY_ID[it.id]?.art ?? it.id} name={it.id} size="sm" /></span>)}
                </div>
              )}
              <div className="arcade-hud__abilities">
                {(["q", "w", "e", "r"] as const).map((key) => {
                  const lvl = p.abilities[key];
                  const ab = sim.hero.abilities[key];
                  const cdTotal = ab.passive ? 0 : ab.cooldown * (1 - p.stats.cooldown);
                  const cd = p.cooldowns[key] / TICK_HZ;
                  return (
                    <button
                      key={key}
                      type="button"
                      className="arcade-ability"
                      data-locked={lvl === 0 ? "true" : undefined}
                      data-passive={ab.passive ? "true" : undefined}
                      disabled={lvl === 0 || ab.passive}
                      onPointerDown={(e) => { e.stopPropagation(); cast(key); }}
                      title={t(`arcade.ab.${sim.hero.id}.${key}` as MessageKey)}
                    >
                      <b>{key.toUpperCase()}</b>
                      <small>{lvl > 0 ? `${t("arcade.hud.lvlShort")}${lvl}` : "—"}</small>
                      {cd > 0 && cdTotal > 0 && <i style={{ height: `${(cd / cdTotal) * 100}%` }} />}
                      {cd > 0 && <em>{Math.ceil(cd)}</em>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {status === "paused" && sim && !sim.over && (
          <div className="arcade-overlay" data-testid="arcade-paused">
            <Surface className="arcade-overlay__card">
              <h2>{t("arcade.hud.paused")}</h2>
              <p className="arcade-overlay__seed">{t("common.seed")}: <code>{seed}</code></p>
              <div className="arcade-overlay__actions">
                <Button variant="primary" onClick={resume}>{t("arcade.hud.resume")}</Button>
                <Button variant="leave" onClick={() => setConfirmQuit(true)}>{t("arcade.hud.quit")}</Button>
              </div>
            </Surface>
          </div>
        )}
        {sim?.shopOpen && status !== "over" && (
          <div className="arcade-overlay" data-testid="arcade-shop">
            <div className="arcade-levelup arcade-shop">
              <Eyebrow>{t("arcade.shop.title")}</Eyebrow>
              <h2>{t("arcade.shop.gold", { gold: sim.player.gold })}</h2>
              <p className="arcade-shop__hint">{t("arcade.shop.hint", { n: sim.player.items.length, max: ARCADE.shop.slots })}</p>
              <div className="arcade-offers">
                {sim.shopOffers.map((offer, i) => {
                  const def = ARCADE_ITEM_BY_ID[offer.id];
                  const affordable = sim.player.gold >= offer.price && sim.player.items.length < ARCADE.shop.slots;
                  return (
                    <button key={`${offer.id}-${i}`} type="button" className="arcade-offer" data-kind="item" data-rarity={offer.rarity} data-testid={`arcade-shop-${i}`} disabled={!affordable} onClick={() => shopAct(i + 1)}>
                      <span className="arcade-offer__tag"><ItemIcon slug={def.art} name={offer.id} size="sm" /> {t(`arcade.rarity.${offer.rarity}` as MessageKey)}</span>
                      <strong>{t(`arcade.item.${offer.id}` as MessageKey)}</strong>
                      <small>{t("arcade.shop.price", { gold: offer.price })}</small>
                      <p>{t(`arcade.item.${offer.id}.desc` as MessageKey)}</p>
                    </button>
                  );
                })}
              </div>
              <div className="arcade-overlay__actions arcade-shop__actions">
                <Button variant="secondary" disabled={sim.player.gold < sim.shopRerollPrice()} onClick={() => shopAct(SHOP_ACT.reroll)}>{t("arcade.shop.reroll", { gold: sim.shopRerollPrice() })}</Button>
                <Button variant="primary" data-testid="arcade-shop-close" onClick={() => shopAct(SHOP_ACT.close)}>{t("arcade.shop.close")}</Button>
              </div>
            </div>
          </div>
        )}
        {sim?.pending && status !== "over" && (
          <div className="arcade-overlay" data-testid="arcade-levelup">
            <div className="arcade-levelup">
              <Eyebrow>{t("arcade.levelUp", { n: sim.player.level })}</Eyebrow>
              <h2>{t("arcade.pick")}</h2>
              <div className="arcade-offers">
                {sim.pending.map((offer, i) => (
                  <OfferCard key={i} offer={offer} index={i} onPick={() => choose(i)} />
                ))}
              </div>
            </div>
          </div>
        )}
        {status === "over" && outcome && (
          <div className="arcade-overlay" data-testid="arcade-over">
            <Surface className="arcade-overlay__card arcade-overlay__card--over" data-outcome={outcome.outcome}>
              <Eyebrow>{t("arcade.title")} · {hero.name}</Eyebrow>
              <h2>{t(outcome.outcome === "victory" ? "arcade.over.victory" : "arcade.over.dead")}</h2>
              <dl className="arcade-result">
                <div><dt>{t("arcade.over.time")}</dt><dd>{formatClock(outcome.tick)}</dd></div>
                <div><dt>{t("arcade.hud.level")}</dt><dd>{outcome.level}</dd></div>
                <div><dt>{t("arcade.hud.kills")}</dt><dd>{outcome.kills}</dd></div>
                <div><dt>{t("arcade.hud.gold")}</dt><dd>{outcome.gold}</dd></div>
                <div><dt>{t("arcade.hud.roshan")}</dt><dd>{t(outcome.roshanKilled ? "arcade.over.roshanYes" : "arcade.over.roshanNo")}</dd></div>
                <div><dt>{t("arcade.rank")}</dt><dd>{t(`arcade.tier.${rankOf(outcome.rank).tier}` as MessageKey)} {"★".repeat(rankOf(outcome.rank).stars)}</dd></div>
                <div><dt>{t("arcade.actLabel")}</dt><dd>{t(`arcade.act.${outcome.act}` as MessageKey)}</dd></div>
                {outcome.greedStacks > 0 && <div><dt>{t("arcade.hud.greed")}</dt><dd>×{outcome.greedStacks}</dd></div>}
              </dl>
              {outcome.items.length > 0 && (
                <div className="arcade-result__schools">
                  {outcome.items.map((id, i) => <Chip key={`${id}-${i}`}><ItemIcon slug={ARCADE_ITEM_BY_ID[id]?.art ?? id} name={id} size="sm" /> {t(`arcade.item.${id}` as MessageKey)}</Chip>)}
                </div>
              )}
              {outcome.schools.length > 0 && (
                <div className="arcade-result__schools">
                  {outcome.schools.map((s) => <Chip key={s}><ItemIcon slug={SCHOOL_ART[s]} name={s} size="sm" /> {t(`arcade.school.${s}` as MessageKey)}</Chip>)}
                </div>
              )}
              <p className="arcade-overlay__seed">{t("common.seed")}: <code>{seed}</code></p>
              <div className="arcade-overlay__actions">
                <Button variant="primary" data-testid="arcade-again" onClick={() => start(seed)}>{t("arcade.over.again")}</Button>
                <Button variant="secondary" onClick={() => start()}>{t("arcade.over.newSeed")}</Button>
                <Button variant="leave" onClick={quit}>{t("arcade.over.toSetup")}</Button>
              </div>
            </Surface>
          </div>
        )}
      </div>
      {confirmQuit && (
        <Modal title={t("arcade.hud.quit")} description={t("arcade.hud.quitConfirm")} onClose={() => setConfirmQuit(false)}>
          {({ close }) => (
            <>
              <Button variant="danger" onClick={() => { close(); quit(); }}>{t("arcade.hud.quit")}</Button>
              <Button variant="secondary" onClick={close}>{t("common.close")}</Button>
            </>
          )}
        </Modal>
      )}
    </main>
  );
}

function OfferCard({ offer, index, onPick }: { offer: Offer; index: number; onPick: () => void }) {
  const { t } = useI18n();
  const sim = getArcadeSim();
  if (offer.kind === "ability") {
    const lvl = (sim?.player.abilities[offer.key] ?? 0) + 1;
    return (
      <button type="button" className="arcade-offer" data-kind="ability" data-testid={`arcade-offer-${index}`} onClick={onPick}>
        <span className="arcade-offer__tag">{t("arcade.offer.ability")} · {offer.key.toUpperCase()}</span>
        <strong>{t(`arcade.ab.${sim?.hero.id ?? "juggernaut"}.${offer.key}` as MessageKey)}</strong>
        <small>{t("arcade.offer.point", { lvl })}</small>
        <p>{t(`arcade.ab.${sim?.hero.id ?? "juggernaut"}.${offer.key}.desc` as MessageKey)}</p>
      </button>
    );
  }
  if (offer.kind === "talent") {
    return (
      <button type="button" className="arcade-offer" data-kind="talent" data-testid={`arcade-offer-${index}`} onClick={onPick}>
        <span className="arcade-offer__tag">{t("arcade.offer.talent")}</span>
        <strong>{t(`arcade.t.${offer.id}` as MessageKey)}</strong>
      </button>
    );
  }
  const def = UPGRADE_BY_ID[offer.id];
  const rank = (sim?.player.upgrades[offer.id]?.rank ?? 0) + 1;
  return (
    <button type="button" className="arcade-offer" data-kind="upgrade" data-rarity={offer.rarity} data-testid={`arcade-offer-${index}`} onClick={onPick}>
      <span className="arcade-offer__tag"><ItemIcon slug={SCHOOL_ART[def.school]} name={def.school} size="sm" /> {t(`arcade.school.${def.school}` as MessageKey)} · {t(`arcade.type.${def.type}` as MessageKey)}</span>
      <strong>{t(`arcade.up.${def.id}` as MessageKey)}</strong>
      <small>{t(`arcade.rarity.${offer.rarity}` as MessageKey)} · {t("arcade.offer.rank", { rank, max: def.maxRank })}</small>
      <p>{t(`arcade.up.${def.id}.desc` as MessageKey)}</p>
    </button>
  );
}
