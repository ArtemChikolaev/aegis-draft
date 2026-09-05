// Питомцы школы «Зверинец» (T13.21, референс — призывы Death Must Die): сущности сима со своим ИИ.
// Ястреб Beastmaster собирает шарды, волк Lycan кусает и замедляет, Медведь-дух Lone Druid бьёт тяжело и
// изредка оглушает. Спрайты — `dota_px/{hawk,wolf,bear}` через тот же конвейер (dota_manifest_px.tsv).
export type PetKind = "hawk" | "wolf" | "bear";

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
};
