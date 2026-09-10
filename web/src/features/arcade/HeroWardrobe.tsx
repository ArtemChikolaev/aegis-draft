// Гардероб героя (T13.27, просьба владельца 2026-09-06: «тыкаем по герою — открывается окошко, где
// видно, как перс выглядит сейчас и как будет выглядеть, если купим; покупаем там же»).
// Окно живо только на экране настройки: показывает анимированное превью выбранного облика (тот же
// лист Dota, что и в бою), список обликов героя (базовая модель + арканы/персоны/сеты), стили аркан
// и остальные слоты косметики. Покупка — здесь, а не списком под выбором героя.
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/core.ts";
import { useArcade } from "../../state/arcadeStore.ts";
import { HEROES, type HeroId } from "../../game/arcade/content/heroes.ts";
import { COSMETICS, COSMETIC_BY_ID, SHARD_PRICE, type CosmeticDef, type CosmeticSlot, type StyleDef } from "../../game/arcade/content/cosmetics.ts";
import { Button, Modal } from "../../ui/index.ts";
import { useHero } from "../draft/heroes.ts";
import { densePixel, pixelScale } from "./pixelMode.ts";
import { dotaSheet, dotaSheetState, drawDotaFrame, frameGeometry, gemSheet, HERO_AURA, setPixelSheets, sheetGlow, type SheetGlow } from "./sprites.ts";
import { auraGeoFromBox, drawAuraEffect, drawDeathEffect, drawGroundEffect, drawTrailEffect, readEffectPalette, type AuraEffect, type AuraGeo, type DeathEffect, type GroundEffect, type TrailEffect } from "./effects.ts";

/** Слоты, которые редактируются в гардеробе после облика. */
const EFFECT_SLOTS: readonly CosmeticSlot[] = ["frame", "aura", "trail", "death", "tint"];

/** Надетые эффекты для превью: варианты по слотам (из COSMETIC_BY_ID). */
export interface PreviewEffects { frame?: GroundEffect; aura?: AuraEffect; trail?: TrailEffect; death?: DeathEffect; /** Эффект самого скина (cosmetics `fx.aura`) — рисуется всегда, под надетым свечением, как в бою. */ skinAura?: AuraEffect }

/** Цикл превью: секунды на стойку, ходьбу (с разворотом) и удар. */
const IDLE_S = 1.6;
const WALK_S = 3.2;
const ATTACK_S = 1.2;
const LOOP_S = IDLE_S + WALK_S + ATTACK_S;

/** Ручной выбор анимации в превью (T13.57): «auto» — прежний цикл стойка → ходьба по кругу → удар. */
export type PreviewAnim = "auto" | "idle" | "walk" | "attack";
export type PreviewBg = "none" | "radiant" | "dire";

/** Какая анимация и направление в превью на секунде `el` цикла: чистая функция, чтобы тестировать без canvas. */
export function pickPreviewAnim(el: number, dirs: number, still: boolean, forced: PreviewAnim = "auto"): { anim: "idle" | "walk" | "attack"; dir: number } {
  if (still) return { anim: "idle", dir: 0 };
  if (forced === "walk") return { anim: "walk", dir: Math.floor((el / WALK_S) * dirs) % dirs };
  if (forced === "idle" || forced === "attack") return { anim: forced, dir: 0 };
  const loop = el % LOOP_S;
  const anim = loop < IDLE_S ? "idle" : loop < IDLE_S + WALK_S ? "walk" : "attack";
  // Ходьба разворачивает модель кругом, стойка и удар — лицом к камере.
  const dir = anim === "walk" ? Math.floor(((loop - IDLE_S) / WALK_S) * dirs) % dirs : 0;
  return { anim, dir };
}

/**
 * Анимированное превью облика: тот же лист `dota_px*`, что рисует бой, кадры крутятся по часам
 * страницы (не по симу — это витрина, а не забег). `static` — одна поза для карточки списка.
 */
