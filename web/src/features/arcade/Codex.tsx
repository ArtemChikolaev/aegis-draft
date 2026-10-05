// Справочник механик Аркады (M25): на подготовке — аффиксы элиты, умения нейтралов, руны, серии, Древние лагеря и типы
// благословений. Запись открывается после первой встречи (как бестиарий) — те же «увиденные», что у подсказок M24
// (`hints.ts`); типы благословений видны сразу — они и так на каждой карточке. Числа — из конфига, как в симе.
import { useMemo } from "react";
import { ARCADE, TICK_HZ } from "../../game/arcade/config.ts";
import { AFFIX_IDS, ENEMY_KINDS } from "../../game/arcade/content/enemies.ts";
import type { EnemyKindId, NeutralCastId, RuneKind, UpgradeType } from "../../game/arcade/types.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/core.ts";
import { CODEX_ANCIENTS, CODEX_CASTS, CODEX_RIVALS, CODEX_RUNES, loadSeenHints } from "./hints.ts";

type T = (k: MessageKey, v?: Record<string, string | number>) => string;
interface Entry { key: string | null; name: string; desc: string }

const TYPES: readonly UpgradeType[] = ["attack", "strike", "cast", "dash", "summon", "power", "passive"];
const pct = (x: number) => Math.round(x * 100);

function castVars(id: NeutralCastId): Record<string, number> {
  const NC = ARCADE.neutralCasts;
  switch (id) {
    case "stomp": return { r: NC.stomp.radius, stun: NC.stomp.stun };
    case "clap": return { r: NC.clap.radius, sec: NC.clap.slowSec };
    case "purge": return { sec: NC.purge.slowSec };
    case "frost_armor": return { sec: NC.frostArmor.seconds, pct: pct(1 - NC.frostArmor.taken) };
    case "fireball": return { r: NC.fireball.radius };
    case "meat_hook": return { len: NC.meatHook.length };
    case "berserkers_call": return { r: NC.berserkersCall.radius, sec: NC.berserkersCall.tauntSec };
    case "laguna_blade": return { len: NC.lagunaBlade.length, sec: NC.lagunaBlade.tele / TICK_HZ };
  }
}

function runeVars(id: RuneKind): Record<string, number> {
  const R = ARCADE.rune;
  switch (id) {
    case "dd": return { mult: R.dd.mult, sec: R.dd.seconds };
    case "shield": return { pct: pct(R.shield.frac), sec: R.shield.seconds };
    case "arcane": return { pct: pct(R.arcane.cooldown), sec: R.arcane.seconds };
    case "illusion": return { n: R.illusion.count, sec: R.illusion.seconds, pct: pct(R.illusion.dmgFrac) };
    case "wisdom": return { min: ARCADE.wisdom.every / TICK_HZ / 60, pct: pct(ARCADE.wisdom.levelFrac) };
  }
}

/** Разделы справочника; `key` — ключ «увиденного» (null — открыто всегда). */
function sections(t: T): { id: string; title: string; entries: Entry[] }[] {
  const armor = pct(1 - ARCADE.neutralCasts.frostArmor.taken);
  return [
    { id: "affix", title: t("arcade.hint.affix"), entries: AFFIX_IDS.map((id) => ({ key: `affix.${id}`, name: t(`arcade.affix.${id}` as MessageKey), desc: t(`arcade.affix.${id}.desc` as MessageKey) })) },
    { id: "casts", title: t("arcade.codex.casts"), entries: CODEX_CASTS.map((id) => ({ key: `cast.${id}`, name: t(`arcade.steal.${id}` as MessageKey), desc: t(`arcade.codex.cast.${id}` as MessageKey, castVars(id)) })) },
    { id: "runes", title: t("arcade.codex.runes"), entries: CODEX_RUNES.map((id) => ({ key: `rune.${id}`, name: t(`arcade.rune.${id}` as MessageKey), desc: t(`arcade.codex.rune.${id}` as MessageKey, runeVars(id)) })) },
    {
      id: "series", title: t("arcade.codex.series"), entries: [
        { key: "streak", name: t("arcade.hint.streak"), desc: t("arcade.hud.streakHint") },
        { key: "multi", name: t("arcade.codex.multi"), desc: t("arcade.hud.multiHint", { sec: ARCADE.multiKill.rampageCd / TICK_HZ }) },
      ],
    },
    { id: "rivals", title: t("arcade.codex.rivals"), entries: CODEX_RIVALS.map((id) => ({ key: `rival.${id}`, name: t(`arcade.enemy.${id}` as MessageKey), desc: t(`arcade.codex.rival.${id}` as MessageKey, { ...castVars(ENEMY_KINDS[id as EnemyKindId].cast!), stay: ARCADE.rivals.stay / TICK_HZ }) })) },
    { id: "ancients", title: t("arcade.codex.ancients"), entries: CODEX_ANCIENTS.map((id) => ({ key: `ancient.${id}`, name: t(`arcade.enemy.${id}` as MessageKey), desc: t(`arcade.codex.ancient.${id}` as MessageKey, { r: ARCADE.neutralCasts.fireball.radius, aura: ENEMY_KINDS.granite_golem.armorAura ?? 0, pct: armor }) })) },
    {
      id: "types", title: t("arcade.codex.types"), entries: TYPES.map((type) => ({
        key: null,
        name: t(`arcade.type.${type}` as MessageKey),
        desc: `${t(`arcade.codex.type.${type}` as MessageKey)} ${t(ARCADE.blessingSlots[type] !== undefined ? "arcade.codex.slot" : "arcade.codex.noSlot", { n: ARCADE.blessingSlots[type] ?? 0 })}`,
      })),
    },
  ];
}

/** Сколько записей открыто из тех, что открываются встречей. */
export function codexProgress(seen: ReadonlySet<string>, t: T): { open: number; total: number } {
  const keyed = sections(t).flatMap((s) => s.entries).filter((e) => e.key !== null);
  return { open: keyed.filter((e) => seen.has(e.key!)).length, total: keyed.length };
}

export function MechanicsCodex() {
  const { t } = useI18n();
  const seen = useMemo(() => loadSeenHints(), []);
  const list = sections(t);
  const { open, total } = codexProgress(seen, t);
  return (
    <div className="arcade-codex" data-testid="arcade-codex">
      <p className="arcade-codex__progress">{t("arcade.codex.open", { n: open, total })}</p>
      {list.map((s) => (
        <section key={s.id} className="arcade-codex__section" data-testid={`arcade-codex-${s.id}`}>
          <h4>{s.title}</h4>
          <ul>
            {s.entries.map((e) => {
              const known = e.key === null || seen.has(e.key);
              return (
                <li key={e.key ?? e.name} data-locked={known ? undefined : "true"}>
                  <b>{known ? e.name : "???"}</b>
                  <span>{known ? e.desc : t("arcade.codex.locked")}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
