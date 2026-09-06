// Arcade (PRD §5.15): экран режима — настройка → сцена (canvas + HUD) → итог. Сим тикает в rAF-цикле
// сцены с фиксированным шагом (config.TICK_HZ), React рисует только HUD и оверлеи; сам мир — в
// renderer.ts. Пауза по Esc/Space, кнопке и visibilitychange; выход из забега — через confirm.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRun } from "../../state/runStore.ts";
import { bestArcadeEntry, equippedGear, getArcadeSim, hasActVictory, hasFullActVictory, maxUnlockedRank, useArcade } from "../../state/arcadeStore.ts";
import { useTmaChrome } from "../../state/tmaChrome.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/core.ts";
import { ARCADE, DT, TICK_HZ } from "../../game/arcade/config.ts";
import { SCHOOL_ART, UPGRADE_BY_ID } from "../../game/arcade/content/schools.ts";
import { RANK_TIERS, STARS, rankOf, rankStep } from "../../game/arcade/content/ranks.ts";
import { ARCADE_ITEM_BY_ID, itemEffectsAt, type ItemEffect } from "../../game/arcade/content/items.ts";
import { HEROES, HERO_IDS, type HeroId } from "../../game/arcade/content/heroes.ts";
import { ENEMY_KINDS } from "../../game/arcade/content/enemies.ts";
import { preloadArcadeArt } from "./sprites.ts";
import { ATTACK_MASK, AUTOATTACK_ACT, AUTOCAST_ACT, IDLE_INPUT, SHOP_ACT, type ArcadeInput } from "../../game/arcade/types.ts";
import { arcadeDaily, decodeReplay, encodeReplay, isArcadeDailySeed, replayCompatible, replayUrl } from "../../game/arcade/replay.ts";
import { ARCADE_CONFIG_VERSION } from "../../game/arcade/config.ts";
import { COSMETICS, COSMETIC_BY_ID, skinnedHero } from "../../game/arcade/content/cosmetics.ts";
import { NEUTRAL_BY_ID, NEUTRAL_ENCHANT_BY_ID } from "../../game/arcade/content/neutrals.ts";
import { GEAR_SLOTS, gearArt, gearScore, type GearItem, type GearSlot } from "../../game/arcade/content/gear.ts";
import type { AbilityKey, Offer } from "../../game/arcade/types.ts";
import { Button, Chip, Eyebrow, HeroThumb, ItemIcon, Modal, Surface, TextField, prefersReducedMotion, screenShakeEnabled, sfxArcade, sfxBuy, sfxSting, sfxVerdict } from "../../ui/index.ts";
import { sfxDebug, sfxSample } from "../../ui/sound.ts";
import { useHero } from "../draft/heroes.ts";
import { ArcadeInputController } from "./input.ts";
import { heroHitSfx, heroSpinSfx, heroVoice, preloadHeroSfx, preloadHeroVoice, resetHeroSfx } from "./heroSfx.ts";
import { ensureMusic, stopMusic } from "./music.ts";
import { Soundscape } from "./soundscape.ts";
import { pixelScale } from "./pixelMode.ts";
import { HeroWardrobe, wornSkin } from "./HeroWardrobe.tsx";

/** Пиксельный режим статичен на загрузку страницы (query-параметр) — иконки предметов и умений берём из px-наборов. */
const PX = pixelScale() >= 1;
const ABILITY_KEYS_UI: readonly AbilityKey[] = ["q", "w", "e", "r"];
import { ArcadeRenderer, formatClock } from "./renderer.ts";
import "./arcade.css";

