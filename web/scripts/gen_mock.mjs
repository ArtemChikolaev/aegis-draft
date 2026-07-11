#!/usr/bin/env node
// Генератор производных мок-данных из packs.json + heroes.json.
// Детерминированный (seeded), чтобы данные были воспроизводимы и согласованы с паками.
// Запуск: node web/scripts/gen_mock.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "public", "data");
const read = (f) => JSON.parse(readFileSync(join(dataDir, f), "utf8"));
const write = (f, o) => writeFileSync(join(dataDir, f), JSON.stringify(o, null, 2) + "\n");

const packs = read("packs.json");
const heroes = read("heroes.json");
const heroIds = heroes.map((h) => h.id);

// Mixed Draft требует 5 разных команд. Старый базовый мок содержал только 4 и
// маскировал fallback-повтор команды. Детерминированно добавляем пятую mock-команду.
const teamIds = new Set(packs.map((pack) => pack.teamId));
if (teamIds.size < 5) {
  const source = packs[0];
  const accountOffset = 1_000_000_000;
  packs.push({
    ...source,
    id: "esl-one-2024-9900001",
    eventId: "esl-one-2024",
    teamId: 9_900_001,
    teamName: "Aegis Mock Five",
    tag: "AM5",
    players: source.players.map((player, index) => ({
      ...player,
      accountId: player.accountId + accountOffset,
      nickname: `Mock${index + 1}`,
    })),
  });
  write("packs.json", packs);
  const manifest = read("manifest.json");
  manifest.counts.packs = packs.length;
  manifest.counts.players = packs.reduce((sum, pack) => sum + pack.players.length, 0);
  write("manifest.json", manifest);
}
const mockFive = packs.find((pack) => pack.teamId === 9_900_001);
if (mockFive && mockFive.eventId !== "esl-one-2024") {
  mockFive.id = "esl-one-2024-9900001";
  mockFive.eventId = "esl-one-2024";
  write("packs.json", packs);
}

// Детерминированный хеш → [0,1)
const rand = (n) => {
  let x = Math.sin(n) * 10000;
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

// Сгруппировать игроков по команде (одна команда может быть в нескольких паках/событиях)
const byTeam = new Map();
const byEvent = new Map();
const seenPlayer = new Map(); // accountId -> {nickname, role, ovr}
for (const p of packs) {
  for (const pl of p.players) {
    if (!byTeam.has(p.teamId)) byTeam.set(p.teamId, { teamName: p.teamName, players: new Set() });
    byTeam.get(p.teamId).players.add(pl.accountId);
    if (!byEvent.has(p.eventId)) byEvent.set(p.eventId, new Set());
    byEvent.get(p.eventId).add(pl.accountId);
    seenPlayer.set(pl.accountId, { ...pl, teamId: p.teamId, teamName: p.teamName });
  }
}

// players.json
const players = {};
for (const [accountId, pl] of seenPlayer) {
  players[accountId] = {
    accountId,
    nickname: pl.nickname,
    primaryRole: pl.role,
    rolesPlayed: [pl.role],
    teams: [{ teamId: pl.teamId, teamName: pl.teamName, games: pl.games }],
    peak: {
      [pl.role]: {
        ovr: Math.min(99, pl.ovr + 2),
        windowStart: "2024-01-01",
        windowEnd: "2024-06-30",
        games: 40 + Math.floor(rand(accountId) * 20),
      },
    },
  };
}
write("players.json", players);

// playerHeroStats.json — для каждого игрока: его role-pool + сигнатурки его паков
const packSig = new Map(); // accountId -> Set(heroId)
for (const p of packs) for (const pl of p.players) {
  if (!packSig.has(pl.accountId)) packSig.set(pl.accountId, new Set());
  for (const h of p.signatureHeroes) packSig.get(pl.accountId).add(h);
}
const playerHeroStats = {};
for (const [accountId, pl] of seenPlayer) {
  const pool = new Set([...(rolePool[pl.role] || []), ...(packSig.get(accountId) || [])]);
  const entry = {};
  for (const h of pool) if (heroIds.includes(h)) entry[h] = { games: gamesOf(accountId, h), winrate: wr(accountId, h) };
  playerHeroStats[accountId] = entry;
}
write("playerHeroStats.json", playerHeroStats);

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

// squadSynergy.json — пары внутри команды
const squad = [];
for (const { players: set } of byTeam.values()) {
  const arr = [...set].sort((a, b) => a - b);
  for (let i = 0; i < arr.length; i++)
    for (let j = i + 1; j < arr.length; j++)
      squad.push({ ids: [arr[i], arr[j]], games: 20 + Math.floor(rand(arr[i] + arr[j]) * 200), winrate: wr(arr[i], arr[j]) });
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

// teamSuccess.json — по окнам
const teamSuccess = {};
for (const [teamId, { players: set }] of byTeam) {
  const base = 70 + Math.floor(rand(teamId) * 25);
  teamSuccess[teamId] = {
    last_2y: { successScore: base, titles: Math.floor(rand(teamId) * 3), topFinishes: 2 + Math.floor(rand(teamId + 1) * 4), prizeUsd: 500000 + Math.floor(rand(teamId + 2) * 3000000), games: 40 + Math.floor(rand(teamId + 3) * 80), winrate: wr(teamId, 3), tiPlacement: 1 + Math.floor(rand(teamId + 4) * 8) },
    last_1y: { successScore: Math.min(99, base + 3), titles: Math.floor(rand(teamId + 5) * 2), topFinishes: 1 + Math.floor(rand(teamId + 6) * 3), prizeUsd: 200000 + Math.floor(rand(teamId + 7) * 1500000), games: 20 + Math.floor(rand(teamId + 8) * 50), winrate: wr(teamId + 1, 3) },
  };
}
write("teamSuccess.json", teamSuccess);

console.log("mock data generated:", { players: Object.keys(players).length, squadPairs: squad.length, teams: teamSuccess ? Object.keys(teamSuccess).length : 0 });
