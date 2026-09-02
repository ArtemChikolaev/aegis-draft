package transport

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/aegis-draft/server/internal/config"
	"github.com/aegis-draft/server/internal/service"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

func roomsTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	server := NewServer(config.Config{Env: "test"}, Deps{Rooms: service.NewRoomManager(nil)})
	ts := httptest.NewServer(server.Handler())
	t.Cleanup(ts.Close)
	return ts
}

func wsURL(ts *httptest.Server, code string) string {
	return strings.Replace(ts.URL, "http://", "ws://", 1) + "/api/ws/rooms/" + code
}

func createTestRoom(t *testing.T, ts *httptest.Server) string {
	t.Helper()
	resp, err := ts.Client().Post(ts.URL+"/api/rooms", "application/json", nil)
	if err != nil {
		t.Fatalf("create room: %v", err)
	}
	defer resp.Body.Close()
	var body struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil || body.Code == "" {
		t.Fatalf("create room decode: %v %q", err, body.Code)
	}
	return body.Code
}

func dialRoom(t *testing.T, ctx context.Context, ts *httptest.Server, code, name, token string, versions service.RoomVersions) (*websocket.Conn, welcomePayload) {
	t.Helper()
	conn, _, err := websocket.Dial(ctx, wsURL(ts, code), nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	hello := envelope("hello", helloPayload{Name: name, Token: token, Versions: versions})
	if err := wsjson.Write(ctx, conn, hello); err != nil {
		t.Fatalf("hello: %v", err)
	}
	msg := readMessage(t, ctx, conn)
	if msg.Type != "welcome" {
		t.Fatalf("expected welcome, got %s %s", msg.Type, string(msg.Payload))
	}
	var welcome welcomePayload
	if err := json.Unmarshal(msg.Payload, &welcome); err != nil {
		t.Fatalf("welcome payload: %v", err)
	}
	return conn, welcome
}

func readMessage(t *testing.T, ctx context.Context, conn *websocket.Conn) wsMessage {
	t.Helper()
	readCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var msg wsMessage
	if err := wsjson.Read(readCtx, conn, &msg); err != nil {
		t.Fatalf("read: %v", err)
	}
	return msg
}

// Ждём presence нужного вида, пропуская собственные join-эхо: рассылка идёт всем.
func waitPresence(t *testing.T, ctx context.Context, conn *websocket.Conn, kind string) presencePayload {
	t.Helper()
	for attempt := 0; attempt < 5; attempt++ {
		msg := readMessage(t, ctx, conn)
		if msg.Type != "presence" {
			continue
		}
		var presence presencePayload
		if err := json.Unmarshal(msg.Payload, &presence); err != nil {
			t.Fatalf("presence payload: %v", err)
		}
		if presence.Event.Kind == kind {
			return presence
		}
	}
	t.Fatalf("presence %q not received", kind)
	return presencePayload{}
}

func testVersions() service.RoomVersions {
	return service.RoomVersions{SchemaVersion: 1, RatingModelVersion: "v1.13.0", BalanceConfigVersion: "b1.35.0"}
}

func TestRoomSocketTwoClientsSeeEachOther(t *testing.T) {
	ts := roomsTestServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	code := createTestRoom(t, ts)

	alice, aliceWelcome := dialRoom(t, ctx, ts, code, "Alice", "", testVersions())
	defer alice.CloseNow()
	if len(aliceWelcome.Members) != 1 || aliceWelcome.Token == "" {
		t.Fatalf("alice welcome: %+v", aliceWelcome)
	}
	waitPresence(t, ctx, alice, "joined") // собственный join

	bob, bobWelcome := dialRoom(t, ctx, ts, code, "Bob", "", testVersions())
	defer bob.CloseNow()
	if len(bobWelcome.Members) != 2 {
		t.Fatalf("bob welcome members: %+v", bobWelcome.Members)
	}

	// DoD MP0: Алиса видит вход Боба живой рассылкой.
	joined := waitPresence(t, ctx, alice, "joined")
	if joined.Event.Name != "Bob" || len(joined.Members) != 2 {
		t.Fatalf("alice presence: %+v", joined)
	}

	// ping/pong живо.
	if err := wsjson.Write(ctx, alice, envelope("ping", struct{}{})); err != nil {
		t.Fatalf("ping: %v", err)
	}
	if msg := readMessage(t, ctx, alice); msg.Type != "pong" {
		t.Fatalf("expected pong, got %s", msg.Type)
	}
}

func TestRoomSocketReconnectNoGhosts(t *testing.T) {
	ts := roomsTestServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	code := createTestRoom(t, ts)

	watcher, _ := dialRoom(t, ctx, ts, code, "Watcher", "", testVersions())
	defer watcher.CloseNow()
	waitPresence(t, ctx, watcher, "joined")

	first, welcome := dialRoom(t, ctx, ts, code, "Bob", "", testVersions())
	waitPresence(t, ctx, watcher, "joined")
	first.CloseNow() // обрыв без leave
	disconnected := waitPresence(t, ctx, watcher, "disconnected")
	if len(disconnected.Members) != 2 {
		t.Fatalf("member must stay for reconnect: %+v", disconnected.Members)
	}

	second, again := dialRoom(t, ctx, ts, code, "Bob", welcome.Token, testVersions())
	defer second.CloseNow()
	if again.SelfID != welcome.SelfID {
		t.Fatalf("reconnect must keep identity: %s vs %s", again.SelfID, welcome.SelfID)
	}
	reconnected := waitPresence(t, ctx, watcher, "reconnected")
	if len(reconnected.Members) != 2 {
		t.Fatalf("ghost after reconnect: %+v", reconnected.Members)
	}

	// Явный leave освобождает слот и рассылается.
	if err := wsjson.Write(ctx, second, envelope("leave", struct{}{})); err != nil {
		t.Fatalf("leave: %v", err)
	}
	left := waitPresence(t, ctx, watcher, "left")
	if len(left.Members) != 1 {
		t.Fatalf("leave must free the seat: %+v", left.Members)
	}
}

func TestRoomSocketRejectsVersionMismatchAndUnknownRoom(t *testing.T) {
	ts := roomsTestServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	code := createTestRoom(t, ts)

	pinner, _ := dialRoom(t, ctx, ts, code, "Pinner", "", testVersions())
	defer pinner.CloseNow()

	// Другой balance — отказ version_mismatch до входа в комнату.
	other := testVersions()
	other.BalanceConfigVersion = "b9.9.9"
	conn, _, err := websocket.Dial(ctx, wsURL(ts, code), nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.CloseNow()
	if err := wsjson.Write(ctx, conn, envelope("hello", helloPayload{Name: "Old", Versions: other})); err != nil {
		t.Fatalf("hello: %v", err)
	}
	msg := readMessage(t, ctx, conn)
	var fail errorPayload
	if msg.Type != "error" || json.Unmarshal(msg.Payload, &fail) != nil || fail.Code != "version_mismatch" {
		t.Fatalf("expected version_mismatch, got %s %s", msg.Type, string(msg.Payload))
	}

	// Несуществующая комната — room_not_found.
	missing, _, err := websocket.Dial(ctx, wsURL(ts, "ZZZZZ"), nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer missing.CloseNow()
	if err := wsjson.Write(ctx, missing, envelope("hello", helloPayload{Name: "Lost", Versions: testVersions()})); err != nil {
		t.Fatalf("hello: %v", err)
	}
	msg = readMessage(t, ctx, missing)
	if msg.Type != "error" || json.Unmarshal(msg.Payload, &fail) != nil || fail.Code != "room_not_found" {
		t.Fatalf("expected room_not_found, got %s %s", msg.Type, string(msg.Payload))
	}
}

// Медленный сокет: hub выкидывает его из комнаты сигналом drop, а не закрытием канала —
// иначе pong читателя в уже закрытый outbox паниковал бы (select/default от этого не спасает).
func TestRoomHubDropsSlowPeerWithoutClosingOutbox(t *testing.T) {
	hub := newRoomHub()
	peer, replaced := hub.attach("ROOM", "token")
	if replaced != nil {
		t.Fatal("fresh attach must not replace anything")
	}
	for i := 0; i < cap(peer.outbox); i++ {
		hub.broadcast("ROOM", envelope("relay", i))
	}
	hub.broadcast("ROOM", envelope("relay", "overflow"))
	select {
	case <-peer.dropped:
	default:
		t.Fatal("overflowing peer must be dropped")
	}
	if hub.detach("ROOM", "token", peer) {
		t.Fatal("dropped peer must already be gone from the hub")
	}
	// Владелец всё ещё может писать в свой outbox (как читатель делает с pong) и закрыть его сам.
	select {
	case peer.outbox <- envelope("pong", struct{}{}):
	default:
	}
	peer.drop() // повторный drop — no-op, не паника
	close(peer.outbox)
}
