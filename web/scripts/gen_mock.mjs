#!/usr/bin/env node
// Единственный автор мок-датасета aegis-draft. Детерминированный (seeded).
// Из компактных таблиц TEAMS + EVENTS собирает events.json и packs.json, затем
// деривит players/playerHeroStats/teammates/squadSynergy/eventHeroStats/teamSuccess
// и manifest. Мок играет роль вывода Go-пайплайна: events[].formats и manifest.formats
// ВЫЧИСЛЯЮТСЯ от даты сборки (schema/events.schema.json), а не задаются руками.
// Правило формата — зеркало pipeline/internal/formats/Assign; меняешь одно — правь оба.
// Запуск: node web/scripts/gen_mock.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "public", "data");
const read = (f) => JSON.parse(readFileSync(join(dataDir, f), "utf8"));
const write = (f, o) => writeFileSync(join(dataDir, f), JSON.stringify(o, null, 2) + "\n");

// Дата сборки = as-of окон. UTC-полночь, календарное вычитание лет (как Go AddDate).
const BUILT_AT = "2026-07-11T00:00:00Z";
const AS_OF = { y: 2026, m: 7, d: 11 };
const asOfMs = Date.UTC(AS_OF.y, AS_OF.m - 1, AS_OF.d);
const windowStartMs = (years) => Date.UTC(AS_OF.y - years, AS_OF.m - 1, AS_OF.d);
const endMs = (isoDate) =>
  Date.UTC(+isoDate.slice(0, 4), +isoDate.slice(5, 7) - 1, +isoDate.slice(8, 10));

/** Форматы события: скользящие окна last_Ny от даты + курируемый valve_legacy (все TI + Valve Major). */
function formatsFor(ev) {
  const end = endMs(ev.endDate);
  const out = [];
  if (end <= asOfMs) {
    for (const [f, years] of [["last_1y", 1], ["last_2y", 2], ["last_5y", 5]]) {
      if (end >= windowStartMs(years)) out.push(f);
    }
  }
  if (ev.type === "ti" || ev.type === "major") out.push("valve_legacy");
  return out;
}

const heroes = read("heroes.json");
const heroIds = heroes.map((h) => h.id);

// --- Ростеры команд (фиксированный accountId у игрока во всех событиях) ---
// ovr → impact/economy/reliability детерминированно по роли (мок правдоподобия пентагона).
const roleDelta = {
  safelane: { impact: -2, economy: 3, reliability: -4 },
  mid: { impact: 2, economy: -2, reliability: -5 },
  offlane: { impact: 2, economy: -6, reliability: -3 },
  support: { impact: -6, economy: -18, reliability: 1 },
};
const clampStat = (v) => Math.max(40, Math.min(99, v));
const stat = (ovr, role, axis) => clampStat(ovr + roleDelta[role][axis]);

const p = (accountId, nickname, role, ovr) => ({ accountId, nickname, role, ovr });
const TEAMS = {
  spirit: {
    teamId: 8291895, teamName: "Team Spirit", tag: "TSpirit", sig: [44, 74, 114, 26, 5],
    roster: [p(321580662, "Yatoro", "safelane", 92), p(402092269, "Larl", "mid", 90), p(302214028, "Collapse", "offlane", 91), p(251217746, "Mira", "support", 86), p(302085096, "Miposhka", "support", 87)],
  },
  liquid: {
    teamId: 2163, teamName: "Team Liquid", tag: "Liquid", sig: [6, 74, 41, 26, 68],
    roster: [p(165564334, "micKe", "safelane", 87), p(202067680, "Nisha", "mid", 89), p(88271237, "33", "offlane", 86), p(152967170, "Boxi", "support", 82), p(84599582, "Insania", "support", 83)],
  },
  gg: {
    teamId: 8599101, teamName: "Gaimin Gladiators", tag: "GG", sig: [1, 11, 41, 87, 128],
    roster: [p(156909578, "dyrachyo", "safelane", 89), p(174308280, "Quinn", "mid", 88), p(419365356, "ATF", "offlane", 87), p(152859296, "tOfu", "support", 83), p(213243839, "Seleri", "support", 84)],
  },
  betboom: {
    teamId: 8255888, teamName: "BetBoom Team", tag: "BB", sig: [8, 22, 114, 87, 128],
    roster: [p(200029254, "Nightfall", "safelane", 85), p(152574006, "TORONTOTOKYO", "mid", 86), p(259630369, "MieRo", "offlane", 84), p(302241878, "Kataomi", "support", 81), p(152962063, "Save-", "support", 82)],
  },
  tundra: {
    teamId: 8687717, teamName: "Tundra Esports", tag: "Tundra", sig: [1, 25, 44, 68, 5],
    roster: [p(152966869, "Skiter", "safelane", 89), p(152392947, "Bzm", "mid", 88), p(111620041, "Pure", "offlane", 86), p(87012746, "Saksa", "support", 84), p(84330566, "Sneyking", "support", 85)],
  },
  xtreme: {
    teamId: 8261500, teamName: "Xtreme Gaming", tag: "XG", sig: [8, 11, 114, 26, 87],
    roster: [p(114239371, "Ame", "safelane", 90), p(325573893, "Xm", "mid", 89), p(117858647, "Xxs", "offlane", 87), p(153164013, "XinQ", "support", 85), p(146603730, "Xll", "support", 84)],
  },
  falcons: {
    teamId: 9247354, teamName: "Team Falcons", tag: "TF", sig: [6, 22, 41, 68, 128],
    roster: [p(202956328, "Crystallis", "safelane", 86), p(311360822, "Malr1ne", "mid", 88), p(88472357, "fng", "offlane", 85), p(87177591, "Cr1t", "support", 84), p(94296097, "Ws", "support", 84)],
  },
};

