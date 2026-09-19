// Гардероб героя (T13.27, просьба владельца 2026-09-06: «тыкаем по герою — открывается окошко, где
// видно, как перс выглядит сейчас и как будет выглядеть, если купим; покупаем там же»).
// Окно живо только на экране настройки: показывает анимированное превью выбранного облика (тот же
// лист Dota, что и в бою), список обликов героя (базовая модель + арканы/персоны/сеты), стили аркан
// и остальные слоты косметики. Покупка — здесь, а не списком под выбором героя.
import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/core.ts";
import { useArcade } from "../../state/arcadeStore.ts";
import { HEROES, type HeroId } from "../../game/arcade/content/heroes.ts";
import { COSMETICS, COSMETIC_BY_ID, LOOK_DEFAULT, PART_BASE, SHARD_PRICE, choosableSlots, defaultLoadout, familyOf, formSheet as formSheetOf, formSheetCandidates, heroLook, loadoutSheet, sourceCosmetic, summonSheets, type CosmeticDef, type CosmeticSlot, type DotaSlot, type StyleDef } from "../../game/arcade/content/cosmetics.ts";
import { HERO_PARTS } from "../../game/arcade/content/parts.ts";
import { Button, Modal } from "../../ui/index.ts";
import { useHero } from "../draft/heroes.ts";
import { densePixel, pixelScale } from "./pixelMode.ts";
import { dotaSheet, dotaSheetState, dotaSheetStill, drawDotaFrame, frameGeometry, gemSheet, HERO_AURA, resolveSheet, setPixelSheets, sheetGlow, type SheetGlow } from "./sprites.ts";
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

/**
 * Лист из кандидатов по приоритету (sprites.ts `resolveSheet`): первый существующий. С прочитанным индексом набора ответ
 * синхронный; без него опрашиваем раз в 100 мс, пока более приоритетный кандидат грузится, и перерисовываем родителя,
 * когда ответ сменился (раньше «листа нет» узнавал только сам холст превью, и родитель оставался с пустым листом).
 */
function useResolvedSheet(candidates: readonly string[]): string {
  const key = candidates.join("|");
  const [, bump] = useState(0);
  useEffect(() => {
    const list = key.split("|");
    if (resolveSheet(list).settled) return;
    const id = window.setInterval(() => { bump((n) => n + 1); if (resolveSheet(list).settled) window.clearInterval(id); }, 100);
    return () => window.clearInterval(id);
  }, [key]);
  return resolveSheet(candidates, false).sheet;
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
    const pal = readEffectPalette();
    const trailPts: { x: number; y: number; t: number }[] = [];
    // Токены фона читаются один раз на эффект, а не в каждом кадре: `getComputedStyle` форсирует пересчёт стилей.
    const style = bg !== "none" ? getComputedStyle(document.documentElement) : null;
    const tok = (k: string, fb: string) => style?.getPropertyValue(k).trim() || fb;
    const ground = bg === "none" ? null : bg === "dire"
      ? { base: tok("--arcade-ground-night", "#0a0f12"), grass: tok("--arcade-grass-night-a", "#0c1418"), dirt: tok("--arcade-dirt-night", "#1c1714") }
      : { base: tok("--arcade-ground", "#0f1a12"), grass: tok("--arcade-grass-a", "#17301c"), dirt: tok("--arcade-dirt", "#3a2e1e") };
    /** Кадр превью; true — картинка окончательная (лист нарисован либо его точно нет): неподвижной миниатюре ждать больше нечего. */
    const draw = (): boolean => {
      const bare = sheet.split("~")[0];
      // Неподвижная миниатюра композита — один кадр, а не полный лист (A4: полный композит — десятки МиБ).
      const pick = still ? dotaSheetStill : dotaSheet;
      const primary = pick(sheet);
      const raw = primary ?? pick(bare);
      const gone = !raw && dotaSheetState(sheet) === "missing" && dotaSheetState(bare) === "missing";
      if (gone) setMissing(true);
      // Лист без стиля — временная замена, пока грузится свой: окончательно только когда своего точно нет.
      const final = !!primary || gone || (!!raw && dotaSheetState(sheet) === "missing");
      const s = raw && glow ? gemSheet(raw, gem) : raw;
      c.imageSmoothingEnabled = false;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, size, size);
      // Фон Radiant/Dire (T13.57): пятно земли в тонах акта, чтобы оценить читаемость облика днём и ночью.
      if (ground) {
        c.fillStyle = ground.base;
        c.fillRect(0, 0, size, size);
        c.fillStyle = ground.grass;
        c.beginPath(); c.ellipse(size / 2, size * 0.78, size * 0.42, size * 0.14, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = ground.dirt;
        c.beginPath(); c.ellipse(size / 2, size * 0.8, size * 0.22, size * 0.07, 0, 0, Math.PI * 2); c.fill();
      }
      if (!s) return final;
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
        if (!last || (last.x - tx) ** 2 + (last.y - ty) ** 2 > 16) trailPts.push({ x: tx, y: ty, t: now });
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
      return final;
    };
    // Неподвижная миниатюра рисуется один раз: пока лист грузится — переспрашиваем раз в 100 мс, потом останавливаемся.
    // Раньше у каждой был свой вечный rAF — до 13 миниатюр на вкладке перерисовывали один и тот же кадр 60 раз в секунду.
    if (still) {
      let timer = 0;
      const poll = () => { if (!draw()) timer = window.setTimeout(poll, 100); };
      poll();
      return () => window.clearTimeout(timer);
    }
    let raf = 0;
    const loop = () => { raf = requestAnimationFrame(loop); draw(); };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [sheet, size, gem, glow, still, effects?.frame, effects?.aura, effects?.skinAura, effects?.trail, effects?.death, forcedAnim, bg, lifeSize]);
  return (
    <span className="arcade-wardrobe__slot" style={{ width: size, maxWidth: "100%", aspectRatio: "1" }}>
      <canvas ref={ref} className="arcade-wardrobe__canvas" style={{ width: size, height: size }} aria-hidden />
      {missing && <em className="arcade-wardrobe__pending">{t("arcade.wardrobe.pending")}</em>}
    </span>
  );
}

