// Питомцы школы «Зверинец» (T13.21, референс — призывы Death Must Die): сущности сима со своим ИИ.
// Ястреб Beastmaster собирает шарды, волк Lycan кусает и замедляет, Медведь-дух Lone Druid бьёт тяжело и
// изредка оглушает. Спрайты — `dota_px/{hawk,wolf,bear}` через тот же конвейер (dota_manifest_px.tsv).
/** `illusion` — копия героя (руна иллюзий, Conjure Image, Mirror Image, Juxtapose, Phantasm): бежит за героем и бьёт
 *  как он — в ближнем бою рядом, в дальнем снарядом; у Terrorblade в Метаморфозе иллюзии тоже переходят в дальний бой.
 *  Скорость, дальность и период удара берутся у героя на лету (см. sim.tickPets), в таблице — только тело и поводок. */
/** `summon` — призыв способности (Spawn Spiderlings, Nature's Call, Summon Wolves, варды): такое же
 *  существо сима, как питомец Зверинца, только живёт по таймеру умения и берёт тело из `SUMMONS`. */
export type PetKind = "hawk" | "wolf" | "bear" | "illusion" | "summon";

export interface PetDef {
  kind: PetKind;
  /** Радиус тела (коллизия/отрисовка) и скорость. */
  r: number;
  speed: number;
  /** Дистанция, на которой питомец держится от героя, и радиус поиска цели. */
  leash: number;
  seek: number;
  /** Урон удара (×ранг апгрейда и множитель Рёва), период удара в секундах, дальность удара. */
  dmg: number;
  every: number;
  reach: number;
  /** Ястреб: радиус сбора шардов. */
  collect?: number;
  /** Волк: замедление на укус (доля, 1 с); медведь: шанс стана 0.3 с. */
  slow?: number;
  stun?: number;
}

export const PETS: Record<PetKind, PetDef> = {
  hawk: { kind: "hawk", r: 10, speed: 260, leash: 60, seek: 0, dmg: 0, every: 0, reach: 0, collect: 110 },
  wolf: { kind: "wolf", r: 12, speed: 210, leash: 70, seek: 260, dmg: 14, every: 1.1, reach: 30, slow: 0.35 },
  bear: { kind: "bear", r: 18, speed: 150, leash: 80, seek: 200, dmg: 30, every: 1.6, reach: 40, stun: 0.2 },
  illusion: { kind: "illusion", r: 14, speed: 0, leash: 56, seek: 320, dmg: 0, every: 0, reach: 0 },
  summon: { kind: "summon", r: 14, speed: 190, leash: 70, seek: 300, dmg: 0, every: 1, reach: 34 },
};

/**
 * Тело призыва умения. Ключ — `SummonDef.art` из content/heroes.ts (он же имя листа спрайтов в
 * `art/sprites/dota_px2/`). Владелец 2026-09-08: «паучки бруды просто стоят на месте и бьют в
 * гигантском радиусе — любой суммон/иллюзия бегает за хозяином и бьёт врагов, как у Наги».
 * Поэтому существо = питомец сима (tickPets), а не картинка над зоной урона.
 *
 * `stationary` — только для тотемов, которые и в Dota вкопаны в землю (Nether/Plague/Death/Serpent
 * Ward, Psionic Trap, Tombstone): они остаются в точке установки, но стреляют по конкретной цели,
 * а не «жгут всех в круге».
 */
export interface SummonBody {
  r: number;
  speed: number;
  leash: number;
  seek: number;
  reach: number;
  /** Период удара, с: урон за удар сим считает от значения умения (sim.spawnSummons). */
  every: number;
  /** Бьёт снарядом вместо удара в упор (ястреб Beastmaster). */
  ranged?: boolean;
  /** Тотем: стоит там, где поставлен, и бьёт мгновенно на `reach` (см. sim.tickPets). */
  stationary?: boolean;
}

export const SUMMONS: Record<string, SummonBody> = {
  // Звери и существа: бегут за героем и бьют в упор.
  spiderling: { r: 11, speed: 235, leash: 62, seek: 320, reach: 30, every: 0.8 },
  beetle: { r: 11, speed: 225, leash: 62, seek: 320, reach: 30, every: 0.8 },
  treant: { r: 16, speed: 175, leash: 74, seek: 300, reach: 36, every: 1.2 },
  wolf: { r: 12, speed: 210, leash: 70, seek: 300, reach: 30, every: 1.1 },
  // Тяжёлым одиночкам период удара короче, чем просится по весу: DPS от него не зависит (sim.spawnSummons
  // делит урон на `every`), а редкий тяжёлый удар теряется в дороге и в оверкилле — Lone Druid при 1.6
  // недобирал 9 п.п. «дошёл до Рошана» против прежней зоны (замер 2026-09-08).
  bear: { r: 18, speed: 150, leash: 80, seek: 280, reach: 40, every: 1.1 },
  hellbear: { r: 20, speed: 150, leash: 84, seek: 280, reach: 42, every: 1.1 },
  warlock_golem: { r: 24, speed: 135, leash: 96, seek: 280, reach: 46, every: 1.1 },
  hawk: { r: 10, speed: 260, leash: 60, seek: 300, reach: 90, every: 1, ranged: true },
  // Тотемы Dota: стоят там, где поставлены, и бьют по одной цели на дистанции (мгновенно, как прежняя зона).
  // Период короткий не для красоты: тотемы выбирают ОДНУ ближайшую цель, и три редких тяжёлых удара
  // приходят в неё разом — мелочь умирает с первого, два остальных уходят в пустоту. Прежняя зона била
  // раз в 0.25 с одним источником и почти не переливала; Shadow Shaman на 0.9 с недобирал 11 п.п.
  ward_nether: { r: 12, speed: 0, leash: 0, seek: 320, reach: 300, every: 0.4, stationary: true },
  ward_plague: { r: 12, speed: 0, leash: 0, seek: 340, reach: 320, every: 0.4, stationary: true },
  ward_death: { r: 14, speed: 0, leash: 0, seek: 360, reach: 340, every: 0.3, stationary: true },
  ward_serpent: { r: 12, speed: 0, leash: 0, seek: 360, reach: 340, every: 0.4, stationary: true },
  trap_psionic: { r: 12, speed: 0, leash: 0, seek: 320, reach: 300, every: 0.4, stationary: true },
  tombstone: { r: 16, speed: 0, leash: 0, seek: 320, reach: 300, every: 0.4, stationary: true },
};