const ABILITY_MASK: Record<AbilityKey, number> = { q: 1, w: 2, e: 4, r: 8 };
/** Пассивки, которые копят стаки в `player.stacks` — у них в HUD показываем число, а не название. */
const STACKING_SIGS = new Set(["souls", "swipes", "growth"]);

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
  const startDaily = useArcade((s) => s.startDaily);
  const startReplay = useArcade((s) => s.startReplay);
  const loadedReplay = useArcade((s) => s.loadedReplay);
  const setLoadedReplay = useArcade((s) => s.setLoadedReplay);
  const cosmetics = useArcade((s) => s.cosmetics);
  const gear = useArcade((s) => s.gear);
  const equipGear = useArcade((s) => s.equipGear);
  const salvageGear = useArcade((s) => s.salvageGear);
  const [gearSlot, setGearSlot] = useState<GearSlot | null>(null);
  /** Гардероб (владелец 2026-09-06): открывается тычком по уже выбранному герою и кнопкой «Внешний вид». */
  const [wardrobe, setWardrobe] = useState<HeroId | null>(null);
  const [seed, setSeed] = useState("");
  const [replayCode, setReplayCode] = useState("");
  const daily = arcadeDaily();
  const dailyEntry = history.find((e) => e.seed === daily.seed) ?? null;
  const best = bestArcadeEntry(history);
  // Ссылка `#arcade=<код>`: открыли — предлагаем смотреть реплей сразу.
  useEffect(() => {
    if (typeof window === "undefined" || !window.location.hash.startsWith("#arcade=")) return;
    const rep = decodeReplay(window.location.hash);
    if (rep) setLoadedReplay(rep);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, [setLoadedReplay]);
  const pastedReplay = replayCode.trim() ? decodeReplay(replayCode) : null;
  const replayToWatch = pastedReplay ?? loadedReplay;
  const unlocked = maxUnlockedRank(history);
  const current = rankOf(rank);
  return (
    <main className="arcade-setup">
      {!backNative && <Button variant="back" onClick={() => setMode(null)}>← {t("start.backToModes")}</Button>}
      <header className="screen-heading">
        <Eyebrow>{t("arcade.eyebrow")}</Eyebrow>
        <h1>{t(act === "full" ? "arcade.titleFull" : act === "dire" ? "arcade.titleDire" : act === "river" ? "arcade.titleRiver" : "arcade.title")}</h1>
        <p>{t(act === "full" ? "arcade.leadFull" : act === "dire" ? "arcade.leadDire" : act === "river" ? "arcade.leadRiver" : "arcade.lead")}</p>
      </header>
      <div className="arcade-setup__grid">
        <Surface className="arcade-setup__hero" data-testid="arcade-hero">
          <span className="arcade-setup__label">{t("arcade.hero")}</span>
          <div className="arcade-heroes" data-testid="arcade-heroes">
            {HERO_IDS.map((id) => {
              const def = HEROES[id];
              const info = heroOf(def.dotaId);
              return (
                <button key={id} type="button" className="arcade-heroes__pick" data-active={id === heroId ? "true" : undefined} data-testid={`arcade-hero-${id}`} onClick={() => { if (id === heroId) { setWardrobe(id); return; } setHero(id); preloadHeroSfx(id); preloadHeroVoice(id); void preloadArcadeArt(id, Object.keys(ENEMY_KINDS), "short"); }}>
                  <HeroThumb picture={info.picture || def.picture} name={info.name} size="md" layout="card" />
                  <small>{t(def.ranged ? "arcade.hero.ranged" : "arcade.hero.melee")}</small>
                  {(() => {
                    // Бейдж скина на карточке героя (владелец: «косметика по герою»): надетый — по редкости, иначе — сколько доступно.
                    const skins = COSMETICS.filter((c) => c.slot === "skin" && c.hero === id);
                    if (skins.length === 0) return null;
                    const on = wornSkin(id, cosmetics.equipped.skin);
                    return on
                      ? <span className="arcade-heroes__skin" data-rarity={on.rarity} data-testid={`arcade-hero-skin-${id}`}>{t(on.rarity === "arcana" ? "arcade.rarity.arcana" : "arcade.cosmetics.persona")}</span>
                      : <span className="arcade-heroes__skin" data-testid={`arcade-hero-skins-${id}`}>{t("arcade.cosmetics.skinsCount", { n: skins.length })}</span>;
                  })()}
                </button>
              );
            })}
          </div>
          <div className="arcade-gear" data-testid="arcade-gear">
            <span className="arcade-setup__label">{t("arcade.gear.title")} · {t("arcade.gear.count", { n: gear.items.length })}</span>
            <div className="arcade-gear__slots">
              {GEAR_SLOTS.map((slot) => {
                const item = gear.items.find((i) => i.uid === gear.equipped[slot]);
                return (
                  <button key={slot} type="button" className="arcade-gear__slot" data-active={gearSlot === slot ? "true" : undefined} data-rarity={item?.rarity} data-testid={`arcade-gear-slot-${slot}`} onClick={() => setGearSlot(gearSlot === slot ? null : slot)}>
                    <small>{t(`arcade.gear.slot.${slot}` as MessageKey)}</small>
                    {item ? <><ItemIcon pixel={PX} slug={gearArt(item)} name={item.base} size="sm" /><span>{t(`arcade.gearName.${item.base}` as MessageKey)}</span></> : <span className="arcade-gear__empty">—</span>}
                  </button>
                );
              })}
            </div>
            {gearSlot && (
              <ul className="arcade-gear__list" data-testid="arcade-gear-list">
                <li><Button variant="secondary" onClick={() => equipGear(gearSlot, null)}>{t("arcade.gear.unequip")}</Button></li>
                {gear.items.filter((i) => i.slot === gearSlot).sort((a, b) => gearScore(b) - gearScore(a)).map((item) => (
                  <li key={item.uid} data-rarity={item.rarity} data-equipped={gear.equipped[gearSlot] === item.uid ? "true" : undefined}>
                    <ItemIcon pixel={PX} slug={gearArt(item)} name={item.base} size="sm" />
                    <div>
                      <strong>{t(`arcade.gearName.${item.base}` as MessageKey)} <em>· {t(`arcade.rarity.${item.rarity}` as MessageKey)} · T{item.tier}</em></strong>
                      <span>{item.affixes.map((a) => affixLabel(t, a.stat, a.value)).join(" · ")}</span>
                    </div>
                    <Button variant="secondary" data-testid={`arcade-gear-equip-${item.uid}`} onClick={() => equipGear(gearSlot, item.uid)}>{t("arcade.gear.equip")}</Button>
                    <Button variant="leave" onClick={() => salvageGear(item.uid)}>{t("arcade.gear.salvage")}</Button>
                  </li>
                ))}
                {gear.items.filter((i) => i.slot === gearSlot).length === 0 && <li><em>{t("arcade.gear.none")}</em></li>}
              </ul>
            )}
          </div>
          <div className="arcade-cosmetics" data-testid="arcade-cosmetics">
            <span className="arcade-setup__label">{t("arcade.cosmetics.title")} · {cosmetics.owned.length}/{COSMETICS.length} · {t("arcade.cosmetics.shards", { n: cosmetics.shards })}</span>
            <Button variant="secondary" data-testid="arcade-wardrobe-open" onClick={() => setWardrobe(heroId)}>{t("arcade.wardrobe.open")}</Button>
          </div>
          <ul className="arcade-setup__kit">
            {(["q", "w", "e", "r"] as const).map((key) => (
              <li key={key}><AbilityIcon hero={heroId} k={key} size={30} /> <span>{t(`arcade.ab.${HEROES[heroId].kit}.${key}` as MessageKey)}</span><small>{t(`arcade.ab.${HEROES[heroId].kit}.${key}.desc` as MessageKey)}</small></li>
            ))}
            {HEROES[heroId].signature && <li key="sig" className="arcade-setup__kit-sig" data-testid="arcade-signature"><b>✦</b> <span>{t(`arcade.sig.${HEROES[heroId].signature.kind}` as MessageKey)}</span><small>{t(`arcade.sig.${HEROES[heroId].signature.kind}.desc` as MessageKey)}</small></li>}
          </ul>
        </Surface>
        <Surface className="arcade-setup__run">
          <div className="arcade-act" data-testid="arcade-act">
            {(["full", "dire", "river", "short"] as const).map((id) => {
              const locked = (id === "dire" && !hasFullActVictory(history)) || (id === "river" && !hasActVictory(history, "dire"));
              return (
                <button key={id} type="button" className="arcade-rank__tier" data-active={act === id ? "true" : undefined} data-locked={locked ? "true" : undefined} disabled={locked} title={locked ? t(id === "river" ? "arcade.act.riverLocked" : "arcade.act.direLocked") : undefined} data-testid={`arcade-act-${id}`} onClick={() => setAct(id)}>{t(`arcade.act.${id}` as MessageKey)}</button>
              );
            })}
          </div>
          <p className="arcade-setup__goal">{t(act === "full" ? "arcade.goalFull" : act === "dire" ? "arcade.goalDire" : act === "river" ? "arcade.goalRiver" : "arcade.goal")}</p>
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
          <Surface className="arcade-daily" data-testid="arcade-daily">
            <div>
              <span className="arcade-setup__label">{t("arcade.daily.title")}</span>
              <p>{t("arcade.daily.text", { hero: heroOf(HEROES[daily.hero].dotaId).name })}</p>
              {dailyEntry && <p className="arcade-daily__done" data-testid="arcade-daily-done">{t(dailyEntry.outcome === "victory" ? "arcade.over.victory" : "arcade.over.dead")} · {formatClock(dailyEntry.seconds * TICK_HZ)} · {t("arcade.hud.level")} {dailyEntry.level}</p>}
            </div>
            <Button variant="secondary" data-testid="arcade-daily-play" onClick={startDaily}>{t(dailyEntry ? "arcade.daily.again" : "arcade.daily.play")}</Button>
          </Surface>
          <label className="arcade-setup__seed">
            <span className="arcade-setup__label">{t("arcade.replay.code")}</span>
            <TextField value={replayCode} onChange={(e) => setReplayCode(e.target.value)} placeholder={t("arcade.replay.placeholder")} data-testid="arcade-replay-code" />
          </label>
          {replayToWatch && (
            <div className="arcade-replay-load" data-testid="arcade-replay-load">
              <span>{t("arcade.replay.found", { hero: heroOf(HEROES[replayToWatch.hero].dotaId).name, seed: replayToWatch.seed })}{!replayCompatible(replayToWatch) && ` · ${t("arcade.replay.version", { v: replayToWatch.version, cur: ARCADE_CONFIG_VERSION })}`}</span>
              <Button variant="primary" data-testid="arcade-replay-watch" onClick={() => startReplay(replayToWatch)}>{t("arcade.replay.watch")}</Button>
            </div>
          )}
          <div className="arcade-setup__best">
            <span className="arcade-setup__label">{t("arcade.best")}</span>
            {best
              ? <span data-testid="arcade-best">{heroOf(HEROES[(best.hero as HeroId) in HEROES ? (best.hero as HeroId) : "juggernaut"].dotaId).name} · {t(best.outcome === "victory" ? "arcade.over.victory" : "arcade.over.dead")} · {t(`arcade.tier.${rankOf(best.rank ?? 0).tier}` as MessageKey)} {"★".repeat(rankOf(best.rank ?? 0).stars)} · {formatClock(best.seconds * TICK_HZ)} · {t("arcade.hud.level")} {best.level} · {best.kills} {t("arcade.hud.kills").toLowerCase()}</span>
              : <span>{t("arcade.noHistory")}</span>}
          </div>
        </Surface>
      </div>
      {wardrobe && <HeroWardrobe hero={wardrobe} onClose={() => setWardrobe(null)} />}
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
  const levelReroll = useArcade((s) => s.levelReroll);
  const levelBanish = useArcade((s) => s.levelBanish);
  const shopAct = useArcade((s) => s.shopAct);
  const autoCastSetting = useArcade((s) => s.autoCast);
  const toggleAutoCast = useArcade((s) => s.toggleAutoCast);
  const finish = useArcade((s) => s.finish);
  const quit = useArcade((s) => s.quit);
  const start = useArcade((s) => s.start);
  const startReplay = useArcade((s) => s.startReplay);
  const bump = useArcade((s) => s.bump);
  const replayLog = useArcade((s) => s.replayLog);
  const replayRef = useRef(replayLog);
  replayRef.current = replayLog;
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const equippedCosmetics = useArcade((s) => s.cosmetics.equipped);
  const cosmeticStyles = useArcade((s) => s.cosmetics.styles);
  const lastDrops = useArcade((s) => s.lastDrops);
  const lastLoot = useArcade((s) => s.lastLoot);
  // Экипировка на старте забега — часть кода реплея (детерминизм): снимок берём один раз при монтировании.
  const startGear = useRef<GearItem[]>(equippedGear(useArcade.getState().gear)).current;
  const rendererRef = useRef<ArcadeRenderer | null>(null);
  useEffect(() => { rendererRef.current?.setCosmetics(equippedCosmetics, cosmeticStyles); }, [equippedCosmetics, cosmeticStyles]);
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
  // Загрузка арта перед стартом: сим стоит, показываем «Загрузка…», чтобы не мелькали риги и голая земля.
  const [loading, setLoading] = useState(true);
  const loadingRef = useRef(true);
  loadingRef.current = loading;

  useEffect(() => {
    const canvas = canvasRef.current, stage = stageRef.current;
    if (!canvas || !stage) return;
    const renderer = new ArcadeRenderer(canvas, hero.picture || heroDef.picture);
    rendererRef.current = renderer;
    renderer.setCosmetics(useArcade.getState().cosmetics.equipped, useArcade.getState().cosmetics.styles);
    // Dev-хук для headless-QA (телепорт к торговцу/Рошану без ожидания): в прод-сборке его нет.
    if (import.meta.env.DEV) { const w = window as unknown as { __arcadeSim?: typeof getArcadeSim; __sfxDebug?: typeof sfxDebug }; w.__arcadeSim = getArcadeSim; w.__sfxDebug = sfxDebug; }
    const controller = new ArcadeInputController(stage);
    controllerRef.current = controller;
    controller.onPause = () => {
      const s = useArcade.getState();
      const cur = getArcadeSim();
      // Пока открыт выбор прокачки/лавка/лут — игра и так стоит; пауза поверх карточек только путает (фидбэк владельца).
      if (cur && (cur.pending || cur.shopOpen || cur.neutralOpen || cur.lootOpen)) return;
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
    let wasNeutral = false;
    let seen = { hits: 0, crits: 0, casts: 0, ults: 0, hurt: 0, kills: 0, eliteKills: 0, pickups: 0 };
    const scape = new Soundscape(heroDef.id);
    // Озвучка и лист героя — с учётом надетого скина (аркана/персона), см. content/cosmetics.ts skinnedHero.
    const voiceId = skinnedHero(heroDef.id, useArcade.getState().cosmetics.equipped);
    // Реплики (T13.16 срез 2): спавн — при старте, ходьба — раз в 25–45 с движения, остальное — по событиям сима.
    let spoke = false, movingSince = 0, nextMoveLine = 0, lastPx = 0, lastPy = 0, wasOver = false;
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
      else if (statusRef.current === "running" && !loadingRef.current && !sim.pending && !sim.shopOpen && !sim.neutralOpen && !sim.over) {
        acc += dt;
        let steps = 0;
        while (acc >= DT && steps < 5) {
          sim.step(replayRef.current ? replayInput(replayRef.current, sim.steps) : controller.read());
          acc -= DT;
          steps++;
        }
        if (steps === 5) acc = 0;
      }
      // Автокаст: в симе он включён по умолчанию (так гоняется бот и читаются старые реплеи), а игрок
      // управляет им из HUD. Разницу закрываем через `act` — она попадает в input-лог, реплей точен.
      if (!replayRef.current && statusRef.current === "running" && !loadingRef.current && !sim.pending && !sim.shopOpen && !sim.neutralOpen && !sim.over) {
        const want = useArcade.getState().autoCast;
        for (let i = 0; i < ABILITY_KEYS_UI.length; i++) {
          const k = ABILITY_KEYS_UI[i];
          if (sim.player.autoCast[k] !== want[k]) { controller.queueAct(AUTOCAST_ACT + i); break; }
        }
        if (sim.player.autoAttack !== want.attack) controller.queueAct(AUTOATTACK_ACT);
      }
      // Дельты счётчиков сима → звук и juice. Пакет Dota (soundscape) первичен, синтетика — фолбэк.
      const ev = sim.events;
      const handled = scape.frame(sim, now, statusRef.current === "running" && !loadingRef.current);
      if (ev.eliteKills > seen.eliteKills) { sfxArcade("elite"); if (!prefersReducedMotion()) hitStop = 6; }
      else if (ev.kills > seen.kills && !handled.kill) sfxArcade("kill");
      // Удары — сэмплы Dota героя (heroSfx), синтетика остаётся фолбэком.
      if (ev.crits > seen.crits) { if (!handled.crit) sfxArcade("crit"); heroHitSfx(sim.hero.id, true, now); }
      else if (ev.hits > seen.hits) { if (!heroHitSfx(sim.hero.id, false, now)) sfxArcade("hit"); }
      heroSpinSfx(sim.hero.id, sim.tick < sim.player.spinUntil && !sim.over && statusRef.current === "running");
      // Реплики героя.
      if (!spoke && sim.tick > 30 && statusRef.current === "running" && !loadingRef.current) { spoke = true; heroVoice(voiceId, "spawn", now); nextMoveLine = now + 20000 + Math.random() * 15000; }
      if (!sim.over && statusRef.current === "running") {
        const moved = Math.abs(sim.player.x - lastPx) + Math.abs(sim.player.y - lastPy) > 0.5;
        lastPx = sim.player.x; lastPy = sim.player.y;
        if (!moved) movingSince = now; else if (now - movingSince > 1500 && now > nextMoveLine) { if (heroVoice(voiceId, "move", now, 1, 15000)) nextMoveLine = now + 25000 + Math.random() * 20000; }
        if (ev.eliteKills > seen.eliteKills) heroVoice(voiceId, "kill", now, 0.7, 8000);
        else if (ev.kills > seen.kills) heroVoice(voiceId, "kill", now, 0.08, 14000);
        if (ev.ults > seen.ults) heroVoice(voiceId, "ability", now, 0.8, 10000);
        else if (ev.casts > seen.casts) heroVoice(voiceId, "attack", now, 0.1, 18000);
        if (ev.hurt > seen.hurt) heroVoice(voiceId, "pain", now, 0.06, 12000);
        if (sim.pending && !wasPending) heroVoice(voiceId, "level", now, 0.45, 20000);
      }
      if (sim.over && !wasOver) { wasOver = true; heroVoice(voiceId, sim.player.hp <= 0 ? "death" : "kill", now); }
      // Музыка: боевые темы по кругу, тема Рошана пока он жив; на паузе и после конца — тишина.
      ensureMusic(sim.over || statusRef.current !== "running" || loadingRef.current ? "off" : sim.roshan?.alive ? "roshan" : "battle");
      if (ev.ults > seen.ults) sfxArcade("ult");
      else if (ev.casts > seen.casts) sfxArcade("cast");
      if (ev.hurt > seen.hurt) { if (!handled.hurt) sfxArcade("hurt"); hurtUntil = now + 140; }
      if (ev.pickups > seen.pickups) sfxArcade("pickup");
      seen = { ...ev };
      stage.dataset.hurt = now < hurtUntil ? "true" : "";
      stage.dataset.lowhp = sim.player.hp / sim.player.stats.maxHp < 0.3 && !sim.over ? "true" : "";
      if (replayRef.current && (sim.pending || sim.shopOpen || sim.neutralOpen)) sim.step(replayInput(replayRef.current, sim.steps));
      if (sim.pending && !wasPending) { if (!handled.levelup) sfxArcade("levelup"); bump(); }
      if ((sim.shopOpen && !wasShop) || (sim.neutralOpen && !wasNeutral)) { sfxBuy(); bump(); }
      wasNeutral = sim.neutralOpen;
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
    preloadHeroSfx(heroDef.id);
    preloadHeroVoice(voiceId);
    const simNow = getArcadeSim();
    let cancelled = false;
    setLoading(true);
    void preloadArcadeArt(voiceId, Object.keys(ENEMY_KINDS), simNow?.act ?? "short").then(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      resetHeroSfx();
      stopMusic();
      scape.dispose();
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
                {replayLog && <Chip>{t("arcade.hud.replay")}</Chip>}
                {isArcadeDailySeed(seed) && <Chip>{t("arcade.hud.daily")}</Chip>}
                {p.aegis && <Chip>{t("arcade.hud.aegis")}</Chip>}
                {sim.hero.signature && (sim.hero.signature.kind === "souls" || sim.hero.signature.kind === "swipes") && <Chip>{t(`arcade.sig.${sim.hero.signature.kind}` as MessageKey)} {p.stacks}{sim.hero.signature.cap ? `/${sim.hero.signature.cap}` : ""}</Chip>}
                {sim.tick < sim.greedUntil && <Chip>{t("arcade.hud.greed")} {formatClock(sim.greedUntil - sim.tick)}</Chip>}
                <span className="arcade-hud__rank">{t(`arcade.tier.${sim.rank.tier}` as MessageKey)} {"★".repeat(sim.rank.stars)}</span>
              </span>
              <Button variant="secondary" className="arcade-hud__pause" onClick={() => (status === "paused" ? resume() : pause())}>{status === "paused" ? t("arcade.hud.resume") : t("arcade.hud.pauseBtn")}</Button>
            </div>
            <div className="arcade-hud__gear" data-testid="arcade-hud-gear">
              {GEAR_SLOTS.map((slot) => { const g = p.gear[slot] as GearItem | undefined; return <span key={slot} className="arcade-hud__item" data-rarity={g?.rarity} title={g ? t(`arcade.gearName.${g.base}` as MessageKey) : t(`arcade.gear.slot.${slot}` as MessageKey)}>{g ? <ItemIcon pixel={PX} slug={gearArt(g)} name={g.base} size="sm" /> : <i className="arcade-hud__slot-empty" />}</span>; })}
              {p.bag.length > 0 && <span className="arcade-hud__bag">{t("arcade.gear.bag", { n: p.bag.length, max: ARCADE.loot.bagCap })}</span>}
            </div>
            {boss && (
              <div className="arcade-hud__boss">
                <span>{t(boss.kind.structure ? "arcade.hud.ancient" : "arcade.hud.roshan")}</span>
                <div className="arcade-bar arcade-bar--boss"><i style={{ width: `${Math.max(0, boss.hp / boss.maxHp) * 100}%` }} /></div>
              </div>
            )}
            </div>
            <div className="arcade-hud__bottom">
              <HeroThumb picture={hero.picture || heroDef.picture} name={hero.name} size="md" showName={false} />
              <div className="arcade-hud__bars">
                <div className="arcade-bar arcade-bar--hp" title="HP"><i style={{ width: `${Math.max(0, p.hp / p.stats.maxHp) * 100}%` }} /><span>{Math.ceil(p.hp)} / {p.stats.maxHp}</span></div>
                <div className="arcade-bar arcade-bar--xp"><i style={{ width: `${Math.min(1, p.xp / p.xpNext) * 100}%` }} /><span>{t("arcade.hud.level")} {p.level}</span></div>
              </div>
              {(p.items.length > 0 || p.neutral) && (
                <div className="arcade-hud__items" data-testid="arcade-items">
                  {p.neutral && <span className="arcade-hud__item arcade-hud__item--neutral" title={`${p.neutralEnchant ? `${t(`arcade.enchant.${p.neutralEnchant}` as MessageKey)} ` : ""}${t(`arcade.neutral.${p.neutral}` as MessageKey)}`}><ItemIcon pixel={PX} slug={p.neutral} name={p.neutral} size="sm" />{p.neutralEnchant && <b className="arcade-hud__stack">✦</b>}</span>}
                  {Object.values(p.items.reduce<Record<string, { id: string; rarity: string; n: number }>>((acc, it) => { const k = `${it.id}:${it.rarity}`; acc[k] = acc[k] ? { ...acc[k], n: acc[k].n + 1 } : { id: it.id, rarity: it.rarity, n: 1 }; return acc; }, {})).map((g) => (
                    <span key={`${g.id}:${g.rarity}`} className="arcade-hud__item" data-rarity={g.rarity} title={`${t(`arcade.item.${g.id}` as MessageKey)}${g.n > 1 ? ` ×${g.n} · ${t("arcade.shop.stacks")}` : ""}`}>
                      <ItemIcon pixel={PX} slug={ARCADE_ITEM_BY_ID[g.id]?.art ?? g.id} name={g.id} size="sm" />
                      {g.n > 1 && <b className="arcade-hud__stack" data-testid="arcade-item-stack">×{g.n}</b>}
                    </span>
                  ))}
                </div>
              )}
              <div className="arcade-hud__abilities">
                {sim.hero.signature && (
                  // Фирменная пассивка в HUD (T13.15): она не нажимается, но её видно — а у копящих
                  // пассивок (души, ярость, плоть) рядом счётчик, иначе рост ничем не подтверждается.
                  <span
                    className="arcade-ability arcade-ability--sig"
                    data-testid="arcade-hud-signature"
                    title={`${t(`arcade.sig.${sim.hero.signature.kind}` as MessageKey)} — ${t(`arcade.sig.${sim.hero.signature.kind}.desc` as MessageKey)}`}
                  >
                    <b>✦</b>
                    <small>{STACKING_SIGS.has(sim.hero.signature.kind) ? Math.round(p.stacks) : t(`arcade.sig.${sim.hero.signature.kind}` as MessageKey)}</small>
                  </span>
                )}
                {/* Автоатака: значок «А» переключает, само нажатие бьёт один раз (клавиша F). */}
                <button
                  type="button"
                  className="arcade-ability"
                  data-testid="arcade-attack"
                  onPointerDown={(e) => { e.stopPropagation(); controllerRef.current?.cast(ATTACK_MASK); }}
                  title={t(autoCastSetting.attack ? "arcade.hud.autoAttackOn" : "arcade.hud.autoAttackOff")}
                >
                  <b>{t("arcade.hud.attackShort")}</b>
                  <small>F</small>
                  <span
                    role="checkbox"
                    tabIndex={0}
                    aria-checked={autoCastSetting.attack}
                    className="arcade-ability__auto"
                    data-on={autoCastSetting.attack ? "true" : undefined}
                    data-testid="arcade-autoattack"
                    onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); toggleAutoCast("attack"); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); toggleAutoCast("attack"); } }}
                  >{t("arcade.hud.autoCastShort")}</span>
                </button>
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
                      title={t(`arcade.ab.${sim.hero.kit}.${key}` as MessageKey)}
                    >
                      <AbilityIcon hero={sim.hero.id} k={key} size={30} />
                      <b>{key.toUpperCase()}</b>
                      <small>{lvl > 0 ? `${t("arcade.hud.lvlShort")}${lvl}` : "—"}</small>
                      {!ab.passive && (
                        // Переключатель автокаста рядом с умением (владелец 2026-09-06): выключен — умение
                        // срабатывает только по нажатию, включён — само по перезарядке.
                        <span
                          role="checkbox"
                          tabIndex={0}
                          aria-checked={autoCastSetting[key]}
                          className="arcade-ability__auto"
                          data-on={autoCastSetting[key] ? "true" : undefined}
                          data-testid={`arcade-autocast-${key}`}
                          title={t(autoCastSetting[key] ? "arcade.hud.autoCastOn" : "arcade.hud.autoCastOff")}
                          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); toggleAutoCast(key); }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); toggleAutoCast(key); } }}
                        >{t("arcade.hud.autoCastShort")}</span>
                      )}
                      {cd > 0 && cdTotal > 0 && <i style={{ height: `${(cd / cdTotal) * 100}%` }} />}
                      {cd > 0 && <em>{Math.ceil(cd)}</em>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {loading && (
          <div className="arcade-overlay arcade-overlay--loading" data-testid="arcade-loading">
            <div className="arcade-overlay__card"><Eyebrow>{t("arcade.loading.eyebrow")}</Eyebrow><h2>{t("arcade.loading.title")}</h2><p>{t("arcade.loading.hint")}</p></div>
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
        {sim?.lootOpen && status !== "over" && (
          <div className="arcade-overlay" data-testid="arcade-loot">
            <div className="arcade-levelup arcade-shop">
              <Eyebrow>{t("arcade.loot.title")}</Eyebrow>
              <h2>{t(`arcade.gearName.${sim.lootOpen.base}` as MessageKey)}</h2>
              <p className="arcade-shop__hint">{t(`arcade.gear.slot.${sim.lootOpen.slot}` as MessageKey)} · {t(`arcade.rarity.${sim.lootOpen.rarity}` as MessageKey)} · T{sim.lootOpen.tier}{sim.lootOpen.unique ? ` · ${t("arcade.loot.unique")}` : ""}</p>
              <div className="arcade-offers arcade-loot__compare">
                <GearCard item={sim.lootOpen} title={t("arcade.loot.found")} />
                <GearCard item={(sim.player.gear[sim.lootOpen.slot] as GearItem | undefined) ?? null} title={t("arcade.loot.current")} />
              </div>
              <div className="arcade-overlay__actions arcade-shop__actions">
                <Button variant="primary" data-testid="arcade-loot-equip" onClick={() => shopAct(1)}>{t("arcade.loot.equip")}</Button>
                <Button variant="secondary" data-testid="arcade-loot-bag" disabled={sim.player.bag.length >= ARCADE.loot.bagCap} onClick={() => shopAct(2)}>{t("arcade.gear.bag", { n: sim.player.bag.length, max: ARCADE.loot.bagCap })}</Button>
                <Button variant="leave" data-testid="arcade-loot-leave" onClick={() => shopAct(SHOP_ACT.close)}>{t("arcade.loot.leave")}</Button>
              </div>
            </div>
          </div>
        )}
        {sim?.neutralOpen && status !== "over" && (
          <div className="arcade-overlay" data-testid="arcade-neutral">
            <div className="arcade-levelup arcade-shop">
              <Eyebrow>{t("arcade.neutral.title", { tier: NEUTRAL_BY_ID[sim.neutralOffers[0]?.id]?.tier ?? 1 })}</Eyebrow>
              <h2>{t("arcade.neutral.pick")}</h2>
              <p className="arcade-shop__hint">{sim.player.neutral ? t("arcade.neutral.replaces", { name: t(`arcade.neutral.${sim.player.neutral}` as MessageKey) }) : t("arcade.neutral.slot")}</p>
              <div className="arcade-offers">
                {sim.neutralOffers.map((n, i) => (
                  <button key={n.id} type="button" className="arcade-offer" data-kind="neutral" data-testid={`arcade-neutral-${i}`} onClick={() => shopAct(i + 1)}>
                    <span className="arcade-offer__tag"><ItemIcon pixel={PX} slug={n.id} name={n.id} size="sm" /> {t("arcade.neutral.tier", { tier: n.tier })}</span>
                    <strong>{sim.neutralEnchants[i] ? `${t(`arcade.enchant.${sim.neutralEnchants[i]}` as MessageKey)} ` : ""}{t(`arcade.neutral.${n.id}` as MessageKey)}</strong>
                    <p>{t(`arcade.neutral.${n.id}.desc` as MessageKey)}</p>
                    <StatList effects={[{ e: n.effect, m: 1 }, ...(sim.neutralEnchants[i] && NEUTRAL_ENCHANT_BY_ID[sim.neutralEnchants[i]] ? [{ e: NEUTRAL_ENCHANT_BY_ID[sim.neutralEnchants[i]].effect, m: n.tier, extra: true }] : [])]} />
                  </button>
                ))}
              </div>
              <div className="arcade-overlay__actions arcade-shop__actions">
                <Button variant="secondary" data-testid="arcade-neutral-skip" onClick={() => shopAct(SHOP_ACT.close)}>{t("arcade.neutral.skip")}</Button>
              </div>
            </div>
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
                      <span className="arcade-offer__tag"><ItemIcon pixel={PX} slug={def.art} name={offer.id} size="sm" /> {t(`arcade.rarity.${offer.rarity}` as MessageKey)}</span>
                      <strong>{t(`arcade.item.${offer.id}` as MessageKey)}</strong>
                      <small>{t("arcade.shop.price", { gold: offer.price })}{sim.player.items.filter((it) => it.id === offer.id).length > 0 && <> · {t("arcade.shop.haveN", { n: sim.player.items.filter((it) => it.id === offer.id).length })}</>}</small>
                      <StatList effects={itemEffectsAt(def, offer.rarity)} />
                      {(offer.rarity === "standard" || offer.rarity === "refined") && def.extras && <small className="arcade-offer__more">{t("arcade.shop.moreAtExotic")}</small>}
                    </button>
                  );
                })}
              </div>
              {sim.player.items.length > 0 && (
                <div className="arcade-shop__owned" data-testid="arcade-shop-owned">
                  <span className="arcade-shop__owned-title">{t("arcade.shop.owned")}</span>
                  {sim.player.items.map((it, i) => (
                    <button key={`${it.id}-${i}`} type="button" className="arcade-shop__sell" data-rarity={it.rarity} data-testid={`arcade-shop-sell-${i}`} title={t(`arcade.item.${it.id}.desc` as MessageKey)} onClick={() => shopAct(SHOP_ACT.sellBase + i)}>
                      <ItemIcon pixel={PX} slug={ARCADE_ITEM_BY_ID[it.id]?.art ?? it.id} name={it.id} size="sm" />
                      <span>{t(`arcade.item.${it.id}` as MessageKey)}</span>
                      <small>{t("arcade.shop.sell", { gold: sim.itemSellPrice(it) })}</small>
                    </button>
                  ))}
                </div>
              )}
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
              <p className="arcade-shop__hint">{t("arcade.pickHint")}</p>
              <div className="arcade-offers">
                {sim.pending.map((offer, i) => (
                  <div key={i} className="arcade-offer-wrap">
                    <OfferCard offer={offer} index={i} onPick={() => choose(i)} />
                    {offer.kind === "upgrade" && sim.banishesLeft > 0 && !UPGRADE_BY_ID[offer.id]?.legendary && (
                      <button type="button" className="arcade-offer__banish" data-testid={`arcade-banish-${i}`} onClick={() => levelBanish(i)}>{t("arcade.levelup.banish", { n: sim.banishesLeft })}</button>
                    )}
                  </div>
                ))}
              </div>
              <div className="arcade-overlay__actions arcade-shop__actions">
                <Button variant="secondary" data-testid="arcade-levelup-reroll" disabled={sim.player.gold < sim.levelRerollPrice()} onClick={() => levelReroll()}>{t("arcade.levelup.reroll", { gold: sim.levelRerollPrice() })}</Button>
              </div>
            </div>
          </div>
        )}
        {status === "over" && outcome && (
          <div className="arcade-overlay" data-testid="arcade-over">
            <Surface className="arcade-overlay__card arcade-overlay__card--over" data-outcome={outcome.outcome}>
              <Eyebrow>{t(outcome.act === "full" ? "arcade.titleFull" : outcome.act === "dire" ? "arcade.titleDire" : outcome.act === "river" ? "arcade.titleRiver" : "arcade.title")} · {hero.name}</Eyebrow>
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
              {lastLoot.length > 0 && (
                <div className="arcade-drops" data-testid="arcade-loot-result">
                  <span className="arcade-setup__label">{t("arcade.loot.gained", { n: lastLoot.length })}</span>
                  <div className="arcade-result__schools">
                    {lastLoot.map((g) => <Chip key={g.uid}><ItemIcon pixel={PX} slug={gearArt(g)} name={g.base} size="sm" /> {t(`arcade.gearName.${g.base}` as MessageKey)} · {t(`arcade.rarity.${g.rarity}` as MessageKey)}</Chip>)}
                  </div>
                </div>
              )}
              {outcome.neutral && <p className="arcade-overlay__seed">{t("arcade.neutral.slot")}: {t(`arcade.neutral.${outcome.neutral}` as MessageKey)}</p>}
              {outcome.items.length > 0 && (
                <div className="arcade-result__schools">
                  {outcome.items.map((id, i) => <Chip key={`${id}-${i}`}><ItemIcon pixel={PX} slug={ARCADE_ITEM_BY_ID[id]?.art ?? id} name={id} size="sm" /> {t(`arcade.item.${id}` as MessageKey)}</Chip>)}
                </div>
              )}
              {outcome.schools.length > 0 && (
                <div className="arcade-result__schools">
                  {outcome.schools.map((s) => <Chip key={s}><ItemIcon pixel={PX} slug={SCHOOL_ART[s]} name={s} size="sm" /> {t(`arcade.school.${s}` as MessageKey)}</Chip>)}
                </div>
              )}
              {lastDrops.length > 0 && (
                <div className="arcade-drops" data-testid="arcade-drops">
                  <span className="arcade-setup__label">{t("arcade.cosmetics.drops")}</span>
                  <div className="arcade-result__schools">
                    {lastDrops.map((d, i) => <Chip key={`${d.id}-${i}`}>{t(`arcade.cosmetic.${d.id}` as MessageKey)} · {t(`arcade.rarity.${COSMETIC_BY_ID[d.id].rarity}` as MessageKey)}{d.duplicate && ` · +${d.shards} ${t("arcade.cosmetics.shardWord")}`}</Chip>)}
                  </div>
                </div>
              )}
              <p className="arcade-overlay__seed">{t("common.seed")}: <code>{seed}</code></p>
              {sim && !replayLog && (
                <div className="arcade-overlay__actions arcade-overlay__share">
                  <Button variant="secondary" data-testid="arcade-copy-replay" onClick={() => { void copyText(encodeReplay({ seed, hero: sim.hero.id, rank: sim.rank.step, act: sim.act, version: ARCADE_CONFIG_VERSION, log: sim.log, gear: startGear })).then(() => setCopied("code")); }}>{copied === "code" ? t("arcade.replay.copied") : t("arcade.replay.copy")}</Button>
                  <Button variant="secondary" onClick={() => { void copyText(replayUrl(encodeReplay({ seed, hero: sim.hero.id, rank: sim.rank.step, act: sim.act, version: ARCADE_CONFIG_VERSION, log: sim.log, gear: startGear }), window.location.origin, window.location.pathname)).then(() => setCopied("link")); }}>{copied === "link" ? t("link.copied") : t("link.copy")}</Button>
                  <Button variant="secondary" data-testid="arcade-watch-replay" onClick={() => startReplay({ seed, hero: sim.hero.id, rank: sim.rank.step, act: sim.act, version: ARCADE_CONFIG_VERSION, log: [...sim.log], gear: startGear })}>{t("arcade.replay.watch")}</Button>
                </div>
              )}
              <div className="arcade-overlay__actions">
                <Button variant="primary" data-testid="arcade-again" onClick={() => start(seed)}>{t("arcade.over.again")}</Button>
                <Button variant="secondary" onClick={() => start()}>{t("arcade.over.newSeed")}</Button>
                <Button variant="leave" onClick={quit}>{t("arcade.over.toSetup")}</Button>
              </div>
            </Surface>
          </div>
        )}
      </div>
      {typeof window !== "undefined" && new URLSearchParams(window.location.search).has("sfxdebug") && <SfxDebugPanel hero={sim?.hero.id ?? "juggernaut"} />}
      <p className="arcade__credits">{t("arcade.credits")}</p>
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