/**
 * Масштаб превью облика. При увеличении держим ЦЕЛОЕ число физических пикселей на арт-пиксель:
 * при дробном (230 css / 128 арт = 1.8) nearest-neighbour тянет часть пикселей вдвое, часть нет,
 * и облик выходит кашей. При уменьшении (миниатюры 48 px под лист 128) целых чисел нет вовсе,
 * поэтому там оставляем дробный масштаб: иначе миниатюра показывала бы кроп в упор.
 *
 * `world` — рост героя (по нему выравниваем облики между собой), `frameFit` — во сколько раз
 * помещается ВЕСЬ кадр листа: выше него подниматься нельзя, иначе поля кадра уезжают за холст и
 * длинное оружие/крылья обрезаются рамкой (владелец 2026-09-08: «уже давно перестали туда влезать»).
 * Раньше масштаб округлялся вверх «на поля», но у листов с `margin 1.4` кадр на четверть больше
 * роста — герой рисовался на 280 px в холсте 220 px.
 */
export function previewScale(size: number, world: number, dpr: number, frameFit = Infinity): number {
  const ideal = Math.min(size / Math.max(1, world), frameFit);
  return ideal * dpr >= 1 ? Math.floor(ideal * dpr) / dpr : ideal;
}

/**
 * Свечение листа облика (для показа самоцветов): undefined — лист ещё грузится, null — свечения нет.
 * Листы грузятся лениво и без событий, поэтому опрашиваем раз в 100 мс, пока не готов.
 */
function useSheetGlow(sheet: string, enabled: boolean): SheetGlow | null | undefined {
  const [glow, setGlow] = useState<SheetGlow | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) { setGlow(null); return; }
    setGlow(undefined);
    const bare = sheet.split("~")[0];
    const probe = () => {
      const s = dotaSheet(sheet) ?? dotaSheet(bare);
      if (s) { setGlow(sheetGlow(s)); return true; }
      if (dotaSheetState(sheet) === "missing" && dotaSheetState(bare) === "missing") { setGlow(null); return true; }
      return false;
    };
    if (probe()) return;
    const id = window.setInterval(() => { if (probe()) window.clearInterval(id); }, 100);
    return () => window.clearInterval(id);
  }, [sheet, enabled]);
  return glow;
}