type WardrobeTab = "looks" | "parts" | "form" | "summons" | "effects";

/** Вкладка по клавише (WAI-ARIA tabs): стрелки — соседняя по кругу, Home/End — крайние; null — клавиша не про вкладки. */
export function tabByKey<T>(ids: readonly T[], current: T, key: string): T | null {
  const i = ids.indexOf(current);
  if (i < 0 || ids.length === 0) return null;
  if (key === "ArrowRight") return ids[(i + 1) % ids.length];
  if (key === "ArrowLeft") return ids[(i - 1 + ids.length) % ids.length];
  if (key === "Home") return ids[0];
  if (key === "End") return ids[ids.length - 1];
  return null;
}

/** Некупленная косметика, выбранная к покупке (часть слота, скин призыва или формы): `id` — предмет косметики. */
export type PendingBuy = { kind: "part"; id: string; slot: DotaSlot; src: string } | { kind: "summon"; id: string; art: string } | { kind: "form"; id: string };

/**
 * Тычок по миниатюре части/призыва/формы: своя — надевается сразу, некупленная — только выбирается к покупке
 * (повторный тычок снимает выбор). Чистая функция, чтобы правило «один клик не покупает» держал тест.
 */
export function pickThumb(owned: boolean, want: PendingBuy, current: PendingBuy | null): { apply: boolean; pending: PendingBuy | null } {
  if (owned) return { apply: true, pending: null };
  const same = !!current && current.kind === want.kind && current.id === want.id && (current.kind !== "part" || (want.kind === "part" && current.slot === want.slot));
  return { apply: false, pending: same ? null : want };
}

