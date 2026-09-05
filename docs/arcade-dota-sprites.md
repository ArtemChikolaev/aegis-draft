# Аркада: спрайты из моделей Dota 2 (путь А, BACKLOG T13.13)

Цель: герои, крипы, Рошан и земля в Аркаде выглядят как в Dota, потому что это и есть модели Dota,
отрендеренные в 2D-листы кадров со штатными анимациями. Пайплайн: клиент Dota 2 → Source 2 Viewer CLI
(glTF с анимациями и материалами) → Blender-скрипт `web/scripts/blender/render_dota_sprites.py`
(лист PNG + JSON-мета) → папка `web/public/art/sprites/dota/` → игра подхватывает автоматически
(приоритет над LPC и ригами).

Правовая рамка: некоммерческий фан-проект, из клиента берётся только визуал, атрибуция Valve
уже есть в UI и `manifest.source`. Ничего из клиента не распространяем отдельно от игры.

## 0. Что понадобится (один раз)
- Клиент Dota 2 в Steam (нужен `pak01_dir.vpk` и соседние `pak01_*.vpk`).
- **Source 2 Viewer CLI** — https://github.com/ValveResourceFormat/ValveResourceFormat/releases
  (архив `Source2Viewer-CLI` под свою ОС; есть macOS arm64/x64). Распаковать, дать права на запуск.
- **Blender 4.x** — https://www.blender.org/download/ (нужен только бинарник `blender`).
- Пути ниже для macOS; на Windows те же команды, только путь к Steam другой.

```bash
DOTA="$HOME/Library/Application Support/Steam/steamapps/common/dota 2 beta/game/dota"
S2V=~/Downloads/Source2Viewer-CLI/Source2Viewer-CLI   # где распаковал
OUT=~/dota-export
```

## 1. Найти модели
Список файлов по маске (быстро, ничего не распаковывает):
```bash
"$S2V" -i "$DOTA/pak01_dir.vpk" -l -f models/heroes/juggernaut/ -e vmdl_c
"$S2V" -i "$DOTA/pak01_dir.vpk" -l -f models/creeps/neutral_creeps/n_creep_kobold/ -e vmdl_c
"$S2V" -i "$DOTA/pak01_dir.vpk" -l -f models/creeps/roshan/ -e vmdl_c
```
Нужны файлы вида `.../juggernaut.vmdl_c`, `.../n_creep_kobold.vmdl_c`, `.../roshan.vmdl_c`
(у героев базовая модель — только тело: штаны, маска, оружие, наручи, плащ лежат рядом отдельными `vmdl_c` и пришиваются к скелету параметром `--parts` / четвёртой колонкой манифеста; у крипов и Рошана всё в одной модели).

## 2. Экспорт в glTF с анимациями и материалами
```bash
"$S2V" -i "$DOTA/pak01_dir.vpk" -f models/heroes/juggernaut/juggernaut.vmdl_c \
  -o "$OUT/juggernaut" -d --gltf_export_format glb --gltf_export_animations --gltf_export_materials --gltf_textures_adapt
```
То же для кобольда и Рошана (папки `$OUT/kobold`, `$OUT/roshan`). В выходной папке появится
`*.glb` (модель + текстуры + все анимации). Список анимаций модели можно ограничить, если glb
тяжёлый: `--gltf_animation_list "idle,run,attack,death"` (имена — как в файле; посмотреть их
можно, открыв glb в Blender: вкладка Action).

## 3. Рендер листа кадров
```bash
cd /Users/Shared/Coding/aegis-draft/web/scripts/blender
/Applications/Blender.app/Contents/MacOS/Blender -b -P render_dota_sprites.py -- \
  --glb "$OUT/juggernaut/models/heroes/juggernaut/juggernaut.glb" --name juggernaut \
  --out ../../public/art/sprites/dota --dirs 8 --frame 128 --fps 12 --world 84 \
  --anims "walk=run,idle=idle,attack=attack,death=death"
```
Параметры:
- `--anims` — наши состояния = подстроки имён анимаций модели. У героев обычно `idle`, `run`,
  `attack`, `death`; у крипов `run`/`attack`/`death`; у Рошана `roshan_attack`, `roshan_death` —
  подстрока `attack` их найдёт. Нет анимации — состояние пропускается, игра подставит walk/idle.