/** Строки эффектов предмета с учётом множителя редкости: «+4 регенерации/с», «+20% крит»… (владелец 2026-09-06: «не видно, что даёт качество»). */
function statLines(t: (k: MessageKey, v?: Record<string, string | number>) => string, effects: { e: ItemEffect; m: number; extra?: boolean }[]): { text: string; extra: boolean }[] {
  const out: { text: string; extra: boolean }[] = [];
  const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;
  const num = (v: number, d = 0) => `${v > 0 ? "+" : ""}${d ? v.toFixed(d) : Math.round(v)}`;
  for (const { e, m, extra } of effects) {
    const add = (key: MessageKey, v: Record<string, string | number>) => out.push({ text: t(key, v), extra: !!extra });
    if (e.regen) add("arcade.stat.regen", { v: num(e.regen * m, 1) });
    if (e.lifesteal) add("arcade.stat.lifesteal", { v: pct(e.lifesteal * m) });
    if (e.armor) add("arcade.stat.armor", { v: num(e.armor * m) });
    if (e.attackSpeed) add("arcade.stat.attackSpeed", { v: pct(e.attackSpeed * m) });
    if (e.crit) add("arcade.stat.crit", { v: pct(e.crit * m) });
    if (e.damage) add("arcade.stat.damage", { v: num(e.damage * m) });
    if (e.moveSpeed) add("arcade.stat.moveSpeed", { v: pct(e.moveSpeed * m) });
    if (e.maxHp) add("arcade.stat.maxHp", { v: num(e.maxHp * m) });
    if (e.goldPerKill) add("arcade.stat.goldPerKill", { v: num(e.goldPerKill * m) });
    if (e.xpMult) add("arcade.stat.xpMult", { v: pct(e.xpMult * m) });
    if (e.cleave) add("arcade.stat.cleave", { v: (e.cleave * m).toFixed(1) });
    if (e.cooldown) add("arcade.stat.cooldown", { v: `${Math.round(e.cooldown * m * 100)}%` });
    if (e.stunImmune) out.push({ text: t("arcade.stat.stunImmune"), extra: !!extra });
  }
  return out;
}

