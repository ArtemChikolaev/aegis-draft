// Лобби Arena (MP0 + MP2): комната по коду + живой список участников; host выбирает формат и
// запускает ОБЩИЙ драфт (одновременные раунды, приоритет змейки). Панель появляется только при
// сконфигуренном API: на сборке без сервера карточка остаётся «Скоро».
import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useArena } from "../../state/arenaStore.ts";
import { useRun } from "../../state/runStore.ts";
import { arenaPoolShortage } from "../../game/arenaDraft.ts";
import { Button, Eyebrow, OptionGroup, Surface, TextField } from "../../ui/index.ts";
import type { MessageKey } from "../../i18n/core.ts";
import type { Format } from "../../types/data.ts";

/** Ось комнаты одна — формат (эпоха пула): пул MP2 общий и mixed по построению, остальные оси
 *  Quick Draft к общему драфту неприменимы. Меньше осей — меньше сюрпризов у 17 незнакомцев. */
const ARENA_FORMATS: { value: Format; label: MessageKey }[] = [
  { value: "last_1y", label: "start.last1y" },
  { value: "last_2y", label: "start.last2y" },
  { value: "last_5y", label: "start.last5y" },
  { value: "valve_legacy", label: "start.valveLegacy" },
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
  const data = useRun((s) => s.data);
  const match = useArena((s) => s.match);
  useArena((s) => s.serial);
  const startMatch = useArena((s) => s.startMatch);
  const [joinCode, setJoinCode] = useState("");
  const [format, setFormat] = useState<Format>("last_2y");
  const playerName = teamName.trim() || "Aegis Five";

  if (status === "lobby" && code) {
    const isHost = members.length > 0 && members[0].id === selfId;
    // Гейт старта: общему драфту нужен пул на 18 команд с глобальной уникальностью — тонкий
    // формат (или mock-датасет) должен отказывать словами, а не молча игнорировать start.
    const shortage = data ? arenaPoolShortage(data, format) : "no data";
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
        {/* MP2: партия запущена, а этот клиент в посадку не попал (вошёл после старта) —
            он зритель, честный статус вместо кнопок. До start host видит формат и кнопку,
            остальные ждут: недобор до 18 добьют боты, стартовать можно хоть в одиночку. */}
        {match ? (
          <p className="arena-lobby__note" data-testid="arena-in-progress">
            {t(match.engine.phase !== "done" ? "arena.matchRunning" : "arena.matchFinished")}
          </p>
        ) : isHost ? (
          <>
            <OptionGroup title={t("start.format")} soonLabel={t("common.soon")}
              options={ARENA_FORMATS.map((option) => ({ value: option.value, label: t(option.label) }))}
              value={format} onChange={setFormat} />
            {shortage !== null && <p className="arena-lobby__note" role="alert">{t("arena.shortage")}</p>}
            <Button variant="primary" data-testid="arena-start" disabled={shortage !== null}
              onClick={() => startMatch(format)}>
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