- `--dirs 8` — восемь направлений (0 = лицом к камере, дальше против часовой на экране: вниз → вправо → вверх → влево). Для крипов хватит 4.
- `--world` — высота спрайта в игровых пикселях: герой 84, кобольд 56, огр 110, Рошан 180.
- `--pitch 42` — высота камеры над горизонтом (90 = строго сверху; 42 читается как RTS/DMD, 58 — ближе к Dota, но силуэты хуже). `--yaw-offset 90`, если модель
  в кадре стоит боком (значит, в файле она смотрит по +X, а не по −Y).
- `--frame 128` — кадр 128×128 (Рошану дать 256).
- `attack=attack@0.12-0.7` — брать только часть клипа (доли длительности). У клипов Dota длинный замах и возврат,
  а урон в игре наносится в начале окна анимации — оставляем сам удар (у героев ~0.12–0.7, у крипов 0.1–0.75).
- `--parts a.glb,b.glb` — части героя (штаны/маска/оружие/наручи/плащ). **Экспортируй части тоже с
  `--gltf_export_animations`**: без него CLI не пишет скин (скелет + веса), и часть застывает в bind-позе рядом
  с бегущим телом («два персонажа»). Скрипт не пересаживает меши частей на скелет тела (у тела кости без
  весов, например `sword_1`, экспортируются с вырожденной позой покоя, и меч уезжает от руки), а ставит на каждую
  кость части Copy Transforms с одноимённой костью тела (имена сравниваются без учёта регистра). Служебная
  «Icosphere» из каждого glb VRF выкидывается.
- После рендера конвейер прогоняет лист через `pngquant` (если стоит, `brew install pngquant`): 256 цветов,
  лист худеет в 4–5 раз (Juggernaut 6 МБ → 1.1 МБ) без видимой потери на 128 px.

Результат: `web/public/art/sprites/dota/juggernaut.png` + `juggernaut.json`. Имя листа = id героя
в игре (`juggernaut`, `crystal_maiden`, `sniper`, `axe`, `zeus`, шаблонные — их id из
`content/heroes.ts`) или id врага (`kobold`, `kobold_foreman`, `hill_troll`, `satyr`, `ogre`,
`centaur`, `wildwing`, `lane_creep`, `siege_creep`, `golem`, `roshan`, `tormentor`, `dark_troll`,
`hellbear`, `ancient`). Игра ищет `dota/<id>.json`; нашла — рисует ей, нет — LPC/риг.

Модели Dota для врагов (ориентир по путям в vpk):
| Враг в игре | Модель |
|---|---|
| kobold / kobold_foreman | `models/creeps/neutral_creeps/n_creep_kobold/` (`n_creep_kobold`, `n_creep_kobold_tunneler` / `_foreman`) |
| hill_troll | `models/creeps/neutral_creeps/n_creep_troll_dark_a/` или `n_creep_forest_troll_*` |
| satyr | `models/creeps/neutral_creeps/n_creep_satyr_a/` |
| ogre | `models/creeps/neutral_creeps/n_creep_ogre_lrg/` |
| centaur | `models/creeps/neutral_creeps/n_creep_centaur_*/` |
| wildwing | `models/creeps/neutral_creeps/n_creep_gargoyle/` (wildwing = harpy → `n_creep_harpy_*`) |
| lane_creep / siege_creep | `models/creeps/lane_creeps/creep_radiant_melee/`, `creep_radiant_siege/` |
| golem | `models/creeps/neutral_creeps/n_creep_golem_a/` |
| roshan | `models/creeps/roshan/roshan` |
| tormentor | `models/creeps/misc/tormentor/` |
| ancient | `models/props_structures/radiant_ancient001` (статичная, `--dirs 1`) |
| dark_troll | `models/creeps/neutral_creeps/n_creep_troll_dark_b/` |
| hellbear | `models/creeps/neutral_creeps/n_creep_beast/` |

