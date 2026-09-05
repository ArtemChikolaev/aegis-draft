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

Модели Dota, которые уже в манифесте `web/scripts/blender/dota_manifest.tsv` (проверенные пути в vpk):
| В игре | Модель | Заметки |
|---|---|---|
| kobold / kobold_foreman | `n_creep_kobold/kobold_a/n_creep_kobold_a`, `kobold_c/n_creep_kobold_c` | анимации `run/idle/attack/death` |
| hill_troll | `n_creep_forest_trolls/n_creep_forest_troll_berserker` + часть `…_berserker_axe` | имена с префиксом модели — подстрока находит |
| satyr | `n_creep_satyr_b/n_creep_satyr_b` | `satyr_b_run` и т. п. |
| ogre | `n_creep_ogre_med/n_creep_ogre_med` | |
| centaur | `n_creep_centaur_lrg/n_creep_centaur_lrg` | бег — `runN` |
| wildwing | `n_creep_gargoyle/n_creep_gargoyle` | idle — `gargoyle_idle2` |
| dark_troll | `n_creep_troll_dark_b/n_creep_troll_dark_b` | |
| hellbear | `n_creep_beast/n_creep_beast` | смерть — `die` |
| lane_creep / siege_creep | `lane_creeps/creep_radiant_melee/radiant_melee`, `creep_good_siege/creep_good_siege` | у осадного смерти нет (отдельная deathsim-модель) |
| golem | `n_creep_golem_a/neutral_creep_golem_a` | смерть — `dieAlt` |
| roshan | `models/creeps/roshan/roshan` | `roshan_*` |
| ancient | `models/props_structures/good_ancient001` | статичная, `--dirs 1` |
| tree_oak / tree_pine / rock | `props_tree/tree_oak_01`, `props_tree/armandpine/armandpine_01`, `props_nature/rock_ground001` | статичные; листва и камень в экспорте белёсые (нет шейдерного тинта) — игра подкрашивает их при отрисовке (`tint` в `drawDotaFrame`) |
| tormentor | модели в vpk нет (`models/` без `tormentor`) | остаётся фигура |

Все пути — под `models/creeps/neutral_creeps/`, если не указано иное. Полный список моделей: `"$S2V" -i "$VPK" -l -f models/ -e vmdl_c`.

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

## 6. Звуки ударов героев
```bash
S2V=~/tools/s2v/Source2Viewer-CLI bash web/scripts/dota_sounds.sh
```
Скрипт выгружает `sounds/weapons/hero/<папка>/` (имена папок Valve отличаются: `zuus`, `bristlebog`, `nevermore`, `windrunner`, `antimage` — таблица в скрипте), берёт `attack*`/`*swing*`, `preattack*`, `impact*`, жмёт `afconvert` в AAC mono 40 kbps и пишет `public/art/sfx/dota/index.json`. Игра (`features/arcade/heroSfx.ts`) играет клип героя на каждый удар, петлю Blade Fury у Juggernaut; нет клипов — синтетика. Арканы/сеты: `arcana_*` файлы в тех же папках — под T13.12.
- **Скины и базовые префиксы (2026-09-06):** в папке `sounds/vo/<hero>/` лежат вперемешку база, арканы и персоны; базовый
  префикс определять по именам `*_move_01.vsnd_c` (S2V -l), не по частоте: Razor — `raz_` (`rz_vsa_` — аркана), Dragon Knight —
  `drag_` (`dk_davion_`/`dk_slyrak_` — персоны), Earthshaker — `erth_` (`earth_arcana_`), QoP — `pain_` (`qop_arc_`), Ogre —
  `ogmag_` (`ogm_arc_`). Скин со своей озвучкой — отдельная запись `hero@skin:папка:префикс` в `dota_voice.sh`; токены скинов
  (`_arc_`, `_vsa_`, `_per_`, `_davion_`, `persona`, …) исключаются из базы, но не из набора самого скина. Скин без своей
  озвучки (арканы CM/PA) говорит голосом базового героя (`voiceKey` в `heroSfx.ts`).

## 7. Пиксельный стиль (Dead Cells-подход) — пилот
Решение владельца 2026-09-06: режим должен выглядеть пиксельным, ориентир — Dead Cells (детальный пиксель, не 8-бит).
Те же модели, тот же конвейер, меняется последний шаг:
- `render_dota_sprites.py --pixel`: движок **Workbench** (плоская заливка текстурой цвета, студийный свет без бликов и теней,
  чёрный контур по силуэту, cavity для рёбер, сглаживание выключено); кадр **48 px** для героев, 36 — крипы, 72 — деревья
  (исходный кадр / 2.67); `--world` = 2 × кадр, чтобы при внутреннем масштабе игры ×2 спрайт ложился 1:1 в пиксели.
  Workbench в режиме TEXTURE берёт *активный* узел-картинку материала — скрипт делает активной текстуру `*_color*`
  (иначе первым идёт detailmask и силуэт выходит чёрным).
- Палитра: `pngquant --nofs 48` (без дизеринга — ровные пятна). Листы кладутся рядом: `public/art/sprites/dota_px/`
  (`SPRITES=…/dota_px bash dota_pipeline.sh manifest_px.tsv`), обычные остаются в `dota/`.
- Игра: `?pixel=2` включает пиксельный проход рендера (мир рисуется в буфер 1/2 и растягивается nearest) и переключает
  загрузчик на `dota_px/` с фолбэком на `dota/`; земля — `dota_px/terrain/*` (256 px, 20 цветов).
- Пилот: Juggernaut, Shadow Fiend, Crystal Maiden, кобольд, дуб, камень. Дальше по решению владельца — весь манифест.
- **Два набора пиксельных листов (2026-09-06):** `dota_px/` (кадр 64 герой / 48 крип, `dota_manifest_px.tsv`) — для фактора 2
  (обычный монитор) и `dota_px2/` (кадр ×2 при том же `--world`, `dota_manifest_px2.tsv`) — для фактора 1 (Retina/телефон:
  1 CSS px на арт-пиксель = 2 физических). Фактор выбирает `features/arcade/pixelMode.ts` по DPR; загрузчик листов идёт
  `dota_px2 → dota_px → dota`. Перерендер всего набора: `SPRITES=…/dota_px2 OUT=<экспорт> S2V=<cli> bash dota_pipeline.sh dota_manifest_px2.tsv`
  (~30 мин на 47 листов, S2V экспортирует glb заново — это нормально).
- **Тёмные модели (Shadow Fiend, Рошан):** color-текстура SF почти чёрная (средняя яркость 0.017 — в Dota он светится
  selfillum/spec, чего у Workbench нет). `--pixel` теперь делает автоэкспозицию: если средняя яркость непрозрачных пикселей
  текстуры ниже `--autoexpose` (0.16), пиксели поднимаются гаммой до `--expose-target` (0.4) прямо в картинке (Workbench граф
  узлов не считает). `--light` для таких моделей всё равно держать 1.5–1.7.
- **Земля:** `web/scripts/pixel_terrain.mts` (Playwright-canvas, без sharp/PIL) делает из `dota/terrain/*.png` пиксельные 128-px
  текстуры: усреднение до 64, 5 ступеней яркости лестницей контраста вокруг среднего цвета, затемнение под тон карты
  (`lum=0.2 contrast=0.3 div=2`). Старые 4-битные PNG рисовались ровной «мутью» — контраст исходников Dota почти нулевой.
  В игре тексель = 2 внутренних пикселя при любом факторе (`texScale = 2·фактор`).

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