function StatList({ effects }: { effects: { e: ItemEffect; m: number; extra?: boolean }[] }) {
  const { t } = useI18n();
  return (
    <ul className="arcade-stats">
      {statLines(t, effects).map((l, i) => <li key={i} data-extra={l.extra ? "true" : undefined}>{l.text}</li>)}
    </ul>
  );
}

/** Иконка способности из Dota (`art/abilities/<hero>_<q|w|e|r>.png`, scripts/dota_ability_icons.sh); нет файла — просто буква. */
/** Панель отладки звука (`?sfxdebug=1`): состояние AudioContext, кэш сэмплов, последние попытки и кнопка самопроверки — чтобы владелец мог прислать, что реально играет у него. */
function SfxDebugPanel({ hero }: { hero: string }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = window.setInterval(() => tick((n) => n + 1), 500); return () => window.clearInterval(id); }, []);
  const d = sfxDebug();
  const base = `${import.meta.env.BASE_URL}art/sfx/dota/`;
  return (
    <div className="arcade-sfxdebug" data-testid="arcade-sfxdebug">
      <b>SFX debug</b> · ctx <i>{d.state}</i> · master {d.master.toFixed(2)} · enabled {String(d.enabled)} · cached {d.cached} · failed {d.failed}
      <button type="button" onClick={() => { sfxSample(`${base}${hero}/attack_1.m4a`, 0.8); sfxSample(`${base}pack/enemies/kobold_death_1.m4a`, 0.8, 1, 0.5); sfxSample(`${base}voice/${hero}/spawn_1.mp3`, 0.9, 1, 1.2); }}>test: hit + kobold death + voice</button>
      <ol>{d.log.slice().reverse().map((e, i) => <li key={i} data-status={e.status}>{e.status} · {e.url}</li>)}</ol>
    </div>
  );
}

