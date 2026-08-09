// Буткемп Roguelite Run (T5.2, срезы 2–3): Reward, контекстный Market и резерв.
// Постоянная левая панель переиспользует тот же Pentagon/SynergyBreakdown, что драфт и турнир:
// игрок всегда видит активный ростер, hero assignment и связи до принятия решения.
import { useEffect, useMemo, useRef, useState } from "react";
import { ECONOMY, type Offer, type Summand, type SummandValues } from "../../game/anteEconomy.ts";
import type { Rarity } from "../../game/rarity.ts";
import {
  conditionAxes,
  effectMatch,
  itemAt,
  itemDef,
  itemLabel,
  itemTier,
} from "../../game/items.ts";
import { buildTacticContext, isTacticId, tacticLabelParams } from "../../game/tactics.ts";
import { heroTags } from "../../game/heroTags.ts";
import { itemArtSlug } from "../../game/itemArt.ts";
import type { Candidate } from "../../game/packs.ts";
import { candidatesOf } from "../../game/packs.ts";
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
import type { MessageKey } from "../../i18n/core.ts";
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
import { RewardPanel } from "./RewardPanel.tsx";
import { PreparationPanel } from "./PreparationPanel.tsx";
import { CampHint } from "./CampHint.tsx";
import { CampCelebration } from "./CampCelebration.tsx";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useRun } from "../../state/runStore.ts";
import {
  Button,
  CheatBadge,
  Eyebrow,
  HeroThumb,
  ItemIcon,
  Modal,
  RarityBadge,
  useCardTilt,
  useCountUp,
  StageKindBadge,
  PowerBreakdown,
  TagChips,
  type TagChip,
  Select,
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
  CardInspectTrigger,
  ItemMatch,
  OfferDelta,
  fmt,
  itemContribution,
  itemLabelParams,
  layerChip,
  signed,
  valuesOf,
  type CampSection,
  type InspectedOffer,
} from "./CampCards.tsx";
import "./camp.css";

