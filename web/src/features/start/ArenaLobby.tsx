// Лобби Arena (MP0): комната по коду + живой список участников. Это ПЕРВЫЙ кусок режима —
// панель честно говорит, что драфт и турнир приедут следующими срезами (MP1/MP2), и появляется
// только при сконфигуренном API: на сборке без сервера карточка остаётся «Скоро».
import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useArena } from "../../state/arenaStore.ts";
import { useRun } from "../../state/runStore.ts";
import { Button, Eyebrow, OptionGroup, Surface, TextField } from "../../ui/index.ts";
import type { MessageKey } from "../../i18n/core.ts";
import type { DraftStyle, RunConfig } from "../../game/packs.ts";
import type { Format } from "../../types/data.ts";

/** Конфиг драфта комнаты (MP1): host выбирает две оси, остальное — фикс Quick Draft-дефолтов.
 *  Рероллы 2 (как Roguelite), event-скоринг, авто-назначение: меньше осей — меньше сюрпризов
 *  у 17 незнакомцев. */
const ARENA_FORMATS: { value: Format; label: MessageKey }[] = [
  { value: "last_1y", label: "start.last1y" },
  { value: "last_2y", label: "start.last2y" },
  { value: "last_5y", label: "start.last5y" },
  { value: "valve_legacy", label: "start.valveLegacy" },
];
const ARENA_DRAFTS: { value: DraftStyle; label: MessageKey }[] = [
  { value: "team", label: "start.teamPacks" },
  { value: "mixed", label: "start.mixedDraft" },
];

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
  const match = useArena((s) => s.match);
  const startMatch = useArena((s) => s.startMatch);
  const [joinCode, setJoinCode] = useState("");
  const [format, setFormat] = useState<Format>("last_2y");
  const [draftStyle, setDraftStyle] = useState<DraftStyle>("team");
  const playerName = teamName.trim() || "Aegis Five";

  if (status === "lobby" && code) {
    const isHost = members.length > 0 && members[0].id === selfId;
    const config: RunConfig = { draftStyle, format, rerolls: 2, scoring: "event", allocation: "auto" };
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
        {/* MP1: партия запущена, а этот клиент в неё не попал (вошёл после лока/reconnect без
            драфта) — честный статус вместо кнопок. До start же host видит конфиг и кнопку,
            остальные ждут: недобор до 18 добьют боты, стартовать можно хоть в одиночку. */}
        {match ? (
          <p className="arena-lobby__note" data-testid="arena-in-progress">
            {t(!match.locked ? "arena.matchRunning"
              : selfId && match.rosters[selfId] ? "arena.matchFinished" : "arena.matchLocked")}
          </p>
        ) : isHost ? (
          <>
            <OptionGroup title={t("start.draftStyle")} soonLabel={t("common.soon")}
              options={ARENA_DRAFTS.map((option) => ({ value: option.value, label: t(option.label) }))}
              value={draftStyle} onChange={setDraftStyle} />
            <OptionGroup title={t("start.format")} soonLabel={t("common.soon")}
              options={ARENA_FORMATS.map((option) => ({ value: option.value, label: t(option.label) }))}
              value={format} onChange={setFormat} />
            <Button variant="primary" data-testid="arena-start" onClick={() => startMatch(config)}>
              {t("arena.start", { bots: Math.max(0, 18 - members.length) })}
            </Button>
          </>
        ) : (
          <p className="arena-lobby__note">{t("arena.waitStart")}</p>
        )}
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