/** Широкая раскладка гардероба (превью слева, вкладки справа) — от 900 px; уже — превью закреплено сверху. */
function useWideWardrobe(): boolean {
  const query = "(min-width: 900px)";
  const [wide, setWide] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

interface Look {
  /** null — базовая модель героя. */
  def: CosmeticDef | null;
  sheet: string;
  owned: boolean;
}

export function HeroWardrobe({ hero, onClose }: { hero: HeroId; onClose: () => void }) {
  const { t } = useI18n();
  /** Имя диалога для скринридера: Modal ставит этот id на заголовок и ссылается на него из aria-labelledby. */
  const titleId = useId();
  const cosmetics = useArcade((s) => s.cosmetics);
  const equip = useArcade((s) => s.equip);
  const setStyle = useArcade((s) => s.setStyle);
  const buyCosmetic = useArcade((s) => s.buyCosmetic);
  const setPerHeroLook = useArcade((s) => s.setPerHeroLook);
  const setPart = useArcade((s) => s.setPart);
  const setSummonSkin = useArcade((s) => s.setSummonSkin);
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
  // Вкладки вместо длинной ленты (владелец 2026-09-19: «слишком много листать вниз, при пролистывании не видно, как
  // будет выглядеть»): превью закреплено, разделы — по одному. Вкладка «Форма» сама показывает форму в превью и
  // возвращает обычный показ при уходе с неё — режим «Form» не залипает.
  const [tab, setTab] = useState<WardrobeTab>("looks");
  // Покупка — как во вкладке «Облики»: тычок по некупленной миниатюре только выбирает её (примерка на витрине), покупает
  // отдельная кнопка. Раньше части, призывы и формы покупались самим тычком по миниатюре (аудит 2026-09-19).
  const [pending, setPending] = useState<PendingBuy | null>(null);
  const selectTab = (next: WardrobeTab) => {
    setPending(null);
    if (next === "form") setPreviewAnim("form");
    else if (tab === "form" && previewAnim === "form") setPreviewAnim("auto");
    setTab(next);
  };
  const wide = useWideWardrobe();
  const [viewOpen, setViewOpen] = useState(false);
  const stageSize = wide ? 300 : 200;
  const [previewBg, setPreviewBg] = useState<PreviewBg>("none");
  const [lifeSize, setLifeSize] = useState(false);
  const [compare, setCompare] = useState(false);
  const hasForm = Object.values(HEROES[hero].abilities).some((a) => a.form !== undefined);
  // Форма: свой скин формы (слот `form`, T13.80 срез 3) важнее формы облика (`<hero>@<skin>@meta`), та — важнее базовой.
  // Своего листа формы у большинства обликов нет, поэтому лист выбирается из кандидатов по факту существования
  // (`useResolvedSheet`): раньше `<облик>@meta` выбирался, пока «грузится», приходил 404 — и превью формы оставалось пустым.
  // На витрине — форма ВЫБРАННОГО облика (что будет, если его надеть), в миниатюре «как у облика» — форма НАДЕТОГО.
  const stageForm = useResolvedSheet(formSheetCandidates(hero, sel.def ? sel.sheet : null, formSheetOf(hero, cosmetics.formSkins ?? {}, { ...cosmetics.equipped, skin: sel.def?.id })));
  const asWornForm = useResolvedSheet(formSheetCandidates(hero, equippedSkin?.variant ?? null, formSheetOf(hero, {}, cosmetics.equipped)));
  const formSkins = COSMETICS.filter((c) => c.slot === "form" && c.hero === hero);
  const formOn = cosmetics.formSkins?.[hero];
  const setFormSkin = useArcade((s) => s.setFormSkin);
  const worn = (sel.def?.id ?? null) === (equippedSkin?.id ?? null);
  // Облик по слотам (T13.80): на витрине — собранный облик надетого скина; вкладка слота и части-источники.
  const hp = HERO_PARTS[hero];
  const wornLook = heroLook(hero, cosmetics);
  const pendingDef = pending ? COSMETIC_BY_ID[pending.id] : undefined;
  // Примерка выбранной к покупке части: облик, каким он станет после покупки (часть считается своей).
  const tryOnSheet = pending?.kind === "part" ? loadoutSheet(hero, cosmetics.equipped, cosmetics.styles, { ...(cosmetics.loadout?.[hero] ?? {}), [pending.slot]: pending.src }, [...cosmetics.owned, pending.id]) : null;
  const stageSheet = tryOnSheet ?? (worn && wornLook.mixed ? wornLook.sheet : previewSheet);
  // Что сейчас даёт форма: явный выбор / «обычная» / бандл надетого сета / форма самого облика. Подпись под витриной —
  // чтобы было видно, выбран ли скин на Метаморфозу (владелец 2026-09-19: «нет понимания, выбран ли скин»).
  const formNow = pending?.kind === "form" && pendingDef ? pendingDef.variant : stageForm;
  const formDef = COSMETICS.find((c) => c.slot === "form" && c.variant === wornLook.form);
  const formLabel = formOn === LOOK_DEFAULT ? t("arcade.wardrobe.formDefault") : formDef ? t(`arcade.cosmetic.${formDef.id}` as MessageKey) : t("arcade.wardrobe.formOfLook");
  const asWornSummons = summonSheets(hero, {}, cosmetics.equipped);
  const [slotPick, setSlotTab] = useState<DotaSlot>(hp?.slots[0] ?? "head");
  const myLoadout = cosmetics.loadout?.[hero] ?? {};
  // Основа надетого облика (срез 2): семейство слоёв — базовая модель, аркана или её стиль; слоты редактируются на ней.
  const wornFam = familyOf(hero, cosmetics.equipped, cosmetics.styles);
  // Слот без выбора (закреплён за основой: арбалет арканы Drow) вкладкой не показываем.
  const slotTabs = wornFam ? choosableSlots(hero, wornFam.id) : hp?.slots ?? [];
  const slotTab = slotTabs.includes(slotPick) ? slotPick : slotTabs[0] ?? slotPick;
  const wornDefaults = defaultLoadout(hero, cosmetics.equipped, cosmetics.styles);
  const followSrc = wornDefaults[slotTab];
  const partSheet = (src: string) => `${wornFam?.id ?? hero}+body+${src}.${slotTab}`;
  const srcName = (src: string) => { const d = sourceCosmetic(hero, src); return d ? t(`arcade.cosmetic.${d.id}` as MessageKey) : t("arcade.wardrobe.base"); };
  const changedSlots = (hp?.slots ?? []).filter((s) => wornLook.parts[s] !== wornDefaults[s]);
  const wornStyleDef = equippedSkin?.styles?.find((st) => st.id === cosmetics.styles[equippedSkin.id]);
  const resetParts = useArcade((s) => s.resetParts);
  const summonArts = [...new Set(Object.values(def.abilities).map((a) => a.summon?.art).filter((a): a is string => !!a && COSMETICS.some((c) => c.slot === "summon" && c.hero === hero && c.variant.startsWith(`${a}@`))))];
  const price = sel.def ? SHARD_PRICE[sel.def.rarity] : 0;
  const tabs = ([["looks", "arcade.wardrobe.tab.looks", true], ["parts", "arcade.wardrobe.slots", !!hp || skins.length > 0], ["form", "arcade.wardrobe.forms", hasForm && formSkins.length > 0], ["summons", "arcade.wardrobe.summons", summonArts.length > 0], ["effects", "arcade.wardrobe.tab.effects", true]] as [WardrobeTab, MessageKey, boolean][]).filter((x) => x[2]);
  const applyPending = (p: PendingBuy) => { if (p.kind === "part") setPart(p.slot, p.src); else if (p.kind === "summon") setSummonSkin(p.art, p.id); else setFormSkin(p.id); };
  /** Тычок по миниатюре: своя — надеть, некупленная — выбрать к покупке (см. `pickThumb`). */
  const onThumb = (owned: boolean, want: PendingBuy) => { const r = pickThumb(owned, want, pending); if (r.apply) applyPending(want); setPending(r.pending); };
  const isPending = (kind: PendingBuy["kind"], id: string) => pending?.kind === kind && pending.id === id;
  /** Полоса покупки выбранной миниатюры — под списком вкладки. */
  const buyBar = (kind: PendingBuy["kind"]) => pending && pendingDef && pending.kind === kind && (kind !== "part" || (pending.kind === "part" && pending.slot === slotTab)) ? (
    <div className="arcade-wardrobe__buybar" data-testid="arcade-wardrobe-pending">
      <span>{t(`arcade.cosmetic.${pendingDef.id}` as MessageKey)}</span>
      <Button variant="primary" data-testid="arcade-wardrobe-pending-buy" disabled={cosmetics.shards < SHARD_PRICE[pendingDef.rarity]} onClick={() => { if (buyCosmetic(pendingDef.id)) { applyPending(pending); setPending(null); } }}>
        {t("arcade.wardrobe.buy", { n: SHARD_PRICE[pendingDef.rarity] })}
      </Button>
    </div>
  ) : null;
  // Аркана рисуется со свечением; самоцветы показываем только если у листа это свечение есть
  // (как в Dota: призматический самоцвет красит эффекты, и облику без них он не нужен).
  const arcana = sel.def?.rarity === "arcana";
  const effectVariant = (slot: CosmeticSlot) => { const id = cosmetics.equipped[slot]; return id ? COSMETIC_BY_ID[id]?.variant : undefined; };
  const previewEffects: PreviewEffects = { frame: effectVariant("frame") as GroundEffect | undefined, aura: effectVariant("aura") as AuraEffect | undefined, skinAura: ((worn ? wornLook.fx?.aura : sel.def?.fx?.aura) as AuraEffect | undefined) ?? HERO_AURA[hero], trail: effectVariant("trail") as TrailEffect | undefined, death: effectVariant("death") as DeathEffect | undefined };
  const glow = useSheetGlow(previewSheet, arcana);
  const styleOptions = (sel.def?.styles ?? []).filter((st) => st.hue === undefined || !!glow);
  return (
    <Modal
      title={info.name || def.picture}
      size="wide"
      subhead={<span className="arcade-wardrobe__shards">{t("arcade.cosmetics.shards", { n: cosmetics.shards })}</span>}
      onClose={onClose}
      layout="content"
      labelledBy={titleId}
      dismissLabel={t("common.close")}
    >
      <div className="arcade-wardrobe" data-testid="arcade-wardrobe">
        <div className="arcade-wardrobe__stage">
          <div className="arcade-wardrobe__stages">
            <LookPreview key={`${stageSheet}#${selStyle?.hue ?? "own"}#${previewAnim}#${previewBg}#${lifeSize}`} sheet={previewAnim === "form" ? formNow : stageSheet} size={compare ? Math.round(stageSize * 0.7) : stageSize} gem={previewAnim === "form" && wornLook.form && formOn !== LOOK_DEFAULT ? selStyle?.hue ?? glow?.hue ?? null : selStyle?.hue ?? null} glow={arcana} effects={previewEffects} anim={previewAnim === "form" ? "idle" : previewAnim} bg={previewBg} lifeSize={lifeSize} />
            {compare && sel.def && (
              <span className="arcade-wardrobe__compare" data-testid="arcade-wardrobe-compare">
                <LookPreview key={`base#${previewAnim}#${previewBg}#${lifeSize}`} sheet={previewAnim === "form" ? `${hero}@meta` : hero} size={Math.round(stageSize * 0.7)} effects={{ skinAura: HERO_AURA[hero] }} anim={previewAnim === "form" ? "idle" : previewAnim} bg={previewBg} lifeSize={lifeSize} />
                <small>{t("arcade.wardrobe.base")}</small>
              </span>
            )}
          </div>
          <button type="button" className="arcade-wardrobe__view-toggle" aria-expanded={viewOpen} aria-controls={`${titleId}-view`} data-active={viewOpen ? "true" : undefined} data-testid="arcade-wardrobe-view-toggle" onClick={() => setViewOpen((v) => !v)}>{t("arcade.wardrobe.view")}</button>
          <div className="arcade-wardrobe__controls" id={`${titleId}-view`} data-open={viewOpen ? "true" : undefined} data-testid="arcade-wardrobe-controls">
            {(["auto", "idle", "walk", "attack", ...(hasForm ? (["form"] as const) : [])] as (PreviewAnim | "form")[]).map((a) => (
              <button key={a} type="button" className="arcade-rank__tier" aria-pressed={previewAnim === a} data-active={previewAnim === a ? "true" : undefined} data-testid={`arcade-wardrobe-anim-${a}`} onClick={() => setPreviewAnim(a)}>{t(`arcade.wardrobe.anim.${a}` as MessageKey)}</button>
            ))}
            <span className="arcade-wardrobe__sep" />
            {(["none", "radiant", "dire"] as const).map((b) => (
              <button key={b} type="button" className="arcade-rank__tier" aria-pressed={previewBg === b} data-active={previewBg === b ? "true" : undefined} data-testid={`arcade-wardrobe-bg-${b}`} onClick={() => setPreviewBg(b)}>{t(`arcade.wardrobe.bg.${b}` as MessageKey)}</button>
            ))}
            <span className="arcade-wardrobe__sep" />
            <button type="button" className="arcade-rank__tier" aria-pressed={lifeSize} data-active={lifeSize ? "true" : undefined} data-testid="arcade-wardrobe-lifesize" onClick={() => setLifeSize((v) => !v)}>{t("arcade.wardrobe.lifeSize")}</button>
            <button type="button" className="arcade-rank__tier" aria-pressed={compare} data-active={compare ? "true" : undefined} disabled={!sel.def} data-testid="arcade-wardrobe-compare-toggle" onClick={() => setCompare((v) => !v)}>{t("arcade.wardrobe.compare")}</button>
          </div>
          <strong data-testid="arcade-wardrobe-name">
            {sel.def ? t(`arcade.cosmetic.${sel.def.id}` as MessageKey) : t("arcade.wardrobe.base")}
          </strong>
          {sel.def && <small data-rarity={sel.def.rarity}>{t(`arcade.rarity.${sel.def.rarity}` as MessageKey)}</small>}
          {hasForm && formSkins.length > 0 && <small className="arcade-wardrobe__hint" data-testid="arcade-wardrobe-form-now">{t(formOn ? "arcade.wardrobe.formNow" : "arcade.wardrobe.formNowFollow", { name: formLabel })}</small>}
          {worn && wornFam && changedSlots.length > 0 && (
            <div className="arcade-wardrobe__composition" data-testid="arcade-wardrobe-composition">
              {wornLook.mixed && <b>{t("arcade.wardrobe.mixed")}</b>}
              <span>{t("arcade.wardrobe.baseOf")}: {wornFam.id === hero ? t("arcade.wardrobe.base") : equippedSkin ? t(`arcade.cosmetic.${equippedSkin.id}` as MessageKey) : hero}</span>
              {changedSlots.map((s) => <span key={s}>{t(`arcade.wardrobe.slot.${s}` as MessageKey)}: {wornLook.parts[s] ? srcName(wornLook.parts[s]!) : t("arcade.wardrobe.slotEmpty")}</span>)}
              <button type="button" data-testid="arcade-wardrobe-reset-parts" onClick={resetParts}>{t("arcade.wardrobe.resetParts")}</button>
            </div>
          )}
          {worn && wornLook.styleDropped && wornStyleDef && <em className="arcade-wardrobe__hint" data-testid="arcade-wardrobe-style-dropped">{t("arcade.wardrobe.styleDropped", { style: t(`arcade.style.${wornStyleDef.id}` as MessageKey) })}</em>}
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
        </div>
        <div className="arcade-wardrobe__panel">
          <div className="arcade-wardrobe__tabs" role="tablist" aria-labelledby={titleId} data-testid="arcade-wardrobe-tabs">
            {tabs.map(([id, key]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`${titleId}-tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`${titleId}-panel`}
                tabIndex={tab === id ? 0 : -1}
                className="arcade-rank__tier"
                data-active={tab === id ? "true" : undefined}
                data-testid={`arcade-wardrobe-tab-${id}`}
                onClick={() => selectTab(id)}
                onKeyDown={(e) => {
                  // Стрелки/Home/End двигают выбор по вкладкам (WAI-ARIA tabs), фокус едет вместе с выбором.
                  const next = tabByKey(tabs.map((x) => x[0]), id, e.key);
                  if (!next) return;
                  e.preventDefault();
                  selectTab(next);
                  document.getElementById(`${titleId}-tab-${next}`)?.focus();
                }}
              >
                {t(key)}
              </button>
            ))}
          </div>
          <div className="arcade-wardrobe__tabpanel" role="tabpanel" id={`${titleId}-panel`} aria-labelledby={`${titleId}-tab-${tab}`}>
          {tab === "looks" && (
            <>
        <div className="arcade-wardrobe__looks" data-testid="arcade-wardrobe-looks">
          {looks.map((l) => {
            const id = l.def?.id ?? "base";
            return (
              <button
                key={id}
                type="button"
                className="arcade-wardrobe__look"
                aria-pressed={(l.def?.id ?? null) === (sel.def?.id ?? null)} data-active={(l.def?.id ?? null) === (sel.def?.id ?? null) ? "true" : undefined}
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

          {sel.def && styleOptions.length > 0 && (
            <div className="arcade-wardrobe__styles" data-testid="arcade-wardrobe-styles">
              <small>{t("arcade.wardrobe.styles")}</small>
              <div className="arcade-cosmetics__options">
                <button type="button" className="arcade-rank__tier" aria-pressed={!selStyle} data-active={!selStyle ? "true" : undefined} onClick={() => setStyle(sel.def!.id, null)}>{t("arcade.wardrobe.styleBase")}</button>
                {styleOptions.map((st) => (
                  <button key={st.id} type="button" className="arcade-rank__tier" aria-pressed={selStyle?.id === st.id} data-active={selStyle?.id === st.id ? "true" : undefined} data-testid={`arcade-wardrobe-style-${st.id}`} onClick={() => setStyle(sel.def!.id, st.id)}>
                    {st.hue !== undefined && <i className="arcade-wardrobe__gem" style={{ background: `hsl(${st.hue} 72% 56%)` }} />}
                    {t(`arcade.style.${st.id}` as MessageKey)}
                  </button>
                ))}
              </div>
            </div>
          )}
            </>
          )}
        {tab === "parts" && hp && (
          <div className="arcade-wardrobe__slots" data-testid="arcade-wardrobe-slots">
            <small>{t("arcade.wardrobe.slots")}</small>
            {!wornFam ? (
              <em className="arcade-wardrobe__hint" data-testid="arcade-wardrobe-slots-whole">{t("arcade.wardrobe.slotsWhole")}</em>
            ) : (
              <>
                <div className="arcade-cosmetics__options">
                  {slotTabs.map((slot) => (
                    <button key={slot} type="button" className="arcade-rank__tier" aria-pressed={slotTab === slot} data-active={slotTab === slot ? "true" : undefined} data-override={myLoadout[slot] ? "true" : undefined} data-testid={`arcade-wardrobe-slot-${slot}`} onClick={() => { setSlotTab(slot); setPending(null); }}>{t(`arcade.wardrobe.slot.${slot}` as MessageKey)}</button>
                  ))}
                </div>
                <div className="arcade-wardrobe__looks" data-testid="arcade-wardrobe-parts">
                  <button type="button" className="arcade-wardrobe__look" aria-pressed={!myLoadout[slotTab]} data-active={!myLoadout[slotTab] ? "true" : undefined} data-owned="true" data-testid="arcade-wardrobe-part-follow" onClick={() => { setPart(slotTab, null); setPending(null); }}>
                    {followSrc ? <LookPreview sheet={partSheet(followSrc)} size={64} still /> : <span className="arcade-wardrobe__slot" style={{ width: 64, height: 64 }}><small>{t("arcade.wardrobe.slotEmpty")}</small></span>}
                    <span>{t("arcade.wardrobe.followSkin")}</span>
                    {!myLoadout[slotTab] && <b>{t("arcade.wardrobe.wornMark")}</b>}
                  </button>
                  {Object.keys(wornFam.family.sources).filter((src) => wornFam.family.sources[src].includes(slotTab)).map((src) => {
                    const srcDef = sourceCosmetic(hero, src);
                    const owned = src === PART_BASE || (srcDef ? cosmetics.owned.includes(srcDef.id) : false);
                    return (
                      <button
                        key={src}
                        type="button"
                        className="arcade-wardrobe__look"
                        aria-pressed={myLoadout[slotTab] === src} data-active={myLoadout[slotTab] === src ? "true" : undefined}
                        data-rarity={srcDef?.rarity}
                        data-owned={owned ? "true" : undefined}
                        data-pending={srcDef && isPending("part", srcDef.id) ? "true" : undefined}
                        data-testid={`arcade-wardrobe-part-${src}`}
                        onClick={() => { if (owned) { setPart(slotTab, src); setPending(null); } else if (srcDef) onThumb(false, { kind: "part", id: srcDef.id, slot: slotTab, src }); }}
                      >
                        <LookPreview sheet={partSheet(src)} size={64} still />
                        <span>{srcDef ? t(`arcade.cosmetic.${srcDef.id}` as MessageKey) : t("arcade.wardrobe.base")}</span>
                        {myLoadout[slotTab] === src && <b>{t("arcade.wardrobe.wornMark")}</b>}
                        {!owned && srcDef && <em>{SHARD_PRICE[srcDef.rarity]}</em>}
                      </button>
                    );
                  })}
                </div>
                {buyBar("part")}
                <small className="arcade-wardrobe__hint">{t("arcade.wardrobe.slotsHint")}</small>
              </>
            )}
          </div>
        )}
        {tab === "summons" && summonArts.length > 0 && (
          <div className="arcade-wardrobe__slots" data-testid="arcade-wardrobe-summons">
            <small>{t("arcade.wardrobe.summons")}</small>
            {summonArts.map((art) => {
              const on = cosmetics.summonSkins?.[hero]?.[art];
              // У сета героя может быть свой призыв (волки Ambry): тогда «как у облика» и «обычный» — разные выборы.
              const bundled = COSMETICS.some((c) => c.slot === "summon" && c.hero === hero && c.withSkin && c.variant.startsWith(`${art}@`));
              return (
                <div key={art} className="arcade-wardrobe__looks">
                  {bundled && (
                    <button type="button" className="arcade-wardrobe__look" aria-pressed={!on} data-active={!on ? "true" : undefined} data-owned="true" data-testid={`arcade-wardrobe-summon-${art}-follow`} onClick={() => { setSummonSkin(art, null); setPending(null); }}>
                      <LookPreview sheet={asWornSummons[art] ?? art} size={64} still />
                      <span>{t("arcade.wardrobe.followSkin")}</span>
                      {!on && <b>{t("arcade.wardrobe.wornMark")}</b>}
                    </button>
                  )}
                  <button type="button" className="arcade-wardrobe__look" aria-pressed={(bundled ? on === LOOK_DEFAULT : !on)} data-active={(bundled ? on === LOOK_DEFAULT : !on) ? "true" : undefined} data-owned="true" data-testid={`arcade-wardrobe-summon-${art}-base`} onClick={() => { setSummonSkin(art, bundled ? LOOK_DEFAULT : null); setPending(null); }}>
                    <LookPreview sheet={art} size={64} still />
                    <span>{t("arcade.wardrobe.summonBase")}</span>
                    {(bundled ? on === LOOK_DEFAULT : !on) && <b>{t("arcade.wardrobe.wornMark")}</b>}
                  </button>
                  {COSMETICS.filter((c) => c.slot === "summon" && c.hero === hero && c.variant.startsWith(`${art}@`)).map((c) => {
                    const owned = cosmetics.owned.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="arcade-wardrobe__look"
                        aria-pressed={on === c.id} data-active={on === c.id ? "true" : undefined}
                        data-rarity={c.rarity}
                        data-owned={owned ? "true" : undefined}
                        data-pending={isPending("summon", c.id) ? "true" : undefined}
                        data-testid={`arcade-wardrobe-summon-${c.id}`}
                        onClick={() => onThumb(owned, { kind: "summon", id: c.id, art })}
                      >
                        <LookPreview sheet={c.variant} size={64} still />
                        <span>{t(`arcade.cosmetic.${c.id}` as MessageKey)}</span>
                        {on === c.id && <b>{t("arcade.wardrobe.wornMark")}</b>}
                        {!owned && <em>{SHARD_PRICE[c.rarity]}</em>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {buyBar("summon")}
          </div>
        )}
        {tab === "form" && hasForm && formSkins.length > 0 && (
          <div className="arcade-wardrobe__slots" data-testid="arcade-wardrobe-forms">
            <small>{t("arcade.wardrobe.forms")}</small>
            <div className="arcade-wardrobe__looks">
              <button type="button" className="arcade-wardrobe__look" aria-pressed={!formOn} data-active={!formOn ? "true" : undefined} data-owned="true" data-testid="arcade-wardrobe-form-follow" onClick={() => { setFormSkin(null); setPending(null); }}>
                <LookPreview sheet={asWornForm} size={64} still />
                <span>{t("arcade.wardrobe.formBase")}</span>
                {!formOn && <b>{t("arcade.wardrobe.wornMark")}</b>}
              </button>
              <button type="button" className="arcade-wardrobe__look" aria-pressed={formOn === LOOK_DEFAULT} data-active={formOn === LOOK_DEFAULT ? "true" : undefined} data-owned="true" data-testid="arcade-wardrobe-form-base" onClick={() => { setFormSkin(LOOK_DEFAULT); setPending(null); }}>
                <LookPreview sheet={`${hero}@meta`} size={64} still />
                <span>{t("arcade.wardrobe.formDefault")}</span>
                {formOn === LOOK_DEFAULT && <b>{t("arcade.wardrobe.wornMark")}</b>}
              </button>
              {formSkins.map((c) => {
                const owned = cosmetics.owned.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="arcade-wardrobe__look"
                    aria-pressed={formOn === c.id} data-active={formOn === c.id ? "true" : undefined}
                    data-rarity={c.rarity}
                    data-owned={owned ? "true" : undefined}
                    data-pending={isPending("form", c.id) ? "true" : undefined}
                    data-testid={`arcade-wardrobe-form-${c.id}`}
                    onClick={() => onThumb(owned, { kind: "form", id: c.id })}
                  >
                    <LookPreview sheet={c.variant} size={64} still />
                    <span>{t(`arcade.cosmetic.${c.id}` as MessageKey)}</span>
                    {formOn === c.id && <b>{t("arcade.wardrobe.wornMark")}</b>}
                    {!owned && <em>{SHARD_PRICE[c.rarity]}</em>}
                  </button>
                );
              })}
            </div>
            {buyBar("form")}
          </div>
        )}
        {tab === "parts" && !hp && skins.length > 0 && (
          <div className="arcade-wardrobe__slots" data-testid="arcade-wardrobe-slots-soon">
            <small>{t("arcade.wardrobe.slots")}</small>
            <em className="arcade-wardrobe__hint">{t("arcade.wardrobe.slotsSoon")}</em>
          </div>
        )}
        {tab === "effects" && (
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
                  <button type="button" className="arcade-rank__tier" aria-pressed={!cosmetics.equipped[slot]} data-active={!cosmetics.equipped[slot] ? "true" : undefined} onClick={() => equip(slot, null)}>{t("arcade.cosmetics.none")}</button>
                  {all.map((c) => {
                    const owned = cosmetics.owned.includes(c.id);
                    return owned ? (
                      <button key={c.id} type="button" className="arcade-rank__tier" data-rarity={c.rarity} aria-pressed={cosmetics.equipped[slot] === c.id} data-active={cosmetics.equipped[slot] === c.id ? "true" : undefined} data-testid={`arcade-cosmetic-${c.id}`} onClick={() => equip(slot, c.id)}>
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
        )}
          </div>
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
