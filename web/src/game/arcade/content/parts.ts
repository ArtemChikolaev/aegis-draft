// Части героев по слотам Dota (T13.80). СГЕНЕРИРОВАНО scripts/dota_part_layers.mts table — не править руками.
// У героя: слоты в порядке отрисовки (снизу вверх) и семейства основ — тела со своими слоями: базовая модель `<hero>`,
// аркана `<hero>@arcana` и её стили `<hero>@arcana~style1`. У семейства: `defaults` — источник части в каждом слоте у
// самой основы (слот без записи у неё пуст) и `sources` — источники (`base` — модель по умолчанию, имя основы — её
// собственные части, `<set>` — сет `<hero>@<set>`) со слотами, под которые отрендерен слой `<основа>+<источник>.<слот>`.
// Лист тела — `<основа>+body`. Слот — `item_slot` из items_game (dota_item_index.json), порядок — DRAW_ORDER (dota_slots.mjs).
// Сборка облика — content/cosmetics.ts (loadoutSheet), рендер — features/arcade/sprites.ts.
export type DotaSlot = "back" | "mount" | "legs" | "belt" | "armor" | "arms" | "shoulder" | "neck" | "misc" | "head" | "weapon";
export interface PartsFamily { defaults: Readonly<Partial<Record<DotaSlot, string>>>; sources: Readonly<Record<string, readonly DotaSlot[]>> }
export interface HeroParts { slots: readonly DotaSlot[]; families: Readonly<Record<string, PartsFamily>> }
export const HERO_PARTS: Readonly<Record<string, HeroParts>> = /* DATA */{
  "juggernaut": {
    "slots": [
      "back",
      "legs",
      "arms",
      "head",
      "weapon"
    ],
    "families": {
      "juggernaut": {
        "defaults": {
          "legs": "base",
          "head": "base",
          "weapon": "base",
          "arms": "base",
          "back": "base"
        },
        "sources": {
          "base": [
            "back",
            "legs",
            "arms",
            "head",
            "weapon"
          ],
          "bladesrunner": [
            "back",
            "legs",
            "arms",
            "head",
            "weapon"
          ]
        }
      },
      "juggernaut@arcana": {
        "defaults": {
          "legs": "base",
          "weapon": "base",
          "arms": "base",
          "head": "arcana"
        },
        "sources": {
          "base": [
            "back",
            "legs",
            "arms",
            "head",
            "weapon"
          ],
          "arcana": [
            "head"
          ],
          "bladesrunner": [
            "back",
            "legs",
            "arms",
            "head",
            "weapon"
          ]
        }
      },
      "juggernaut@arcana~style1": {
        "defaults": {
          "legs": "base",
          "weapon": "base",
          "arms": "base",
          "head": "arcana"
        },
        "sources": {
          "base": [
            "back",
            "legs",
            "arms",
            "head",
            "weapon"
          ],
          "arcana": [
            "head"
          ],
          "bladesrunner": [
            "back",
            "legs",
            "arms",
            "head",
            "weapon"
          ]
        }
      }
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
    "families": {
      "phantom_assassin": {
        "defaults": {
          "back": "base",
          "belt": "base",
          "head": "base",
          "shoulder": "base",
          "weapon": "base"
        },
        "sources": {
          "base": [
            "back",
            "belt",
            "shoulder",
            "head",
            "weapon"
          ],
          "darkfeather": [
            "back",
            "belt",
            "shoulder",
            "head",
            "weapon"
          ]
        }
      }
    }
  },
  "lina": {
    "slots": [
      "belt",
      "arms",
      "neck",
      "head"
    ],
    "families": {
      "lina": {
        "defaults": {
          "arms": "base",
          "belt": "base",
          "head": "base",
          "neck": "base"
        },
        "sources": {
          "base": [
            "belt",
            "arms",
            "neck",
            "head"
          ],
          "dragonfire": [
            "belt",
            "arms",
            "neck",
            "head"
          ],
          "battle_caster": [
            "belt",
            "arms",
            "neck",
            "head"
          ]
        }
      },
      "lina@arcana": {
        "defaults": {
          "head": "arcana",
          "arms": "base",
          "belt": "base",
          "neck": "base"
        },
        "sources": {
          "base": [
            "belt",
            "arms",
            "neck",
            "head"
          ],
          "arcana": [
            "head"
          ],
          "dragonfire": [
            "belt",
            "arms",
            "neck",
            "head"
          ],
          "battle_caster": [
            "belt",
            "arms",
            "neck",
            "head"
          ]
        }
      }
    }
  },
  "monkey_king": {
    "slots": [
      "back",
      "armor",
      "shoulder",
      "head",
      "weapon"
    ],
    "families": {
      "monkey_king": {
        "defaults": {
          "armor": "base",
          "weapon": "base",
          "back": "base",
          "head": "base",
          "shoulder": "base"
        },
        "sources": {
          "base": [
            "back",
            "armor",
            "shoulder",
            "head",
            "weapon"
          ],
          "fiery_vajrapani": [
            "armor",
            "shoulder",
            "head",
            "weapon"
          ],
          "cult_of_the_demon_trickster": [
            "armor",
            "shoulder",
            "head",
            "weapon"
          ]
        }
      },
      "monkey_king@arcana": {
        "defaults": {
          "armor": "base",
          "weapon": "base",
          "back": "base",
          "shoulder": "base",
          "head": "arcana"
        },
        "sources": {
          "base": [
            "back",
            "armor",
            "shoulder",
            "head",
            "weapon"
          ],
          "arcana": [
            "head"
          ],
          "fiery_vajrapani": [
            "armor",
            "shoulder",
            "head",
            "weapon"
          ],
          "cult_of_the_demon_trickster": [
            "armor",
            "shoulder",
            "head",
            "weapon"
          ]
        }
      },
      "monkey_king@arcana~style1": {
        "defaults": {
          "armor": "base",
          "weapon": "base",
          "back": "base",
          "shoulder": "base",
          "head": "arcana"
        },
        "sources": {
          "base": [
            "back",
            "armor",
            "shoulder",
            "head",
            "weapon"
          ],
          "arcana": [
            "head"
          ],
          "fiery_vajrapani": [
            "armor",
            "shoulder",
            "head",
            "weapon"
          ],
          "cult_of_the_demon_trickster": [
            "armor",
            "shoulder",
            "head",
            "weapon"
          ]
        }
      },
      "monkey_king@arcana~style2": {
        "defaults": {
          "armor": "base",
          "weapon": "base",
          "back": "base",
          "shoulder": "base",
          "head": "arcana"
        },
        "sources": {
          "base": [
            "back",
            "armor",
            "shoulder",
            "head",
            "weapon"
          ],
          "arcana": [
            "head"
          ],
          "fiery_vajrapani": [
            "armor",
            "shoulder",
            "head",
            "weapon"
          ],
          "cult_of_the_demon_trickster": [
            "armor",
            "shoulder",
            "head",
            "weapon"
          ]
        }
      },
      "monkey_king@arcana~style3": {
        "defaults": {
          "armor": "base",
          "weapon": "base",
          "back": "base",
          "shoulder": "base",
          "head": "arcana"
        },
        "sources": {
          "base": [
            "back",
            "armor",
            "shoulder",
            "head",
            "weapon"
          ],
          "arcana": [
            "head"
          ],
          "fiery_vajrapani": [
            "armor",
            "shoulder",
            "head",
            "weapon"
          ],
          "cult_of_the_demon_trickster": [
            "armor",
            "shoulder",
            "head",
            "weapon"
          ]
        }
      }
    }
  },
  "axe": {
    "slots": [
      "belt",
      "armor",
      "misc",
      "head",
      "weapon"
    ],
    "families": {
      "axe": {
        "defaults": {
          "armor": "base",
          "belt": "base",
          "head": "base",
          "weapon": "base"
        },
        "sources": {
          "base": [
            "belt",
            "armor",
            "head",
            "weapon"
          ],
          "blackthorn": [
            "belt",
            "armor",
            "misc",
            "head",
            "weapon"
          ],
          "armor_of_the_wrought_legion": [
            "belt",
            "armor",
            "misc",
            "head",
            "weapon"
          ]
        }
      }
    }
  }
}/* END */;
