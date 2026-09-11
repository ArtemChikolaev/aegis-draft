// Arcade (PRD §5.15): экран режима — настройка → сцена (canvas + HUD) → итог. Сим тикает в rAF-цикле
// сцены с фиксированным шагом (config.TICK_HZ), React рисует только HUD и оверлеи; сам мир — в
// renderer.ts. Пауза по Esc/Space, кнопке и visibilitychange; выход из забега — через confirm.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRun } from "../../state/runStore.ts";
import { MARK_IDS, bestArcadeEntry, equippedGear, getArcadeSim, hasActVictory, hasFullActVictory, masteryTitle, maxUnlockedRank, useArcade, type ArcadeProgress, type MarkId } from "../../state/arcadeStore.ts";
import { LEGACY_BRANCHES, LEGACY_MAX_RANK, LEGACY_PER_RANK, legacySpentTotal, type LegacyBranch } from "../../game/arcade/content/legacy.ts";
import { useTmaChrome } from "../../state/tmaChrome.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/core.ts";
import { DEV_FREE_SHOP, ARCADE, DT, TICK_HZ, sec } from "../../game/arcade/config.ts";
import { SCHOOL_ART, UPGRADE_BY_ID, upgradeFigures } from "../../game/arcade/content/schools.ts";
import type { PlayerStats } from "../../game/arcade/types.ts";
import { RANK_TIERS, STARS, rankOf, rankStep } from "../../game/arcade/content/ranks.ts";
import { ARCADE_ITEM_BY_ID, itemEffectsAt, type ItemEffect } from "../../game/arcade/content/items.ts";
import { HEROES, HERO_IDS, type HeroId } from "../../game/arcade/content/heroes.ts";
import { ENEMY_KINDS } from "../../game/arcade/content/enemies.ts";
import { dotaSheet, dotaSheetState, preloadArcadeArt } from "./sprites.ts";
import type { ArcadeSim } from "../../game/arcade/sim.ts";
import { ATTACK_MASK, AUTOATTACK_ACT, AUTOCAST_ACT, BAG_DROP_ACT, BAG_EQUIP_ACT, BUILD_ACT, IDLE_INPUT, PICKUP_ACT, SHOP_ACT, type ArcadeInput } from "../../game/arcade/types.ts";
import { arcadeDaily, decodeReplay, encodeReplay, isArcadeDailySeed, replayCompatible, replayUrl } from "../../game/arcade/replay.ts";
import { ARCADE_CONFIG_VERSION } from "../../game/arcade/config.ts";
import { TRAITS, TRAIT_IDS, traitUnlocked } from "../../game/arcade/content/traits.ts";
import { COSMETICS, COSMETIC_BY_ID, skinnedHero } from "../../game/arcade/content/cosmetics.ts";
import { NEUTRAL_BY_ID, NEUTRAL_ENCHANT_BY_ID } from "../../game/arcade/content/neutrals.ts";
import { GEAR_SLOTS, gearArt, gearScore, type GearItem, type GearSlot } from "../../game/arcade/content/gear.ts";
import type { AbilityKey, Offer, RuneKind } from "../../game/arcade/types.ts";
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
import { groupHeroes, recentHeroes } from "./heroPicker.ts";
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
  const progress = useArcade((s) => s.progress);
  const legacySpend = useArcade((s) => s.legacySpend);
  const legacyReset = useArcade((s) => s.legacyReset);
  const start = useArcade((s) => s.start);
  const rank = useArcade((s) => s.rank);
  const setRank = useArcade((s) => s.setRank);
  const heroId = useArcade((s) => s.hero);
  const setHero = useArcade((s) => s.setHero);
  const trait = useArcade((s) => s.trait);
  const setTrait = useArcade((s) => s.setTrait);
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
  // Избранные и недавние герои (владелец 2026-09-12): чтобы не искать в списке из 126 каждый раз.
  const favorites = useArcade((s) => s.favorites);
  const toggleFavorite = useArcade((s) => s.toggleFavorite);
  const [heroQuery, setHeroQuery] = useState("");
  const heroGroups = useMemo(() => groupHeroes(HERO_IDS, favorites, recentHeroes(history, HERO_IDS), heroQuery, (id) => heroOf(HEROES[id].dotaId).name), [favorites, history, heroQuery]);
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
  const unlocked = maxUnlockedRank(progress);
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
          <div className="arcade-heroes__tools">
            <input className="arcade-heroes__search" type="search" value={heroQuery} onChange={(e) => setHeroQuery(e.target.value)} placeholder={t("arcade.heroes.search")} aria-label={t("arcade.heroes.search")} data-testid="arcade-hero-search" />
            <small>{t("arcade.heroes.favHint")}</small>
          </div>
          <div className="arcade-heroes" data-testid="arcade-heroes">
            {(([["favorites", heroGroups.favorites], ["recent", heroGroups.recent], ["rest", heroGroups.rest]] as const).filter(([, ids]) => ids.length > 0)).map(([group, ids]) => (
              <Fragment key={group}>
                {(group !== "rest" || heroGroups.favorites.length > 0 || heroGroups.recent.length > 0) && <span className="arcade-heroes__group" data-testid={`arcade-heroes-group-${group}`}>{t(`arcade.heroes.${group}` as MessageKey)}</span>}
                {ids.map((id) => {
                  const fav = favorites.includes(id);
                  const def = HEROES[id];
                  const info = heroOf(def.dotaId);
                  return (
                    <button key={id} type="button" className="arcade-heroes__pick" data-active={id === heroId ? "true" : undefined} data-testid={`arcade-hero-${id}`} onClick={() => { if (id === heroId) { setWardrobe(id); return; } setHero(id); preloadHeroSfx(id); preloadHeroVoice(id); void preloadArcadeArt(id, Object.keys(ENEMY_KINDS), "short"); }}>
                      <span role="button" tabIndex={0} className="arcade-heroes__star" data-on={fav ? "true" : undefined} aria-label={t(fav ? "arcade.heroes.unfav" : "arcade.heroes.fav")} title={t(fav ? "arcade.heroes.unfav" : "arcade.heroes.fav")} data-testid={`arcade-hero-fav-${id}`} onClick={(e) => { e.stopPropagation(); toggleFavorite(id); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); toggleFavorite(id); } }}>{fav ? "★" : "☆"}</span>
                      <HeroThumb picture={info.picture || def.picture} name={info.name} size="md" layout="card" />
                      <small>{t(def.ranged ? "arcade.hero.ranged" : "arcade.hero.melee")}</small>
                      {(() => {
                        // Бейдж скина на карточке героя (владелец: «косметика по герою»): надетый — по редкости, иначе — сколько доступно.
                        const skins = COSMETICS.filter((c) => c.slot === "skin" && c.hero === id);
                        if (skins.length === 0) return null;
                        const on = wornSkin(id, cosmetics.skins[id]);
                        return on
                          ? <span className="arcade-heroes__skin" data-rarity={on.rarity} data-testid={`arcade-hero-skin-${id}`}>{t(on.rarity === "arcana" ? "arcade.rarity.arcana" : "arcade.cosmetics.persona")}</span>
                          : <span className="arcade-heroes__skin" data-testid={`arcade-hero-skins-${id}`}>{t("arcade.cosmetics.skinsCount", { n: skins.length })}</span>;
                      })()}
                    </button>

                  );
                })}
              </Fragment>
            ))}
            {heroGroups.favorites.length + heroGroups.recent.length + heroGroups.rest.length === 0 && <span className="arcade-heroes__empty">{t("arcade.heroes.none")}</span>}
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
          <div className="arcade-trait" data-testid="arcade-trait">
            <span className="arcade-setup__label">{t("arcade.trait.title")}</span>
            <div className="arcade-trait__row">
              <button type="button" className="arcade-rank__tier" data-active={trait === null ? "true" : undefined} data-testid="arcade-trait-base" onClick={() => setTrait(null)} title={t("arcade.trait.base.desc")}>{t("arcade.trait.base")}</button>
              {TRAIT_IDS.map((id) => {
                const marks = progress.perHero[heroId]?.marks.length ?? 0;
                const locked = !traitUnlocked(id, marks);
                return <button key={id} type="button" className="arcade-rank__tier" data-active={trait === id ? "true" : undefined} data-locked={locked ? "true" : undefined} disabled={locked} data-testid={`arcade-trait-${id}`} title={locked ? t("arcade.trait.locked", { n: TRAITS[id].unlockMarks }) : t(`arcade.trait.${id}.desc` as MessageKey)} onClick={() => setTrait(id)}>{t(`arcade.trait.${id}` as MessageKey)}</button>;
              })}
            </div>
            <small className="arcade-trait__desc">{trait ? t(`arcade.trait.${trait}.desc` as MessageKey) : t("arcade.trait.base.desc")}</small>
          </div>
          <MasteryPanel marks={progress.perHero[heroId]?.marks ?? []} />
        </Surface>
        <Surface className="arcade-setup__run">
          <div className="arcade-act" data-testid="arcade-act">
            {(["full", "dire", "river", "short"] as const).map((id) => {
              const locked = (id === "dire" && !hasFullActVictory(progress)) || (id === "river" && !hasActVictory(progress, "dire"));
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
          <LegacyPanel progress={progress} onSpend={legacySpend} onReset={legacyReset} />
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
  /** Раскрытый предмет в лавке: показываем его статы и описание, продажа — отдельной кнопкой. */
  const [openItem, setOpenItem] = useState<number | null>(null);
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
  const lastSeals = useArcade((s) => s.lastSeals);
  // Экипировка на старте забега — часть кода реплея (детерминизм): снимок берём один раз при монтировании.
  const startGear = useRef<GearItem[]>(equippedGear(useArcade.getState().gear)).current;
  /** Снимок пунктов наследия на старте: в код реплея, чтобы зритель видел ту же силу, а не свою. Дейлик — без. */
  const startLegacy = useRef(isArcadeDailySeed(useArcade.getState().seed) ? undefined : { ...useArcade.getState().progress.legacy.spent }).current;
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
    // Подбор (G / Enter) и экран сборки (Tab / I) — через `act` в сим: попадают в input-лог, реплей повторяет.
    controller.onPickup = () => { const cur = getArcadeSim(); if (cur && (cur.nearLoot || cur.nearPond || (cur.nearForge && cur.forgeReady()) || (cur.nearRift && cur.riftReady())) && !cur.lootOpen && !cur.pondOpen && !cur.forgeOpen && !cur.riftOpen && !cur.buildOpen) controller.queueAct(PICKUP_ACT); };
    controller.onFlare = () => { if (useArcade.getState().status === "running") renderer.flare(performance.now()); };
    controller.onBuild = () => { const cur = getArcadeSim(); if (cur && !cur.pending && !cur.shopOpen && !cur.neutralOpen && !cur.lootOpen && useArcade.getState().status === "running") controller.queueAct(BUILD_ACT); };
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
    let wasPond = false;
    let wasContract = false;
    let wasForge = false;
    let wasRift = false;
    let seen = { hits: 0, crits: 0, casts: 0, ults: 0, hurt: 0, kills: 0, eliteKills: 0, pickups: 0, camps: 0, outposts: 0, contracts: 0, ambushes: 0, rifts: 0, caravans: 0 };
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
      if (ev.camps > seen.camps) { sfxArcade("elite"); if (!prefersReducedMotion()) hitStop = 8; }
      if (ev.outposts > seen.outposts) sfxArcade("levelup");
      if (ev.contracts > seen.contracts) { sfxArcade("elite"); if (!prefersReducedMotion()) hitStop = 8; }
      if (ev.rifts > seen.rifts) { sfxArcade("elite"); if (!prefersReducedMotion()) hitStop = 10; }
      if (ev.caravans > seen.caravans) { sfxBuy(); bump(); }
      if (ev.ambushes > seen.ambushes) sfxArcade("crit"); // метка засады — звук-предупреждение
      seen = { ...ev };
      stage.dataset.hurt = now < hurtUntil ? "true" : "";
      stage.dataset.lowhp = sim.player.hp / sim.player.stats.maxHp < 0.3 && !sim.over ? "true" : "";
      if (replayRef.current && (sim.pending || sim.shopOpen || sim.neutralOpen)) sim.step(replayInput(replayRef.current, sim.steps));
      if (sim.pending && !wasPending) { if (!handled.levelup) sfxArcade("levelup"); bump(); }
      if ((sim.shopOpen && !wasShop) || (sim.neutralOpen && !wasNeutral) || (sim.pondOpen && !wasPond) || (sim.contractOpen && !wasContract) || (sim.forgeOpen && !wasForge) || (sim.riftOpen && !wasRift)) { sfxBuy(); bump(); }
      wasContract = sim.contractOpen;
      wasForge = sim.forgeOpen;
      wasRift = sim.riftOpen;
      wasNeutral = sim.neutralOpen;
      wasPond = sim.pondOpen;
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
  const boss = sim?.roshan?.alive ? sim.roshan : sim?.ancient?.alive ? sim.ancient : sim?.defiler?.alive && sim.playerAtCamp() ? sim.defiler : sim?.centaur?.alive && sim.playerAtGrove() ? sim.centaur : sim?.necromancer?.alive && sim.playerAtBarrow() ? sim.necromancer : sim?.thunder?.alive && sim.playerAtLair() ? sim.thunder : sim?.warden?.alive && sim.playerAtFord() ? sim.warden : sim?.stalker?.alive && sim.playerAtDen() ? sim.stalker : sim?.hunter?.alive ? sim.hunter : null;

  return (
    <main className="arcade" data-testid="arcade-stage">
      <div className="arcade__stage" ref={stageRef}>
        <canvas ref={canvasRef} className="arcade__canvas" />
        {sim && p && (
          <div className="arcade-hud" aria-live="off">
            <div className="arcade-hud__upper">
            <div className="arcade-hud__top">
              <span className="arcade-hud__clock" data-testid="arcade-clock" data-paused={sim.riftActive() ? "true" : undefined}>{formatClock(sim.actTick)}</span>
              <span className="arcade-hud__stats">
                <span>{t("arcade.hud.kills")} <b>{p.kills}</b></span>
                <span>{t("arcade.hud.gold")} <b>{p.gold}</b></span>
                {replayLog && <Chip>{t("arcade.hud.replay")}</Chip>}
                {isArcadeDailySeed(seed) && <Chip>{t("arcade.hud.daily")}</Chip>}
                {p.aegis && <Chip>{t("arcade.hud.aegis")}</Chip>}
                {sim.hero.signature && (sim.hero.signature.kind === "souls" || sim.hero.signature.kind === "swipes") && <Chip>{t(`arcade.sig.${sim.hero.signature.kind}` as MessageKey)} {p.stacks}{sim.hero.signature.cap ? `/${sim.hero.signature.cap}` : ""}</Chip>}
                {sim.tick < sim.greedUntil && <Chip>{t("arcade.hud.greed")} {formatClock(sim.greedUntil - sim.tick)}</Chip>}
                {sim.outpost && !sim.outpost.captured && sim.playerAtOutpost() && <Chip data-testid="arcade-outpost-chip">{t("arcade.hud.outpost", { pct: Math.floor((sim.outpost.progress / sim.outpost.need) * 100) })}</Chip>}
                {sim.contract && !sim.contract.done && <Chip data-testid="arcade-contract-chip">{t("arcade.hud.contract", { target: t(`arcade.contract.target.${sim.contract.target}` as MessageKey), reward: t(`arcade.contract.reward.${sim.contract.reward}` as MessageKey) })}</Chip>}
                {sim.player.curse && <Chip data-testid="arcade-curse-chip">{t(`arcade.curse.${sim.player.curse}` as MessageKey)}{sim.player.curse === "debt" ? ` · ${sim.player.debtLeft}` : ""}</Chip>}
                {sim.caravan && (sim.caravan.state === "moving" || (sim.caravan.state === "waiting" && sim.playerEscorting())) && <Chip data-testid="arcade-caravan-chip">{t("arcade.hud.caravan", { pct: Math.round(sim.caravanProgress() * 100) })}</Chip>}
                {sim.pit && sim.tidePhase().phase !== "low" && <Chip data-testid="arcade-tide-chip">{t(sim.tidePhase().phase === "high" ? "arcade.hud.tideHigh" : "arcade.hud.tideWarn", { time: formatClock(sim.tidePhase().left) })}</Chip>}
                {sim.riftActive() && <Chip data-testid="arcade-rift-chip">{t("arcade.hud.rift", { rule: t(`arcade.rift.rule.${sim.rift!.rule}` as MessageKey), time: formatClock(sim.riftLeft()) })}</Chip>}
                {sim.camp && !sim.camp.cleared && sim.playerAtCamp() && <Chip data-testid="arcade-camp-chip">{t("arcade.hud.camp", { n: sim.totemsAlive(), total: sim.camp.totems })}</Chip>}
                <span className="arcade-hud__rank">{t(`arcade.tier.${sim.rank.tier}` as MessageKey)} {"★".repeat(sim.rank.stars)}</span>
              </span>
              <Button variant="secondary" className="arcade-hud__build" data-testid="arcade-build-open" onClick={() => controllerRef.current?.onBuild?.()}>{t("arcade.build.open")}</Button>
              <Button variant="secondary" className="arcade-hud__pause" onClick={() => (status === "paused" ? resume() : pause())}>{status === "paused" ? t("arcade.hud.resume") : t("arcade.hud.pauseBtn")}</Button>
            </div>
            <div className="arcade-hud__gear" data-testid="arcade-hud-gear">
              {GEAR_SLOTS.map((slot) => { const g = p.gear[slot] as GearItem | undefined; return <span key={slot} className="arcade-hud__item" data-rarity={g?.rarity} title={g ? t(`arcade.gearName.${g.base}` as MessageKey) : t(`arcade.gear.slot.${slot}` as MessageKey)}>{g ? <ItemIcon pixel={PX} slug={gearArt(g)} name={g.base} size="sm" /> : <i className="arcade-hud__slot-empty" />}</span>; })}
              {p.bag.length > 0 && <span className="arcade-hud__bag">{t("arcade.gear.bag", { n: p.bag.length, max: ARCADE.loot.bagCap })}</span>}
            </div>
            <BuffBar sim={sim} />
            {boss && (
              <div className="arcade-hud__boss">
                <span>{boss.kind.id === "satyr_defiler" ? t("arcade.hud.defiler", { shield: Math.round(ARCADE.defiler.shieldPerTotem * sim!.totemsAlive() * 100) }) : boss.kind.id === "centaur_warden" ? t(sim!.tick < boss.stunUntil ? "arcade.hud.centaurStunned" : "arcade.hud.centaur") : boss.kind.id === "troll_necromancer" ? t(sim!.idolsAlive() > 0 ? "arcade.hud.necro" : "arcade.hud.necroExposed", { n: sim!.idolsAlive(), total: ARCADE.necro.idols }) : boss.kind.id === "thunder_golem" ? t("arcade.hud.thunder") : boss.kind.id === "river_warden" ? t(sim!.wardenShielded() ? "arcade.hud.wardenShield" : "arcade.hud.wardenOpen") : boss.kind.id === "dire_stalker" ? t(sim!.stalkerHidden() ? "arcade.hud.stalkerHidden" : "arcade.hud.stalkerOpen") : t(boss.kind.structure ? "arcade.hud.ancient" : "arcade.hud.roshan")}</span>
                <div className="arcade-bar arcade-bar--boss"><i style={{ width: `${Math.max(0, boss.hp / boss.maxHp) * 100}%` }} /></div>
              </div>
            )}
            </div>
            {!sim.nearLoot && !sim.nearPond && sim.nearForge && !sim.forgeOpen && !sim.lootOpen && !sim.buildOpen && status === "running" && (
              <button type="button" className="arcade-hud__pickup" data-testid="arcade-forge-open" disabled={!sim.forgeReady()} onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); controllerRef.current?.onPickup?.(); }}>
                <b>{t("arcade.forge.open")}</b>
                <span>{sim.forgeReady() ? t("arcade.forge.openHint") : t("arcade.forge.cold", { time: formatClock(ARCADE.forge.fromTick[sim.act]) })}</span>
                <small>G</small>
              </button>
            )}
            {!sim.nearLoot && !sim.nearPond && !sim.nearForge && sim.nearRift && !sim.riftOpen && !sim.lootOpen && !sim.buildOpen && status === "running" && (
              <button type="button" className="arcade-hud__pickup" data-testid="arcade-rift-open" disabled={!sim.riftReady()} onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); controllerRef.current?.onPickup?.(); }}>
                <b>{t("arcade.rift.open")}</b>
                <span>{sim.riftReady() ? t("arcade.rift.openHint", { sec: Math.round(ARCADE.rift.duration / 60) }) : t("arcade.rift.cold", { time: formatClock(ARCADE.rift.fromTick[sim.act]) })}</span>
                <small>G</small>
              </button>
            )}
            {!sim.nearLoot && sim.nearPond && !sim.pondOpen && !sim.lootOpen && !sim.buildOpen && status === "running" && (
              <button type="button" className="arcade-hud__pickup" data-testid="arcade-pond-open" onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); controllerRef.current?.onPickup?.(); }}>
                <b>{t("arcade.pond.open")}</b>
                <span>{t(sim.player.curse ? "arcade.pond.openCursed" : "arcade.pond.openHint")}</span>
                <small>G</small>
              </button>
            )}
            {sim.nearLoot && !sim.lootOpen && !sim.buildOpen && status === "running" && (
              <button type="button" className="arcade-hud__pickup" data-testid="arcade-pickup" onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); controllerRef.current?.onPickup?.(); }}>
                {sim.nearLoot.item && <ItemIcon pixel={PX} slug={gearArt(sim.nearLoot.item as GearItem)} name={sim.nearLoot.item.base} size="sm" />}
                <b>{sim.nearLoot.kind === "chest" ? t("arcade.loot.pickupChest") : t("arcade.loot.pickup")}</b>
                {sim.nearLoot.item && <span data-rarity={sim.nearLoot.item.rarity}>{t(`arcade.gearName.${sim.nearLoot.item.base}` as MessageKey)}</span>}
                <small>G</small>
              </button>
            )}
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
        {sim?.riftOpen && sim.rift && status !== "over" && (
          <div className="arcade-overlay" data-testid="arcade-rift">
            <div className="arcade-levelup arcade-shop">
              <Eyebrow>{t("arcade.rift.title")}</Eyebrow>
              <h2>{t("arcade.rift.pick")}</h2>
              <p className="arcade-shop__hint">{t("arcade.rift.hint", { sec: Math.round(ARCADE.rift.duration / 60), rest: Math.round(ARCADE.rift.respite / 60) })}</p>
              <div className="arcade-overlay__actions arcade-shop__actions">
                {sim.rift.offered.map((r, i) => (
                  <Button key={r} variant={i === 0 ? "primary" : "secondary"} data-testid={`arcade-rift-${i + 1}`} onClick={() => shopAct(i + 1)}>{t(`arcade.rift.rule.${r}` as MessageKey)} · {t(`arcade.rift.rule.${r}.desc` as MessageKey)}</Button>
                ))}
                <Button variant="leave" data-testid="arcade-rift-leave" onClick={() => shopAct(SHOP_ACT.close)}>{t("arcade.rift.leave")}</Button>
              </div>
            </div>
          </div>
        )}
        {sim?.forgeOpen && status !== "over" && (
          <div className="arcade-overlay" data-testid="arcade-forge">
            <div className="arcade-levelup arcade-shop arcade-build">
              <Eyebrow>{t("arcade.forge.title")}</Eyebrow>
              <h2>{sim.forgeSlot < 0 ? t("arcade.forge.pickItem") : t("arcade.forge.pickAction")}</h2>
              <p className="arcade-shop__hint">{t("arcade.forge.hint")}</p>
              <div className="arcade-forge__gear">
                {GEAR_SLOTS.map((slot, i) => {
                  const item = (sim.player.gear[slot] as GearItem | undefined) ?? null;
                  return (
                    <button key={slot} type="button" className="arcade-forge__slot" data-active={sim.forgeSlot === i ? "true" : undefined} disabled={!item} data-testid={`arcade-forge-slot-${slot}`} onClick={() => shopAct(10 + i)}>
                      <GearCard item={item} title={t(`arcade.gear.slot.${slot}` as MessageKey)} compact />
                    </button>
                  );
                })}
              </div>
              <div className="arcade-overlay__actions arcade-shop__actions">
                {(["temper", "reforge", "sacrifice"] as const).map((k, i) => (
                  <Button key={k} variant={i === 0 ? "primary" : "secondary"} data-testid={`arcade-forge-${k}`} disabled={sim.forgeSlot < 0 || sim.player.gold < (DEV_FREE_SHOP ? 0 : sim.forgePrice(k))} onClick={() => shopAct(i + 1)}>{t(`arcade.forge.${k}` as MessageKey)} · {DEV_FREE_SHOP ? 0 : sim.forgePrice(k)}</Button>
                ))}
                <Button variant="leave" data-testid="arcade-forge-leave" onClick={() => shopAct(SHOP_ACT.close)}>{t("arcade.forge.leave")}</Button>
              </div>
            </div>
          </div>
        )}
        {sim?.contractOpen && status !== "over" && (
          <div className="arcade-overlay" data-testid="arcade-contract">
            <div className="arcade-levelup arcade-shop">
              <Eyebrow>{t("arcade.contract.title")}</Eyebrow>
              <h2>{t("arcade.contract.pick")}</h2>
              <p className="arcade-shop__hint">{t("arcade.contract.hint")}</p>
              <div className="arcade-overlay__actions arcade-shop__actions">
                {sim.contractOffers.map((o, i) => (
                  <Button key={o.target} variant={i === 0 ? "primary" : "secondary"} data-testid={`arcade-contract-${i + 1}`} onClick={() => shopAct(i + 1)}>{t(`arcade.contract.target.${o.target}` as MessageKey)} → {t(`arcade.contract.reward.${o.reward}` as MessageKey)}</Button>
                ))}
                <Button variant="leave" data-testid="arcade-contract-skip" onClick={() => shopAct(SHOP_ACT.close)}>{t("arcade.contract.skip")}</Button>
              </div>
            </div>
          </div>
        )}
        {sim?.pondOpen && status !== "over" && (
          <div className="arcade-overlay" data-testid="arcade-pond">
            <div className="arcade-levelup arcade-shop">
              <Eyebrow>{t("arcade.pond.title")}</Eyebrow>
              <h2>{t("arcade.pond.pick")}</h2>
              <p className="arcade-shop__hint">{t("arcade.pond.hint")}</p>
              <div className="arcade-overlay__actions arcade-shop__actions">
                <Button variant="primary" data-testid="arcade-pond-heal" onClick={() => shopAct(1)}>{t("arcade.pond.heal", { pct: Math.round(ARCADE.pond.healFrac * 100) })}</Button>
                <Button variant="secondary" data-testid="arcade-pond-cleanse" disabled={!sim.player.curse} onClick={() => shopAct(2)}>{sim.player.curse ? t("arcade.pond.cleanse", { curse: t(`arcade.curse.${sim.player.curse}` as MessageKey) }) : t("arcade.pond.cleanseNone")}</Button>
                <Button variant="leave" data-testid="arcade-pond-leave" onClick={() => shopAct(SHOP_ACT.close)}>{t("arcade.pond.leave")}</Button>
              </div>
            </div>
          </div>
        )}
        {sim?.lootOpen && status !== "over" && (
          <div className="arcade-overlay" data-testid="arcade-loot">
            <div className="arcade-levelup arcade-shop">
              <Eyebrow>{t("arcade.loot.title")}</Eyebrow>
              <h2>{t(`arcade.gearName.${sim.lootOpen.base}` as MessageKey)}</h2>
              <p className="arcade-shop__hint">{t(`arcade.gear.slot.${sim.lootOpen.slot}` as MessageKey)} · {t(`arcade.rarity.${sim.lootOpen.rarity}` as MessageKey)} · T{sim.lootOpen.tier}{sim.lootOpen.unique ? ` · ${t("arcade.loot.unique")}` : ""}</p>
              {sim.lootCursed && <p className="arcade-shop__hint arcade-loot__cursed" data-testid="arcade-loot-cursed">{t(`arcade.loot.cursed.${sim.lootCurse}` as MessageKey, { debt: Math.round(ARCADE.curse.debt.base + ARCADE.curse.debt.perMin * sim.tick / 3600), pct: Math.round(ARCADE.curse.debt.share * 100) })}</p>}
              <div className="arcade-offers arcade-loot__compare">
                <GearCard item={sim.lootOpen} title={t("arcade.loot.found")} />
                <GearCard item={(sim.player.gear[sim.lootOpen.slot] as GearItem | undefined) ?? null} title={t("arcade.loot.current")} />
              </div>
              {sim.player.bag.length >= ARCADE.loot.bagCap && (
                <div className="arcade-bag" data-testid="arcade-loot-bagfull">
                  <p className="arcade-shop__hint">{t("arcade.loot.bagFull")}</p>
                  <BagList bag={sim.player.bag as GearItem[]} onDrop={(i) => shopAct(BAG_DROP_ACT + i)} dropLabel={t("arcade.loot.drop")} />
                </div>
              )}
              <div className="arcade-overlay__actions arcade-shop__actions">
                <Button variant="primary" data-testid="arcade-loot-equip" onClick={() => shopAct(1)}>{t("arcade.loot.equip")}</Button>
                <Button variant="secondary" data-testid="arcade-loot-bag" disabled={sim.player.bag.length >= ARCADE.loot.bagCap} onClick={() => shopAct(2)}>{t("arcade.gear.bag", { n: sim.player.bag.length, max: ARCADE.loot.bagCap })}</Button>
                <Button variant="leave" data-testid="arcade-loot-leave" onClick={() => shopAct(SHOP_ACT.close)}>{t("arcade.loot.leave")}</Button>
              </div>
            </div>
          </div>
        )}
        {sim?.buildOpen && status !== "over" && (
          <div className="arcade-overlay" data-testid="arcade-build">
            <div className="arcade-levelup arcade-shop arcade-build">
              <Eyebrow>{t("arcade.build.title")}</Eyebrow>
              <h2>{hero.name}</h2>
              <section className="arcade-build__section">
                <small className="arcade-build__label">{t("arcade.build.gear")}</small>
                <div className="arcade-build__gear">
                  {GEAR_SLOTS.map((slot) => <GearCard key={slot} item={(sim.player.gear[slot] as GearItem | undefined) ?? null} title={t(`arcade.gear.slot.${slot}` as MessageKey)} compact />)}
                </div>
              </section>
              <section className="arcade-build__section">
                <small className="arcade-build__label">{t("arcade.build.stats")}</small>
                <ul className="arcade-stats arcade-build__stats" data-testid="arcade-build-stats">
                  {([
                    ["hp", `${Math.ceil(sim.player.hp)} / ${sim.player.stats.maxHp}`],
                    ["regen", sim.player.stats.regen.toFixed(1)],
                    ["armor", String(Math.round(sim.player.stats.armor))],
                    ["damage", String(Math.round(sim.player.stats.damage))],
                    ["attackRate", (1 / sim.player.stats.attackInterval).toFixed(2)],
                    ["crit", `${Math.round(sim.player.stats.critChance * 100)}% · ×${sim.player.stats.critMult.toFixed(1)}`],
                    ["lifesteal", `${Math.round(sim.player.stats.lifesteal * 100)}%`],
                    ["cooldown", `${Math.round(sim.player.stats.cooldown * 100)}%`],
                    ["speed", String(Math.round(sim.player.stats.speed))],
                    ["pickup", String(Math.round(sim.player.stats.pickup))],
                    ["goldPerKill", String(sim.player.stats.goldPerKill)],
                    ["xpMult", `${Math.round((1 + sim.player.stats.xpMult) * 100)}%`],
                  ] as [string, string][]).map(([k, v]) => <li key={k}><span>{t(`arcade.stats.${k}` as MessageKey)}</span> <b>{v}</b></li>)}
                </ul>
              </section>
              <section className="arcade-build__section">
                <small className="arcade-build__label">{t("arcade.build.bag")} {sim.player.bag.length}/{ARCADE.loot.bagCap}</small>
                {sim.player.bag.length === 0
                  ? <p className="arcade-shop__hint">{t("arcade.build.bagEmpty")}</p>
                  : <BagList bag={sim.player.bag as GearItem[]} onEquip={(i) => controllerRef.current?.queueAct(BAG_EQUIP_ACT + i)} onDrop={(i) => controllerRef.current?.queueAct(BAG_DROP_ACT + i)} equipLabel={t("arcade.build.equip")} dropLabel={t("arcade.loot.drop")} />}
              </section>
              <section className="arcade-build__section">
                <small className="arcade-build__label">{t("arcade.build.skills")}</small>
                {Object.keys(sim.player.upgrades).length === 0 && sim.player.talents.length === 0
                  ? <p className="arcade-shop__hint">{t("arcade.build.skillsEmpty")}</p>
                  : (
                    <div className="arcade-build__skills">
                      {Object.entries(sim.player.upgrades).map(([id, u]) => {
                        const def = UPGRADE_BY_ID[id];
                        return (
                          <span key={id} className="arcade-build__skill" data-legendary={def?.legendary ? "true" : undefined} title={t(`arcade.up.${id}.desc` as MessageKey)}>
                            <ItemIcon pixel={PX} slug={def?.art ?? SCHOOL_ART[def?.school ?? "radiance"]} name={id} size="sm" />
                            <b>{t(`arcade.up.${id}` as MessageKey)}</b>
                            <small>{def?.legendary ? t("arcade.build.legendary") : t("arcade.build.rank", { n: u.rank })}</small>
                          </span>
                        );
                      })}
                      {sim.player.talents.map((id) => (
                        <span key={id} className="arcade-build__skill" data-talent="true">
                          <b>{t(`arcade.t.${id}` as MessageKey)}</b>
                          <small>{t("arcade.offer.talent")}</small>
                        </span>
                      ))}
                    </div>
                  )}
              </section>
              {(sim.player.items.length > 0 || sim.player.neutral) && (
                <section className="arcade-build__section">
                  <small className="arcade-build__label">{t("arcade.build.items")}</small>
                  <div className="arcade-build__skills">
                    {sim.player.neutral && (
                      <span className="arcade-build__skill" data-neutral="true" title={t(`arcade.neutral.${sim.player.neutral}.desc` as MessageKey)}>
                        <ItemIcon pixel={PX} slug={sim.player.neutral} name={sim.player.neutral} size="sm" />
                        <b>{sim.player.neutralEnchant ? `${t(`arcade.enchant.${sim.player.neutralEnchant}` as MessageKey)} ` : ""}{t(`arcade.neutral.${sim.player.neutral}` as MessageKey)}</b>
                        <small>{t("arcade.build.neutral")}</small>
                      </span>
                    )}
                    {sim.player.items.map((it, i) => (
                      <span key={`${it.id}:${i}`} className="arcade-build__skill" data-rarity={it.rarity} title={t(`arcade.item.${it.id}.desc` as MessageKey)}>
                        <ItemIcon pixel={PX} slug={ARCADE_ITEM_BY_ID[it.id]?.art ?? it.id} name={it.id} size="sm" />
                        <b>{t(`arcade.item.${it.id}` as MessageKey)}</b>
                        <small>{t(`arcade.rarity.${it.rarity}` as MessageKey)}</small>
                      </span>
                    ))}
                  </div>
                </section>
              )}
              <div className="arcade-overlay__actions arcade-shop__actions">
                <Button variant="primary" data-testid="arcade-build-close" onClick={() => controllerRef.current?.queueAct(BUILD_ACT)}>{t("arcade.build.close")}</Button>
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
                    <StatList effects={[{ e: n.effect, m: 1 }, ...(sim.neutralEnchants[i] && NEUTRAL_ENCHANT_BY_ID[sim.neutralEnchants[i]] ? [{ e: NEUTRAL_ENCHANT_BY_ID[sim.neutralEnchants[i]].effect, m: n.tier, extra: true }] : [])]} now={sim.player.stats} />
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
              {sim.shopPriceMult() < 1 && <p className="arcade-shop__hint arcade-shop__discount" data-testid="arcade-shop-discount">{t("arcade.shop.caravanDiscount", { pct: Math.round((1 - sim.shopPriceMult()) * 100) })}</p>}
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
                      <StatList effects={itemEffectsAt(def, offer.rarity)} now={sim.player.stats} />
                      {(offer.rarity === "standard" || offer.rarity === "refined") && def.extras && <small className="arcade-offer__more">{t("arcade.shop.moreAtExotic")}</small>}
                    </button>
                  );
                })}
              </div>
              {sim.player.items.length > 0 && (
                <div className="arcade-shop__owned" data-testid="arcade-shop-owned">
                  <span className="arcade-shop__owned-title">{t("arcade.shop.owned")}</span>
                  {sim.player.items.map((it, i) => {
                    // Владелец 2026-09-06: «в лавке видно только цену продажи, а характеристик нет».
                    // Тычок раскрывает предмет — статы и описание; продажа отдельной кнопкой, чтобы
                    // случайное касание не продавало сборку.
                    const def = ARCADE_ITEM_BY_ID[it.id];
                    const open = openItem === i;
                    return (
                      <div key={`${it.id}-${i}`} className="arcade-shop__item" data-open={open ? "true" : undefined}>
                        <button type="button" className="arcade-shop__sell" data-rarity={it.rarity} data-testid={`arcade-shop-item-${i}`} aria-expanded={open} onClick={() => setOpenItem(open ? null : i)}>
                          <ItemIcon pixel={PX} slug={def?.art ?? it.id} name={it.id} size="sm" />
                          <span>{t(`arcade.item.${it.id}` as MessageKey)}</span>
                          <small>{t(`arcade.rarity.${it.rarity}` as MessageKey)}</small>
                        </button>
                        {open && (
                          <div className="arcade-shop__details" data-testid={`arcade-shop-details-${i}`}>
                            {def && <StatList effects={itemEffectsAt(def, it.rarity)} />}
                            <p>{t(`arcade.item.${it.id}.desc` as MessageKey)}</p>
                            <Button variant="leave" data-testid={`arcade-shop-sell-${i}`} onClick={() => { setOpenItem(null); shopAct(SHOP_ACT.sellBase + i); }}>
                              {t("arcade.shop.sell", { gold: sim.itemSellPrice(it) })}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
              <Eyebrow>{sim.pendingSource === "camp" ? t("arcade.camp.title") : t("arcade.levelUp", { n: sim.player.level })}</Eyebrow>
              <h2>{sim.pendingSource === "camp" ? t("arcade.camp.pick") : t("arcade.pick")}</h2>
              <p className="arcade-shop__hint">{sim.pendingSource === "camp" ? t("arcade.camp.hint") : t("arcade.pickHint")}</p>
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
                {sim.pendingSource !== "camp" && <Button variant="secondary" data-testid="arcade-levelup-reroll" disabled={sim.player.gold < sim.levelRerollPrice()} onClick={() => levelReroll()}>{t("arcade.levelup.reroll", { gold: sim.levelRerollPrice() })}</Button>}
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
                {outcome.campsCleared > 0 && <div><dt>{t("arcade.over.camp")}</dt><dd>{t("arcade.over.campYes")}</dd></div>}
                {outcome.outpostCaptured && <div><dt>{t("arcade.over.outpost")}</dt><dd>{t("arcade.over.outpostYes")}</dd></div>}
                {outcome.centaurSlain && <div><dt>{t("arcade.over.centaur")}</dt><dd>{t("arcade.over.centaurYes")}</dd></div>}
                {outcome.necromancerSlain && <div><dt>{t("arcade.over.necro")}</dt><dd>{t("arcade.over.necroYes")}</dd></div>}
                {outcome.thunderSlain && <div><dt>{t("arcade.over.thunder")}</dt><dd>{t("arcade.over.thunderYes")}</dd></div>}
                {outcome.wardenSlain && <div><dt>{t("arcade.over.warden")}</dt><dd>{t("arcade.over.wardenYes")}</dd></div>}
                {outcome.stalkerSlain && <div><dt>{t("arcade.over.stalker")}</dt><dd>{t("arcade.over.stalkerYes")}</dd></div>}
                {outcome.contractDone && <div><dt>{t("arcade.contract.title")}</dt><dd>{t("arcade.over.contractYes")}</dd></div>}
                {outcome.forged && <div><dt>{t("arcade.forge.title")}</dt><dd>{t("arcade.over.forgedYes")}</dd></div>}
                {outcome.trait && <div><dt>{t("arcade.trait.title")}</dt><dd>{t(`arcade.trait.${outcome.trait}` as MessageKey)}</dd></div>}
                {outcome.caravanDone && <div><dt>{t("arcade.caravan.title")}</dt><dd>{t("arcade.over.caravanYes")}</dd></div>}
                {outcome.riftDone && outcome.riftRule && <div><dt>{t("arcade.rift.title")}</dt><dd>{t("arcade.over.riftYes", { rule: t(`arcade.rift.rule.${outcome.riftRule}` as MessageKey) })}</dd></div>}
                {outcome.cursesTaken > 0 && <div><dt>{t("arcade.over.curses")}</dt><dd>{outcome.cursed ? t("arcade.over.cursesLeft", { n: outcome.cursesTaken }) : t("arcade.over.cursesCleansed", { n: outcome.cursesTaken })}</dd></div>}
              </dl>
              {lastSeals > 0 && <p className="arcade-result__seals" data-testid="arcade-seals-result">{t("arcade.legacy.earned", { n: lastSeals })}</p>}
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
                  <Button variant="secondary" data-testid="arcade-copy-replay" onClick={() => { void copyText(encodeReplay({ seed, hero: sim.hero.id, rank: sim.rank.step, act: sim.act, version: ARCADE_CONFIG_VERSION, log: sim.log, gear: startGear, legacy: startLegacy, trait: sim.trait?.id })).then(() => setCopied("code")); }}>{copied === "code" ? t("arcade.replay.copied") : t("arcade.replay.copy")}</Button>
                  <Button variant="secondary" onClick={() => { void copyText(replayUrl(encodeReplay({ seed, hero: sim.hero.id, rank: sim.rank.step, act: sim.act, version: ARCADE_CONFIG_VERSION, log: sim.log, gear: startGear, legacy: startLegacy, trait: sim.trait?.id }), window.location.origin, window.location.pathname)).then(() => setCopied("link")); }}>{copied === "link" ? t("link.copied") : t("link.copy")}</Button>
                  <Button variant="secondary" data-testid="arcade-watch-replay" onClick={() => startReplay({ seed, hero: sim.hero.id, rank: sim.rank.step, act: sim.act, version: ARCADE_CONFIG_VERSION, log: [...sim.log], gear: startGear, legacy: startLegacy })}>{t("arcade.replay.watch")}</Button>
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
function statLines(t: (k: MessageKey, v?: Record<string, string | number>) => string, effects: { e: ItemEffect; m: number; extra?: boolean }[], now?: PlayerStats): { text: string; extra: boolean; after?: string }[] {
  const out: { text: string; extra: boolean; after?: string }[] = [];
  const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;
  const num = (v: number, d = 0) => `${v > 0 ? "+" : ""}${d ? v.toFixed(d) : Math.round(v)}`;
  // «Сейчас → после»: чтобы было видно, что предмет реально меняет (владелец 2026-09-07: «берёшь
  // cooldown — а ничего не изменяется»). Скорость атаки и бега — множители к базе, показываем итог в %.
  const p1 = (v: number) => `${Math.round(v * 100)}%`;
  const nowAfter = (key: keyof PlayerStats | "attackSpeed" | "moveSpeed" | "crit", delta: number): string | undefined => {
    if (!now) return undefined;
    switch (key) {
      case "regen": return `${now.regen.toFixed(1)} → ${(now.regen + delta).toFixed(1)}`;
      case "armor": return `${Math.round(now.armor)} → ${Math.round(now.armor + delta)}`;
      case "damage": return `${Math.round(now.damage)} → ${Math.round(now.damage + delta)}`;
      case "maxHp": return `${Math.round(now.maxHp)} → ${Math.round(now.maxHp + delta)}`;
      case "goldPerKill": return `${now.goldPerKill} → ${now.goldPerKill + delta}`;
      case "lifesteal": return `${p1(now.lifesteal)} → ${p1(now.lifesteal + delta)}`;
      case "crit": return `${p1(now.critChance)} → ${p1(now.critChance + delta)}`;
      case "cooldown": return `−${p1(now.cooldown)} → −${p1(Math.min(0.75, now.cooldown + delta))}`;
      case "xpMult": return `${p1(1 + now.xpMult)} → ${p1(1 + now.xpMult + delta)}`;
      case "attackSpeed": return `${(1 / now.attackInterval).toFixed(2)} → ${(1 / (now.attackInterval / (1 + delta))).toFixed(2)} ${t("arcade.stats.attackRate")}`;
      case "moveSpeed": return `${Math.round(now.speed)} → ${Math.round(now.speed * (1 + delta))}`;
      default: return undefined;
    }
  };
  for (const { e, m, extra } of effects) {
    const add = (key: MessageKey, v: Record<string, string | number>, stat?: Parameters<typeof nowAfter>[0], delta?: number) => out.push({ text: t(key, v), extra: !!extra, after: stat !== undefined && delta !== undefined ? nowAfter(stat, delta) : undefined });
    if (e.regen) add("arcade.stat.regen", { v: num(e.regen * m, 1) }, "regen", e.regen * m);
    if (e.lifesteal) add("arcade.stat.lifesteal", { v: pct(e.lifesteal * m) }, "lifesteal", e.lifesteal * m);
    if (e.armor) add("arcade.stat.armor", { v: num(e.armor * m) }, "armor", e.armor * m);
    if (e.attackSpeed) add("arcade.stat.attackSpeed", { v: pct(e.attackSpeed * m) }, "attackSpeed", e.attackSpeed * m);
    if (e.crit) add("arcade.stat.crit", { v: pct(e.crit * m) }, "crit", e.crit * m);
    if (e.damage) add("arcade.stat.damage", { v: num(e.damage * m) }, "damage", e.damage * m);
    if (e.moveSpeed) add("arcade.stat.moveSpeed", { v: pct(e.moveSpeed * m) }, "moveSpeed", e.moveSpeed * m);
    if (e.maxHp) add("arcade.stat.maxHp", { v: num(e.maxHp * m) }, "maxHp", e.maxHp * m);
    if (e.goldPerKill) add("arcade.stat.goldPerKill", { v: num(e.goldPerKill * m) }, "goldPerKill", e.goldPerKill * m);
    if (e.xpMult) add("arcade.stat.xpMult", { v: pct(e.xpMult * m) }, "xpMult", e.xpMult * m);
    if (e.cleave) add("arcade.stat.cleave", { v: (e.cleave * m).toFixed(1) });
    if (e.cooldown) add("arcade.stat.cooldown", { v: `${Math.round(e.cooldown * m * 100)}%` }, "cooldown", e.cooldown * m);
    if (e.stunImmune) out.push({ text: t("arcade.stat.stunImmune"), extra: !!extra });
  }
  return out;
}

function StatList({ effects, now }: { effects: { e: ItemEffect; m: number; extra?: boolean }[]; now?: PlayerStats }) {
  const { t } = useI18n();
  return (
    <ul className="arcade-stats">
      {statLines(t, effects, now).map((l, i) => <li key={i} data-extra={l.extra ? "true" : undefined}>{l.text}{l.after && <em className="arcade-stats__after">{l.after}</em>}</li>)}
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
  // Потолок рангов у апгрейда растёт от редкости, поэтому в карточке показываем СВОЙ потолок,
  // а не базовый `maxRank`: иначе на «4 из 3» игрок решит, что видит баг.
  const cap = Math.max(sim?.player.upgrades[offer.id]?.cap ?? 0, UPGRADE_BY_ID[offer.id].maxRank + (ARCADE.rarity.rankBonus[offer.rarity] ?? 0));
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
  // Цифры «сейчас → после»: формулы школ в upgradeFigures (владелец 2026-09-07: «непонятно, как растёт урон»).
  const curPower = sim?.player.upgrades[offer.id]?.power ?? 0;
  const ctx = { power: (id: string) => sim?.player.upgrades[id]?.power ?? 0 };
  const before = upgradeFigures(offer.id, rank - 1, curPower, ctx);
  const after = upgradeFigures(offer.id, rank, curPower + ARCADE.rarity.mult[offer.rarity], ctx);
  const fmt = (f: { value: number; unit?: string }) => f.unit === "pct" ? `${f.value >= 0 ? "+" : ""}${Math.round(f.value * 100)}%` : f.unit === "s" ? `${(Math.round(f.value * 10) / 10)} ${t("arcade.unit.s")}` : `${Math.round(f.value * 10) / 10}`;
  return (
    <button type="button" className="arcade-offer" data-kind="upgrade" data-rarity={offer.rarity} data-testid={`arcade-offer-${index}`} onClick={onPick}>
      <span className="arcade-offer__tag"><ItemIcon pixel={PX} slug={SCHOOL_ART[def.school]} name={def.school} size="sm" /> {def.requiresSchools ? t("arcade.offer.hybrid", { a: t(`arcade.school.${def.requiresSchools[0]}` as MessageKey), b: t(`arcade.school.${def.requiresSchools[1]}` as MessageKey) }) : <>{t(`arcade.school.${def.school}` as MessageKey)} · {t(`arcade.type.${def.type}` as MessageKey)}</>}</span>
      <strong>{t(`arcade.up.${def.id}` as MessageKey)}</strong>
      <small>{t(`arcade.rarity.${offer.rarity}` as MessageKey)}{offer.rarity !== "standard" && <> · {t("arcade.offer.mult", { m: ARCADE.rarity.mult[offer.rarity] })}</>} · {t("arcade.offer.rank", { rank, max: cap })}{cap > def.maxRank && <> · {t("arcade.offer.capUp", { n: cap - def.maxRank })}</>}</small>
      <p>{t(`arcade.up.${def.id}.desc` as MessageKey)}</p>
      {after.length > 0 && (
        <ul className="arcade-figures" data-testid="arcade-offer-figures">
          {after.map((f, i) => {
            const b = before[i];
            const same = b && Math.abs(b.value - f.value) < 1e-9;
            return (
              <li key={f.key}>
                <span>{t(`arcade.fig.${f.key}` as MessageKey)}</span>
                {b && rank > 1 && !same ? <><s>{fmt(b)}</s> → <em>{fmt(f)}</em></> : <em>{fmt(f)}</em>}
              </li>
            );
          })}
        </ul>
      )}
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

/** Сумка: список предметов с «надеть» / «выбросить». Экран добычи даёт только выброс (освободить место). */
function BagList({ bag, onEquip, onDrop, equipLabel, dropLabel }: { bag: GearItem[]; onEquip?: (i: number) => void; onDrop: (i: number) => void; equipLabel?: string; dropLabel: string }) {
  const { t } = useI18n();
  return (
    <div className="arcade-bag__list">
      {bag.map((g, i) => (
        <div key={g.uid} className="arcade-bag__row" data-rarity={g.rarity} data-testid={`arcade-bag-${i}`}>
          <ItemIcon pixel={PX} slug={gearArt(g)} name={g.base} size="sm" />
          <span className="arcade-bag__name"><b>{t(`arcade.gearName.${g.base}` as MessageKey)}</b><small>{t(`arcade.gear.slot.${g.slot}` as MessageKey)} · T{g.tier} · {t("arcade.loot.score", { n: gearScore(g) })} · {g.affixes.map((a) => affixLabel(t, a.stat, a.value)).join(" · ")}</small></span>
          {onEquip && <Button variant="secondary" data-testid={`arcade-bag-equip-${i}`} onClick={() => onEquip(i)}>{equipLabel}</Button>}
          <Button variant="leave" data-testid={`arcade-bag-drop-${i}`} onClick={() => onDrop(i)}>{dropLabel}</Button>
        </div>
      ))}
    </div>
  );
}

function GearCard({ item, title, compact = false }: { item: GearItem | null; title: string; compact?: boolean }) {
  const { t } = useI18n();
  if (!item) return <div className="arcade-offer arcade-offer--static" data-kind="gear" data-compact={compact ? "true" : undefined}><span className="arcade-offer__tag">{title}</span><strong>—</strong><p>{t("arcade.loot.empty")}</p></div>;
  return (
    <div className="arcade-offer arcade-offer--static" data-kind="gear" data-rarity={item.rarity} data-compact={compact ? "true" : undefined}>
      <span className="arcade-offer__tag"><ItemIcon pixel={PX} slug={gearArt(item)} name={item.base} size="sm" /> {title}</span>
      <strong>{t(`arcade.gearName.${item.base}` as MessageKey)}</strong>
      <small>{t(`arcade.rarity.${item.rarity}` as MessageKey)} · T{item.tier} · {t("arcade.loot.score", { n: gearScore(item) })}{item.forged ? ` · ${t("arcade.forge.forgedMark")}` : ""}</small>
      <p>{item.affixes.map((a) => affixLabel(t, a.stat, a.value)).join(" · ")}</p>
    </div>
  );
}

function affixLabel(t: (k: MessageKey, v?: Record<string, string | number>) => string, stat: string, value: number): string {
  const pct = ["attackSpeed", "crit", "lifesteal", "cooldown", "moveSpeed", "xpMult"].includes(stat);
  return `+${pct ? Math.round(value * 100) + "%" : value} ${t(`arcade.affix.${stat}` as MessageKey)}`;
}

/** Панель баффов рун (T13.32, владелец: «нет индикации, сколько действует руна»): иконка модели руны,
 *  имя, остаток времени и тающая полоска; щит показывает ещё и запас, иллюзии — их число. */
/** Мастерство героя (T13.48): отметки за события забега — звание и трофеи после потолка Наследия. */
function MasteryPanel({ marks }: { marks: readonly MarkId[] }) {
  const { t } = useI18n();
  return (
    <div className="arcade-mastery" data-testid="arcade-mastery">
      <span className="arcade-setup__label">{t("arcade.mastery.title")} · {t(`arcade.mastery.${masteryTitle(marks)}` as MessageKey)} · {marks.length}/{MARK_IDS.length}</span>
      <div className="arcade-mastery__marks">
        {MARK_IDS.map((m) => <span key={m} className="arcade-mastery__mark" data-on={marks.includes(m) ? "true" : undefined} title={t(`arcade.mark.${m}.desc` as MessageKey)} data-testid={`arcade-mark-${m}`}>{marks.includes(m) ? "✓" : "○"} {t(`arcade.mark.${m}` as MessageKey)}</span>)}
      </div>
    </div>
  );
}

/** Наследие Aegis (T13.44): печати за победы в полных актах → три ветки по четыре пункта на весь ростер. */
function LegacyPanel({ progress, onSpend, onReset }: { progress: ArcadeProgress; onSpend: (b: LegacyBranch) => void; onReset: () => void }) {
  const { t } = useI18n();
  const L = progress.legacy;
  const spentTotal = legacySpentTotal(L.spent);
  const free = L.seals - spentTotal;
  return (
    <div className="arcade-legacy" data-testid="arcade-legacy">
      <div className="arcade-legacy__head">
        <span className="arcade-setup__label">{t("arcade.legacy.title")}</span>
        <span className="arcade-legacy__seals" data-testid="arcade-legacy-seals">{t("arcade.legacy.seals", { free, total: L.seals })}</span>
      </div>
      <p className="arcade-rank__unlock">{t("arcade.legacy.hint")}</p>
      <div className="arcade-legacy__rows">
        {LEGACY_BRANCHES.map((b) => {
          const rank = L.spent[b];
          const pct = Math.round(LEGACY_PER_RANK[b] * rank * 1000) / 10;
          const maxPct = Math.round(LEGACY_PER_RANK[b] * LEGACY_MAX_RANK * 1000) / 10;
          return (
            <div key={b} className="arcade-legacy__row" data-testid={`arcade-legacy-${b}`}>
              <b>{t(`arcade.legacy.${b}` as MessageKey)}</b>
              <span>{t(`arcade.legacy.${b}.desc` as MessageKey, { pct, max: maxPct })}</span>
              <i className="arcade-legacy__pips" aria-label={`${rank}/${LEGACY_MAX_RANK}`}>{Array.from({ length: LEGACY_MAX_RANK }, (_, i) => <em key={i} data-on={i < rank ? "true" : undefined} />)}</i>
              <Button variant="secondary" data-testid={`arcade-legacy-spend-${b}`} disabled={free <= 0 || rank >= LEGACY_MAX_RANK} onClick={() => onSpend(b)}>+1</Button>
            </div>
          );
        })}
      </div>
      {spentTotal > 0 && <Button variant="leave" data-testid="arcade-legacy-reset" onClick={onReset}>{t("arcade.legacy.reset")}</Button>}
    </div>
  );
}

function BuffBar({ sim }: { sim: ArcadeSim }) {
  const { t } = useI18n();
  const p = sim.player;
  const ill = sim.pets.filter((x) => x.kind === "illusion" && x.until !== undefined);
  const illUntil = ill.reduce((m, x) => Math.max(m, x.until ?? 0), 0);
  const rows: { kind: RuneKind; until: number; total: number; extra?: string }[] = [];
  if (sim.tick < p.ddUntil) rows.push({ kind: "dd", until: p.ddUntil, total: sec(ARCADE.rune.dd.seconds) });
  if (sim.tick < p.shieldUntil && p.shieldHp > 0) rows.push({ kind: "shield", until: p.shieldUntil, total: sec(ARCADE.rune.shield.seconds), extra: `${Math.ceil(p.shieldHp)} HP` });
  if (sim.tick < p.arcaneUntil) rows.push({ kind: "arcane", until: p.arcaneUntil, total: sec(ARCADE.rune.arcane.seconds) });
  if (ill.length > 0 && illUntil > sim.tick) rows.push({ kind: "illusion", until: illUntil, total: sec(ARCADE.rune.illusion.seconds), extra: `×${ill.length}` });
  if (rows.length === 0) return null;
  return (
    <div className="arcade-hud__buffs" data-testid="arcade-buffs">
      {rows.map((r) => (
        <span key={r.kind} className={`arcade-hud__buff arcade-hud__buff--${r.kind}`} data-testid={`arcade-rune-${r.kind}`}>
          <RuneIcon kind={r.kind} />
          <b>{t(`arcade.rune.${r.kind}` as MessageKey)}<span>{formatClock(r.until - sim.tick)}{r.extra ? ` · ${r.extra}` : ""}</span></b>
          <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, (r.until - sim.tick) / r.total))})` }} />
        </span>
      ))}
    </div>
  );
}

/** Первый кадр листа руны (`rune_<вид>`) в маленьком canvas; пока лист грузится — перерисовка по таймеру. */
function RuneIcon({ kind }: { kind: RuneKind }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    let timer = 0;
    const draw = () => {
      if (!alive || !ref.current) return;
      const name = `rune_${kind}`;
      const ds = dotaSheet(name);
      if (!ds) { if (dotaSheetState(name) === "loading") timer = window.setTimeout(draw, 150); return; }
      const g = ref.current.getContext("2d");
      if (!g) return;
      const n = ref.current.width;
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, n, n);
      g.drawImage(ds.img, 0, 0, ds.meta.frame, ds.meta.frame, 0, 0, n, n);
    };
    draw();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [kind]);
  return <canvas ref={ref} width={52} height={52} aria-hidden="true" />;
}
