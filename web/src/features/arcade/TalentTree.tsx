// Дерево талантов героя (M23): все пары 10/15/20/25 видны заранее — на подготовке и в окне сборки (взятое отмечено),
// как дерево в Dota; ниже — что дадут предметы Aghanim's (Shard — запасные таланты Q/W/E, Scepter — оба таланта ульта).
import type { HeroDef } from "../../game/arcade/content/heroes.ts";
import { TALENT_LEVELS, heroTalents, scepterTalents, shardTalents, talentLabel } from "../../game/arcade/content/talents.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/core.ts";
import { ItemIcon } from "../../ui/index.ts";

type T = (k: MessageKey, v?: Record<string, string | number>) => string;

/** Подпись таланта: талант умения — с именем умения героя, общий — строка `arcade.t.<id>`. */
export function talentText(t: T, hero: HeroDef | undefined, id: string): string {
  if (!hero) return t(`arcade.t.${id}` as MessageKey);
  const l = talentLabel(hero.id, id);
  return t(l.key as MessageKey, l.ability ? { ...l.vars, ability: t(`arcade.ab.${hero.kit}.${l.ability}` as MessageKey) } : l.vars);
}

export function TalentTree({ hero, taken = [], pixel, invert = false, shard = false, scepter = false }: {
  hero: HeroDef;
  /** Взятые таланты (`player.talents`): отмечаются в дереве. */
  taken?: readonly string[];
  pixel: boolean;
  /** На тёмной вставке (окно сборки поверх сцены). */
  invert?: boolean;
  /** Предмет уже получен — строка Aghanim's отмечена. */
  shard?: boolean;
  scepter?: boolean;
}) {
  const { t } = useI18n();
  const ladder = heroTalents(hero.id);
  const aghanim = [
    { id: "aghanims_shard", art: "aghanims_shard", ids: shardTalents(hero.id), got: shard },
    { id: "aghanims_scepter", art: "ultimate_scepter", ids: scepterTalents(hero.id), got: scepter },
  ].filter((a) => a.ids.length > 0);
  return (
    <div className="arcade-talents" data-testid="arcade-talents" data-invert={invert ? "true" : undefined}>
      <ol className="arcade-talents__rows">
        {TALENT_LEVELS.map((lvl) => (
          <li key={lvl} className="arcade-talents__row" data-testid={`arcade-talents-${lvl}`}>
            <b className="arcade-talents__lvl">{lvl}</b>
            {ladder[lvl].map((id) => (
              <span key={id} className="arcade-talents__pick" data-taken={taken.includes(id) ? "true" : undefined}>{talentText(t, hero, id)}</span>
            ))}
          </li>
        ))}
        {aghanim.map((a) => (
          <li key={a.id} className="arcade-talents__row arcade-talents__row--item" data-testid={`arcade-talents-${a.id}`}>
            <ItemIcon pixel={pixel} slug={a.art} name="" size="sm" />
            <span className="arcade-talents__pick" data-taken={a.got ? "true" : undefined}>
              <b>{t(a.id === "aghanims_shard" ? "arcade.roshanReward.aghanims_shard" : "arcade.item.aghanims_scepter")}:</b> {a.ids.map((id) => talentText(t, hero, id)).join(" · ")}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
