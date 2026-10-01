// Таланты героя (T22.2): на 10/15/20/25 уровне — пара талантов по киту героя, как в Dota («Blade Fury: 4 → 5 с»),
// вместо восьми общих на всех. Талант усиливает одно поле одного умения; какое поле, решает вид умения (KIND_MODS):
// только поля, которые сим этого вида реально читает (castAbility, тик, пересчёт статов). Сим держит свою копию героя
// (`cloneHeroDef`) и правит её выбранным талантом — все ветки видов читают числа уже с талантом.
// Общие таланты (t10_dmg…t25_regen) остались запасом: слот, которому по киту нечего дать (у пассивки нет перезарядки),
// берёт общий талант своего уровня.
import { ARCADE } from "../config.ts";
import type { AbilityKey } from "../types.ts";
import { HEROES, type AbilityDef, type AbilityKind, type HeroDef, type HeroId } from "./heroes.ts";

/** Что усиливает талант умения. */
export type TalentMod = "value" | "duration" | "cooldown" | "radius" | "count";
/** Талант по киту: умение и поле; `id` — `<key>_<mod>` (`q_duration`). */
export interface KitTalent { id: string; key: AbilityKey; mod: TalentMod }

/** Что талант усиливает у вида умения — от главного к запасному. Поле без числа у конкретного умения (нет `duration`,
 *  нулевой урон у чистого контроля) пропускается — берётся следующее. У frenzy главное — длительность: его «сила» — доля
 *  интервала атаки, и на старших рангах она уже упирается в потолок ×4 скорости (sim, `Math.max(0.25, k)`). */
const KIND_MODS: Record<AbilityKind, readonly TalentMod[]> = {
  spin: ["duration", "value"], ward: ["value", "duration"], crit: ["value"], omni: ["value", "count"],
  nova: ["value", "radius"], frostbite: ["value", "duration"], arcane_aura: ["value"], freezing_field: ["value", "duration"],
  shrapnel: ["value", "duration"], headshot: ["value"], take_aim: ["value"], assassinate: ["value", "cooldown"],
  berserker_call: ["value", "radius"], battle_hunger: ["value", "count"], counter_helix: ["value", "radius"], culling_blade: ["value", "cooldown"],
  arc_lightning: ["value", "count"], lightning_bolt: ["value", "duration"], static_field: ["value", "radius"], thundergod: ["value", "cooldown"],
  dash: ["value", "cooldown", "radius"], line_burst: ["value", "count"], meteor: ["value", "count"], armor_buff: ["value", "duration"],
  rage: ["value", "duration"], frenzy: ["duration", "value"], haste: ["duration", "cooldown"], damage_ward: ["value", "duration"],
  life_drain: ["value", "duration"], gust: ["value", "radius"], multishot: ["value", "count"], remnant: ["value", "cooldown"],
  mass_freeze: ["value", "duration", "radius"], requiem: ["value", "radius"], goo: ["value", "cooldown"], ravage: ["value", "radius"],
  edict: ["value", "duration"], death_pact: ["value", "duration"], signature: ["value"], presence: ["value", "radius"],
  armor_passive: ["value"], frost_arrows: ["value"], searing: ["value"], venom: ["value"], mana_break: ["value"], coup: ["value"],
  mana_void: ["value", "cooldown"], reincarnation: ["cooldown"], rupture: ["value", "duration"], corrosive: ["value", "duration"],
  berserk_blood: ["value"], metamorphosis: ["value", "duration"], tether: ["value", "duration"], spirits: ["value", "duration"],
};

/** Виды, у которых `value` — урон (подпись «урон +N%»); у остальных — сила эффекта (броня, лечение, шанс, стан…). */
export const DAMAGE_KINDS: ReadonlySet<AbilityKind> = new Set<AbilityKind>([
  "spin", "omni", "nova", "frostbite", "freezing_field", "shrapnel", "headshot", "assassinate", "battle_hunger", "counter_helix",
  "culling_blade", "arc_lightning", "lightning_bolt", "static_field", "thundergod", "dash", "line_burst", "meteor", "damage_ward",
  "life_drain", "gust", "multishot", "remnant", "mass_freeze", "requiem", "goo", "ravage", "edict", "searing", "venom", "mana_break",
  "mana_void", "rupture", "spirits",
]);

/** Что считает `count` у вида — для подписи «+1 зона / цель / стрела / удар». */
export const COUNT_UNIT: Partial<Record<AbilityKind, "zone" | "target" | "arrow" | "strike">> = {
  line_burst: "zone", meteor: "zone", arc_lightning: "target", battle_hunger: "target", multishot: "arrow", omni: "strike",
};

function hasMod(ab: AbilityDef, mod: TalentMod): boolean {
  switch (mod) {
    case "value": return ab.value.some((v) => v > 0);
    case "duration": return ab.duration !== undefined && ab.duration > 0;
    case "radius": return ab.radius !== undefined && ab.radius > 0;
    case "count": return !!ab.count?.some((c) => c > 0);
    // Перезарядка есть у активных умений; из пассивок — только у Reincarnation (сим читает её `cooldown`).
    case "cooldown": return ab.cooldown > 0 && (!ab.passive || ab.kind === "reincarnation");
  }
}

/** Таланты умения по порядку KIND_MODS — только те, что у этого умения есть чем усилить. */
function abilityTalents(def: HeroDef, key: AbilityKey): KitTalent[] {
  const ab = def.abilities[key];
  return (KIND_MODS[ab.kind] ?? []).filter((mod) => hasMod(ab, mod)).map((mod) => ({ id: `${key}_${mod}`, key, mod }));
}