function LookPreview({ sheet, size, gem = null, glow = false, still = false, effects, anim: forcedAnim = "auto", bg = "none", lifeSize = false }: { sheet: string; size: number; gem?: number | null; glow?: boolean; still?: boolean; effects?: PreviewEffects; anim?: PreviewAnim; bg?: PreviewBg; lifeSize?: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const { t } = useI18n();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    setMissing(false);
    const px = pixelScale();
    setPixelSheets(px >= 1, densePixel(px));
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1)));
    cv.width = Math.round(size * dpr);
    cv.height = Math.round(size * dpr);
    const c = cv.getContext("2d");
    if (!c) return;
    const t0 = performance.now();
    let raf = 0;
    const pal = readEffectPalette();
    const trailPts: { x: number; y: number; t: number }[] = [];
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const bare = sheet.split("~")[0];
      const raw = dotaSheet(sheet) ?? dotaSheet(bare);
      if (!raw && dotaSheetState(sheet) === "missing" && dotaSheetState(bare) === "missing") setMissing(true);
      const s = raw && glow ? gemSheet(raw, gem) : raw;
      c.imageSmoothingEnabled = false;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, size, size);
      // Фон Radiant/Dire (T13.57): пятно земли в тонах акта, чтобы оценить читаемость облика днём и ночью.
      if (bg !== "none") {
        const style = getComputedStyle(document.documentElement);
        const tok = (k: string, fb: string) => style.getPropertyValue(k).trim() || fb;
        c.fillStyle = bg === "dire" ? tok("--arcade-ground-night", "#0a0f12") : tok("--arcade-ground", "#0f1a12");
        c.fillRect(0, 0, size, size);
        c.fillStyle = bg === "dire" ? tok("--arcade-grass-night-a", "#0c1418") : tok("--arcade-grass-a", "#17301c");
        c.beginPath(); c.ellipse(size / 2, size * 0.78, size * 0.42, size * 0.14, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = bg === "dire" ? tok("--arcade-dirt-night", "#1c1714") : tok("--arcade-dirt", "#3a2e1e");
        c.beginPath(); c.ellipse(size / 2, size * 0.8, size * 0.22, size * 0.07, 0, 0, Math.PI * 2); c.fill();
      }
      if (!s) return;
      const el = (performance.now() - t0) / 1000;
      const picked = pickPreviewAnim(el, s.meta.dirs, still, forcedAnim);
      const anim = picked.anim, dir = picked.dir;
      const frame = still ? 0 : Math.floor(el * s.meta.fps);
      // Масштаб — по росту героя, а не по кадру: у листов с запасом 1.4 кадр на четверть шире, и без
      // поправки герой в витрине мельчал бы вместе с ростом рамки. Потолок — целый кадр в холсте.
      // «Реальный размер» (T13.57): тот же множитель, что в бою, — герой ровно такой, как на поле.
      const mult = lifeSize ? Math.max(1, Math.round(pixelScale())) : previewScale(size, s.meta.world * (1.12 / (s.meta.margin ?? 1.12)), dpr, size / Math.max(1, s.meta.world));
      // Эффекты в превью (владелец 2026-09-07: «никак не отображаются в превью персонажа»): те же
      // функции, что в бою. Радиус героя и высота силуэта — от размера превью, тик — от часов страницы.
      const fx = effects;
      const tick = Math.floor(el * 60);
      // Зерно эффектов — два арт-пикселя, как в бою (artPx = 2 · фактор), радиус кольца — как у героя в бою
      // относительно роста (R ≈ 0.17 роста).
      const px = Math.max(1, Math.round(mult * 2));
      // Кадр листа целиком по центру холста: якорь (ноги) — там, где он лежит в кадре, а не «на 90%
      // высоты», иначе верх кадра уезжает за холст и голова/крылья обрезаются.
      const box = s.meta.world * mult;
      const R = box * 0.11, hx = size / 2, hy = (size - box) / 2 + box * s.meta.anchor.y, hh = box * 0.62;
      if (fx?.trail && !still) {
        // След: герой в превью стоит, поэтому точки идут по дуге за ним, как будто он только что подошёл.
        const now = performance.now();
        const a = el * 1.6;
        const tx = hx + Math.cos(a) * size * 0.22, ty = hy + Math.sin(a) * size * 0.08;
        const last = trailPts[trailPts.length - 1];
        if (!last || Math.hypot(last.x - tx, last.y - ty) > 4) trailPts.push({ x: tx, y: ty, t: now });
        while (trailPts.length && now - trailPts[0].t > 520) trailPts.shift();
        drawTrailEffect(c, trailPts, now, fx.trail, px, pal, (tx, ty, alpha) => { drawDotaFrame(c, s, anim, dir, frame, tx, ty, alpha, mult * 0.96); });
      }
      if (fx?.frame) drawGroundEffect(c, hx, hy, R, fx.frame, tick, px, pal, 0);
      let geo: AuraGeo | null = null;
      if (fx?.aura || fx?.skinAura) {
        // Геометрия контура кадра в координатах превью — та же, что в бою, только масштаб превью.
        const g = frameGeometry(s, anim, dir, frame);
        const scale = (s.meta.world / s.meta.frame) * mult;
        const ox = hx - s.meta.frame * scale * s.meta.anchor.x, oy = hy - s.meta.frame * scale * s.meta.anchor.y;
        const sheet = s;
        geo = g ? {
          left: ox + g.x0 * scale, top: oy + g.y0 * scale, right: ox + (g.x1 + 1) * scale, bottom: oy + (g.y1 + 1) * scale,
          outline: g.outline.map((pt) => ({ x: ox + (pt.x + 0.5) * scale, y: oy + (pt.y + 0.5) * scale })),
          silhouette: (color, alpha, dx, dy) => { drawDotaFrame(c, sheet, anim, dir, frame, hx + dx, hy + dy, alpha, mult, color); },
        } : auraGeoFromBox(hx, hy, hh);
        if (fx.skinAura) drawAuraEffect(c, geo, fx.skinAura, tick, 11, px, pal, 0, "back");
        if (fx.aura && fx.aura !== fx.skinAura) drawAuraEffect(c, geo, fx.aura, tick, 7, px, pal, 0, "back");
      }
      drawDotaFrame(c, s, anim, dir, frame, hx, hy, 1, mult);
      if (geo && fx?.skinAura) drawAuraEffect(c, geo, fx.skinAura, tick, 11, px, pal, 0, "front");
      if (geo && fx?.aura && fx.aura !== fx.skinAura) drawAuraEffect(c, geo, fx.aura, tick, 7, px, pal, 0, "front");
      if (fx?.death && !still) {
        // Эффект смерти врагов: раз в две секунды вспыхивает сбоку от героя.
        const k = (el % 2) / 0.9;
        if (k < 1) drawDeathEffect(c, hx + size * 0.32, hy - size * 0.1, size * 0.06, k, fx.death, Math.floor(el / 2), px, pal);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [sheet, size, gem, glow, still, effects?.frame, effects?.aura, effects?.skinAura, effects?.trail, effects?.death, forcedAnim, bg, lifeSize]);
  return (
    <span className="arcade-wardrobe__slot" style={{ width: size, maxWidth: "100%", aspectRatio: "1" }}>
      <canvas ref={ref} className="arcade-wardrobe__canvas" style={{ width: size, height: size }} aria-hidden />
      {missing && <em className="arcade-wardrobe__pending">{t("arcade.wardrobe.pending")}</em>}
    </span>
  );
}

