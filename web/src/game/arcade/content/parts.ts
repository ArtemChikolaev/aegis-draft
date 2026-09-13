// Части героев по слотам Dota (T13.80). СГЕНЕРИРОВАНО scripts/dota_part_layers.mts build — не править руками:
// у каждого героя слоты в порядке отрисовки (снизу вверх) и источники частей (`base` — модель по умолчанию,
// `<set>` — сет `<hero>@<set>`) с теми слотами, под которые отрендерен слой `<hero>+<источник>.<слот>`.
// Лист тела — `<hero>+body`. Сборка облика — content/cosmetics.ts (loadoutSheet), рендер — features/arcade/sprites.ts.
export type DotaSlot = "back" | "mount" | "belt" | "armor" | "arms" | "shoulder" | "neck" | "misc" | "head" | "weapon";
export interface HeroParts { slots: readonly DotaSlot[]; sources: Readonly<Record<string, readonly DotaSlot[]>> }
export const HERO_PARTS: Readonly<Record<string, HeroParts>> = /* DATA */{
  "juggernaut": {
    "slots": [
      "back",
      "belt",
      "arms",
      "head",
      "weapon"
    ],
    "sources": {
      "base": [
        "belt",
        "head",
        "weapon",
        "arms",
        "back"
      ],
      "bladesrunner": [
        "arms",
        "back",
        "head",
        "belt",
        "weapon"
      ]
    }
  },
  "phantom_assassin": {
    "slots": [
      "back",
      "belt",
      "shoulder",
      "head",
      "weapon"
    ],
    "sources": {
      "base": [
        "back",
        "weapon",
        "head",
        "shoulder"
      ],
      "darkfeather": [
        "back",
        "belt",
        "head",
        "shoulder",
        "weapon"
      ]
    }
  },
  "lina": {
    "slots": [
      "belt",
      "arms",
      "shoulder",
      "neck",
      "misc",
      "head"
    ],
    "sources": {
      "base": [
        "arms",
        "belt",
        "head",
        "neck"
      ],
      "dragonfire": [
        "arms",
        "belt",
        "head",
        "neck"
      ],
      "arcana": [
        "head",
        "shoulder",
        "belt",
        "misc"
      ]
    }
  },
  "monkey_king": {
    "slots": [
      "back",
      "armor",
      "shoulder",
      "misc",
      "head",
      "weapon"
    ],
    "sources": {
      "base": [
        "armor",
        "weapon",
        "back",
        "head",
        "shoulder"
      ],
      "fiery_vajrapani": [
        "armor",
        "head",
        "shoulder",
        "weapon"
      ],
      "arcana": [
        "misc"
      ],
      "cult_of_the_demon_trickster": [
        "armor",
        "head",
        "shoulder",
        "weapon"
      ]
    }
  },
  "axe": {
    "slots": [
      "back",
      "belt",
      "armor",
      "misc",
      "head",
      "weapon"
    ],
    "sources": {
      "base": [
        "armor",
        "belt",
        "head",
        "back",
        "weapon"
      ],
      "blackthorn": [
        "armor",
        "belt",
        "head",
        "misc",
        "weapon"
      ],
      "armor_of_the_wrought_legion": [
        "armor",
        "belt",
        "head",
        "misc",
        "weapon"
      ]
    }
  }
}/* END */;
