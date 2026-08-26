package service

import (
	"errors"
	"fmt"
	"testing"
	"time"
)

func testVersions() RoomVersions {
	return RoomVersions{SchemaVersion: 1, RatingModelVersion: "v1.13.0", DataHash: "sha256:abc", BalanceConfigVersion: "b1.35.0"}
}

func TestRoomJoinPinsVersionsAndRejectsMismatch(t *testing.T) {
	m := NewRoomManager(nil)
	room := m.CreateRoom()
	if len(room.Code) != roomCodeLength {
		t.Fatalf("code %q", room.Code)
	}

	first, err := m.JoinRoom(room.Code, "Alice", "", testVersions())
	if err != nil {
		t.Fatalf("join: %v", err)
	}
	if first.Reconnected || first.Token == "" || len(first.Members) != 1 {
		t.Fatalf("first join: %+v", first)
	}

	// Совместимый клиент входит; пустой dataHash — легален (манифест ещё не в руках).
	okVersions := testVersions()
	okVersions.DataHash = ""
	if _, err := m.JoinRoom(room.Code, "Bob", "", okVersions); err != nil {
		t.Fatalf("compatible join: %v", err)
	}

	// Другой balance/model/schema/dataHash — отказ «обнови», пулы разойдутся.
	for name, mutate := range map[string]func(*RoomVersions){
		"schema":  func(v *RoomVersions) { v.SchemaVersion = 2 },
		"model":   func(v *RoomVersions) { v.RatingModelVersion = "v9.0.0" },
		"balance": func(v *RoomVersions) { v.BalanceConfigVersion = "b9.0.0" },
		"data":    func(v *RoomVersions) { v.DataHash = "sha256:def" },
	} {
		bad := testVersions()
		mutate(&bad)
		if _, err := m.JoinRoom(room.Code, "Eve", "", bad); !errors.Is(err, ErrVersionMismatch) {
			t.Fatalf("%s mismatch: err=%v", name, err)
		}
	}
}

func TestRoomReconnectDoesNotDuplicate(t *testing.T) {
	m := NewRoomManager(nil)
	room := m.CreateRoom()
	joined, err := m.JoinRoom(room.Code, "Alice", "", testVersions())
	if err != nil {
		t.Fatalf("join: %v", err)
	}
	if _, _, err := m.DisconnectMember(room.Code, joined.Token); err != nil {
		t.Fatalf("disconnect: %v", err)
	}

	again, err := m.JoinRoom(room.Code, "Alice II", joined.Token, testVersions())
	if err != nil {
		t.Fatalf("reconnect: %v", err)
	}
	if !again.Reconnected || again.Member.ID != joined.Member.ID {
		t.Fatalf("reconnect must reuse member: %+v", again)
	}
	if len(again.Members) != 1 {
		t.Fatalf("ghost appeared: %d members", len(again.Members))
	}
	if !again.Members[0].Connected || again.Members[0].Name != "Alice II" {
		t.Fatalf("member state: %+v", again.Members[0])
	}
}

func TestRoomCapacityAndLeave(t *testing.T) {
	m := NewRoomManager(nil)
	room := m.CreateRoom()
	tokens := make([]string, 0, RoomCapacity)
	for i := 0; i < RoomCapacity; i++ {
		joined, err := m.JoinRoom(room.Code, fmt.Sprintf("P%d", i), "", testVersions())
		if err != nil {
			t.Fatalf("join %d: %v", i, err)
		}
		tokens = append(tokens, joined.Token)
	}
	if _, err := m.JoinRoom(room.Code, "Extra", "", testVersions()); !errors.Is(err, ErrRoomFull) {
		t.Fatalf("expected full, got %v", err)
	}
	// Явный выход освобождает слот; disconnect — НЕТ (место держится под reconnect).
	if _, _, err := m.LeaveRoom(room.Code, tokens[0]); err != nil {
		t.Fatalf("leave: %v", err)
	}
	if _, err := m.JoinRoom(room.Code, "Late", "", testVersions()); err != nil {
		t.Fatalf("join after leave: %v", err)
	}
}

func TestRoomPrune(t *testing.T) {
	current := time.Unix(1_700_000_000, 0)
	m := NewRoomManager(func() time.Time { return current })
	room := m.CreateRoom()
	joined, _ := m.JoinRoom(room.Code, "Alice", "", testVersions())

	// Пока кто-то онлайн — комната живёт сколько угодно.
	current = current.Add(24 * time.Hour)
	if removed := m.PruneRooms(time.Hour); removed != 0 {
		t.Fatalf("pruned live room: %d", removed)
	}

	// Все офлайн меньше ttl — комната ждёт reconnect.
	if _, _, err := m.DisconnectMember(room.Code, joined.Token); err != nil {
		t.Fatalf("disconnect: %v", err)
	}
	current = current.Add(30 * time.Minute)
	if removed := m.PruneRooms(time.Hour); removed != 0 {
		t.Fatalf("pruned waiting room: %d", removed)
	}

	// Все офлайн дольше ttl — комната удаляется, код перестаёт находиться.
	current = current.Add(2 * time.Hour)
	if removed := m.PruneRooms(time.Hour); removed != 1 {
		t.Fatalf("prune: %d", removed)
	}
	if _, err := m.JoinRoom(room.Code, "Ghost", joined.Token, testVersions()); !errors.Is(err, ErrRoomNotFound) {
		t.Fatalf("expected not found, got %v", err)
	}
}

func TestRoomRelayLogOrderAndStamping(t *testing.T) {
	m := NewRoomManager(nil)
	room := m.CreateRoom()
	alice, err := m.JoinRoom(room.Code, "Alice", "", testVersions())
	if err != nil {
		t.Fatalf("join alice: %v", err)
	}
	bob, err := m.JoinRoom(room.Code, "Bob", "", testVersions())
	if err != nil {
		t.Fatalf("join bob: %v", err)
	}

	// Сервер штампует порядок и подтверждённого отправителя; payload непрозрачен.
	first, err := m.AppendRelay(room.Code, alice.Token, []byte(`{"kind":"start"}`))
	if err != nil {
		t.Fatalf("append: %v", err)
	}
	second, err := m.AppendRelay(room.Code, bob.Token, []byte(`{"kind":"pick"}`))
	if err != nil {
		t.Fatalf("append: %v", err)
	}
	if first.Seq != 1 || second.Seq != 2 {
		t.Fatalf("seq: %d, %d", first.Seq, second.Seq)
	}
	if first.From != alice.Member.ID || second.From != bob.Member.ID {
		t.Fatalf("from: %q, %q", first.From, second.From)
	}

	// Чужой токен писать в лог не может (from подделать нельзя).
	if _, err := m.AppendRelay(room.Code, "not-a-token", []byte(`{}`)); !errors.Is(err, ErrMemberNotFound) {
		t.Fatalf("stranger append: %v", err)
	}

	// Лог возвращается целиком и копией — реконнект реплеит с нуля.
	log, err := m.RelayLog(room.Code)
	if err != nil || len(log) != 2 {
		t.Fatalf("log: %v, %d", err, len(log))
	}
	log[0].Seq = 99
	fresh, _ := m.RelayLog(room.Code)
	if fresh[0].Seq != 1 {
		t.Fatalf("log must be a copy, got seq %d", fresh[0].Seq)
	}
}
