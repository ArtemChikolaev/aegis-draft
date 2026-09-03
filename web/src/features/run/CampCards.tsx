// Презентационные части Буткемпа: формат чисел, бейджи, карточки. Всё здесь — чистые функции и
// компоненты без доступа к стору: они получают уже посчитанные значения и только рисуют их.
// Вынесены из `CampScreen`, который держал их вперемешку с экономикой экрана (R14.2).
import type { ReactNode } from "react";
import type { SummandValues } from "../../game/anteEconomy.ts";
import type { Rarity } from "../../game/rarity.ts";
import { evaluateItems, type EffectMatch, type ItemDef } from "../../game/items.ts";
import type { Candidate } from "../../game/packs.ts";
import type { BossEvaluation } from "../../game/bossConditions.ts";
import { roleMessageKey, type MessageKey } from "../../i18n/core.ts";
import type { SummandDelta } from "./campPresentation.ts";
import type { OfferOverlayAction } from "./OfferOverlay.tsx";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { Eyebrow, HeroThumb, OvrBadge, playerOvrTier, RoleTag, TeamLogo, teamMonogram } from "../../ui/index.ts";
import { useHero } from "../draft/heroes.ts";

/** Перевод с уже подставленными переменными — ровно та сигнатура, что отдаёт `useI18n`. */
export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function fmt(value: number): string {
  return Number.isInteger(value) ? value.toString() : (Math.round(value * 10) / 10).toString();
}

export function signed(value: number): string {
  return value > 0 ? `+${fmt(value)}` : fmt(value);
}

/** Параметры шаблона описания предмета: теги и атрибуты переводятся, числа остаются числами.
 *  Описание собирается из тех же данных, что и эффект, поэтому текст не может разойтись с числом. */
export function itemLabelParams(
  params: Record<string, string | number>,
  t: Translate,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key === "tag") out[key] = t(`heroTag.${value}` as MessageKey);
    else if (key === "attr") out[key] = t(`heroAttr.${value}` as MessageKey);
    else out[key] = value;
  }
  return out;
}

/** Панель boss condition: правило + причина + статус штрафа против ТЕКУЩЕГО ростера.
 *  Одна на два случая — предстоящий этап и разведанный турнир (R9.4): содержимое у них
 *  идентичное, разная только подпись и то, что разведанный ещё не наступил. */
export function BossPanel({ boss, eyebrow, hint, testId, scouted = false }: {
  boss: BossEvaluation;
  eyebrow: string;
  hint?: string;
  testId: string;
  scouted?: boolean;
}) {
  const { t } = useI18n();
  return (
    <section
      className={`camp-boss camp-boss--${boss.met ? "met" : "active"}${scouted ? " camp-boss--scouted" : ""}`}
      data-testid={testId}
      data-boss-id={boss.bossId}
    >
      <div className="camp-boss__head">
        <Eyebrow>{eyebrow}</Eyebrow>
        <strong className="camp-boss__name">{t(`boss.${boss.bossId}` as MessageKey)}</strong>
      </div>
      <p className="camp-boss__desc">{t(`boss.desc.${boss.bossId}` as MessageKey)}</p>
      <div className="camp-boss__status">
        <span className={`camp-boss__reason camp-boss__reason--${boss.met ? "met" : "warn"}`}>
          {t(boss.reasonKey as MessageKey, boss.reasonParams)}
        </span>
        {boss.met ? (
          <span className="camp-boss__tag camp-boss__tag--met" data-testid={`${testId}-met`}>
            ✓ {t("boss.metLabel")}
          </span>
        ) : (
          <span className="camp-boss__tag camp-boss__tag--warn" data-testid={`${testId}-penalty`}>
            {t("boss.penaltyValue", { n: fmt(boss.penalty) })}
          </span>
        )}
      </div>
      {hint && <p className="camp-boss__hint">{hint}</p>}
    </section>
  );
}

/** Что показывает инспектор карточки: identity + готовый разбор. Собирается в момент клика, потому
 *  что дельты уже посчитаны для самой карточки — второй раз считать их нельзя (разошлись бы). */
export interface InspectedOffer {
  title: string;
  subtitle?: string;
  summary?: ReactNode;
  deltas: SummandDelta[];
  total: number;
  from: number;
  to: number;
  action?: OfferOverlayAction;
}

