// Экран ожидания Arena MP1 (phase "arenaWait"): свой драфт готов — состав сдаётся в комнату,
// дальше ждём лока. Host отсюда закрывает драфт (несданные составы заменят боты). Сдача — на
// маунте экрана, а не из runStore: сторы не заводят циклическую зависимость (runStore ничего
// не знает про arenaStore), а экран и есть точка «драфт завершён в режиме arena».
import { useEffect } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useArena } from "../../state/arenaStore.ts";
import { useRun } from "../../state/runStore.ts";
import { ARENA_FIELD_SIZE } from "../../game/arenaProtocol.ts";
import { Button, Eyebrow, Modal, Surface } from "../../ui/index.ts";
import { useState } from "react";

export function ArenaWait() {
  const { t } = useI18n();
  const code = useArena((s) => s.code);
  const selfId = useArena((s) => s.selfId);
  const members = useArena((s) => s.members);
  const match = useArena((s) => s.match);
  const submitRoster = useArena((s) => s.submitRoster);
  const lockMatch = useArena((s) => s.lockMatch);
  const leaveRoom = useArena((s) => s.leaveRoom);
  const reset = useRun((s) => s.reset);
  const [leaveGate, setLeaveGate] = useState(false);

  // Сдать состав ровно один раз: submitRoster сам no-op, если уже сдан/комната заперта.
  useEffect(() => {
    submitRoster();
  }, [submitRoster]);

  const submitted = match ? Object.keys(match.rosters).length : 0;
  const isHost = match?.hostId === selfId;
  const submittedIds = new Set(Object.keys(match?.rosters ?? {}));

  return (
    <main className="arena-wait" data-testid="arena-wait">
      <Surface className="arena-lobby">
        <Eyebrow>{t("arena.lobbyEyebrow")} · {code}</Eyebrow>
        <h1>{t("arena.waitTitle")}</h1>
        <p className="arena-lobby__note">
          {t("arena.waitNote", { submitted, bots: Math.max(0, ARENA_FIELD_SIZE - Math.max(members.length, submitted)) })}
        </p>
        <ul className="arena-lobby__members" data-testid="arena-wait-members">
          {members.map((member) => (
            <li key={member.id} data-connected={member.connected} className={member.id === selfId ? "is-self" : ""}>
              <em aria-hidden="true" />
              <span>{member.name}</span>
              {member.id === selfId && <small>{t("arena.you")}</small>}
              <small>{submittedIds.has(member.id) ? t("arena.rosterReady") : t("arena.rosterDrafting")}</small>
            </li>
          ))}
        </ul>
        {isHost && (
          <Button variant="primary" data-testid="arena-lock" onClick={lockMatch}>
            {t("arena.lock")}
          </Button>
        )}
        {!isHost && <p className="arena-lobby__note">{t("arena.waitForHost")}</p>}
        <Button variant="leave" data-testid="arena-wait-leave" onClick={() => setLeaveGate(true)}>
          {t("arena.leave")}
        </Button>
        {leaveGate && (
          <Modal title={t("arena.leaveWaitTitle")} description={t("arena.leaveWaitText")} onClose={() => setLeaveGate(false)}>
            <Button variant="secondary" onClick={() => setLeaveGate(false)}>{t("duel.exitStay")}</Button>
            <Button variant="danger" data-testid="arena-wait-leave-confirm" onClick={() => { leaveRoom(); reset(); setLeaveGate(false); }}>
              {t("arena.leave")}
            </Button>
          </Modal>
        )}
      </Surface>
    </main>
  );
}
