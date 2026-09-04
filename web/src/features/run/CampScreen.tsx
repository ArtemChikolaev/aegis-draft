// Буткемп Roguelite Run (T5.2, срезы 2–3): Reward, контекстный Market и резерв.
// Постоянная левая панель переиспользует тот же Pentagon/SynergyBreakdown, что драфт и турнир:
// игрок всегда видит активный ростер, hero assignment и связи до принятия решения.
import { squadSynergyOf } from "../../data/dataFiles.ts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ECONOMY, tradeInRarity, type Offer, type Summand, type SummandValues } from "../../game/anteEconomy.ts";
import { nextRarity, type Rarity } from "../../game/rarity.ts";
import {
  conditionAxes,
  effectMatch,
  itemAt,
  itemDef,
  itemLabel,
  itemTier,
} from "../../game/items.ts";
import { stageMutators } from "../../game/anteRun.ts";
import { mutatorDescParams } from "../../game/dynastyMutators.ts";
import { buildTacticContext, isTacticId, tacticLabelParams, widePoolProgress } from "../../game/tactics.ts";
import { heroTags } from "../../game/heroTags.ts";
import type { Candidate } from "../../game/packs.ts";
import { candidatesOf, stakesOf } from "../../game/packs.ts";
import {
  chemistryPairEdges,
  chemistryPlayersFromRoster,
  heroStatsForAssignment,
  heroStatsForDisplay,
  heroSynergyRows,
  heroSynergyTier,
  playerHeroGames,
  squadChemistryRows,
} from "../../game/score.ts";
import { campBuildLinksMessageKey, campHeroGamesMessageKey, type MessageKey } from "../../i18n/core.ts";
import {
  campPowerPreview,
  evaluateCampPower,
  summandDeltas,
  type CampPowerPreview,
  type CampPowerState,
  type SummandDelta,
} from "./campPresentation.ts";
import { OfferOverlay } from "./OfferOverlay.tsx";
import { BuildCardInspector } from "./BuildCardInspector.tsx";
import { BuildRail, buildRailCards } from "./BuildRail.tsx";
import { MarketPanel } from "./MarketPanel.tsx";
import { BuildPanel } from "./BuildPanel.tsx";
import { ActionsPanel } from "./ActionsPanel.tsx";
import { ReservePanel } from "./ReservePanel.tsx";
import { RewardPanel } from "./RewardPanel.tsx";
import { PreparationPanel } from "./PreparationPanel.tsx";
import { CampCelebration } from "./CampCelebration.tsx";
import { TradeOverlay, type TradeOption } from "./TradeOverlay.tsx";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useRun } from "../../state/runStore.ts";
import {
  Button,
  CheatBadge,
  Eyebrow,
  HeroThumb,
  Modal,
  RarityBadge,
  useCardTilt,
  useCountUp,
  StageKindBadge,
  TagChips,
  type TagChip,
  StatTile,
  Surface,
} from "../../ui/index.ts";
import { Pentagon } from "../draft/Pentagon.tsx";
import { PlayerInspector } from "../draft/PlayerInspector.tsx";
import { HeroTagInspector } from "../heroes/HeroTagInspector.tsx";
import { SynergyBreakdown } from "../draft/SynergyBreakdown.tsx";
import { useHero } from "../draft/heroes.ts";
import {
  BossPanel,
  CampPlayerCard,
  ItemMatch,
  fmt,
  itemContribution,
  itemLabelParams,
  signed,
  valuesOf,
  type CampSection,
  type InspectedOffer,
} from "./CampCards.tsx";
import "./camp.css";

type RunSlice = ReturnType<typeof useRun.getState>;

interface CampScreenProps {
  camp: NonNullable<RunSlice["camp"]>;
  ante: NonNullable<RunSlice["ante"]>;
  snapshot: NonNullable<RunSlice["snapshot"]>;
  score: NonNullable<NonNullable<RunSlice["snapshot"]>["score"]>;
  data: NonNullable<RunSlice["data"]>;
  config: NonNullable<RunSlice["config"]>;
}

/** Обёртка — только guard. Тело с хуками живёт в CampScreenBody: там useMemo/useCallback стоят
 *  ПОСЛЕ проверки на null (правило хуков), и превью силы не пересчитываются на каждый клик по
 *  инспектору (T12.5, аудит 2026-09-02: 8 useState на экране × evaluateCampPower на оффер). */
export function CampScreen() {
  const camp = useRun((s) => s.camp);
  const ante = useRun((s) => s.ante);
  const snapshot = useRun((s) => s.snapshot);
  const data = useRun((s) => s.data);
  const config = useRun((s) => s.config);
  const score = snapshot?.score;
  if (!camp || !ante || !score || !snapshot || !data || !config) return null;
  return <CampScreenBody camp={camp} ante={ante} snapshot={snapshot} score={score} data={data} config={config} />;
}