export function CampScreen() {
  const camp = useRun((s) => s.camp);
  const ante = useRun((s) => s.ante);
  const snapshot = useRun((s) => s.snapshot);
  const data = useRun((s) => s.data);
  const config = useRun((s) => s.config);
  const boss = useRun((s) => s.boss);
  const scoutedBoss = useRun((s) => s.scoutedBoss);
  const chooseReward = useRun((s) => s.chooseReward);
  const previewTactic = useRun((s) => s.previewTactic);
  const buyMarket = useRun((s) => s.buyMarket);
  const rerollMarket = useRun((s) => s.rerollMarket);
  const discardTactic = useRun((s) => s.discardTactic);
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
  const { t } = useI18n();
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

  // Новый Буткемп начинается с обязательного выбора награды. Resume после уже сделанного выбора
  // не возвращает игрока в свёрнутую награду — продолжает с рынка. Состояние это только UI:
  // в сейв и RunEngine разделы не протекают.
  useEffect(() => {
    if (!camp) return;
    setActiveSection(camp.rewardChosen ? "market" : "reward");
  }, [camp?.campStageIndex]);
  // Золото берёт у `useCountUp` только НАПРАВЛЕНИЕ, а не набегающее значение.
  //
  // Почему не число: набег живёт на requestAnimationFrame, а в неактивной вкладке rAF тормозится —
  // поймано замером, счётчик застрял на 6 при настоящих 7. Для Team OVR это косметика, для золота
  // нет: по нему игрок решает, хватает ли на покупку, и показать не то число нельзя. Вспышка при
  // этом сохраняется — она и отвечает на «что сейчас изменилось» (design-language §Движение).
  //
  // Хук обязан стоять ДО раннего `return null` ниже, поэтому читает `camp` опционально.
  // В Cheat Mode целимся в null: у «∞» изменений не бывает, сигналить нечего.
  const { direction: goldDirection } = useCountUp(
    camp && !camp.unlimitedGold ? camp.gold : null,
  );
  // Hover-tilt карточек (R15.6): один делегированный слушатель на корне экрана — карточки
  // постоянно перемонтируются раздачей, и вешать обработчики на каждую было бы утечкой
  // логики в списки. Углы пишутся CSS-переменными, стиль — camp.css.
  const tiltRootRef = useRef<HTMLElement | null>(null);
  useCardTilt(tiltRootRef);
  const candidates = useMemo(() => (data?.packs ?? []).flatMap(candidatesOf), [data]);
  const eventNames = useMemo(
    () => new Map((data?.events ?? []).map((event) => [event.id, event.short ?? event.name])),
    [data?.events],
  );
  const eventLabel = (eventId: string) => eventNames.get(eventId) ?? eventId;

  const score = snapshot?.score;
  if (!camp || !ante || !score || !snapshot || !data || !config) return null;
  // Алиасы сохраняют non-null гарантию внутри локальных функций превью: TypeScript не переносит
  // narrowing изменяемых store-ссылок через границу замыкания.
  const activeCamp = camp;
  const activeSnapshot = snapshot;
  const activeData = data;

  const build = {
    economy: camp.modifiers,
    equippedCards: camp.equippedTactics,
    cardRarity: camp.cardRarity,
  };

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

  const currentPowerState = powerState(
    valuesOf(score), snapshot.roster, score.assignment.byPlayer, snapshot.heroes,
  );
  const currentEvaluation = evaluateCampPower(currentPowerState, build);
  const current = currentEvaluation.values;
  const mods = currentEvaluation.modifiers;
  const tactics = currentEvaluation.tactics;
  const itemEval = currentEvaluation.items;
  const power = currentEvaluation.power;

  function previewPower(
    nextScore: SummandValues,
    roster: typeof activeSnapshot.roster,
    assignment: Record<number, number>,
    activeHeroes: readonly number[],
    heroRarity: Record<string, Rarity> = activeCamp.heroRarity,
  ): CampPowerPreview {
    return campPowerPreview(
      currentPowerState,
      powerState(nextScore, roster, assignment, activeHeroes, heroRarity),
      build,
    );
  }

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
  const chemistryEdges = chemistryPairEdges(
    chemistryPlayersFromRoster(snapshot.roster),
    data.squadSynergy,
    data.teammates,
  );
  const phs = heroStatsForAssignment(data);
  const displayPhs = heroStatsForDisplay(data);
  const heroRows = heroSynergyRows(snapshot.roster, score.assignment, phs, displayPhs);
  const chemistryRows = squadChemistryRows(snapshot.roster, data.squadSynergy, data.teammates);
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
        const preview = itemContribution(def, snapshot?.heroes ?? [], t, rarity);
        // Карточка улучшения (R14.3) обязана назвать себя улучшением: без этого «Guardian Greaves ·
        // Экзотическая» рядом с уже стоящей «Обычной» читается как второй экземпляр.
        const upgradeFrom: Rarity = camp?.cardRarity?.[offer.cardId] ?? "common";
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
            match={effectMatch(scaled.effect, { activeHeroes: snapshot?.heroes ?? [], cardRarity: {} })}
            hero={hero}
            t={t}
          />,
          ...(scaled.drawback ? [
            <ItemMatch
              key="md"
              match={effectMatch(scaled.drawback, { activeHeroes: snapshot?.heroes ?? [], cardRarity: {} })}
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
    const axes = conditionAxes(camp!.equippedTactics);
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
              <span>{t("camp.heroGames", { n: games })}</span>
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
        <CampPlayerCard candidate={incoming} heroId={afterHeroId} />
        {outgoing && (
          outgoing.player.accountId === incoming.player.accountId ? (
            <div className="camp-offer__fit camp-offer__fit--form" data-form-upgrade="true">
              <small>{t("camp.formUpgrade")}</small>
              <strong>{eventLabel(outgoing.eventId)}</strong>
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
              <b>{t("camp.dynastyTitleReward", { gold: ECONOMY.dynastyMilestone.gold, n: ECONOMY.dynastyMilestone.rarityUpgrades })}</b>
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
                  links: chemistryRows.length,
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
              <div className="camp__build-col" data-testid="camp-tactics">
                <div className="camp__build-head">
                  <div className="camp__section-heading">
                    <h3 className="camp__section-title">{t("camp.tactics")}</h3>
                    <CampHint label={t("camp.showHint")}>{t("camp.tacticsHint")}</CampHint>
                  </div>
                  <span className="camp__slot-count">
                    {t("camp.slotsUsed", { used: camp.equippedTactics.length, total: camp.tacticSlots })}
                  </span>
                </div>
                {/* Разложение силы забега. Показывается ТОЛЬКО когда хоть один слой активен —
                    иначе это была бы строка «×1.00 / +0», не несущая информации (R8.2). */}
                {!power.trivial && (
                  <PowerBreakdown
                    testId="camp-power"
                    roster={power.teamOvr + power.flat}
                    additive={power.additive}
                    xMult={power.xMult}
                    total={power.total}
                    labels={{
                      roster: t("camp.powerRoster"), additive: t("camp.powerAdditive"),
                      xMult: t("camp.powerX"), total: t("camp.powerTotal"),
                    }}
                  />
                )}
                {/* Слоты — компактные карточки, а не высокие строки (плейтест 2026-08-04).
                    Раньше каждый слот печатал описание, ограничение, список подходящих героев и всё
                    разложение вклада, поэтому пять слотов занимали экран, а три из них были пустыми
                    «Empty slot» во всю ширину. Правило то же, что у рынка (R13.3): на карточке —
                    что это и работает ли сейчас, остальное по клику. */}
                <div className="camp__slots">
                  {Array.from({ length: camp.tacticSlots }, (_, slot) => {
                    const tacticId = camp.equippedTactics[slot];
                    if (!tacticId) {
                      return <div key={`t-empty-${slot}`} className="camp-slot camp-slot--empty">{t("camp.emptySlot")}</div>;
                    }
                    // Предмет и тактика делят слот (R8.3): различаются только тем, куда целится
                    // эффект — в слагаемые Team OVR или в слои силы забега.
                    const item = itemDef(tacticId);
                    const cardRarity: Rarity = camp.cardRarity[tacticId] ?? "common";
                    const name = t(`${item ? "item" : "tactic"}.${tacticId}` as MessageKey);
                    const scaled = item ? itemAt(item, cardRarity) : null;
                    const label = scaled ? itemLabel(scaled.effect) : null;
                    const reasons = (tactics?.sources ?? []).filter((source) => source.tacticId === tacticId);
                    const contributions = itemEval.sources.filter((source) => source.itemId === tacticId);
                    const idle = item ? contributions.length === 0 : reasons.length === 0;
                    return (
                      <div
                        key={tacticId}
                        className={`camp-slot camp-inspectable-card ${item ? "camp-slot--item" : "camp-slot--tactic"}`}
                        data-card-id={tacticId}
                        data-card-rarity={item ? cardRarity : undefined}
                        data-card-tier={item ? itemTier(cardRarity) : undefined}
                      >
                        <CardInspectTrigger
                          label={name}
                          delta={0}
                          testId={`build-card-${tacticId}`}
                          onOpen={() => setInspectedCard(tacticId)}
                        />
                        <div className="camp-slot__head">
                          {itemArtSlug(tacticId) && (
                            <ItemIcon slug={itemArtSlug(tacticId)!} name={name} size="sm" />
                          )}
                          {/* Название и бейдж качества — своя колонка с переносом: в одной строке
                              бейдж отъедал ширину у имени, и «Necronomicon» рвалось на три куска.
                              Теперь бейдж уходит на следующую строку, а имени достаётся вся
                              ширина карточки (плейтест 2026-08-05). */}
                          <span className="camp-slot__title">
                            <strong>{name}</strong>
                            {item && (
                              <RarityBadge
                                rarity={itemTier(cardRarity)}
                                label={t(`cardTier.${itemTier(cardRarity)}` as MessageKey)}
                                showBase
                              />
                            )}
                          </span>
                          <button
                            type="button"
                            className="camp-slot__discard"
                            aria-label={t("camp.discard")}
                            data-testid={`tactic-discard-${tacticId}`}
                            onClick={() => discardTactic(tacticId)}
                          >
                            ✕
                          </button>
                        </div>
                        <p className="camp-slot__desc">
                          {label
                            ? t(label.template as MessageKey, itemLabelParams(label.params, t))
                            : t(
                              `tactic.desc.${tacticId}` as MessageKey,
                              isTacticId(tacticId) ? tacticLabelParams(tacticId) : undefined,
                            )}
                        </p>
                        {/* Одна строка состояния: сработала карточка или нет. Полное разложение,
                            ограничение и подходящие герои живут в разборе по клику. */}
                        <div className="camp-offer__deltas">
                          {idle && <span className="camp-slot__idle">{t("camp.tacticNoEffect")}</span>}
                          {item && contributions.slice(0, 1).map((source, i) => (
                            <span
                              key={i}
                              className={`camp-offer__delta camp-offer__delta--${source.met ? "up" : "down"}`}
                            >
                              {layerChip(source, t)}
                            </span>
                          ))}
                          {!item && reasons.slice(0, 1).map((source, i) => (
                            <span
                              key={i}
                              className={`camp-offer__delta camp-offer__delta--${source.delta >= 0 ? "up" : "down"}`}
                            >
                              {t(`common.${source.summand}` as MessageKey)} {signed(source.delta)}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              )}

              {activeSection === "preparation" && (
              <div className="camp__build-col" data-testid="camp-actions-panel">
                <div className="camp__build-head">
                  <div className="camp__section-heading">
                    <h3 className="camp__section-title">{t("camp.campActions")}</h3>
                    <CampHint label={t("camp.showHint")}>{t("camp.campActionsHint")}</CampHint>
                  </div>
                  <span className="camp__slot-count">
                    {t("camp.slotsUsed", { used: camp.heldActions.length, total: camp.actionSlots })}
                  </span>
                </div>
                {camp.scouted && <p className="camp__scouted" data-testid="camp-scouted">{t("camp.scouted")}</p>}
                {camp.freeMarketRerolls > 0 && (
                  <p className="camp__perk">{t("camp.freeReroll", { n: camp.freeMarketRerolls })}</p>
                )}
                {camp.freePlayerSwaps > 0 && (
                  <p className="camp__perk">{t("camp.freeSwap", { n: camp.freePlayerSwaps })}</p>
                )}
                <div className="camp__slots">
                  {Array.from({ length: camp.actionSlots }, (_, slot) => {
                    const actionId = camp.heldActions[slot];
                    if (!actionId) {
                      return <div key={`a-empty-${slot}`} className="camp-slot camp-slot--empty">{t("camp.emptySlot")}</div>;
                    }
                    return (
                      <div key={actionId} className="camp-slot camp-slot--action" data-card-id={actionId}>
                        <div className="camp-slot__head">
                          <strong>{t(`action.${actionId}` as MessageKey)}</strong>
                          <button
                            type="button"
                            className="camp-slot__discard"
                            aria-label={t("camp.discard")}
                            data-testid={`action-discard-${actionId}`}
                            onClick={() => discardAction(actionId)}
                          >
                            ✕
                          </button>
                        </div>
                        <p className="camp-slot__desc">{t(`action.desc.${actionId}` as MessageKey)}</p>
                        <Button
                          variant="primary"
                          data-testid={`action-play-${actionId}`}
                          onClick={() => playCampAction(actionId)}
                        >
                          {t("camp.play")}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
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
              heroOfferSummary={heroOfferSummary}
              rarityOfferSummary={rarityOfferSummary}
              setInspected={setInspected}
              buyMarket={buyMarket}
              rerollMarket={rerollMarket}
              upgradeHeroRarity={upgradeHeroRarity}
            />
          )}

          {activeSection === "build" && (snapshot.reservePlayers.length > 0 || snapshot.reserveHeroes.length > 0) && (
            <Surface className="camp__reserve" data-testid="camp-reserve">
              <div className="camp__section-head">
                <div className="camp__section-heading">
                  <h3 className="camp__section-title">{t("camp.reserve")}</h3>
                  <CampHint label={t("camp.showHint")}>{t("camp.reserveHint")}</CampHint>
                </div>
              </div>
              <div className="camp__reserve-grid">
                {snapshot.reservePlayers.map((reserve, reserveIndex) => (
                  <div
                    key={reserve.candidate.player.accountId}
                    className="camp-reserve-card camp-reserve-card--player"
                  >
                    <CampPlayerCard
                      candidate={reserve.candidate}
                      heroId={score.assignment.byPlayer[reserve.candidate.player.accountId]}
                      label={t("camp.reservePlayer")}
                      testId={reserveIndex === 0 ? "camp-reserve-player" : undefined}
                      nameTestId={reserveIndex === 0 ? "camp-reserve-player-name" : undefined}
                    />
                    <div className="camp-reserve-card__actions">
                      {reserve.previews.map(({ slotIndex, score: after }) => {
                        const outgoing = snapshot.roster[slotIndex]?.candidate;
                        if (!outgoing) return null;
                        const preview = previewPower(
                          valuesOf(after),
                          replaceRosterCandidate(slotIndex, reserve.candidate),
                          after.assignment.byPlayer,
                          snapshot.heroes,
                        );
                        const deltas = preview.deltas;
                        const powerDelta = preview.delta;
                        return (
                          <div
                            className="camp-reserve-swap camp-inspectable-card"
                            key={`${slotIndex}-${outgoing.player.accountId}`}
                          >
                            <CardInspectTrigger
                              label={reserve.candidate.player.nickname}
                              delta={powerDelta}
                              testId={`reserve-player-details-${slotIndex}`}
                              onOpen={() => setInspected({
                                title: reserve.candidate.player.nickname,
                                subtitle: `${t("camp.replacesPlayer")} ${outgoing.player.nickname}`,
                                summary: (
                                  <div className="offer-overlay__reserve-summary">
                                    <CampPlayerCard
                                      candidate={reserve.candidate}
                                      heroId={after.assignment.byPlayer[reserve.candidate.player.accountId]}
                                      label={t("camp.reservePlayer")}
                                    />
                                    <span>
                                      {outgoing.player.nickname} <b>{outgoing.player.ovr}</b>
                                      {" → "}
                                      {reserve.candidate.player.nickname} <b>{reserve.candidate.player.ovr}</b>
                                    </span>
                                  </div>
                                ),
                                deltas,
                                total: powerDelta,
                                from: preview.before.power.total,
                                to: preview.after.power.total,
                                action: {
                                  label: t("camp.swap"),
                                  onSelect: () => swapReservePlayer(slotIndex, reserve.candidate.player.accountId),
                                },
                              })}
                            />
                            <div className="camp-reserve-swap__summary">
                              <span>
                                {outgoing.player.nickname} <b>{outgoing.player.ovr}</b>
                                {" → "}
                                {reserve.candidate.player.nickname}{" "}
                                <b>{reserve.candidate.player.ovr}</b>
                              </span>
                              <div className="camp-offer__deltas">
                                <OfferDelta delta={powerDelta} />
                              </div>
                            </div>
                            <Button
                              variant="secondary"
                              data-testid={`camp-reserve-player-swap-${slotIndex}`}
                              onClick={() => swapReservePlayer(slotIndex, reserve.candidate.player.accountId)}
                            >
                              {t("camp.swap")}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {snapshot.reserveHeroes.map((reserve) => {
                  const reserveHero = hero(reserve.heroId);
                  const outgoingHeroId = heroTargets[reserve.heroId] ?? snapshot.heroes[0];
                  const outgoingHero = hero(outgoingHeroId);
                  const after = reserve.previews
                    .find((preview) => preview.outgoingHeroId === outgoingHeroId)
                    ?.score;
                  const preview = after
                    ? previewPower(
                        valuesOf(after),
                        snapshot.roster,
                        after.assignment.byPlayer,
                        replaceActiveHero(outgoingHeroId, reserve.heroId),
                      )
                    : null;
                  const deltas = preview?.deltas ?? [];
                  const powerDelta = preview?.delta ?? 0;
                  return (
                    <div key={reserve.heroId} className="camp-reserve-card camp-reserve-card--hero camp-inspectable-card">
                      {after && (
                        <CardInspectTrigger
                          label={reserveHero.name}
                          delta={powerDelta}
                          testId={`reserve-hero-details-${reserve.heroId}`}
                          onOpen={() => setInspected({
                            title: reserveHero.name,
                            subtitle: `${t("camp.activeHero")}: ${outgoingHero.name}`,
                            summary: (
                              <div className="camp-hero-compare">
                                <HeroThumb {...reserveHero} size="md" />
                                <span className="camp-hero-compare__arrow" aria-hidden="true">→</span>
                                <HeroThumb {...outgoingHero} size="md" />
                              </div>
                            ),
                            deltas,
                            total: powerDelta,
                            from: preview?.before.power.total ?? power.total,
                            to: preview?.after.power.total ?? power.total,
                            action: {
                              label: t("camp.swap"),
                              onSelect: () => swapReserveHero(outgoingHeroId, reserve.heroId),
                            },
                          })}
                        />
                      )}
                      <small>{t("camp.reserveHeroes")}</small>
                      <div className="camp-hero-compare">
                        <HeroThumb {...reserveHero} size="md" />
                        <span className="camp-hero-compare__arrow" aria-hidden="true">→</span>
                        <HeroThumb {...outgoingHero} size="md" />
                      </div>
                      <Select
                        label={t("camp.replaceHero")}
                        value={String(outgoingHeroId)}
                        options={snapshot.heroes.map((heroId) => ({
                          value: String(heroId),
                          label: hero(heroId).name,
                        }))}
                        onChange={(value) => setHeroTargets((targets) => ({
                          ...targets,
                          [reserve.heroId]: Number(value),
                        }))}
                      />
                      {after && (
                        <div className="camp-offer__deltas">
                          <OfferDelta delta={powerDelta} />
                        </div>
                      )}
                      <Button
                        variant="secondary"
                        data-testid={`camp-reserve-hero-swap-${reserve.heroId}`}
                        onClick={() => swapReserveHero(outgoingHeroId, reserve.heroId)}
                      >
                        {t("camp.swap")}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </Surface>
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
          activeHeroes={snapshot.heroes}
          cardRarity={camp.cardRarity}
          contributions={itemEval.sources.filter((source) => source.itemId === inspectedCard)}
          onClose={() => setInspectedCard(null)}
        />
      )}
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
