#!/usr/bin/env bash
# Реплики героев и общие звуки попаданий из файлов Dota 2 → web/public/art/sfx/dota/ (BACKLOG T13.16, срез 2).
#   voice/<hero>/<cat>_N.m4a + voice/index.json — реплики (spawn/move/attack/kill/level/death/pain/ability),
#   shared/*.m4a — удары по плоти/мечом (слой поверх свиста удара героя).
# Использование: S2V=~/tools/s2v/Source2Viewer-CLI bash scripts/dota_voice.sh   (DOTA=, OUT= как у dota_sounds.sh)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DOTA="${DOTA:-$HOME/Library/Application Support/Steam/steamapps/common/dota 2 beta/game/dota}"
S2V="${S2V:-$HOME/tools/s2v/Source2Viewer-CLI}"
OUT="${OUT:-$HOME/dota-export/voice}"
DEST="$HERE/../public/art/sfx/dota"
VPK="$DOTA/pak01_dir.vpk"
[ -f "$VPK" ] || { echo "нет $VPK"; exit 1; }
[ -x "$S2V" ] || { echo "нет Source2Viewer-CLI: $S2V"; exit 1; }
conv() { afconvert -f m4af -d aac -b 48000 -c 1 "$1" "$2" >/dev/null 2>&1; }
# id героя → папка sounds/vo/<...>
# id героя → папка sounds/vo/<...> → префикс БАЗОВОЙ озвучки. В папках лежат и персоны/арканы (amp_wei у Anti-Mage,
# jung_axe, kidvoker у Invoker, mira_per, pa_asan, helmet_snip, zeus_mars), и по алфавиту они идут раньше базовых —
# без явного префикса герой говорил чужим голосом (владелец 2026-09-06: «у Anti-Mage женская озвучка»).
HEROES="juggernaut:juggernaut:jug_ axe:axe:axe_ crystal_maiden:crystalmaiden:cm_ sniper:sniper:snip_ zeus:zuus:zuus_ phantom_assassin:phantom_assassin:phass_ anti_mage:antimage:anti_ lina:lina:lina_ lich:lich:lich_ drow_ranger:drowranger:dro_ windranger:windrunner:wind_ bristleback:bristleback:bristle_ sven:sven:sven_ storm_spirit:stormspirit:ss_ leshrac:leshrac:lesh_ faceless_void:faceless_void:face_ ursa:ursa:ursa_ lion:lion:lion_ shadow_fiend:nevermore:nev_ pugna:pugna:pugna_ invoker:invoker:invo_ tidehunter:tidehunter:tide_ mirana:mirana:mir_ clinkz:clinkz:clinkz_ shadow_fiend@arcana:nevermore:nev_arc_ anti_mage@wei:antimage:amp_wei_ juggernaut@arcana:juggernaut:jug_arc_"
# категория → regex по имени файла (без префикса героя и номера) → сколько брать
CATS="spawn:(_spawn)$:2 move:(_move)$:6 attack:(_attack)$:3 kill:(_kill)$:4 level:(_level|_levelup)$:2 death:(_death)$:2 pain:(_pain)$:2 ability:(_ability_[a-z_]+|_enrage|_overpower|_earthshock|_ult|_ulti|_laguna|_requiem|_omnislash|_bladefury|_chrono|_ravage|_finger|_godstrength|_focusfire|_multishot|_ballLightning|_deathpact|_lifedrain|_blink|_sunstrike|_pulsenova)$:4"
mkdir -p "$OUT" "$DEST/voice" "$DEST/shared"
INDEX="$DEST/voice/index.json"; echo "{" > "$INDEX"; first=1
for pair in $HEROES; do
  id="${pair%%:*}"; rest="${pair#*:}"; folder="${rest%%:*}"; prefix="${rest##*:}"
  src="$OUT/$id"; mkdir -p "$src"
  "$S2V" -i "$VPK" -f "sounds/vo/$folder/" -e vsnd_c -o "$src/" -d >/dev/null 2>&1 || true
  dir="$(find "$src" -type d -path "*vo/$folder" | head -1)"
  [ -n "$dir" ] || { echo "   $id: нет папки vo/$folder"; continue; }
  # Реплики в vpk лежат как MP3 внутри vsnd — CLI отдаёт .mp3 (кладём как есть, MP3 читают все браузеры) или .wav (жмём).
  # Базовый набор: без аркан/персон/альт-озвучек (arc, wolf, sc_, persona, dc, ti<N>) и без «мета»-реплик (rival/ally/item/deny/…).
  mkdir -p "$DEST/voice/$id"; rm -f "$DEST/voice/$id"/*.m4a "$DEST/voice/$id"/*.mp3
  entry="$(python3 - "$dir" "$DEST/voice/$id" "$prefix" <<'PYSEL'
import os, re, sys, shutil, subprocess
src, dest, prefix = sys.argv[1], sys.argv[2], sys.argv[3]
files = sorted(f for f in os.listdir(src) if f.endswith((".mp3", ".wav")) and f.startswith(prefix))
# Для скинов-аркан (префикс с «arc») исключение «_arc_» снимаем — иначе набор пуст (фикс 2026-09-06).
arc_ok = "arc" in prefix
bad = re.compile((r"" if arc_ok else r"_arc_|^arc_|") + r"_wolf_|sc_|persona|_dc_|ti[0-9]|rival|ally|item|deny|nomana|notyet|purch|thanks|_lose|_win_?[0-9]|laugh|happy|anger|respawn|lasthit|cast_|emote|wheel|chat")
cats = [("spawn", r"_spawn", 2), ("move", r"_move", 6), ("attack", r"_attack", 3), ("kill", r"_kill", 4), ("level", r"_level(up)?", 2),
        ("death", r"_death", 2), ("pain", r"_pain", 2), ("ability", r"_ability_|_enrage|_overpower|_earthshock|_ulti?_|_laguna|_requiem|_omnislash|_bladefury|_chrono|_ravage|_finger|_godstrength|_focusfire|_multishot|_ballLightning|_deathpact|_lifedrain|_blink|_sunstrike|_pulsenova", 4)]
out = []
for cat, rx, cap in cats:
    picked = [f for f in files if not bad.search(f) and re.search(rx + r"_?\d+\.(mp3|wav)$", f)][:cap]
    names = []
    for i, f in enumerate(picked, 1):
        if f.endswith(".mp3"):
            shutil.copy(os.path.join(src, f), os.path.join(dest, f"{cat}_{i}.mp3")); names.append(f"{cat}_{i}.mp3")
        else:
            r = subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "48000", "-c", "1", os.path.join(src, f), os.path.join(dest, f"{cat}_{i}.m4a")], capture_output=True)
            if r.returncode == 0: names.append(f"{cat}_{i}.m4a")
    if names: out.append('"%s":[%s]' % (cat, ",".join('"%s"' % n for n in names)))
print(",".join(out))
PYSEL
)"
  [ $first -eq 1 ] || echo "," >> "$INDEX"; first=0
  printf '  "%s": {%s}' "$id" "$entry" >> "$INDEX"
  echo "   $id ← vo/$folder: $(ls "$DEST/voice/$id" | wc -l | tr -d ' ') файлов"
done
echo "" >> "$INDEX"; echo "}" >> "$INDEX"
# Общий слой попаданий: меч по плоти (мили с клинком), тупой удар (дубина/кулак), стрела/снаряд.
sh="$OUT/shared"; mkdir -p "$sh"
"$S2V" -i "$VPK" -f sounds/weapons/hero/shared/impacts/ -e vsnd_c -o "$sh/" -d >/dev/null 2>&1 || true
"$S2V" -i "$VPK" -f sounds/physics/deaths/common/ -e vsnd_c -o "$sh/" -d >/dev/null 2>&1 || true
i=0; for f in $(find "$sh" -name 'sword_impact*.wav' | sort | head -3); do i=$((i+1)); conv "$f" "$DEST/shared/blade_$i.m4a"; done
i=0; for f in $(find "$sh" -name 'heavy_blade_impact*.wav' | sort | head -3); do i=$((i+1)); conv "$f" "$DEST/shared/heavy_$i.m4a"; done
i=0; for f in $(find "$sh" -name 'body_impact_medium_*.wav' | sort | head -3); do i=$((i+1)); conv "$f" "$DEST/shared/blunt_$i.m4a"; done
i=0; for f in $(find "$sh" -name 'body_impact_light_*.wav' | sort | head -3); do i=$((i+1)); conv "$f" "$DEST/shared/light_$i.m4a"; done
ls "$DEST/shared"; du -sh "$DEST/voice" "$DEST/shared"
