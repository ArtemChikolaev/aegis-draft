// Части героев по слотам Dota (T13.80). СГЕНЕРИРОВАНО scripts/dota_part_layers.mts table — не править руками.
// У героя: слоты в порядке отрисовки (снизу вверх) и семейства основ — тела со своими слоями: базовая модель `<hero>`,
// аркана `<hero>@arcana` и её стили `<hero>@arcana~style1`. У семейства: `defaults` — источник части в каждом слоте у
// самой основы (слот без записи у неё пуст) и `sources` — источники (`base` — модель по умолчанию, имя основы — её
// собственные части, `<set>` — сет `<hero>@<set>`) со слотами, под которые отрендерен слой `<основа>+<источник>.<слот>`.
// Лист тела — `<основа>+body`. Слот — `item_slot` из items_game (dota_item_index.json), порядок — DRAW_ORDER (dota_slots.mjs).
// `backOrder` — где рисовать слой спины (плащ, крылья) в каждом направлении: порядок слотов один на лист, но спиной к камере
// плащ лежит ПОВЕРХ брони, а не под ней. Меряется здесь же: композит «тело + слои по умолчанию» против цельного листа основы.
// Сборка облика — content/cosmetics.ts (loadoutSheet), рендер — features/arcade/sprites.ts.
export type DotaSlot = "back" | "tail" | "mount" | "legs" | "belt" | "armor" | "costume" | "arms" | "gloves" | "shoulder" | "neck" | "misc" | "body_head" | "head" | "weapon" | "offhand_weapon";
export interface PartsFamily { defaults: Readonly<Partial<Record<DotaSlot, string>>>; sources: Readonly<Record<string, readonly DotaSlot[]>>; /** Порядок слоя спины по направлениям листа: 0 — первой, 1 — перед головой/оружием, 2 — последней (нет поля — всюду 0). */ backOrder?: readonly number[] }
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
        },
        "backOrder": [ 1, 0, 0, 0, 1, 2, 1, 1 ]
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
        },
        "backOrder": [ 1, 0, 0, 0, 1, 2, 1, 1 ]
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
        },
        "backOrder": [ 1, 0, 0, 0, 1, 2, 1, 1 ]
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
  },
  "terrorblade": {
    "slots": [
      "back",
      "armor",
      "head",
      "weapon"
    ],
    "families": {
      "terrorblade": {
        "defaults": {
          "armor": "base",
          "head": "base",
          "weapon": "base",
          "back": "base"
        },
        "sources": {
          "base": [
            "back",
            "armor",
            "head",
            "weapon"
          ],
          "marauders": [
            "back",
            "armor",
            "head",
            "weapon"
          ],
          "eternal_purgatory": [
            "back",
            "armor",
            "head",
            "weapon"
          ],
          "foulfell": [
            "back",
            "armor",
            "head",
            "weapon"
          ],
          "broken_code": [
            "back",
            "armor",
            "head",
            "weapon"
          ],
          "forgotten_station": [
            "back",
            "armor",
            "head",
            "weapon"
          ]
        },
        "backOrder": [ 0, 0, 2, 2, 2, 2, 2, 0 ]
      },
      "terrorblade@arcana": {
        "defaults": {
          "armor": "base",
          "head": "arcana",
          "weapon": "base",
          "back": "base"
        },
        "sources": {
          "base": [
            "back",
            "armor",
            "head",
            "weapon"
          ],
          "arcana": [
            "head"
          ],
          "marauders": [
            "back",
            "armor",
            "head",
            "weapon"
          ],
          "eternal_purgatory": [
            "back",
            "armor",
            "head",
            "weapon"
          ],
          "foulfell": [
            "back",
            "armor",
            "head",
            "weapon"
          ],
          "broken_code": [
            "back",
            "armor",
            "head",
            "weapon"
          ],
          "forgotten_station": [
            "back",
            "armor",
            "head",
            "weapon"
          ]
        },
        "backOrder": [ 0, 0, 2, 2, 2, 2, 2, 0 ]
      }
    }
  },
  "anti_mage": {
    "slots": [
      "belt",
      "armor",
      "arms",
      "shoulder",
      "head",
      "weapon",
      "offhand_weapon"
    ],
    "families": {
      "anti_mage": {
        "defaults": {
          "arms": "base",
          "belt": "base",
          "armor": "base",
          "head": "base",
          "offhand_weapon": "base",
          "weapon": "base"
        },
        "sources": {
          "base": [
            "belt",
            "armor",
            "arms",
            "head",
            "weapon",
            "offhand_weapon"
          ],
          "guilt_of_the_survivor": [
            "belt",
            "armor",
            "arms",
            "shoulder",
            "head",
            "weapon",
            "offhand_weapon"
          ],
          "basher_blades": [
            "weapon",
            "offhand_weapon"
          ],
          "arcs_of_manta": [
            "weapon",
            "offhand_weapon"
          ]
        }
      }
    }
  },
  "shadow_fiend": {
    "slots": [
      "back",
      "arms",
      "shoulder",
      "head"
    ],
    "families": {
      "shadow_fiend": {
        "defaults": {
          "arms": "base",
          "head": "base",
          "shoulder": "base"
        },
        "sources": {
          "base": [
            "arms",
            "shoulder",
            "head"
          ],
          "eternal_harvest": [
            "arms",
            "shoulder",
            "head"
          ],
          "souls_tyrant": [
            "arms",
            "shoulder",
            "head"
          ],
          "spring_lineage_eternal_harvest": [
            "arms",
            "shoulder",
            "head"
          ]
        }
      },
      "shadow_fiend@arcana": {
        "defaults": {
          "back": "arcana",
          "arms": "arcana",
          "head": "arcana",
          "shoulder": "arcana"
        },
        "sources": {
          "base": [
            "arms",
            "shoulder",
            "head"
          ],
          "arcana": [
            "back",
            "arms",
            "shoulder",
            "head"
          ],
          "eternal_harvest": [
            "arms",
            "shoulder",
            "head"
          ],
          "souls_tyrant": [
            "arms",
            "shoulder",
            "head"
          ],
          "spring_lineage_eternal_harvest": [
            "arms",
            "shoulder",
            "head"
          ]
        },
        "backOrder": [ 0, 0, 1, 2, 2, 2, 1, 0 ]
      }
    }
  },
  "drow_ranger": {
    "slots": [
      "back",
      "legs",
      "arms",
      "shoulder",
      "misc",
      "head",
      "weapon"
    ],
    "families": {
      "drow_ranger": {
        "defaults": {
          "shoulder": "base",
          "arms": "base",
          "back": "base",
          "head": "base",
          "legs": "base",
          "misc": "base",
          "weapon": "base"
        },
        "sources": {
          "base": [
            "back",
            "legs",
            "arms",
            "shoulder",
            "misc",
            "head",
            "weapon"
          ],
          "sight_of_the_kha_ren_faithful": [
            "back",
            "legs",
            "arms",
            "shoulder",
            "misc",
            "head",
            "weapon"
          ],
          "stranger_in_the_wandering_isles": [
            "back",
            "legs",
            "arms",
            "shoulder",
            "misc",
            "head",
            "weapon"
          ],
          "black_ice_constellation": [
            "back",
            "legs",
            "arms",
            "shoulder",
            "misc",
            "head",
            "weapon"
          ]
        },
        "backOrder": [ 0, 0, 2, 2, 2, 1, 1, 1 ]
      },
      "drow_ranger@arcana": {
        "defaults": {
          "arms": "arcana",
          "back": "arcana",
          "head": "arcana",
          "legs": "arcana",
          "misc": "arcana",
          "shoulder": "arcana",
          "weapon": "arcana"
        },
        "sources": {
          "base": [
            "back",
            "legs",
            "arms",
            "shoulder",
            "misc",
            "head"
          ],
          "arcana": [
            "back",
            "legs",
            "arms",
            "shoulder",
            "misc",
            "head",
            "weapon"
          ],
          "sight_of_the_kha_ren_faithful": [
            "back",
            "legs",
            "arms",
            "shoulder",
            "misc",
            "head"
          ],
          "stranger_in_the_wandering_isles": [
            "back",
            "legs",
            "arms",
            "shoulder",
            "misc",
            "head"
          ],
          "black_ice_constellation": [
            "back",
            "legs",
            "arms",
            "shoulder",
            "misc",
            "head"
          ]
        },
        "backOrder": [ 0, 0, 0, 1, 1, 0, 0, 0 ]
      },
      "drow_ranger@arcana~style1": {
        "defaults": {
          "arms": "arcana",
          "back": "arcana",
          "head": "arcana",
          "legs": "arcana",
          "misc": "arcana",
          "shoulder": "arcana",
          "weapon": "arcana"
        },
        "sources": {
          "base": [
            "back",
            "legs",
            "arms",
            "shoulder",
            "misc",
            "head"
          ],
          "arcana": [
            "back",
            "legs",
            "arms",
            "shoulder",
            "misc",
            "head",
            "weapon"
          ],
          "sight_of_the_kha_ren_faithful": [
            "back",
            "legs",
            "arms",
            "shoulder",
            "misc",
            "head"
          ],
          "stranger_in_the_wandering_isles": [
            "back",
            "legs",
            "arms",
            "shoulder",
            "misc",
            "head"
          ],
          "black_ice_constellation": [
            "back",
            "legs",
            "arms",
            "shoulder",
            "misc",
            "head"
          ]
        },
        "backOrder": [ 0, 0, 0, 0, 1, 0, 0, 0 ]
      }
    }
  }
}/* END */;
