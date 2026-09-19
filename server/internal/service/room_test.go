package service

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"
)

func testVersions() RoomVersions {
	return RoomVersions{SchemaVersion: 1, RatingModelVersion: "v1.13.0", DataHash: "sha256:abc", BalanceConfigVersion: "b1.35.0"}
}

func mustCreateRoom(t *testing.T, m *RoomManager) *Room {
	t.Helper()
	room, err := m.CreateRoom()
	if err != nil {
		t.Fatalf("create room: %v", err)
	}
	return room
}

// Потолок числа комнат: сверх MaxRooms — ErrTooManyRooms; prune брошенных освобождает место.
func TestRoomCountIsCapped(t *testing.T) {
	current := time.Unix(1_700_000_000, 0)
	m := NewRoomManager(func() time.Time { return current })
	for i := 0; i < MaxRooms; i++ {
		mustCreateRoom(t, m)
	}
	if _, err := m.CreateRoom(); !errors.Is(err, ErrTooManyRooms) {
		t.Fatalf("expected ErrTooManyRooms, got %v", err)
	}
	current = current.Add(2 * time.Hour)
	if removed := m.PruneRooms(time.Hour); removed != MaxRooms {
		t.Fatalf("prune: %d", removed)
	}
	mustCreateRoom(t, m)
}

// Потолок relay-лога: и по числу записей, и по суммарному размеру payload. Отказ не портит лог и
// не зовёт deliver; seq остаётся плотным.
func TestRoomRelayLogIsCapped(t *testing.T) {
	m := NewRoomManager(nil)

	byCount := mustCreateRoom(t, m)
	alice, err := m.JoinRoom(byCount.Code, "Alice", "", testVersions())
	if err != nil {
		t.Fatalf("join: %v", err)
	}
	for i := 0; i < MaxRelayEntries; i++ {
		if _, err := m.AppendRelay(byCount.Code, alice.Token, []byte(`{}`), nil); err != nil {
			t.Fatalf("append %d: %v", i, err)
		}
	}
	delivered := false
	if _, err := m.AppendRelay(byCount.Code, alice.Token, []byte(`{}`), func(RelayEntry) { delivered = true }); !errors.Is(err, ErrRelayLogFull) || delivered {
		t.Fatalf("expected ErrRelayLogFull without delivery, got %v delivered=%v", err, delivered)
	}
	if log, _ := m.RelayLog(byCount.Code); len(log) != MaxRelayEntries || log[len(log)-1].Seq != MaxRelayEntries {
		t.Fatalf("log after overflow: %d entries", len(log))
	}

	byBytes := mustCreateRoom(t, m)
	bob, err := m.JoinRoom(byBytes.Code, "Bob", "", testVersions())
	if err != nil {
		t.Fatalf("join: %v", err)
	}
	chunk := []byte(`"` + strings.Repeat("x", 16<<10-2) + `"`) // 16 КиБ — предел ws-сообщения
	for i := 0; i < MaxRelayBytes/len(chunk); i++ {
		if _, err := m.AppendRelay(byBytes.Code, bob.Token, chunk, nil); err != nil {
			t.Fatalf("append chunk %d: %v", i, err)
		}
	}
	if _, err := m.AppendRelay(byBytes.Code, bob.Token, []byte(`{}`), nil); !errors.Is(err, ErrRelayLogFull) {
		t.Fatalf("expected ErrRelayLogFull by bytes, got %v", err)
	}
}

func TestRoomJoinPinsVersionsAndRejectsMismatch(t *testing.T) {
	m := NewRoomManager(nil)
	room := mustCreateRoom(t, m)
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
	room := mustCreateRoom(t, m)
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
	room := mustCreateRoom(t, m)
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
	room := mustCreateRoom(t, m)
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
	room := mustCreateRoom(t, m)
	alice, err := m.JoinRoom(room.Code, "Alice", "", testVersions())
	if err != nil {
		t.Fatalf("join alice: %v", err)
	}
	bob, err := m.JoinRoom(room.Code, "Bob", "", testVersions())
	if err != nil {
		t.Fatalf("join bob: %v", err)
	}

	// Сервер штампует порядок и подтверждённого отправителя; payload непрозрачен.
	first, err := m.AppendRelay(room.Code, alice.Token, []byte(`{"kind":"start"}`), nil)
	if err != nil {
		t.Fatalf("append: %v", err)
	}
	second, err := m.AppendRelay(room.Code, bob.Token, []byte(`{"kind":"pick"}`), nil)
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
	if _, err := m.AppendRelay(room.Code, "not-a-token", []byte(`{}`), nil); !errors.Is(err, ErrMemberNotFound) {
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

// Имя участника — инвариант комнаты: и новый вход, и переименование при reconnect проходят
// нормализацию (краевые пробелы, лимит рун).
func TestRoomJoinNormalizesMemberName(t *testing.T) {
	m := NewRoomManager(nil)
	room := mustCreateRoom(t, m)
	joined, err := m.JoinRoom(room.Code, "  Alice  ", "", testVersions())
	if err != nil || joined.Member.Name != "Alice" {
		t.Fatalf("join: %v %q", err, joined.Member.Name)
	}
	long := strings.Repeat("я", MaxMemberNameRunes-1) + " хвост"
	again, err := m.JoinRoom(room.Code, long, joined.Token, testVersions())
	if err != nil || !again.Reconnected {
		t.Fatalf("reconnect: %v %+v", err, again)
	}
	// Обрезка попала на пробел — он тоже срезан.
	if want := strings.Repeat("я", MaxMemberNameRunes-1); again.Member.Name != want {
		t.Fatalf("name = %q, want %q", again.Member.Name, want)
	}
}

// deliver вызывается под мьютексом сразу после штампа: при одновременных отправителях порядок
// доставки обязан совпадать с порядком seq (на нём держится клиентский фильтр seq <= lastSeq).
// Отказ (чужой токен) deliver не зовёт.
func TestRoomRelayDeliverRunsInSeqOrderUnderConcurrency(t *testing.T) {
	m := NewRoomManager(nil)
	room := mustCreateRoom(t, m)
	const senders = 16
	const perSender = 50
	tokens := make([]string, 0, senders)
	for i := 0; i < senders; i++ {
		joined, err := m.JoinRoom(room.Code, fmt.Sprintf("P%d", i), "", testVersions())
		if err != nil {
			t.Fatalf("join: %v", err)
		}
		tokens = append(tokens, joined.Token)
	}

	var delivered []int // пишется только из deliver, то есть под мьютексом менеджера
	var wg sync.WaitGroup
	for _, token := range tokens {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < perSender; i++ {
				if _, err := m.AppendRelay(room.Code, token, []byte(`{}`), func(entry RelayEntry) {
					delivered = append(delivered, entry.Seq)
				}); err != nil {
					t.Errorf("append: %v", err)
					return
				}
			}
		}()
	}
	wg.Wait()
	if len(delivered) != senders*perSender {
		t.Fatalf("delivered %d of %d", len(delivered), senders*perSender)
	}
	for index, seq := range delivered {
		if seq != index+1 {
			t.Fatalf("delivery order broke at %d: seq %d", index, seq)
		}
	}

	called := false
	if _, err := m.AppendRelay(room.Code, "not-a-token", []byte(`{}`), func(RelayEntry) { called = true }); err == nil || called {
		t.Fatalf("rejected relay must not be delivered: err=%v called=%v", err, called)
	}
}