// --- События (participants: [teamKey, placement, games]). Даты → окна через formatsFor. ---
const EVENTS = [
  { id: "esl-birmingham-2026", name: "ESL One Birmingham 2026", short: "ESLB26", type: "tier1", year: 2026, startDate: "2026-04-20", endDate: "2026-04-26", patch: "7.39", prizePool: 1000000,
    standings: [["spirit", 1, 14], ["falcons", 2, 12], ["betboom", 3, 10]] },
  { id: "ti2025", name: "The International 2025", short: "TI14", type: "ti", year: 2025, startDate: "2025-09-04", endDate: "2025-09-14", patch: "7.38", prizePool: 3000000,
    standings: [["spirit", 1, 18], ["liquid", 2, 17], ["falcons", 3, 15], ["tundra", 4, 14]] },
  { id: "pgl-wallachia-2025", name: "PGL Wallachia Season 4", short: "PGLW4", type: "tier1", year: 2025, startDate: "2025-08-01", endDate: "2025-08-10", patch: "7.37", prizePool: 1000000,
    standings: [["betboom", 1, 13], ["xtreme", 2, 12], ["gg", 3, 11]] },
  { id: "ti2024", name: "The International 2024", short: "TI13", type: "ti", year: 2024, startDate: "2024-09-07", endDate: "2024-09-15", patch: "7.37", prizePool: 2600000,
    standings: [["liquid", 1, 18], ["gg", 2, 17], ["betboom", 3, 15], ["xtreme", 4, 14]] },
  { id: "bali-major-2023", name: "Bali Major 2023", short: "Bali", type: "major", year: 2023, startDate: "2023-08-21", endDate: "2023-08-27", patch: "7.34", prizePool: 500000,
    standings: [["spirit", 1, 16], ["gg", 2, 15], ["tundra", 3, 13], ["xtreme", 4, 12]] },
  { id: "ti2022", name: "The International 2022", short: "TI11", type: "ti", year: 2022, startDate: "2022-10-15", endDate: "2022-10-30", patch: "7.32", prizePool: 1800000,
    standings: [["tundra", 1, 18], ["liquid", 2, 16], ["betboom", 3, 15], ["falcons", 4, 14]] },
];

// --- events.json (форматы выводятся) ---
const events = EVENTS.map((ev) => ({
  id: ev.id, name: ev.name, short: ev.short, type: ev.type, year: ev.year,
  startDate: ev.startDate, endDate: ev.endDate, patch: ev.patch, prizePool: ev.prizePool,
  formats: formatsFor(ev),
}));
write("events.json", events);

// --- packs.json (пак = ростер команды на событии) ---
const packs = [];
for (const ev of EVENTS) {
  for (const [teamKey, placement, games] of ev.standings) {
    const team = TEAMS[teamKey];
    packs.push({
      id: `${ev.id}-${team.teamId}`, eventId: ev.id, teamId: team.teamId, teamName: team.teamName,
      tag: team.tag, logoId: "0", placement,
      players: team.roster.map((pl) => ({
        accountId: pl.accountId, nickname: pl.nickname, role: pl.role, ovr: pl.ovr,
        impact: stat(pl.ovr, pl.role, "impact"), economy: stat(pl.ovr, pl.role, "economy"),
        reliability: stat(pl.ovr, pl.role, "reliability"), games,
      })),
      signatureHeroes: team.sig,
    });
  }
}
write("packs.json", packs);

// Детерминированный хеш → [0,1)
const rand = (n) => {
  const x = Math.sin(n) * 10000;
  return x - Math.floor(x);
};
const wr = (a, b) => Math.round((0.35 + 0.4 * rand(a * 131 + b * 977)) * 10000) / 10000;
const gamesOf = (a, b) => 1 + Math.floor(rand(a * 17 + b * 31) * 25);