/** Лестница: на каждом уровне два слота «умение, номер его таланта»; слоту без таланта — общий талант своего уровня.
 *  В паре — главный талант одного умения против запасного другого: иначе на 10-м почти у всех выходило «урон +25%»
 *  против «урон +25%». К 25-му каждое умение получает оба своих таланта. */
const LADDER: Record<number, readonly [readonly [AbilityKey, number], readonly [AbilityKey, number]]> = {
  10: [["q", 0], ["w", 1]],
  15: [["w", 0], ["e", 1]],
  20: [["e", 0], ["q", 1]],
  25: [["r", 0], ["r", 1]],
};
const FALLBACK: Record<number, readonly [string, string]> = {
  10: ["t10_dmg", "t10_ms"],
  15: ["t15_hp", "t15_crit"],
  20: ["t20_armor", "t20_cd"],
  25: ["t25_regen", "t25_regen"],
};
/** Уровни талантов. */
export const TALENT_LEVELS: readonly number[] = Object.keys(LADDER).map(Number);
/** Общие таланты-запас (строки `arcade.t.<id>`). */
export const GENERIC_TALENTS: readonly string[] = [...new Set(Object.values(FALLBACK).flat())];

const cache = new Map<HeroId, Record<number, readonly [string, string]>>();
/** Пары талантов героя по уровням: id кит-таланта (`q_duration`) или общего (`t15_hp`). Считаются по базовому герою из
 *  HEROES, а не по копии сима: взятый талант меняет числа, но не набор полей. */
export function heroTalents(id: HeroId): Record<number, readonly [string, string]> {
  const hit = cache.get(id);
  if (hit) return hit;
  const def = HEROES[id];
  const byKey = { q: abilityTalents(def, "q"), w: abilityTalents(def, "w"), e: abilityTalents(def, "e"), r: abilityTalents(def, "r") };
  const out: Record<number, readonly [string, string]> = {};
  for (const lvl of TALENT_LEVELS) {
    const [a, b] = LADDER[lvl].map(([key, i], slot) => byKey[key][i]?.id ?? FALLBACK[lvl][slot]);
    out[lvl] = [a, b];
  }
  cache.set(id, out);
  return out;
}

/** Кит-талант по id (`q_duration`) или null — общий талант (`t10_dmg`) или чужой id. */
export function kitTalent(id: string): KitTalent | null {
  const m = /^([qwer])_(value|duration|cooldown|radius|count)$/.exec(id);
  return m ? { id, key: m[1] as AbilityKey, mod: m[2] as TalentMod } : null;
}

/** Множитель таланта: у ульта — сильнее (ARCADE.talents.ult). */
function share(key: AbilityKey, base: number): number {
  return base * (key === "r" ? ARCADE.talents.ult : 1);
}
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Числа таланта «было → стало» по базовому умению (для подписи) — одно место и для сима, и для экрана. */
export function talentFigures(ab: AbilityDef, t: KitTalent): { from: number; to: number } {
  const T = ARCADE.talents;
  switch (t.mod) {
    case "value": return { from: 1, to: 1 + share(t.key, T.value) };
    case "duration": return { from: ab.duration ?? 0, to: round1((ab.duration ?? 0) * (1 + share(t.key, T.duration))) };
    case "cooldown": return { from: ab.cooldown, to: round1(ab.cooldown * (1 - share(t.key, T.cooldown))) };
    case "radius": return { from: ab.radius ?? 0, to: Math.round((ab.radius ?? 0) * (1 + share(t.key, T.radius))) };
    case "count": return { from: 0, to: T.count };
  }
}

/** Применить кит-талант к КОПИИ героя (см. cloneHeroDef): умение получает новые числа на всех уровнях. */
export function applyKitTalent(def: HeroDef, t: KitTalent): void {
  const ab = def.abilities[t.key];
  const f = talentFigures(ab, t);
  switch (t.mod) {
    case "value": ab.value = ab.value.map((v) => v * f.to); break;
    case "duration": ab.duration = f.to; break;
    case "cooldown": ab.cooldown = f.to; break;
    case "radius": ab.radius = f.to; break;
    case "count": ab.count = ab.count?.map((c) => (c > 0 ? c + f.to : c)); break;
  }
}

/** Своя копия героя на забег: таланты правят числа умений, общий HEROES остаётся нетронутым. */
export function cloneHeroDef(def: HeroDef): HeroDef {
  const copy = (ab: AbilityDef): AbilityDef => ({ ...ab, value: [...ab.value], ...(ab.count ? { count: [...ab.count] } : {}) });
  return { ...def, abilities: { q: copy(def.abilities.q), w: copy(def.abilities.w), e: copy(def.abilities.e), r: copy(def.abilities.r) } };
}

/** Подпись таланта для экрана: ключ строки, числа и умение, чьё имя подставить в `{ability}`. Числа — от базового героя,
 *  поэтому взятый талант в списке сборки читается так же, как на карточке выбора. */
export function talentLabel(hero: HeroId, talent: string): { key: string; vars: Record<string, number>; ability?: AbilityKey } {
  const t = kitTalent(talent);
  if (!t) return { key: `arcade.t.${talent}`, vars: {} };
  const ab = HEROES[hero].abilities[t.key];
  const f = talentFigures(ab, t);
  switch (t.mod) {
    case "value": return { key: DAMAGE_KINDS.has(ab.kind) ? "arcade.talent.valueDmg" : "arcade.talent.value", vars: { pct: Math.round((f.to - 1) * 100) }, ability: t.key };
    case "count": return { key: `arcade.talent.count.${COUNT_UNIT[ab.kind] ?? "strike"}`, vars: { n: f.to }, ability: t.key };
    default: return { key: `arcade.talent.${t.mod}`, vars: { from: f.from, to: f.to }, ability: t.key };
  }
}
