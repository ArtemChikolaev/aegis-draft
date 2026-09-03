// Черновик Playbook (T6.4): собирается в Штабе, живёт per-device как карьера (persist.ts), в забег
// попадает копией в RunConfig.playbook при старте — сам стор в игру не читается.
import { create } from "zustand";
import { PLAYBOOK_MAX, isPlaybookCard } from "../game/playbook.ts";
import { readCached, writePersisted } from "./persist.ts";

const KEY = "aegis:playbook:v1";

interface PlaybookStore {
  cards: string[];
  toggle: (cardId: string) => void;
  clear: () => void;
}

function readSaved(): string[] {
  try {
    const raw = readCached(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { v?: number; cards?: unknown };
    if (parsed.v !== 1 || !Array.isArray(parsed.cards)) return [];
    return parsed.cards.filter((id): id is string => typeof id === "string" && isPlaybookCard(id));
  } catch {
    return [];
  }
}

export const usePlaybook = create<PlaybookStore>((set, get) => ({
  cards: readSaved(),
  toggle(cardId) {
    if (!isPlaybookCard(cardId)) return;
    const current = get().cards;
    const next = current.includes(cardId)
      ? current.filter((id) => id !== cardId)
      : current.length >= PLAYBOOK_MAX ? current : [...current, cardId];
    if (next === current) return;
    set({ cards: next });
    void writePersisted(KEY, JSON.stringify({ v: 1, cards: next }));
  },
  clear() {
    set({ cards: [] });
    void writePersisted(KEY, JSON.stringify({ v: 1, cards: [] }));
  },
}));
