import type { Pack } from "../../src/types/data.ts";
import type { Candidate } from "../../src/game/packs.ts";

/** Ростер-слоты из пака команды (для UI-row helpers). */
export function rosterFromPack(pack: Pack): Array<{ candidate: Candidate }> {
  return pack.players.map((player) => ({
    candidate: {
      player,
      teamId: pack.teamId,
      teamName: pack.teamName ?? `Team ${pack.teamId}`,
      eventId: pack.eventId,
      signatureHeroes: pack.signatureHeroes,
    },
  }));
}

export const defaultRunConfig = {
  draftStyle: "team" as const,
  format: "last_2y" as const,
  rerolls: Infinity,
  scoring: "event" as const,
  allocation: "auto" as const,
};