function AbilityIcon({ hero, k, size = 28 }: { hero: string; k: AbilityKey; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <b className="arcade-ability-icon arcade-ability-icon--fallback" style={{ width: size, height: size }}>{k.toUpperCase()}</b>;
  return <img className="arcade-ability-icon" data-pixel={PX ? "true" : undefined} src={`${import.meta.env.BASE_URL}art/${PX ? "abilities_px" : "abilities"}/${hero}_${k}.png`} alt="" width={size} height={size} draggable={false} onError={() => setFailed(true)} />;
}

function OfferCard({ offer, index, onPick }: { offer: Offer; index: number; onPick: () => void }) {
  const { t } = useI18n();
  const sim = getArcadeSim();
  if (offer.kind === "ability") {
    const lvl = (sim?.player.abilities[offer.key] ?? 0) + 1;
    return (
      <button type="button" className="arcade-offer" data-kind="ability" data-testid={`arcade-offer-${index}`} onClick={onPick}>
        <span className="arcade-offer__tag"><AbilityIcon hero={sim?.hero.id ?? "juggernaut"} k={offer.key} size={36} /> {t("arcade.offer.ability")} · {offer.key.toUpperCase()}</span>
        <strong>{t(`arcade.ab.${sim?.hero.kit ?? "juggernaut"}.${offer.key}` as MessageKey)}</strong>
        <small>{t("arcade.offer.point", { lvl })}</small>
        <p>{t(`arcade.ab.${sim?.hero.kit ?? "juggernaut"}.${offer.key}.desc` as MessageKey)}</p>
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
  if (def.legendary) {
    return (
      <button type="button" className="arcade-offer" data-kind="upgrade" data-rarity="legendary" data-testid={`arcade-offer-${index}`} onClick={onPick}>
        <span className="arcade-offer__tag"><ItemIcon pixel={PX} slug={def.art ?? SCHOOL_ART[def.school]} name={def.id} size="sm" /> {t("arcade.rarity.legendary")}{!def.neutral && <> · {t(`arcade.school.${def.school}` as MessageKey)}</>}</span>
        <strong>{t(`arcade.up.${def.id}` as MessageKey)}</strong>
        <small>{t("arcade.offer.legendaryHint")}</small>
        <p>{t(`arcade.up.${def.id}.desc` as MessageKey)}</p>
      </button>
    );
  }
  return (
    <button type="button" className="arcade-offer" data-kind="upgrade" data-rarity={offer.rarity} data-testid={`arcade-offer-${index}`} onClick={onPick}>
      <span className="arcade-offer__tag"><ItemIcon pixel={PX} slug={SCHOOL_ART[def.school]} name={def.school} size="sm" /> {def.requiresSchools ? t("arcade.offer.hybrid", { a: t(`arcade.school.${def.requiresSchools[0]}` as MessageKey), b: t(`arcade.school.${def.requiresSchools[1]}` as MessageKey) }) : <>{t(`arcade.school.${def.school}` as MessageKey)} · {t(`arcade.type.${def.type}` as MessageKey)}</>}</span>
      <strong>{t(`arcade.up.${def.id}` as MessageKey)}</strong>
      <small>{t(`arcade.rarity.${offer.rarity}` as MessageKey)} · {t("arcade.offer.rank", { rank, max: def.maxRank })}</small>
      <p>{t(`arcade.up.${def.id}.desc` as MessageKey)}</p>
    </button>
  );
}

/** Ввод реплея для вызова step() №`step`: последняя запись лога с шагом ≤ step. Лог короткий
 *  относительно числа шагов, поэтому линейный поиск с конца дешевле индекса. */
function replayInput(log: readonly (readonly number[])[], step: number): ArcadeInput {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e[0] <= step) return { mx: e[1], my: e[2], cast: e[3], choose: e[4], act: e[5] ?? 0 };
  }
  return { ...IDLE_INPUT };
}

async function copyText(text: string): Promise<void> {
  try { await navigator.clipboard.writeText(text); } catch { /* буфер недоступен (http/TMA) — молча */ }
}

function GearCard({ item, title }: { item: GearItem | null; title: string }) {
  const { t } = useI18n();
  if (!item) return <div className="arcade-offer arcade-offer--static" data-kind="gear"><span className="arcade-offer__tag">{title}</span><strong>—</strong><p>{t("arcade.loot.empty")}</p></div>;
  return (
    <div className="arcade-offer arcade-offer--static" data-kind="gear" data-rarity={item.rarity}>
      <span className="arcade-offer__tag"><ItemIcon pixel={PX} slug={gearArt(item)} name={item.base} size="sm" /> {title}</span>
      <strong>{t(`arcade.gearName.${item.base}` as MessageKey)}</strong>
      <small>{t(`arcade.rarity.${item.rarity}` as MessageKey)} · T{item.tier} · {t("arcade.loot.score", { n: gearScore(item) })}</small>
      <p>{item.affixes.map((a) => affixLabel(t, a.stat, a.value)).join(" · ")}</p>
    </div>
  );
}

function affixLabel(t: (k: MessageKey, v?: Record<string, string | number>) => string, stat: string, value: number): string {
  const pct = ["attackSpeed", "crit", "lifesteal", "cooldown", "moveSpeed", "xpMult"].includes(stat);
  return `+${pct ? Math.round(value * 100) + "%" : value} ${t(`arcade.affix.${stat}` as MessageKey)}`;
}
