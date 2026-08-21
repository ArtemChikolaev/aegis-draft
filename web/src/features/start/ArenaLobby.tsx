// Лобби Arena (MP0): комната по коду + живой список участников. Это ПЕРВЫЙ кусок режима —
// панель честно говорит, что драфт и турнир приедут следующими срезами (MP1/MP2), и появляется
// только при сконфигуренном API: на сборке без сервера карточка остаётся «Скоро».
import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useArena } from "../../state/arenaStore.ts";
import { useRun } from "../../state/runStore.ts";
import { Button, Eyebrow, Surface, TextField } from "../../ui/index.ts";
import type { MessageKey } from "../../i18n/core.ts";

export function ArenaLobby() {
  const { t } = useI18n();
  const status = useArena((s) => s.status);
  const code = useArena((s) => s.code);
  const selfId = useArena((s) => s.selfId);
  const members = useArena((s) => s.members);
  const errorCode = useArena((s) => s.errorCode);
  const createRoom = useArena((s) => s.createRoom);
  const joinRoom = useArena((s) => s.joinRoom);
  const leaveRoom = useArena((s) => s.leaveRoom);
  const dismissError = useArena((s) => s.dismissError);
  const teamName = useRun((s) => s.teamName);
  const [joinCode, setJoinCode] = useState("");
  const playerName = teamName.trim() || "Aegis Five";

  if (status === "lobby" && code) {
    return (
      <Surface className="arena-lobby" data-testid="arena-lobby">
        <Eyebrow>{t("arena.lobbyEyebrow")}</Eyebrow>
        <div className="arena-lobby__code" data-testid="arena-room-code">
          <span>{t("arena.roomCode")}</span>
          <strong>{code}</strong>
        </div>
        <ul className="arena-lobby__members" data-testid="arena-members">
          {members.map((member) => (
            <li key={member.id} data-connected={member.connected} className={member.id === selfId ? "is-self" : ""}>
              <em aria-hidden="true" />
              <span>{member.name}</span>
              {member.id === selfId && <small>{t("arena.you")}</small>}
              {!member.connected && <small>{t("arena.offline")}</small>}
            </li>
          ))}
        </ul>
        <p className="arena-lobby__note">{t("arena.lobbyNote")}</p>
        <Button variant="leave" data-testid="arena-leave" onClick={leaveRoom}>{t("arena.leave")}</Button>
      </Surface>
    );
  }

  return (
    <Surface className="arena-lobby" data-testid="arena-lobby">
      <Eyebrow>{t("arena.lobbyEyebrow")}</Eyebrow>
      <p className="arena-lobby__note">{t("arena.intro")}</p>
      {status === "error" && errorCode && (
        <p className="arena-lobby__error" role="alert" data-testid="arena-error">
          {t(errorMessageKey(errorCode))}{" "}
          <Button variant="secondary" onClick={dismissError}>{t("common.close")}</Button>
        </p>
      )}
      <div className="arena-lobby__actions">
        <Button
          variant="primary"
          data-testid="arena-create"
          disabled={status === "connecting"}
          onClick={() => void createRoom(playerName)}
        >
          {t(status === "connecting" ? "arena.connecting" : "arena.create")}
        </Button>
        <div className="arena-lobby__join">
          <TextField
            value={joinCode}
            placeholder={t("arena.codePlaceholder")}
            maxLength={8}
            data-testid="arena-code-input"
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
          />
          <Button
            variant="secondary"
            data-testid="arena-join"
            disabled={status === "connecting" || joinCode.trim().length < 4}
            onClick={() => joinRoom(joinCode, playerName)}
          >
            {t("arena.join")}
          </Button>
        </div>
      </div>
    </Surface>
  );
}

function errorMessageKey(code: string): MessageKey {
  switch (code) {
    case "version_mismatch":
      return "arena.errVersion";
    case "room_not_found":
      return "arena.errNotFound";
    case "room_full":
      return "arena.errFull";
    default:
      return "arena.errNetwork";
  }
}