function CampScreenBody({ camp, ante, snapshot, score, data, config }: CampScreenProps) {
  const seed = useRun((s) => s.seed);
  // Правила предстоящего этапа (LG3/T6.4): мутатор круга Династии или стартовые Stakes сезона
  // (T6.4-2: их может быть несколько); пусто — строки не рендерятся.
  const campMutators = stageMutators(seed, ante.index, undefined, stakesOf(config));
  const boss = useRun((s) => s.boss);
  const scoutedBoss = useRun((s) => s.scoutedBoss);
  const chooseReward = useRun((s) => s.chooseReward);
  const previewTactic = useRun((s) => s.previewTactic);
  const buyMarket = useRun((s) => s.buyMarket);
  const rerollMarket = useRun((s) => s.rerollMarket);
  const discardTactic = useRun((s) => s.discardTactic);
  const tradeCardAction = useRun((s) => s.tradeCard);
  const enchantCard = useRun((s) => s.enchantCard);
  const upgradeItemTier = useRun((s) => s.upgradeItemTier);
  const economy = useRun((s) => s.economy);
  const rerollTrade = useRun((s) => s.rerollTrade);
  const discardAction = useRun((s) => s.discardAction);
  const playCampAction = useRun((s) => s.playCampAction);
  const upgradeHeroRarity = useRun((s) => s.upgradeHeroRarity);
  const buyPrep = useRun((s) => s.buyPrep);
  const rerollBoss = useRun((s) => s.rerollBoss);
  const buyScouting = useRun((s) => s.buyScouting);
  const swapReservePlayer = useRun((s) => s.swapReservePlayer);
  const swapReserveHero = useRun((s) => s.swapReserveHero);
  const advanceAnteStage = useRun((s) => s.advanceAnteStage);
  const campCelebration = useRun((s) => s.campCelebration);
  const dismissCampCelebration = useRun((s) => s.dismissCampCelebration);
  const reset = useRun((s) => s.reset);
  const { t, locale } = useI18n();
  const hero = useHero();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [activeSection, setActiveSection] = useState<CampSection>("reward");
  const [heroTargets, setHeroTargets] = useState<Record<number, number>>({});
  const [inspectedPlayer, setInspectedPlayer] = useState<Candidate | null>(null);
  // Разбор карточки рынка (R13.3): на самой карточке одна цифра, полный `до → после` — здесь.
  const [inspected, setInspected] = useState<InspectedOffer | null>(null);
  // Вопрос «а кто вообще бывает illusion?» возникает посреди выбора в Буткемпе, поэтому отвечаем
  // модалкой, не уводя игрока с экрана с незакрытым выбором (тот же приём, что у карточки игрока).
  const [inspectedTag, setInspectedTag] = useState<string | null>(null);
  // Разбор карточки билда (плейтест 2026-08-04): слот показывает суть, полное описание — по клику.
  const [inspectedCard, setInspectedCard] = useState<string | null>(null);
  // Trade-in (LG1): какая карта слота меняется. Оверлей поверх Build — обмен точечный.
  const [tradeFor, setTradeFor] = useState<string | null>(null);

  // Новый Буткемп начинается с обязательного выбора награды. Resume после уже сделанного выбора
  // не возвращает игрока в свёрнутую награду — продолжает с рынка. Состояние это только UI:
  // в сейв и RunEngine разделы не протекают.
  useEffect(() => {
    setActiveSection(camp.rewardChosen ? "market" : "reward");
  }, [camp.campStageIndex]);
  // Золото берёт у `useCountUp` только НАПРАВЛЕНИЕ, а не набегающее значение.
  //
  // Почему не число: набег живёт на requestAnimationFrame, а в неактивной вкладке rAF тормозится —
  // поймано замером, счётчик застрял на 6 при настоящих 7. Для Team OVR это косметика, для золота
  // нет: по нему игрок решает, хватает ли на покупку, и показать не то число нельзя. Вспышка при
  // этом сохраняется — она и отвечает на «что сейчас изменилось» (design-language §Движение).
  //
  // В Cheat Mode целимся в null: у «∞» изменений не бывает, сигналить нечего.
  const { direction: goldDirection } = useCountUp(camp.unlimitedGold ? null : camp.gold);
  // Hover-tilt карточек (R15.6): один делегированный слушатель на корне экрана — карточки
  // постоянно перемонтируются раздачей, и вешать обработчики на каждую было бы утечкой
  // логики в списки. Углы пишутся CSS-переменными, стиль — camp.css.
  const tiltRootRef = useRef<HTMLElement | null>(null);
  useCardTilt(tiltRootRef);
  const candidates = useMemo(() => data.packs.flatMap(candidatesOf), [data]);
  const eventNames = useMemo(
    () => new Map(data.events.map((event) => [event.id, event.short ?? event.name])),
    [data.events],
  );
  const eventYears = useMemo(() => new Map(data.events.map((event) => [event.id, event.year])), [data.events]);
  const eventLabel = (eventId: string) => eventNames.get(eventId) ?? eventId;
  const heroName = (heroId: number) => hero(heroId).name;
  /** Происхождение формы (R5.3): «событие · год». */
  const originOf = (eventId: string) => {
    const year = eventYears.get(eventId);
    return year ? `${eventLabel(eventId)} · ${year}` : eventLabel(eventId);
  };

  // Алиасы остались от эпохи, когда guard стоял здесь же (пропсы теперь non-null): локальные
  // функции превью ссылаются на них, менять их тело ради переименования незачем.
  const activeCamp = camp;
  const activeSnapshot = snapshot;
  const activeData = data;

  const build = useMemo(() => ({
    economy: camp.modifiers,
    equippedCards: camp.equippedTactics,
    cardRarity: camp.cardRarity,
    cardCharges: camp.cardCharges,
  }), [camp.modifiers, camp.equippedTactics, camp.cardRarity, camp.cardCharges]);

  /** Собирает состояние превью через те же контексты, которыми реальные Tactics проверяют
   *  ростер. После замены игрока/героя нельзя переносить старый эффект карточки как константу. */
  function powerState(
    nextScore: SummandValues,
    roster: typeof activeSnapshot.roster,
    assignment: Record<number, number>,
    activeHeroes: readonly number[],
    heroRarity: Record<string, Rarity> = activeCamp.heroRarity,
  ): CampPowerState {
    return {
      score: nextScore,
      tacticContext: buildTacticContext(roster, assignment, activeData, activeCamp.campStageIndex),
      activeHeroes,
      heroRarity,
    };
  }

  // powerState читает activeData / activeCamp.heroRarity / campStageIndex — они в deps явно.
  const currentPowerState = useMemo(
    () => powerState(valuesOf(score), snapshot.roster, score.assignment.byPlayer, snapshot.heroes),
    [score, snapshot.roster, snapshot.heroes, data, camp.heroRarity, camp.campStageIndex],
  );
  const currentEvaluation = useMemo(() => evaluateCampPower(currentPowerState, build), [currentPowerState, build]);
  const current = currentEvaluation.values;
  const mods = currentEvaluation.modifiers;
  const tactics = currentEvaluation.tactics;
  const itemEval = currentEvaluation.items;
  const power = currentEvaluation.power;

  // Стабильная ссылка: MarketPanel кэширует превью офферов на раздачу, ключ кэша — эта функция.
  const previewPower = useCallback((
    nextScore: SummandValues,
    roster: typeof activeSnapshot.roster,
    assignment: Record<number, number>,
    activeHeroes: readonly number[],
    heroRarity: Record<string, Rarity> = activeCamp.heroRarity,
  ): CampPowerPreview => campPowerPreview(
    currentPowerState,
    powerState(nextScore, roster, assignment, activeHeroes, heroRarity),
    build,
  ), [currentPowerState, build, data, camp.heroRarity, camp.campStageIndex]);

  function replaceRosterCandidate(slotIndex: number, candidate: Candidate) {
    return activeSnapshot.roster.map((slot, index) => (
      index === slotIndex ? { ...slot, candidate } : slot
    ));
  }

  function replaceActiveHero(outgoingHeroId: number, incomingHeroId: number): number[] {
    return activeSnapshot.heroes.map((heroId) => heroId === outgoingHeroId ? incomingHeroId : heroId);
  }
  const playerOffers = camp.marketOffers.filter((o) => o.kind === "player");
  const heroOffers = camp.marketOffers.filter((o) => o.kind === "hero");
  const nextLabel = ante.target <= 1
    ? t("ante.nextTargetWin")
    : t("ante.nextTargetTop", { rank: ante.target });
  const { chemistryEdges, phs, displayPhs, heroRows, chemistryRows } = useMemo(() => {
    const phs = heroStatsForAssignment(data);
    const displayPhs = heroStatsForDisplay(data);
    return {
      chemistryEdges: chemistryPairEdges(chemistryPlayersFromRoster(snapshot.roster), squadSynergyOf(data), data.teammates),
      phs,
      displayPhs,
      heroRows: heroSynergyRows(snapshot.roster, score.assignment, phs, displayPhs),
      chemistryRows: squadChemistryRows(snapshot.roster, squadSynergyOf(data), data.teammates),
    };
  }, [snapshot.roster, score.assignment, data]);
  const synergyTier = heroSynergyTier(current.heroSynergy);
  const synergySublabel = synergyTier === "insane"
    ? t("draft.synergyInsane")
    : synergyTier === "great"
      ? t("draft.synergyGreat")
      : mods.heroSynergy
        ? signed(mods.heroSynergy)
        : undefined;
  // Активные карточки берём из тех же `sources`, что рисует разложение силы, — подсветка в рейле
  // не может разойтись с тем, что реально сработало.
  const activeCardIds = new Set<string>([
    ...itemEval.sources.filter((source) => source.met).map((source) => source.itemId),
    ...tactics.sources.map((source) => source.tacticId as string),
  ]);
  const railCards = buildRailCards(
    camp.equippedTactics, camp.heldActions, camp.cardRarity, activeCardIds,
    camp.cardEditions, camp.cardCharges,
  );
  const buildUsed = camp.equippedTactics.length;
  const preparationUsed = camp.heldActions.length;
  const chosenReward = camp.rewardOffers.find((offer) => offer.id === camp.chosenRewardId);

  const sections: Array<{ id: CampSection; label: string; status?: string }> = [
    { id: "reward", label: t("camp.navReward"), status: camp.rewardChosen ? "✓" : undefined },
    { id: "market", label: t("camp.market") },
    { id: "build", label: t("camp.navBuild"), status: `${buildUsed}/${camp.tacticSlots}` },
    { id: "preparation", label: t("camp.navPreparation"), status: `${preparationUsed}/${camp.actionSlots}` },
  ];

  /** Разбор оффера по слагаемым — чистые данные (`campPresentation`), одна арифметика на экран. */
  function offerDeltas(
    before: SummandValues,
    after: SummandValues,
    extra: Partial<SummandValues> = {},
  ): SummandDelta[] {
    return summandDeltas(before, after, mods, extra);
  }

  /** Те же дельты строками — там, где разбор и так короткий (резерв, ручной свап). */
  function deltaRows(
    before: SummandValues,
    after: SummandValues,
    extra: Partial<SummandValues> = {},
  ) {
    return offerDeltas(before, after, extra).map((row) => (
      <span
        key={row.summand}
        className={`camp-offer__delta camp-offer__delta--${row.delta >= 0 ? "up" : "down"}`}
      >
        {t(`common.${row.summand}` as MessageKey)} {fmt(row.from)}→{fmt(row.to)}
      </span>
    ));
  }

  function effectRows(offer: Offer) {
    // Шестой слот (LG2): карточка обязана показать ОБЕ стороны обмена — слот и перманентный минус.
    if (offer.kind === "slot") {
      return [
        <span key="s" className="camp-offer__card-desc">{t("reward.slotDesc")}</span>,
        <span key="p" className="camp-offer__delta camp-offer__delta--down">
          {t("common.base")} {signed(offer.effect?.delta ?? 0)}
        </span>,
      ];
    }
    if (offer.kind === "gold") {
      return [
        <span key="g" className="camp-offer__delta camp-offer__delta--gold">
          {signed(offer.goldGain ?? 0)} ◈
        </span>,
      ];
    }
    if (offer.kind === "reroll") {
      return [
        <span key="r" className="camp-offer__card-desc">{t("reward.rerollDesc", { n: offer.tokens ?? 0 })}</span>,
        <span key="g" className="camp-offer__delta camp-offer__delta--gold">{signed(offer.goldGain ?? 0)} ◈</span>,
      ];
    }
    // Предмет обязан показывать эффект И его цену прямо на карточке награды: иначе его нельзя
    // сравнить с «+12 золота», и выбор награды снова становится нелегибельным (PF-3).
    if (offer.kind === "item" && offer.cardId) {
      const def = itemDef(offer.cardId);
      if (def) {
        // Тир берём С ОФФЕРА и через него же собираем описание: карточка обязана показывать те
        // числа, которые реально лягут в слот (R11.2).
        const rarity: Rarity = offer.cardRarity ?? "common";
        const scaled = itemAt(def, rarity);
        const main = itemLabel(scaled.effect);
        const cost = scaled.drawback ? itemLabel(scaled.drawback) : null;
        const preview = itemContribution(def, snapshot.heroes, t, rarity);
        // Карточка улучшения (R14.3) обязана назвать себя улучшением: без этого «Guardian Greaves ·
        // Экзотическая» рядом с уже стоящей «Обычной» читается как второй экземпляр.
        const upgradeFrom: Rarity = camp.cardRarity[offer.cardId] ?? "common";
        return [
          <RarityBadge
            key="r"
            rarity={itemTier(rarity)}
            label={t(`cardTier.${itemTier(rarity)}` as MessageKey)}
            showBase
          />,
          ...(offer.cardUpgrade ? [
            <span key="u" className="camp-offer__note camp-offer__note--upgrade">
              {t("camp.cardUpgrade", {
                from: t(`cardTier.${itemTier(upgradeFrom)}` as MessageKey),
                to: t(`cardTier.${itemTier(rarity)}` as MessageKey),
              })}
            </span>,
          ] : []),
          <span key="d" className="camp-offer__card-desc">
            {t(main.template as MessageKey, itemLabelParams(main.params, t))}
          </span>,
          ...(cost ? [
            <span key="c" className="camp-offer__card-desc camp-offer__card-desc--cost">
              {t(cost.template as MessageKey, itemLabelParams(cost.params, t))}
            </span>,
          ] : []),
          ...(preview ? [
            <span key="p" className={`camp-offer__delta camp-offer__delta--${preview.positive ? "up" : "down"}`}>
              {preview.text}
            </span>,
          ] : []),
          // Кто из состава включает эту карточку прямо сейчас — иначе условие по тегу
          // непроверяемо глазами (R11.7).
          <ItemMatch
            key="m"
            match={effectMatch(scaled.effect, { activeHeroes: snapshot.heroes, cardRarity: {}, cardCharges: {} })}
            hero={hero}
            t={t}
          />,
          ...(scaled.drawback ? [
            <ItemMatch
              key="md"
              match={effectMatch(scaled.drawback, { activeHeroes: snapshot.heroes, cardRarity: {}, cardCharges: {} })}
              hero={hero}
              t={t}
            />,
          ] : []),
        ];
      }
    }
    if (offer.kind === "quality") {
      return [
        <span key="q" className="camp-offer__card-desc">{t("reward.qualityDesc", { n: offer.tokens ?? 0 })}</span>,
      ];
    }
    if ((offer.kind === "tactic" || offer.kind === "action") && offer.cardId) {
      // Числа описания приходят из того же `TACTICS`, что и эффект: раньше в тексте буквально
      // печаталось «{n}», потому что плейсхолдеру никто не передавал значение.
      const vars = offer.kind === "tactic" && isTacticId(offer.cardId)
        ? tacticLabelParams(offer.cardId)
        : undefined;
      // Тактика обязана показывать, что даст ИМЕННО СЕЙЧАС, — ровно как предмет. Без этого
      // «+Chemistry за сыгранные пары» невозможно сравнить с «+6 золота».
      const now = offer.kind === "tactic" ? tacticContribution(offer.cardId) : null;
      return [
        <span key="card" className="camp-offer__card-desc">
          {t(`${offer.kind}.desc.${offer.cardId}` as MessageKey, vars)}
        </span>,
        ...(now ? [
          <span key="now" className={`camp-offer__delta camp-offer__delta--${now.positive ? "up" : "down"}`}>
            {now.text}
          </span>,
        ] : []),
      ];
    }
    if (offer.preview) return deltaRows(offer.preview.before, offer.preview.after);
    const effect = offer.effect;
    if (!effect) return null;
    const parts: Array<{ summand: Summand; delta: number }> = [
      { summand: effect.summand, delta: effect.delta },
    ];
    if (effect.tradeoffSummand && effect.tradeoffDelta) {
      parts.push({ summand: effect.tradeoffSummand, delta: effect.tradeoffDelta });
    }
    return parts.map(({ summand, delta }) => (
      <span
        key={summand}
        className={`camp-offer__delta camp-offer__delta--${delta >= 0 ? "up" : "down"}`}
      >
        {t(`common.${summand}` as MessageKey)} {fmt(current[summand])}→{fmt(current[summand] + delta)}
      </span>
    ));
  }

  /** Теги героя, которые СЕЙЧАС во что-то играют: по ним есть условие у экипированных карточек.
   *
   *  Почему не весь набор. У героя в среднем четыре тега — на карточке шириной 148px это шум, из
   *  которого не выцепить нужное. Вопрос в Буткемпе конкретный: «этот герой кормит мой билд?».
   *  Полный набор живёт в справочнике героев, где герой и есть предмет разговора. */
  function buildTagChips(heroId: number) {
    const tags = heroTags(heroId);
    if (!tags) return [];
    const axes = conditionAxes(camp.equippedTactics);
    const own = new Set<string>([...tags.lore, ...tags.play]);
    const lore = new Set<string>(tags.lore);
    const chips: TagChip[] = axes.tags
      .filter((tag) => own.has(tag))
      .map((tag) => ({
        key: tag,
        label: t(`heroTag.${tag}` as MessageKey),
        tone: lore.has(tag) ? "lore" : "gameplay",
        active: true,
      }));
    if (axes.attrs.includes(tags.attr)) {
      chips.push({
        key: tags.attr,
        label: t(`heroAttr.${tags.attr}` as MessageKey),
        tone: "attribute",
        active: true,
      });
    }
    return chips;
  }

  /** Что тактика даст на ТЕКУЩЕМ ростере. Условие пере-вычисляется стором тем же контекстом, что
   *  и боевой расчёт, поэтому карточка не может обещать одно, а дать другое. */
  function tacticContribution(tacticId: string): { text: string; positive: boolean } | null {
    const evaluation = previewTactic(tacticId);
    if (!evaluation) return null;
    const mods = evaluation.modifiers;
    const total = mods.base + mods.heroSynergy + mods.chemistry;
    // Wide Pool — пороговая build-around карта: до срабатывания вместо немого «не выполнено»
    // показываем прогресс «N из 10» (плейтест 2026-08-31 — без счётчика непонятно, двигают ли
    // пики к цели). Остальные карты дают частичный вклад и в счётчике не нуждаются.
    if (Math.abs(total) < 0.05 && tacticId === "widePool") {
      const progress = widePoolProgress(currentPowerState.tacticContext);
      return { text: t("camp.widePoolProgress", { n: progress.distinct, need: progress.need }), positive: false };
    }
    if (Math.abs(total) < 0.05) return { text: t("camp.conditionUnmet"), positive: false };
    const parts = ([["base", mods.base], ["heroSynergy", mods.heroSynergy], ["chemistry", mods.chemistry]] as const)
      .filter(([, value]) => Math.abs(value) >= 0.05)
      .map(([summand, value]) => `${t(`common.${summand}` as MessageKey)} ${signed(value)}`);
    return { text: parts.join(" · "), positive: total > 0 };
  }

  function offerIdentity(offer: Offer) {
    if (offer.kind === "hero" && offer.heroSwap) {
      const outgoing = hero(offer.heroSwap.outgoingHeroId);
      const incoming = hero(offer.heroSwap.incomingHeroId);
      const assignedAccountId = Number(
        Object.entries(offer.preview?.afterAssignment ?? {})
          .find(([, heroId]) => heroId === offer.heroSwap!.incomingHeroId)?.[0],
      );
      const assignedPlayer = snapshot!.roster
        .find((slot) => slot.candidate?.player.accountId === assignedAccountId)
        ?.candidate;
      const games = assignedPlayer
        ? playerHeroGames(displayPhs, assignedPlayer.player.accountId, offer.heroSwap.incomingHeroId)
        : 0;
      return (
        <div className="camp-hero-offer">
          {/* Один крупный портрет вместо двух по ~60px. Два портрета в карточке шириной 148px
              делили её пополам, и имя героя — то, по чему карточку узнают, — обрезалось у обоих
              («Keep…», «Night …», «Warlo…»). Заменяемый герой уже в составе, ему хватает строки:
              он опознаётся по имени, а не по арту. */}
          <div className="camp-hero-compare camp-hero-compare--offer">
            <HeroThumb {...incoming} layout="card" />
            <span className="camp-hero-compare__out">
              <small>{t("camp.activeHero")}</small>
              <HeroThumb {...outgoing} size="sm" />
            </span>
          </div>
          {assignedPlayer && (
            <div className="camp-offer__fit">
              <small>{t("camp.heroBestFit")}</small>
              <strong>{assignedPlayer.player.nickname}</strong>
              <span>{t(campHeroGamesMessageKey(locale, games), { n: games })}</span>
            </div>
          )}
        </div>
      );
    }
    return null;
  }

  function playerOfferSummary(incoming: Candidate, outgoing: Candidate | null | undefined, afterHeroId?: number) {
    return (
      <>
        <CampPlayerCard candidate={incoming} heroId={afterHeroId} origin={originOf(incoming.eventId)} />
        {outgoing && (
          outgoing.player.accountId === incoming.player.accountId ? (
            <div className="camp-offer__fit camp-offer__fit--form" data-form-upgrade="true">
              <small>{t("camp.formUpgrade")}</small>
              <strong>{originOf(outgoing.eventId)}</strong>
              <span>{outgoing.player.ovr} OVR →</span>
            </div>
          ) : (
            <div className="camp-offer__fit">
              <small>{t("camp.replacesPlayer")}</small>
              <strong>{outgoing.player.nickname}</strong>
              <span>{outgoing.player.ovr} OVR</span>
            </div>
          )
        )}
      </>
    );
  }

  /** Разбор замены игрока в оверлее (R5.3): явное правило по герою и по сыгранности — какие
   *  пары с составом ПОСЛЕ замены дают Chemistry и сколько pro-игр у входящего на его герое.
   *  Считается тем же squadSynergy/playerHeroStats, что и счёт: список не может разойтись с дельтой. */
  function playerOfferDetails(incoming: Candidate, outgoing: Candidate | null | undefined, afterHeroId: number | undefined, slotIndex: number) {
    const rosterAfter = replaceRosterCandidate(slotIndex, incoming);
    const edges = chemistryPairEdges(chemistryPlayersFromRoster(rosterAfter), squadSynergyOf(data), data.teammates)
      .filter((edge) => edge.a === incoming.player.accountId || edge.b === incoming.player.accountId)
      .sort((x, y) => y.games - x.games);
    const nickOf = (accountId: number) => rosterAfter.find((slot) => slot.candidate?.player.accountId === accountId)?.candidate?.player.nickname ?? String(accountId);
    const heroGames = afterHeroId != null ? playerHeroGames(phs, incoming.player.accountId, afterHeroId) : null;
    return (
      <ul className="camp-offer__details" data-testid="offer-player-details">
        {afterHeroId != null && (
          <li>
            <span>{t("camp.detailHero")}</span>
            <strong>{heroName(afterHeroId)}{heroGames != null ? ` · ${t(campHeroGamesMessageKey(locale, heroGames), { n: heroGames })}` : ""}</strong>
          </li>
        )}
        <li>
          <span>{t("camp.detailPairs")}</span>
          <strong>
            {edges.length === 0
              ? t("camp.detailNoPairs")
              : edges.slice(0, 3).map((edge) => t("camp.detailPair", { nick: nickOf(edge.a === incoming.player.accountId ? edge.b : edge.a), games: edge.games, bonus: fmt(edge.bonus) })).join(" · ")}
          </strong>
        </li>
        {outgoing && outgoing.player.accountId !== incoming.player.accountId && (
          <li>
            <span>{t("camp.detailLeaves")}</span>
            <strong>{outgoing.player.nickname} · {originOf(outgoing.eventId)}</strong>
          </li>
        )}
      </ul>
    );
  }

  function heroOfferSummary(
    offer: Offer,
    incomingRarity: Rarity,
    outgoingRarity: Rarity,
    interactiveTags = true,
  ) {
    if (!offer.heroSwap) return null;
    return (
      <>
        {offerIdentity(offer)}
        <TagChips
          chips={buildTagChips(offer.heroSwap.incomingHeroId)}
          testId={interactiveTags ? `hero-offer-tags-${offer.heroSwap.incomingHeroId}` : undefined}
          onSelect={interactiveTags ? setInspectedTag : undefined}
          selectLabel={interactiveTags ? () => t("heroTag.showAll") : undefined}
        />
        {(incomingRarity !== "common" || outgoingRarity !== "common") && (
          <div className="camp-hero-rarity">
            <RarityBadge rarity={incomingRarity} label={t(`rarity.${incomingRarity}` as MessageKey)} />
          </div>
        )}
      </>
    );
  }

  function rarityOfferSummary(heroId: number, rarity: Rarity, interactiveTags = true) {
    const thumb = hero(heroId);
    return (
      <div className="camp-rarity-card__hero">
        {/* Тот же крупный портрет, что на карточке re-pick: пять предложений улучшения отличались
            только именем героя в 10px, и ряд читался как пять одинаковых кнопок. */}
        <HeroThumb {...thumb} layout="card" />
        <div className="camp-rarity-card__tags">
          <TagChips
            chips={buildTagChips(heroId)}
            testId={interactiveTags ? `hero-build-tags-${heroId}` : undefined}
            onSelect={interactiveTags ? setInspectedTag : undefined}
            selectLabel={interactiveTags ? () => t("heroTag.showAll") : undefined}
            align="center"
          />
        </div>
        <RarityBadge rarity={rarity} label={t(`rarity.${rarity}` as MessageKey)} />
      </div>
    );
  }

  const openInspector = config.hardMode
    ? undefined
    : (candidate: Candidate) => setInspectedPlayer(candidate);

  return (
    <main className="camp" data-testid="camp-screen" ref={tiltRootRef}>
      {/* Секвенция «этап пройден» (R15.2): показывается один раз на свежий проход порога;
          resume в лагерь её не переигрывает (см. runStore.campCelebration). */}
      {campCelebration && (
        <CampCelebration
          ante={ante}
          payout={camp.lastPayout}
          showPayout={!camp.unlimitedGold}
          onDismiss={dismissCampCelebration}
        />
      )}
      <header className="camp__head">
        <div>
          <Eyebrow>{t("camp.title")}</Eyebrow>
          <h2 className="camp__cleared">{t("camp.cleared", { n: ante.index })}</h2>
          {/* Титул Династии (T5.8): единственная причина, по которой у бесконечной фазы есть свои
              вехи, а не только растущая угроза. Празднуем ровно в том лагере, где он взят. */}
          {camp.dynastyMilestone && (
            <p className="camp__milestone" data-testid="camp-dynasty-title">
              🏆 {t("camp.dynastyTitle", { n: ante.titles })}
              {" · "}
              <b>{t("camp.dynastyTitleReward", { gold: ECONOMY.dynastyMilestone.gold, n: ECONOMY.dynastyMilestone.editionTokens })}</b>
            </p>
          )}
          <p className="camp__next" data-testid="camp-next-stage-label">
            <span data-testid="camp-act-stage">
              {ante.dynasty
                ? t("ante.dynastyStage", { n: ante.index + 1 - ante.count })
                : t("ante.actStage", { act: ante.act, stage: ante.stageInAct })}
            </span>
            <StageKindBadge kind={ante.kind} />
            {" · "}{nextLabel}
          </p>
          {/* Мутатор круга Династии (LG3): правило поверх всех этапов круга, та же видимость
              заранее, что у боссов, — готовиться к нему (trade-in, re-pick, накопления) и есть
              работа поздних лагерей. Показывается в каждом лагере круга, а не один раз. */}
          {/* Playbook (T6.4-2): пул наград и trade-in этого забега ограничен — игрок обязан видеть
              это в каждом лагере, иначе «почему не выпадает X» читается как баг. */}
          {config.playbook && (
            <p className="camp__mutator" data-testid="camp-playbook">
              📖 <b>{t("playbook.title")}</b>{" — "}{t("camp.playbook", { n: config.playbook.length })}
            </p>
          )}
          {campMutators.map((campMutator) => (
            <p key={campMutator} className="camp__mutator" data-testid="camp-mutator">
              ☄ <b>{t(`mutator.${campMutator}` as MessageKey)}</b>
              {" — "}
              {t(`mutator.desc.${campMutator}` as MessageKey, mutatorDescParams(campMutator))}
            </p>
          ))}
          {/* Автоматическая выплата показывается разложенной: иначе «проценты за накопление»
              невидимы, и решение «потратить сейчас против накопить» не читается. Премия за место
              (R6.4) — отдельной строкой по той же причине: с чемпионством как наградой вместо
              условия прохода она обязана быть видна, иначе награды как будто нет. */}
          {camp.lastPayout && (
            <p className="camp__payout" data-testid="camp-payout">
              {t("camp.payout")} <b>+{camp.lastPayout.prize}</b> {t("camp.payoutPrize")}
              {camp.lastPayout.performance > 0 && (
                <>
                  {" · "}
                  <b data-testid="camp-performance">+{camp.lastPayout.performance}</b>
                  {" "}{t("camp.payoutPerformance")}
                </>
              )}
              {camp.lastPayout.interest > 0 && (
                <>
                  {" · "}<b data-testid="camp-interest">+{camp.lastPayout.interest}</b> {t("camp.payoutInterest")}
                </>
              )}
            </p>
          )}
        </div>
        {config.cheatMode && <CheatBadge />}
        {/* Золото — второй ресурс решения после силы забега, и до R14.4 оно менялось молча, хотя
            для Run power набег и вспышка уже были. Тот же `useCountUp`, что в центре пентагона:
            направление держится --motion-flash и гаснет — цвет здесь сигнал, а не состояние. */}
        <div className="camp__gold" aria-label={t("camp.gold")} data-gold-direction={goldDirection}>
          <span className="camp__gold-icon">◈</span>
          <strong data-testid="camp-gold">{camp.unlimitedGold ? "∞" : camp.gold}</strong>
        </div>
      </header>

      <div className="camp__workbench">
        <Surface className="camp__team on-invert-surface" data-testid="camp-team-radar">
          <span className="camp__team-glow" aria-hidden="true" />
          <h3 className="camp__team-title">{t("camp.teamNow")}</h3>
          <Pentagon
            roster={snapshot.roster}
            /* Ровно та сила, с которой команда выйдет на этап (R8.3): иначе радар показывал бы
               сумму слагаемых, а в поле уходил Tournament Power — два разных числа на одном
               экране. Разрыв объясняет панель разложения выше. Подпись обязана называть ИМЕННО
               это число (R13.2): пока множителей мало, оно близко к Team OVR, но на позднем
               этапе расходится с ним заметно. */
            centerValue={power.total}
            centerLabelKey="camp.power"
            chemistryEdges={chemistryEdges}
            assignmentByPlayer={score.assignment.byPlayer}
            onSelectPlayer={openInspector}
          />
          <div className="camp__stats score-strip">
            <StatTile
              label={t("common.base")}
              value={fmt(current.base)}
              kind="base"
              sublabel={mods.base ? signed(mods.base) : undefined}
            />
            <StatTile
              label={t("common.heroSynergy")}
              value={fmt(current.heroSynergy)}
              kind="synergy"
              sublabel={synergySublabel}
            />
            <StatTile
              label={t("common.chemistry")}
              value={fmt(current.chemistry)}
              kind="chemistry"
              sublabel={mods.chemistry ? signed(mods.chemistry) : undefined}
            />
          </div>
          {/* Полные таблицы Hero Synergy (5 строк) и Squad Chemistry (до 10) — самый крупный
              текстовый блок экрана, и в Буткемпе он отвечает не на тот вопрос: здесь игрок решает,
              что КУПИТЬ, а не изучает текущий состав построчно. Поэтому свёрнуто в disclosure с
              короткой сводкой; в драфте и на этапе разбор остаётся раскрытым — там он и есть
              содержание экрана. `details/summary` вместо своего состояния: нативно доступно с
              клавиатуры и не требует ещё одного useState. */}
          <details className="camp__build-details" data-testid="camp-build-details">
            <summary>
              <span>{t("camp.buildDetails")}</span>
              <small data-testid="camp-build-summary">
                {t("camp.buildDetailsSummary", {
                  links: t(campBuildLinksMessageKey(locale, chemistryRows.length), { count: chemistryRows.length }),
                  weak: heroRows.filter((row) => row.games === 0).length,
                })}
              </small>
            </summary>
            <SynergyBreakdown
              heroRows={heroRows}
              chemistryRows={chemistryRows}
              onPlayerClick={config.hardMode ? undefined : (accountId) => {
                const candidate = snapshot.roster
                  .find((slot) => slot.candidate?.player.accountId === accountId)
                  ?.candidate;
                if (candidate) setInspectedPlayer(candidate);
              }}
            />
          </details>
        </Surface>

        <div className="camp__economy">
          <nav className="camp__section-nav" aria-label={t("camp.title")} role="tablist" data-testid="camp-section-nav">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                role="tab"
                aria-selected={activeSection === section.id}
                aria-controls={`camp-panel-${section.id}`}
                className="camp__section-tab"
                data-testid={`camp-section-${section.id}`}
                onClick={() => setActiveSection(section.id)}
              >
                <span>{section.label}</span>
                {section.status && <strong>{section.status}</strong>}
              </button>
            ))}
          </nav>

          {/* Билд виден при любом разделе, КРОМЕ самого Build (плейтест 2026-08-04): там ровно те же
              карточки показаны слотами, и рейл над ними был вторым изображением одного и того же. */}
          {activeSection !== "build" && (
            <BuildRail
              cards={railCards}
              slots={camp.tacticSlots}
              testId="camp-build-rail"
              activeHeroes={snapshot.heroes}
              cardRarity={camp.cardRarity}
              contributionsOf={(cardId) => itemEval.sources.filter((source) => source.itemId === cardId)}
            />
          )}

          {activeSection === "preparation" && (
            <div id="camp-panel-preparation" role="tabpanel" className="camp__section-panel enter-fade">
              {boss && <BossPanel boss={boss} eyebrow={t("boss.next")} testId="camp-boss" />}
              {/* Разведанный босс (R9.4): то же правило и тот же `до→после`, но про турнир, до
                  которого ещё несколько этапов. Он живёт рядом со всеми решениями подготовки. */}
              {scoutedBoss && (
                <BossPanel
                  boss={scoutedBoss}
                  eyebrow={t("boss.scouted", { n: scoutedBoss.stageIndex - ante.index + 1 })}
                  hint={t("boss.scoutedHint")}
                  testId="camp-boss-scouted"
                  scouted
                />
              )}
              {/* Поздние синки (T5.9) — прямой ответ на правило этапа и разведку. */}
              <PreparationPanel
                view={camp}
                hasBoss={!!boss}
                onBuyPrep={buyPrep}
                onRerollBoss={rerollBoss}
                onBuyScouting={buyScouting}
              />
            </div>
          )}

          {activeSection === "reward" && (
            <RewardPanel
              camp={camp}
              chosenReward={chosenReward}
              effectRows={effectRows}
              onChoose={(offerId) => {
                chooseReward(offerId);
                setActiveSection("market");
              }}
            />
          )}

          {(activeSection === "build" || activeSection === "preparation") && (
          <section
            key={activeSection}
            id={activeSection === "build" ? "camp-panel-build" : undefined}
            role={activeSection === "build" ? "tabpanel" : undefined}
            className="camp__section enter-fade"
            data-testid={activeSection === "build" ? "camp-build" : "camp-actions"}
          >
            <div className="camp__build camp__build--single">
              {activeSection === "build" && (
                <BuildPanel
                  camp={camp}
                  tactics={tactics}
                  itemEval={itemEval}
                  power={power}
                  widePoolProgress={widePoolProgress(currentPowerState.tacticContext)}
                  onInspectCard={setInspectedCard}
                  onTrade={setTradeFor}
                  onDiscard={discardTactic}
                  onEnchant={enchantCard}
                  itemUpgradeCostOf={(cardId) => economy?.itemUpgradeCost(cardId) ?? null}
                  itemUpgradeDelta={(cardId) => {
                    const next = nextRarity(camp.cardRarity[cardId] ?? "common");
                    if (!next) return 0;
                    const after = evaluateCampPower(currentPowerState, { ...build, cardRarity: { ...build.cardRarity, [cardId]: next } });
                    return after.power.total - currentEvaluation.power.total;
                  }}
                  onUpgradeItem={upgradeItemTier}
                />
              )}

              {activeSection === "preparation" && (
                <ActionsPanel camp={camp} onDiscard={discardAction} onPlay={playCampAction} />
              )}
            </div>
          </section>
          )}

          {activeSection === "market" && (
            <MarketPanel
              camp={camp}
              snapshot={snapshot}
              score={score}
              power={power}
              candidates={candidates}
              playerOffers={playerOffers}
              heroOffers={heroOffers}
              previewPower={previewPower}
              replaceRosterCandidate={replaceRosterCandidate}
              replaceActiveHero={replaceActiveHero}
              playerOfferSummary={playerOfferSummary}
              playerOfferDetails={playerOfferDetails}
              heroOfferSummary={heroOfferSummary}
              rarityOfferSummary={rarityOfferSummary}
              setInspected={setInspected}
              buyMarket={buyMarket}
              rerollMarket={rerollMarket}
              upgradeHeroRarity={upgradeHeroRarity}
            />
          )}

          {activeSection === "build" && (snapshot.reservePlayers.length > 0 || snapshot.reserveHeroes.length > 0) && (
            <ReservePanel
              snapshot={snapshot}
              score={score}
              power={power}
              heroTargets={heroTargets}
              onHeroTarget={(reserveHeroId, outgoingHeroId) => setHeroTargets((targets) => ({
                ...targets,
                [reserveHeroId]: outgoingHeroId,
              }))}
              previewPower={previewPower}
              replaceRosterCandidate={replaceRosterCandidate}
              replaceActiveHero={replaceActiveHero}
              setInspected={setInspected}
              swapReservePlayer={swapReservePlayer}
              swapReserveHero={swapReserveHero}
            />
          )}

          <div className="camp__actions">
            <Button variant="primary" data-testid="camp-next-stage" onClick={advanceAnteStage}>
              {t("ante.nextStage")}<span>→</span>
            </Button>
            <Button variant="secondary" onClick={() => setConfirmLeave(true)}>
              {t("ante.giveUp")}
            </Button>
          </div>
        </div>
      </div>

      {confirmLeave && (
        <Modal
          mark="A"
          title={t("tournament.leaveTitle")}
          description={t("tournament.leaveText")}
          labelledBy="camp-leave-title"
          dismissLabel={t("common.close")}
          onClose={() => setConfirmLeave(false)}
        >
          {({ close }) => (
            <>
              <Button variant="primaryInvert" onClick={close}>{t("tournament.leaveCancel")}</Button>
              <Button variant="danger" onClick={reset}>{t("tournament.leaveConfirm")}</Button>
            </>
          )}
        </Modal>
      )}
      {inspectedPlayer && (
        <PlayerInspector
          candidate={inspectedPlayer}
          data={data}
          onClose={() => setInspectedPlayer(null)}
        />
      )}
      {inspected && (
        <OfferOverlay
          title={inspected.title}
          subtitle={inspected.subtitle}
          summary={inspected.summary}
          deltas={inspected.deltas}
          total={inspected.total}
          totalFrom={inspected.from}
          totalTo={inspected.to}
          totalLabel={t("camp.power")}
          action={inspected.action}
          onClose={() => setInspected(null)}
        />
      )}
      {inspectedCard && (
        <BuildCardInspector
          cardId={inspectedCard}
          rarity={camp.cardRarity[inspectedCard] ?? "common"}
          edition={camp.cardEditions[inspectedCard]}
          charges={camp.cardCharges[inspectedCard] ?? 0}
          activeHeroes={snapshot.heroes}
          cardRarity={camp.cardRarity}
          contributions={itemEval.sources.filter((source) => source.itemId === inspectedCard)}
          onClose={() => setInspectedCard(null)}
        />
      )}
      {/* Trade-in (LG1): превью каждой карты — тем же evaluateCampPower, что и текущая сила;
          дельта на кнопке не может разойтись с тем, что произойдёт после обмена. */}
      {tradeFor && (() => {
        const outgoingRarity: Rarity = itemDef(tradeFor) ? camp.cardRarity[tradeFor] ?? "common" : "common";
        const incomingRarity = tradeInRarity(outgoingRarity);
        const options: TradeOption[] = camp.tradeOffers.map((id) => {
          const equippedCards = camp.equippedTactics.map((c) => (c === tradeFor ? id : c));
          const cardRarity: Record<string, Rarity> = { ...camp.cardRarity };
          delete cardRarity[tradeFor];
          if (itemDef(id) && incomingRarity !== "common") cardRarity[id] = incomingRarity;
          const cardCharges: Record<string, number> = { ...camp.cardCharges };
          delete cardCharges[tradeFor];
          const after = evaluateCampPower(currentPowerState, {
            economy: camp.modifiers, equippedCards, cardRarity, cardCharges,
          });
          return { id, delta: after.power.total - power.total };
        });
        return (
          <TradeOverlay
            outgoingId={tradeFor}
            outgoingRarity={outgoingRarity}
            options={options}
            tradeCost={camp.tradeCost}
            rerollCost={camp.tradeRerollCost}
            canReroll={camp.canRerollTrade}
            affordable={camp.unlimitedGold || camp.gold >= camp.tradeCost}
            onTrade={(incomingId) => {
              tradeCardAction(tradeFor, incomingId);
              setTradeFor(null);
            }}
            onReroll={rerollTrade}
            onClose={() => setTradeFor(null)}
          />
        );
      })()}
      {inspectedTag && (
        <HeroTagInspector
          tag={inspectedTag}
          data={data}
          activeHeroes={snapshot.heroes}
          onClose={() => setInspectedTag(null)}
        />
      )}
    </main>
  );
}