export type CampSection = "reward" | "market" | "build" | "preparation";

/** Главная цифра остаётся компактной; точка входа теперь вся карточка, а не этот чип. */
export function OfferDelta({ delta }: {
  delta: number;
}) {
  const { t } = useI18n();
  return (
    <span className={`camp-offer__delta camp-offer__delta--${delta >= 0 ? "up" : "down"}`}>
      {t("camp.power")} {signed(delta)}
    </span>
  );
}

/** Прозрачная доступная кнопка поверх неинтерактивной части карточки. Вложенные действия
 *  поднимаются выше неё CSS-ом, поэтому Buy/Swap/select не открывают оверлей. */
export function CardInspectTrigger({ label, delta, testId, onOpen }: {
  label: string;
  delta: number;
  testId: string;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="camp-card-inspect-trigger"
      aria-label={`${label} · ${t("camp.power")} ${signed(delta)} · ${t("camp.offerDetails")}`}
      data-testid={testId}
      onClick={onOpen}
    />
  );
}

export function valuesOf(score: { base: number; heroSynergy: number; chemistry: number }): SummandValues {
  return {
    base: score.base,
    heroSynergy: score.heroSynergy,
    chemistry: score.chemistry,
  };
}

/** Подпись вклада предмета. `economy`/`boss` — НЕ силовые слои, поэтому числа здесь не показываем:
 *  их несёт описание карточки. Раньше оба слоя падали в общий fallback и подписывались «Roster»,
 *  из-за чего Linken's Sphere (потолок штрафа босса = 2) читался как «+2 к силе ростера». */
export function layerChip(
  source: { layer: "flat" | "additive" | "xMult" | "economy" | "boss"; value: number; met: boolean },
  t: Translate,
): string {
  if (source.layer === "xMult") return `${t("camp.powerX")} ×${source.value.toFixed(2)}`;
  if (source.layer === "additive") {
    return `${t("camp.powerAdditive")} ${source.value > 0 ? "+" : ""}${fmt(source.value)}%`;
  }
  if (source.layer === "flat") {
    return `${t("camp.powerRoster")} ${source.value > 0 ? "+" : ""}${fmt(source.value)}`;
  }
  const label = t(source.layer === "boss" ? "camp.powerBoss" : "camp.powerEconomy");
  return source.met ? `${label} · ${t("camp.layerActive")}` : `${label} · ${t("camp.tacticNoEffect")}`;
}

/** Что предмет даст ПРЯМО СЕЙЧАС на текущем ростере — чтобы награду можно было сравнить с золотом. */
export function itemContribution(
  def: ItemDef,
  activeHeroes: readonly number[],
  t: Translate,
  rarity: Rarity = "common",
  /** Заряды карты (R13.5): у новой награды 0, у экипированной — реальные. */
  charges = 0,
): { text: string; positive: boolean } | null {
  const evaluation = evaluateItems([def.id], {
    activeHeroes,
    cardRarity: { [def.id]: rarity },
    cardCharges: { [def.id]: charges },
  });
  const parts: string[] = [];
  if (evaluation.flat !== 0) parts.push(`${t("camp.powerRoster")} ${evaluation.flat > 0 ? "+" : ""}${fmt(evaluation.flat)}`);
  if (evaluation.additive !== 0) parts.push(`${t("camp.powerAdditive")} ${evaluation.additive > 0 ? "+" : ""}${fmt(evaluation.additive)}%`);
  for (const mult of evaluation.xMults) parts.push(`${t("camp.powerX")} ×${mult.toFixed(2)}`);
  if (parts.length) return { text: parts.join(" · "), positive: evaluation.flat >= 0 && evaluation.additive >= 0 };
  // Пустой силовой вклад ≠ «условие не выполнено». У экономических и антибоссовых предметов
  // силовых слоёв нет ПО ПОСТРОЕНИЮ, и их эффект уже описан текстом карточки — приписывать им
  // невыполненное условие значит врать про карту, у которой условия нет вовсе.
  const hasPowerCondition = evaluation.sources.some(
    (source) => source.layer === "flat" || source.layer === "additive" || source.layer === "xMult",
  );
  if (!hasPowerCondition) return null;
  return { text: t("camp.conditionUnmet"), positive: false };
}