// Роль → предпочитаемые герои (для правдоподобия синергии)
const rolePool = {
  safelane: [1, 6, 8, 44, 114],
  mid: [11, 22, 25, 74, 41],
  offlane: [41, 114, 128, 44, 8],
  support: [5, 26, 68, 87, 128],
};

// Сгруппировать игроков по команде и событию
const byTeam = new Map();
const byEvent = new Map();
const seenPlayer = new Map(); // accountId -> {nickname, role, ovr, games, teamId, teamName}
for (const pack of packs) {
  for (const pl of pack.players) {
    if (!byTeam.has(pack.teamId)) byTeam.set(pack.teamId, { teamName: pack.teamName, players: new Set() });
    byTeam.get(pack.teamId).players.add(pl.accountId);
    if (!byEvent.has(pack.eventId)) byEvent.set(pack.eventId, new Set());
    byEvent.get(pack.eventId).add(pl.accountId);
    seenPlayer.set(pl.accountId, { ...pl, teamId: pack.teamId, teamName: pack.teamName });
  }
}

// players.json — teams — все команды игрока (сумма игр по паку)
const playerTeams = new Map(); // accountId -> Map(teamId -> {teamName, games})
for (const pack of packs) {
  for (const pl of pack.players) {
    if (!playerTeams.has(pl.accountId)) playerTeams.set(pl.accountId, new Map());
    const teams = playerTeams.get(pl.accountId);
    const prev = teams.get(pack.teamId) ?? { teamName: pack.teamName, games: 0 };
    prev.games += pl.games;
    teams.set(pack.teamId, prev);
  }
}
const players = {};
for (const [accountId, pl] of seenPlayer) {
  const teams = [...playerTeams.get(accountId)].map(([teamId, t]) => ({ teamId, teamName: t.teamName, games: t.games }));
  teams.sort((a, b) => a.teamId - b.teamId);
  players[accountId] = {
    accountId, nickname: pl.nickname, primaryRole: pl.role, rolesPlayed: [pl.role], teams,
    peak: { [pl.role]: { ovr: Math.min(99, pl.ovr + 2), windowStart: "2025-01-01", windowEnd: "2025-06-30", games: 40 + Math.floor(rand(accountId) * 20) } },
  };
}
write("players.json", players);

// playerHeroStats.json — role-pool + сигнатурки паков игрока
const packSig = new Map();
for (const pack of packs) for (const pl of pack.players) {
  if (!packSig.has(pl.accountId)) packSig.set(pl.accountId, new Set());
  for (const h of pack.signatureHeroes) packSig.get(pl.accountId).add(h);
}
const playerHeroStats = {};
for (const [accountId, pl] of seenPlayer) {
  const pool = new Set([...(rolePool[pl.role] || []), ...(packSig.get(accountId) || [])]);
  const entry = {};
  for (const h of pool) if (heroIds.includes(h)) entry[h] = { games: gamesOf(accountId, h), winrate: wr(accountId, h) };
  playerHeroStats[accountId] = entry;
}
write("playerHeroStats.json", playerHeroStats);

// careerPlayerHeroStats.json — пожизненный player×hero: шире окна (весь role-pool + сигнатурки)
// и с бóльшим числом игр, чтобы демонстрировать глубину карьеры (окно/событие уточняют свежесть).
const careerPlayerHeroStats = {};
for (const [accountId, pl] of seenPlayer) {
  const pool = new Set([...(rolePool[pl.role] || []), ...(packSig.get(accountId) || [])]);
  const entry = {};
  for (const h of pool) if (heroIds.includes(h)) entry[h] = { games: gamesOf(accountId, h) * 6 + 5, winrate: wr(accountId, h) };
  careerPlayerHeroStats[accountId] = entry;
}
write("careerPlayerHeroStats.json", careerPlayerHeroStats);

// teammates.json — все, кто в той же команде
const teammates = {};
for (const { players: set } of byTeam.values()) {
  const arr = [...set];
  for (const a of arr) {
    teammates[a] = teammates[a] || [];
    for (const b of arr) if (a !== b && !teammates[a].includes(b)) teammates[a].push(b);
  }
}
for (const k of Object.keys(teammates)) teammates[k].sort((x, y) => x - y);
write("teammates.json", teammates);

