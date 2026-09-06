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
import { COSMETICS, COSMETIC_BY_ID, SHARD_PRICE, type CosmeticDef, type CosmeticSlot } from "../../game/arcade/content/cosmetics.ts";
import { Button, Modal } from "../../ui/index.ts";
import { useHero } from "../draft/heroes.ts";
import { densePixel, pixelScale } from "./pixelMode.ts";
import { dotaSheet, drawDotaFrame, setPixelSheets } from "./sprites.ts";

/** Слоты, которые редактируются в гардеробе после облика. */
const EFFECT_SLOTS: readonly CosmeticSlot[] = ["frame", "trail", "death", "tint"];

/** Цикл превью: секунды на стойку, ходьбу (с разворотом) и удар. */
const IDLE_S = 1.6;
const WALK_S = 3.2;
const ATTACK_S = 1.2;
const LOOP_S = IDLE_S + WALK_S + ATTACK_S;

/**
 * Анимированное превью облика: тот же лист `dota_px*`, что рисует бой, кадры крутятся по часам
 * страницы (не по симу — это витрина, а не забег). `static` — одна поза для карточки списка.
 */
function LookPreview({ sheet, size, still = false }: { sheet: string; size: number; still?: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
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
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const s = dotaSheet(sheet) ?? dotaSheet(sheet.split("~")[0]);
      c.imageSmoothingEnabled = false;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, size, size);
      if (!s) return;
      const el = (performance.now() - t0) / 1000;
      const loop = el % LOOP_S;
      const anim = still || loop < IDLE_S ? "idle" : loop < IDLE_S + WALK_S ? "walk" : "attack";
      // Ходьба разворачивает модель кругом, стойка и удар — лицом к камере.
      const dir = anim === "walk" ? Math.floor(((loop - IDLE_S) / WALK_S) * s.meta.dirs) % s.meta.dirs : 0;
      const frame = still ? 0 : Math.floor(el * s.meta.fps);
      const mult = (size * 1.02) / Math.max(1, s.meta.world);
      drawDotaFrame(c, s, anim, dir, frame, size / 2, size * 0.9, 1, mult);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [sheet, size, still]);
  return <canvas ref={ref} className="arcade-wardrobe__canvas" style={{ width: size, height: size }} aria-hidden />;
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
  const heroOf = useHero();
  const def = HEROES[hero];
  const info = heroOf(def.dotaId);
  const skins = COSMETICS.filter((c) => c.slot === "skin" && c.hero === hero);
  const looks: Look[] = [
    { def: null, sheet: hero, owned: true },
    ...skins.map((c) => ({ def: c, sheet: c.variant, owned: cosmetics.owned.includes(c.id) })),
  ];
  const equippedSkin = skins.find((c) => c.id === cosmetics.equipped.skin) ?? null;
  const [selId, setSelId] = useState<string | null>(equippedSkin?.id ?? null);
  const sel = looks.find((l) => (l.def?.id ?? null) === selId) ?? looks[0];
  const selStyle = sel.def ? cosmetics.styles[sel.def.id] : undefined;
  const previewSheet = sel.def && selStyle && sel.def.styles?.includes(selStyle) ? `${sel.sheet}~${selStyle}` : sel.sheet;
  const worn = (sel.def?.id ?? null) === (equippedSkin?.id ?? null);
  const price = sel.def ? SHARD_PRICE[sel.def.rarity] : 0;
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
          <LookPreview key={previewSheet} sheet={previewSheet} size={220} />
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
          {sel.def && sel.def.styles && sel.def.styles.length > 0 && (
            <div className="arcade-wardrobe__styles" data-testid="arcade-wardrobe-styles">
              <small>{t("arcade.wardrobe.styles")}</small>
              <div className="arcade-cosmetics__options">
                <button type="button" className="arcade-rank__tier" data-active={!selStyle ? "true" : undefined} onClick={() => setStyle(sel.def!.id, null)}>{t("arcade.wardrobe.styleBase")}</button>
                {sel.def.styles.map((st) => (
                  <button key={st} type="button" className="arcade-rank__tier" data-active={selStyle === st ? "true" : undefined} data-testid={`arcade-wardrobe-style-${st}`} onClick={() => setStyle(sel.def!.id, st)}>
                    {t(`arcade.style.${st}` as MessageKey)}
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
                <LookPreview sheet={l.sheet} size={64} still />
                <span>{l.def ? t(`arcade.cosmetic.${l.def.id}` as MessageKey) : t("arcade.wardrobe.base")}</span>
                {(l.def?.id ?? null) === (equippedSkin?.id ?? null) && <b>{t("arcade.wardrobe.wornMark")}</b>}
                {!l.owned && <em>{SHARD_PRICE[l.def!.rarity]}</em>}
              </button>
            );
          })}
        </div>
        <div className="arcade-wardrobe__effects">
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
                      <button key={c.id} type="button" className="arcade-rank__tier arcade-cosmetics__buy" data-rarity={c.rarity} data-testid={`arcade-cosmetic-buy-${c.id}`} disabled={cosmetics.shards < SHARD_PRICE[c.rarity]} title={t("arcade.cosmetics.buyHint")} onClick={() => { if (buyCosmetic(c.id)) equip(slot, c.id); }}>
                        {t(`arcade.cosmetic.${c.id}` as MessageKey)} · {SHARD_PRICE[c.rarity]}
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