/** Подсветка условия предмета: КТО из активных героев его сейчас включает (R11.7).
 *
 *  Показываем не «все теги героя» (их у каждого несколько — это шум), а обратную проекцию:
 *  по конкретной карточке — конкретные герои. Для условия «без тега» подсвечиваем нарушителей:
 *  именно они выключают карточку, и это ровно то, что игроку надо увидеть. */
export function ItemMatch({ match, hero, t }: {
  match: EffectMatch;
  hero: (heroId: number) => { picture: string; name: string };
  t: Translate;
}) {
  if (match.kind === "none") return null;
  if (match.kind === "diversity") {
    return (
      <span className={`camp-offer__delta camp-offer__delta--${match.met ? "up" : "down"}`}>
        {t("item.match.diversity", { have: match.distinct ?? 0, min: match.min ?? 0 })}
      </span>
    );
  }
  const blockers = match.kind === "withoutTag";
  const label = blockers ? t("item.match.blockers") : t(`item.match.${match.kind}` as MessageKey);
  if (!match.heroIds.length) {
    // У «без тега» пустой список — это успех (нарушителей нет), у остальных — отсутствие условия.
    return blockers ? null : (
      <span className="camp-item-match__empty">{t("item.match.none")}</span>
    );
  }
  const capped = match.cap != null && match.heroIds.length > match.cap;
  return (
    <div className="camp-item-match" data-met={match.met} data-blockers={blockers}>
      <span className="camp-item-match__label">{label}</span>
      <span className="camp-item-match__heroes">
        {match.heroIds.map((heroId) => (
          <HeroThumb key={heroId} {...hero(heroId)} size="sm" showName={false} />
        ))}
      </span>
      {capped && (
        <span className="camp-item-match__note">
          {t("item.match.capped", { counted: match.counted, total: match.heroIds.length })}
        </span>
      )}
      {!match.met && match.min != null && !blockers && (
        <span className="camp-item-match__note">{t("item.match.needMore", { min: match.min })}</span>
      )}
    </div>
  );
}

export function CampPlayerCard({
  candidate,
  heroId,
  label,
  testId,
  nameTestId,
}: {
  candidate: Candidate;
  heroId?: number;
  /** Подпись слота. На рынке её НЕ передают: там оффер всегда идёт под роль игрока, и подпись
   *  дублировала бы `RoleTag` буква в букву («SUPPORT · SUPPORT»), съедая ширину у ника —
   *  живьём именно она обрезалась в «SUPPO…», а не длинное имя. Резерв подпись оставляет:
   *  там она говорит про слот, а не про роль. */
  label?: string;
  testId?: string;
  nameTestId?: string;
}) {
  const { t } = useI18n();
  const hero = useHero();
  const { player } = candidate;
  const tier = playerOvrTier(player.ovr);
  const assignedHero = heroId != null ? hero(heroId) : null;

  return (
    <div
      className={`camp-player-card card-tint--${tier}`}
      data-account-id={player.accountId}
      data-testid={testId}
    >
      <div className="camp-player-card__top">
        {label && <span className="camp-player-card__label">{label}</span>}
        <RoleTag role={player.role}>{t(roleMessageKey(player.role))}</RoleTag>
        {/* Логотип — опознание команды, и живёт он в ВЕРХНЕЙ строке, а не рядом с ником.
            В строке идентичности он отнимал 22px+gap у имени, и ники снова начали резаться
            («Cryst…», «Malr1…») — ровно та регрессия, которую чинил R14.1. Верхняя строка после
            R14.1 держит один чип роли, места там достаточно. */}
        <TeamLogo
          src={candidate.logoUrl}
          teamId={candidate.teamId}
          name={candidate.teamName}
          fallback={teamMonogram(candidate.teamName)}
        />
      </div>
      <div className="camp-player-card__identity">
        <span>
          <strong data-testid={nameTestId}>{player.nickname}</strong>
          <small>{candidate.teamName}</small>
        </span>
        {assignedHero && <HeroThumb {...assignedHero} showName={false} />}
      </div>
      <div className="camp-player-card__bottom">
        <span className="camp-player-card__stats">
          <span><b>{player.impact}</b> IMP</span>
          <span><b>{player.economy}</b> ECO</span>
          <span><b>{player.reliability}</b> REL</span>
        </span>
        <OvrBadge as="span" className="camp-player-card__ovr" ovr={player.ovr} unit />
      </div>
    </div>
  );
}