interface Look {
  /** null — базовая модель героя. */
  def: CosmeticDef | null;
  sheet: string;
  owned: boolean;
}

export function HeroWardrobe({ hero, onClose }: { hero: HeroId; onClose: () => void }) {
  const { t } = useI18n();
  const cosmetics = useArcade((s) => s.cosmetics);
  const equip = useArcade((s) => s.equip);
  const setStyle = useArcade((s) => s.setStyle);
  const buyCosmetic = useArcade((s) => s.buyCosmetic);
  const setPerHeroLook = useArcade((s) => s.setPerHeroLook);
  const heroOf = useHero();
  const def = HEROES[hero];
  const info = heroOf(def.dotaId);
  const skins = COSMETICS.filter((c) => c.slot === "skin" && c.hero === hero);
  const looks: Look[] = [
    { def: null, sheet: hero, owned: true },
    ...skins.map((c) => ({ def: c, sheet: c.variant, owned: cosmetics.owned.includes(c.id) })),
  ];
  const equippedSkin = skins.find((c) => c.id === cosmetics.skins[hero]) ?? null;
  const [selId, setSelId] = useState<string | null>(equippedSkin?.id ?? null);
  const sel = looks.find((l) => (l.def?.id ?? null) === selId) ?? looks[0];
  const selStyle: StyleDef | undefined = sel.def?.styles?.find((st) => st.id === cosmetics.styles[sel.def!.id]);
  const previewSheet = selStyle?.sheet ? `${sel.sheet}~${selStyle.id}` : sel.sheet;
  // Превью (T13.57): ручной выбор анимации/формы, фон акта, реальный размер, сравнение с базовым обликом.
  const [previewAnim, setPreviewAnim] = useState<PreviewAnim | "form">("auto");
  const [previewBg, setPreviewBg] = useState<PreviewBg>("none");
  const [lifeSize, setLifeSize] = useState(false);
  const [compare, setCompare] = useState(false);
  const hasForm = Object.values(HEROES[hero].abilities).some((a) => a.kind === "metamorphosis");
  const formSheet = dotaSheetState(`${previewSheet}@meta`) !== "missing" ? `${previewSheet}@meta` : `${hero}@meta`;
  const worn = (sel.def?.id ?? null) === (equippedSkin?.id ?? null);
  const price = sel.def ? SHARD_PRICE[sel.def.rarity] : 0;
  // Аркана рисуется со свечением; самоцветы показываем только если у листа это свечение есть
  // (как в Dota: призматический самоцвет красит эффекты, и облику без них он не нужен).
  const arcana = sel.def?.rarity === "arcana";
  const effectVariant = (slot: CosmeticSlot) => { const id = cosmetics.equipped[slot]; return id ? COSMETIC_BY_ID[id]?.variant : undefined; };
  const previewEffects: PreviewEffects = { frame: effectVariant("frame") as GroundEffect | undefined, aura: effectVariant("aura") as AuraEffect | undefined, skinAura: (sel.def?.fx?.aura as AuraEffect | undefined) ?? HERO_AURA[hero], trail: effectVariant("trail") as TrailEffect | undefined, death: effectVariant("death") as DeathEffect | undefined };
  const glow = useSheetGlow(previewSheet, arcana);
  const styleOptions = (sel.def?.styles ?? []).filter((st) => st.hue === undefined || !!glow);
  return (
    <Modal
      title={info.name || def.picture}
      description={t("arcade.wardrobe.lead")}
      subhead={<span className="arcade-wardrobe__shards">{t("arcade.cosmetics.shards", { n: cosmetics.shards })}</span>}
      onClose={onClose}
      layout="content"
      dismissLabel={t("common.close")}
    >
      <div className="arcade-wardrobe" data-testid="arcade-wardrobe">
        <div className="arcade-wardrobe__stage">
          <div className="arcade-wardrobe__stages">
            <LookPreview key={`${previewSheet}#${selStyle?.hue ?? "own"}#${previewAnim}#${previewBg}#${lifeSize}`} sheet={previewAnim === "form" ? formSheet : previewSheet} size={compare ? 220 : 320} gem={selStyle?.hue ?? null} glow={arcana} effects={previewEffects} anim={previewAnim === "form" ? "idle" : previewAnim} bg={previewBg} lifeSize={lifeSize} />
            {compare && sel.def && (
              <span className="arcade-wardrobe__compare" data-testid="arcade-wardrobe-compare">
                <LookPreview key={`base#${previewAnim}#${previewBg}#${lifeSize}`} sheet={previewAnim === "form" ? `${hero}@meta` : hero} size={220} effects={{ skinAura: HERO_AURA[hero] }} anim={previewAnim === "form" ? "idle" : previewAnim} bg={previewBg} lifeSize={lifeSize} />
                <small>{t("arcade.wardrobe.base")}</small>
              </span>
            )}
          </div>
          <div className="arcade-wardrobe__controls" data-testid="arcade-wardrobe-controls">
            {(["auto", "idle", "walk", "attack", ...(hasForm ? (["form"] as const) : [])] as (PreviewAnim | "form")[]).map((a) => (
              <button key={a} type="button" className="arcade-rank__tier" data-active={previewAnim === a ? "true" : undefined} data-testid={`arcade-wardrobe-anim-${a}`} onClick={() => setPreviewAnim(a)}>{t(`arcade.wardrobe.anim.${a}` as MessageKey)}</button>
            ))}
            <span className="arcade-wardrobe__sep" />
            {(["none", "radiant", "dire"] as const).map((b) => (
              <button key={b} type="button" className="arcade-rank__tier" data-active={previewBg === b ? "true" : undefined} data-testid={`arcade-wardrobe-bg-${b}`} onClick={() => setPreviewBg(b)}>{t(`arcade.wardrobe.bg.${b}` as MessageKey)}</button>
            ))}
            <span className="arcade-wardrobe__sep" />
            <button type="button" className="arcade-rank__tier" data-active={lifeSize ? "true" : undefined} data-testid="arcade-wardrobe-lifesize" onClick={() => setLifeSize((v) => !v)}>{t("arcade.wardrobe.lifeSize")}</button>
            <button type="button" className="arcade-rank__tier" data-active={compare ? "true" : undefined} disabled={!sel.def} data-testid="arcade-wardrobe-compare-toggle" onClick={() => setCompare((v) => !v)}>{t("arcade.wardrobe.compare")}</button>
          </div>
          <strong data-testid="arcade-wardrobe-name">
            {sel.def ? t(`arcade.cosmetic.${sel.def.id}` as MessageKey) : t("arcade.wardrobe.base")}
          </strong>
          {sel.def && <small data-rarity={sel.def.rarity}>{t(`arcade.rarity.${sel.def.rarity}` as MessageKey)}</small>}
          <div className="arcade-wardrobe__actions">
            {worn
              ? <Button variant="secondary" disabled>{t("arcade.wardrobe.worn")}</Button>
              : sel.owned
                ? <Button variant="primary" data-testid="arcade-wardrobe-equip" onClick={() => { equip("skin", sel.def?.id ?? null); }}>{t("arcade.wardrobe.wear")}</Button>
                : <Button
                    variant="primary"
                    data-testid="arcade-wardrobe-buy"
                    disabled={cosmetics.shards < price}
                    onClick={() => { if (sel.def && buyCosmetic(sel.def.id)) equip("skin", sel.def.id); }}
                  >
                    {t("arcade.wardrobe.buy", { n: price })}
                  </Button>}
          </div>
          {!sel.owned && <em className="arcade-wardrobe__hint">{t("arcade.cosmetics.buyHint")}</em>}
          {sel.def && styleOptions.length > 0 && (
            <div className="arcade-wardrobe__styles" data-testid="arcade-wardrobe-styles">
              <small>{t("arcade.wardrobe.styles")}</small>
              <div className="arcade-cosmetics__options">
                <button type="button" className="arcade-rank__tier" data-active={!selStyle ? "true" : undefined} onClick={() => setStyle(sel.def!.id, null)}>{t("arcade.wardrobe.styleBase")}</button>
                {styleOptions.map((st) => (
                  <button key={st.id} type="button" className="arcade-rank__tier" data-active={selStyle?.id === st.id ? "true" : undefined} data-testid={`arcade-wardrobe-style-${st.id}`} onClick={() => setStyle(sel.def!.id, st.id)}>
                    {st.hue !== undefined && <i className="arcade-wardrobe__gem" style={{ background: `hsl(${st.hue} 72% 56%)` }} />}
                    {t(`arcade.style.${st.id}` as MessageKey)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="arcade-wardrobe__looks" data-testid="arcade-wardrobe-looks">
          {looks.map((l) => {
            const id = l.def?.id ?? "base";
            return (
              <button
                key={id}
                type="button"
                className="arcade-wardrobe__look"
                data-active={(l.def?.id ?? null) === (sel.def?.id ?? null) ? "true" : undefined}
                data-rarity={l.def?.rarity}
                data-owned={l.owned ? "true" : undefined}
                data-testid={`arcade-wardrobe-look-${id}`}
                onClick={() => setSelId(l.def?.id ?? null)}
              >
                <LookPreview sheet={l.sheet} size={64} glow={l.def?.rarity === "arcana"} still />
                <span>{l.def ? t(`arcade.cosmetic.${l.def.id}` as MessageKey) : t("arcade.wardrobe.base")}</span>
                {(l.def?.id ?? null) === (equippedSkin?.id ?? null) && <b>{t("arcade.wardrobe.wornMark")}</b>}
                {!l.owned && <em>{SHARD_PRICE[l.def!.rarity]}</em>}
              </button>
            );
          })}
        </div>
        <div className="arcade-wardrobe__effects">
          <label className="arcade-wardrobe__toggle" data-testid="arcade-wardrobe-perhero">
            <input type="checkbox" checked={cosmetics.perHeroLook} onChange={(e) => setPerHeroLook(e.target.checked)} />
            <span>{t("arcade.wardrobe.perHero")}</span>
            <small>{t(cosmetics.perHeroLook ? "arcade.wardrobe.perHeroOn" : "arcade.wardrobe.perHeroOff")}</small>
          </label>
          {cosmetics.equipped.aura && <small className="arcade-wardrobe__hint">{t("arcade.wardrobe.flareHint")}</small>}
          {EFFECT_SLOTS.map((slot) => {
            const all = COSMETICS.filter((c) => c.slot === slot);
            return (
              <div key={slot} className="arcade-cosmetics__slot">
                <small>{t(`arcade.cosmetics.slot.${slot}` as MessageKey)}</small>
                <div className="arcade-cosmetics__options">
                  <button type="button" className="arcade-rank__tier" data-active={!cosmetics.equipped[slot] ? "true" : undefined} onClick={() => equip(slot, null)}>{t("arcade.cosmetics.none")}</button>
                  {all.map((c) => {
                    const owned = cosmetics.owned.includes(c.id);
                    return owned ? (
                      <button key={c.id} type="button" className="arcade-rank__tier" data-rarity={c.rarity} data-active={cosmetics.equipped[slot] === c.id ? "true" : undefined} data-testid={`arcade-cosmetic-${c.id}`} onClick={() => equip(slot, c.id)}>
                        {t(`arcade.cosmetic.${c.id}` as MessageKey)}
                      </button>
                    ) : (
                      <button key={c.id} type="button" className="arcade-rank__tier arcade-cosmetics__buy" data-rarity={c.rarity} data-testid={`arcade-cosmetic-buy-${c.id}`} disabled={!!c.unlock || cosmetics.shards < SHARD_PRICE[c.rarity]} title={c.unlock ? t("arcade.cosmetics.unlockHint", { mark: t(`arcade.mark.${c.unlock.mark}` as MessageKey) }) : t("arcade.cosmetics.buyHint")} onClick={() => { if (buyCosmetic(c.id)) equip(slot, c.id); }}>
                        {t(`arcade.cosmetic.${c.id}` as MessageKey)} · {c.unlock ? t("arcade.cosmetics.unlockShort") : SHARD_PRICE[c.rarity]}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

/** Надет ли на герое скин — для бейджа на карточке выбора. */
export function wornSkin(hero: string, equippedSkin: string | undefined): CosmeticDef | null {
  const def = equippedSkin ? COSMETIC_BY_ID[equippedSkin] : undefined;
  return def && def.slot === "skin" && def.hero === hero ? def : null;
}