## 4. Земля
Текстуры террейна лежат в `maps/<набор>_assets/blends/` (наборы `jungle`, `summer`, `cavern`, `reef`, `journey`, `ti10`; `materials/terrain/` пуст). Экспорт конкретных файлов:
```bash
"$S2V" -i "$DOTA/pak01_dir.vpk" -l -f maps/jungle_assets/blends/ | grep color   # список
"$S2V" -i "$DOTA/pak01_dir.vpk" -f maps/jungle_assets/blends/plants_01_color_psd_8552850e.vtex_c -o "$OUT/terrain/" -d
"$S2V" -i "$DOTA/pak01_dir.vpk" -f maps/jungle_assets/blends/radiant_jungle_dirt_01_color_psd_133dcf93.vtex_c -o "$OUT/terrain/" -d
```
Осторожно: часть «травы» (например, `summer_assets/.../grass_long_*`) — белые маски, которые красит шейдер; нужны текстуры с готовым цветом.
Из полученных PNG нужны бесшовные: трава Radiant (`*grass*`/`*radiant*`), земля/тропа (`*dirt*`),
для акта 2 — трава Dire, вода для реки. Положить как:
`web/public/art/sprites/dota/terrain/grass.png`, `dirt.png`, `grass_dire.png`, `water.png`
(любой квадрат 256–1024 px). Игра замостит ими землю паттерном вместо тайлов LPC.

## 4а. Всё одной командой
`web/scripts/blender/dota_pipeline.sh` делает шаги 1–4 для манифеста (по умолчанию спайк: Juggernaut, кобольд, Рошан):
```bash
DOTA="$HOME/Library/Application Support/Steam/steamapps/common/dota 2 beta/game/dota" \
S2V=~/tools/s2v/Source2Viewer-CLI BLENDER=/Applications/Blender.app/Contents/MacOS/Blender \
bash web/scripts/blender/dota_pipeline.sh
```
Свой набор — TSV `id<TAB>vmdl_c<TAB>аргументы` первым параметром. Проверено на реальных моделях 2026-09-06: Juggernaut (с частями), кобольд, Рошан — листы 3.0 / 1.1 / 4.3 МБ.

## 5. Проверка и коммит
```bash
cd /Users/Shared/Coding/aegis-draft/web && npm run dev   # или мой 5273
```
Открыть Аркаду, выбрать героя — он должен быть моделью Dota; враги, у которых лист есть, тоже.
Коммитить `public/art/sprites/dota/*` вместе (PNG + JSON). Размер: герой ~1–2 МБ на лист при
128 px и 8 направлениях; при переполнении бюджета офлайн-кэша уменьшить `--frame` до 96.

## Что делать, если
- Модель серая/без текстур: перезапустить экспорт с `--gltf_export_materials --gltf_textures_adapt`;
  если текстуры всё равно не легли — открыть glb в Blender вручную и проверить Material Preview.
- Анимация статична: экспорт был без `--gltf_export_animations`, либо имя не совпало с `--anims`
  (посмотреть список: в Blender после импорта — Dope Sheet → Action Editor).
- Часть героя (меч/штаны/маска) стоит на месте, а тело бежит: часть экспортирована без
  `--gltf_export_animations` (скрипт пишет `WARN: у части … нет скелета`). Меч в руке, но не там, где рука:
  проверь, что скрипт свежий (Copy Transforms по костям, а не пересадка меша на скелет тела).
- Удар «рукой», меч не участвует: смотри, что в `--parts` есть модель оружия и что у неё есть кость `sword_1`
  (или аналог) в скелете тела; в кадрах удара клип обрезан `@0.12-0.7`, замах и возврат вырезаны.
- Спрайт стоит боком: `--yaw-offset 90` (или −90).
- Слишком тёмно/светло: `--pitch` и свет заданы в скрипте (`setup_camera_and_lights`), правится там.