// squadSynergy.json — сыгранность ГРУПП 2–5 внутри команды (зеркало aggregate.FromOpenDota).
// Не только пары: Chemistry весит крупную группу выше (пара ×1, пятёрка ×3), и мок обязан это
// воспроизводить, иначе golden-тесты гоняют модель на данных, которых в проде не бывает.
// Игр у группы тем меньше, чем она больше — как в реальности (впятером играли реже, чем вдвоём).
const subsets = (arr, min, max) => {
  const out = [];
  const walk = (start, current) => {
    if (current.length >= min) out.push([...current]);
    if (current.length === max) return;
    for (let i = start; i < arr.length; i++) walk(i + 1, [...current, arr[i]]);
  };
  walk(0, []);
  return out;
};
const squad = [];
for (const { players: set } of byTeam.values()) {
  const arr = [...set].sort((a, b) => a - b);
  for (const group of subsets(arr, 2, 5)) {
    const seed = group.reduce((s, id) => s + id, 0);
    const games = Math.max(5, Math.floor((20 + rand(seed) * 200) / (group.length - 1)));
    squad.push({ ids: group, games, winrate: wr(group[0], group[group.length - 1]) });
  }
}
write("squadSynergy.json", squad);

// eventHeroStats.json — event -> player -> пара героев его role-pool
const eventHeroStats = {};
for (const [eventId, set] of byEvent) {
  eventHeroStats[eventId] = {};
  for (const accountId of set) {
    const pl = seenPlayer.get(accountId);
    const pool = (rolePool[pl.role] || []).slice(0, 3);
    const entry = {};
    for (const h of pool) entry[h] = { games: 1 + Math.floor(rand(accountId + h + eventId.length) * 6), winrate: wr(accountId + 7, h) };
    eventHeroStats[eventId][accountId] = entry;
  }
}
write("eventHeroStats.json", eventHeroStats);

// teamSuccess.json — по каждому формату из фактических standings
const prizeShare = (placement) => ({ 1: 0.3, 2: 0.16, 3: 0.09, 4: 0.06 }[placement] ?? 0.03);
const ALL_FORMATS = ["last_1y", "last_2y", "last_5y", "valve_legacy"];
const teamSuccess = {};
for (const format of ALL_FORMATS) {
  const eventsInFormat = events.filter((ev) => ev.formats.includes(format));
  const acc = new Map(); // teamId -> stats
  for (const ev of eventsInFormat) {
    const src = EVENTS.find((e) => e.id === ev.id);
    for (const [teamKey, placement, games] of src.standings) {
      const teamId = TEAMS[teamKey].teamId;
      const a = acc.get(teamId) ?? { titles: 0, top4: 0, prize: 0, games: 0, wins: 0, tiPlacement: 0, placementSum: 0, events: 0 };
      if (placement === 1) a.titles++;
      if (placement <= 4) a.top4++;
      a.prize += Math.round(ev.prizePool * prizeShare(placement));
      const winrate = 0.42 + 0.28 * rand(teamId * 31 + placement * 17) + (5 - Math.min(placement, 5)) * 0.02;
      a.wins += Math.round(games * Math.min(0.85, winrate));
      a.games += games;
      a.placementSum += placement;
      a.events++;
      if (ev.type === "ti" && (a.tiPlacement === 0 || placement < a.tiPlacement)) a.tiPlacement = placement;
      acc.set(teamId, a);
    }
  }
  for (const [teamId, a] of acc) {
    const prizeFactor = Math.log1p(a.prize) / Math.log1p(5_000_000);
    const winrate = a.games ? a.wins / a.games : 0;
    const successScore = Math.round(
      Math.max(40, Math.min(99, 46 + a.titles * 10 + a.top4 * 3 + prizeFactor * 18 + (winrate - 0.5) * 40)),
    );
    if (!teamSuccess[teamId]) teamSuccess[teamId] = {};
    teamSuccess[teamId][format] = {
      successScore, titles: a.titles, topFinishes: a.top4, prizeUsd: a.prize,
      games: a.games, winrate: Math.round(winrate * 10000) / 10000,
      ...(a.tiPlacement > 0 ? { tiPlacement: a.tiPlacement } : {}),
    };
  }
}
write("teamSuccess.json", teamSuccess);

// manifest.json — formats = объединение форматов событий (все имеют >=5 команд → Mixed играбелен)
const formatsPresent = ALL_FORMATS.filter((f) => events.some((ev) => ev.formats.includes(f)));
const manifest = {
  schemaVersion: 1,
  ratingModelVersion: "mock-1",
  builtAt: BUILT_AT,
  source: {
    opendota: "mock dataset — not real OpenDota data",
    liquipedia: "mock dataset — not real Liquipedia data",
  },
  formats: formatsPresent,
  counts: {
    events: events.length,
    heroes: heroes.length,
    packs: packs.length,
    players: Object.keys(players).length,
  },
};
write("manifest.json", manifest);

console.log("mock data generated:", {
  events: events.length, packs: packs.length, players: Object.keys(players).length,
  teams: byTeam.size, squadPairs: squad.length, formats: formatsPresent,
});
