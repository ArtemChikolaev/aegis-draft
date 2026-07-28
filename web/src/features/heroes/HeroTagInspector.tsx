import { useMemo } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/core.ts";
import { HERO_ATTRS, heroTags, taggedHeroIds, type HeroAttr } from "../../game/heroTags.ts";
import type { GameData } from "../../types/data.ts";
import { Button, HeroThumb, Modal } from "../../ui/index.ts";
import "./heroTagInspector.css";

/** Все герои с выбранным тегом (R11.7).
 *
 *  Зачем модалка, а не переход в справочник: вопрос возникает ПОСРЕДИ решения в Буткемпе
 *  («кто вообще бывает illusion?»), и уводить игрока с экрана, где у него открыт незакрытый
 *  выбор награды и рынка, значило бы терять контекст. Тот же приём, что у карточки игрока.
 *
 *  `attr` и обычный тег обрабатываются одной функцией: для игрока это один и тот же вопрос,
 *  разница только в слое данных. */
export function HeroTagInspector({ tag, data, activeHeroes, onClose }: {
  tag: string;
  data: GameData;
  /** Герои текущего состава — подсвечиваем их, чтобы список сразу отвечал «а у меня есть?». */
  activeHeroes?: readonly number[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const isAttr = (HERO_ATTRS as readonly string[]).includes(tag);
  const label = t(`${isAttr ? "heroAttr" : "heroTag"}.${tag}` as MessageKey);
  const pictures = useMemo(
    () => new Map(data.heroes.map((hero) => [hero.id, hero])),
    [data.heroes],
  );
  const matches = useMemo(() => {
    const own = new Set(activeHeroes ?? []);
    return taggedHeroIds()
      .filter((heroId) => {
        const tags = heroTags(heroId);
        if (!tags) return false;
        return isAttr
          ? tags.attr === (tag as HeroAttr)
          : (tags.lore as readonly string[]).includes(tag) || (tags.play as readonly string[]).includes(tag);
      })
      // Свои герои — вверх: список отвечает «а у меня есть?» раньше, чем «а кто бывает?».
      .map((heroId) => ({ heroId, mine: own.has(heroId), hero: pictures.get(heroId) }))
      .filter((row) => row.hero != null)
      .sort((a, b) => Number(b.mine) - Number(a.mine) || a.hero!.name.localeCompare(b.hero!.name));
  }, [tag, isAttr, activeHeroes, pictures]);

  return (
    <Modal
      title={label}
      description={t("heroTag.inspectorCount", { count: matches.length })}
      labelledBy="hero-tag-inspector-title"
      onClose={onClose}
      dismissLabel={t("common.close")}
      layout="content"
    >
      {({ close }) => (
        <div className="hero-tag-inspector" data-testid="hero-tag-inspector" data-tag={tag}>
          <ul className="hero-tag-inspector__grid">
            {matches.map(({ heroId, mine, hero }) => (
              <li key={heroId} data-hero-id={heroId} data-mine={mine ? "true" : undefined}>
                <HeroThumb picture={hero!.picture} name={hero!.name} size="sm" />
                {mine && <span className="hero-tag-inspector__mine">{t("heroTag.inspectorMine")}</span>}
              </li>
            ))}
          </ul>
          <Button variant="primaryInvert" onClick={close}>{t("common.close")}</Button>
        </div>
      )}
    </Modal>
  );
}
