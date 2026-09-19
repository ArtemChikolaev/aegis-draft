package transport

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/aegis-draft/server/internal/apperr"
	"github.com/aegis-draft/server/internal/config"
	"github.com/aegis-draft/server/internal/service"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

// Имя из hello: краевые пробелы срезаются, длинное обрезается до лимита (вход не ломается),
// имя из одних пробелов — то же, что пустое (bad_hello).
func TestRoomSocketHelloNameIsTrimmedAndCapped(t *testing.T) {
	ts := roomsTestServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	code := createTestRoom(t, ts)

	long := "  " + strings.Repeat("Ж", 200) + "  "
	conn, welcome := dialRoom(t, ctx, ts, code, long, "", testVersions())
	defer conn.CloseNow()
	if len(welcome.Members) != 1 {
		t.Fatalf("members: %+v", welcome.Members)
	}
	name := welcome.Members[0].Name
	if utf8.RuneCountInString(name) != service.MaxMemberNameRunes || strings.TrimSpace(name) != name {
		t.Fatalf("name must be trimmed and capped to %d runes, got %d: %q",
			service.MaxMemberNameRunes, utf8.RuneCountInString(name), name)
	}

	blank, _, err := websocket.Dial(ctx, wsURL(ts, code), nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer blank.CloseNow()
	if err := wsjson.Write(ctx, blank, envelope("hello", helloPayload{Name: "   ", Versions: testVersions()})); err != nil {
		t.Fatalf("hello: %v", err)
	}
	msg := readMessage(t, ctx, blank)
	var fail errorPayload
	if msg.Type != "error" || json.Unmarshal(msg.Payload, &fail) != nil || fail.Code != "bad_hello" {
		t.Fatalf("expected bad_hello, got %s %s", msg.Type, string(msg.Payload))
	}
}

// Отклонённый relay не исчезает молча: отправитель получает НЕфатальный error relay_rejected,
// сокет остаётся рабочим (ping/pong живы), остальным ничего не рассылается.
func TestRoomSocketRejectedRelayIsReportedToSender(t *testing.T) {
	rooms := service.NewRoomManager(nil)
	server := NewServer(config.Config{Env: "test"}, Deps{Rooms: rooms})
	ts := httptest.NewServer(server.Handler())
	t.Cleanup(ts.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	code := createTestRoom(t, ts)

	watcher, _ := dialRoom(t, ctx, ts, code, "Watcher", "", testVersions())
	defer watcher.CloseNow()
	waitPresence(t, ctx, watcher, "joined")
	ghost, ghostWelcome := dialRoom(t, ctx, ts, code, "Ghost", "", testVersions())
	defer ghost.CloseNow()
	waitPresence(t, ctx, ghost, "joined")
	waitPresence(t, ctx, watcher, "joined")

	// Слот исчез при живой сессии (мимо сокета) — AppendRelay откажет ErrMemberNotFound.
	if _, _, err := rooms.LeaveRoom(code, ghostWelcome.Token); err != nil {
		t.Fatalf("leave: %v", err)
	}
	if err := wsjson.Write(ctx, ghost, envelope("relay", map[string]string{"kind": "pick"})); err != nil {
		t.Fatalf("relay: %v", err)
	}
	msg := readMessage(t, ctx, ghost)
	var fail errorPayload
	if msg.Type != "error" || json.Unmarshal(msg.Payload, &fail) != nil || fail.Code != "relay_rejected" {
		t.Fatalf("expected relay_rejected, got %s %s", msg.Type, string(msg.Payload))
	}
	// Ошибка не фатальная: сокет жив.
	if err := wsjson.Write(ctx, ghost, envelope("ping", struct{}{})); err != nil {
		t.Fatalf("ping: %v", err)
	}
	if msg := readMessage(t, ctx, ghost); msg.Type != "pong" {
		t.Fatalf("expected pong after relay_rejected, got %s", msg.Type)
	}
	// Отклонённая запись не попала ни в лог, ни в рассылку: следующий relay watcher — seq 1.
	if err := wsjson.Write(ctx, watcher, envelope("relay", map[string]string{"kind": "start"})); err != nil {
		t.Fatalf("relay: %v", err)
	}
	msg = readMessage(t, ctx, watcher)
	var entry service.RelayEntry
	if msg.Type != "relay" || json.Unmarshal(msg.Payload, &entry) != nil || entry.Seq != 1 {
		t.Fatalf("expected own relay seq 1, got %s %s", msg.Type, string(msg.Payload))
	}
}

// Лог комнаты упёрся в потолок: отправитель получает НЕфатальный relay_log_full, запись никому
// не рассылается, а вошедший позже получает реплей ровно до потолка.
func TestRoomSocketRelayLogFullIsReportedToSender(t *testing.T) {
	rooms := service.NewRoomManager(nil)
	server := NewServer(config.Config{Env: "test"}, Deps{Rooms: rooms})
	ts := httptest.NewServer(server.Handler())
	t.Cleanup(ts.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	code := createTestRoom(t, ts)

	sender, welcome := dialRoom(t, ctx, ts, code, "Sender", "", testVersions())
	defer sender.CloseNow()
	waitPresence(t, ctx, sender, "joined")
	// Лог набиваем мимо сокета (deliver nil — рассылки нет): важен только ответ на запись сверх.
	for i := 0; i < service.MaxRelayEntries; i++ {
		if _, err := rooms.AppendRelay(code, welcome.Token, json.RawMessage(`{}`), nil); err != nil {
			t.Fatalf("append %d: %v", i, err)
		}
	}
	if err := wsjson.Write(ctx, sender, envelope("relay", map[string]string{"kind": "pick"})); err != nil {
		t.Fatalf("relay: %v", err)
	}
	msg := readMessage(t, ctx, sender)
	var fail errorPayload
	if msg.Type != "error" || json.Unmarshal(msg.Payload, &fail) != nil || fail.Code != "relay_log_full" {
		t.Fatalf("expected relay_log_full, got %s %s", msg.Type, string(msg.Payload))
	}

	late, _, err := websocket.Dial(ctx, wsURL(ts, code), nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer late.CloseNow()
	late.SetReadLimit(1 << 20) // реплей полного лога крупнее дефолтного лимита клиента
	if err := wsjson.Write(ctx, late, envelope("hello", helloPayload{Name: "Late", Versions: testVersions()})); err != nil {
		t.Fatalf("hello: %v", err)
	}
	if msg := readMessage(t, ctx, late); msg.Type != "welcome" {
		t.Fatalf("expected welcome, got %s", msg.Type)
	}
	msg = readMessage(t, ctx, late)
	var replay relayLogPayload
	if msg.Type != "relay_log" || json.Unmarshal(msg.Payload, &replay) != nil || len(replay.Entries) != service.MaxRelayEntries {
		t.Fatalf("expected relay_log with %d entries, got %s (%d)", service.MaxRelayEntries, msg.Type, len(replay.Entries))
	}
}

// Потолок числа комнат: POST /api/rooms отвечает 503 rooms_limit в едином формате ошибок.
func TestCreateRoomOverLimitIs503(t *testing.T) {
	rooms := service.NewRoomManager(nil)
	server := NewServer(config.Config{Env: "test"}, Deps{Rooms: rooms})
	ts := httptest.NewServer(server.Handler())
	t.Cleanup(ts.Close)
	for i := 0; i < service.MaxRooms; i++ {
		if _, err := rooms.CreateRoom(); err != nil {
			t.Fatalf("create %d: %v", i, err)
		}
	}
	resp, err := ts.Client().Post(ts.URL+"/api/rooms", "application/json", nil)
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	defer resp.Body.Close()
	var fail apperr.Error
	if err := json.NewDecoder(resp.Body).Decode(&fail); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.StatusCode != http.StatusServiceUnavailable || fail.Code != "rooms_limit" {
		t.Fatalf("status = %d code = %q, want 503 rooms_limit", resp.StatusCode, fail.Code)
	}
}

// Сообщение крупнее maxMessageBytes рвёт соединение статусом 1009, а участник становится
// disconnected (слот под reconnect остаётся) — гигантский relay не попадает ни в лог, ни в рассылку.
func TestRoomSocketOversizedMessageClosesConnection(t *testing.T) {
	ts := roomsTestServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	code := createTestRoom(t, ts)

	watcher, _ := dialRoom(t, ctx, ts, code, "Watcher", "", testVersions())
	defer watcher.CloseNow()
	waitPresence(t, ctx, watcher, "joined")
	loud, _ := dialRoom(t, ctx, ts, code, "Loud", "", testVersions())
	defer loud.CloseNow()
	waitPresence(t, ctx, watcher, "joined")

	// Запись может оборваться и сама (сервер закрыл сокет посреди кадра) — это тоже исход теста.
	_ = wsjson.Write(ctx, loud, envelope("relay", strings.Repeat("x", maxMessageBytes+1)))
	for {
		var msg wsMessage
		err := wsjson.Read(ctx, loud, &msg)
		if err == nil {
			if msg.Type == "relay" {
				t.Fatal("oversized relay must not be broadcast")
			}
			continue
		}
		if status := websocket.CloseStatus(err); status != websocket.StatusMessageTooBig {
			t.Fatalf("expected close 1009, got %v (%v)", status, err)
		}
		break
	}
	// Первое же сообщение watcher после входа Loud — disconnected: relay ему не приходил.
	msg := readMessage(t, ctx, watcher)
	var presence presencePayload
	if msg.Type != "presence" || json.Unmarshal(msg.Payload, &presence) != nil || presence.Event.Kind != "disconnected" {
		t.Fatalf("expected disconnected presence, got %s %s", msg.Type, string(msg.Payload))
	}
}
