package transport

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/aegis-draft/server/internal/config"
	"github.com/aegis-draft/server/internal/service"
	"github.com/coder/websocket/wsjson"
)

// Порядок relay: seq штампуется и ставится в outbox в одной критической секции, поэтому в outbox
// КАЖДОГО участника записи лежат строго по возрастанию seq без пропусков. Раньше штамп шёл под
// мьютексом комнат, а рассылка — отдельно под мьютексом hub: seq 6 мог обогнать seq 5, клиент
// отбрасывал «устаревший» 5 (seq <= lastSeq), и ход терялся у всех онлайн, оставаясь в логе.
// Тест бьёт по шву напрямую (без сокетов — так гонка воспроизводится за миллисекунды): много
// отправителей одновременно, слушатели сверяют порядок своего outbox.
func TestRelayConcurrentSendersKeepSeqOrderInOutbox(t *testing.T) {
	const (
		rounds    = 300
		senders   = 8
		listeners = 2
	)
	for round := 0; round < rounds; round++ {
		rooms := service.NewRoomManager(nil)
		server := NewServer(config.Config{Env: "test"}, Deps{Rooms: rooms})
		room, err := rooms.CreateRoom()
		if err != nil {
			t.Fatalf("create room: %v", err)
		}
		tokens := make([]string, 0, senders)
		for i := 0; i < senders; i++ {
			joined, err := rooms.JoinRoom(room.Code, fmt.Sprintf("S%d", i), "", testVersions())
			if err != nil {
				t.Fatalf("join: %v", err)
			}
			tokens = append(tokens, joined.Token)
		}

		// Слушатели вычитывают outbox сразу (иначе hub выбросит пир за переполнение).
		var listening sync.WaitGroup
		failures := make(chan string, listeners+senders)
		peers := make([]*wsPeer, 0, listeners)
		for i := 0; i < listeners; i++ {
			peer, _ := server.roomHub.attach(room.Code, fmt.Sprintf("listener-%d", i))
			peers = append(peers, peer)
			listening.Add(1)
			go func() {
				defer listening.Done()
				for next := 1; next <= senders; next++ {
					select {
					case msg := <-peer.outbox:
						var entry service.RelayEntry
						if err := json.Unmarshal(msg.Payload, &entry); err != nil {
							failures <- "payload: " + err.Error()
							return
						}
						if entry.Seq != next {
							failures <- fmt.Sprintf("round %d: outbox got seq %d, want %d", round, entry.Seq, next)
							return
						}
					case <-time.After(5 * time.Second):
						failures <- fmt.Sprintf("round %d: relay seq %d never arrived", round, next)
						return
					}
				}
			}()
		}

		// Все отправители стартуют разом — как одновременные пики раунда Арены.
		start := make(chan struct{})
		var sent sync.WaitGroup
		for _, token := range tokens {
			sent.Add(1)
			go func() {
				defer sent.Done()
				<-start
				if err := server.relay(room.Code, token, json.RawMessage(`{"kind":"pick"}`)); err != nil {
					failures <- "relay: " + err.Error()
				}
			}()
		}
		close(start)
		sent.Wait()
		listening.Wait()
		for _, peer := range peers {
			peer.drop()
		}
		select {
		case failure := <-failures:
			t.Fatal(failure)
		default:
		}
	}
}

// То же через настоящие сокеты: несколько клиентов шлют relay одновременно, и каждый обязан
// увидеть ВСЕ записи по порядку seq без пропусков. Темп — волнами: каждый шлёт одну запись, а
// следующую — только увидев всю волну. Ожидание лишь своего эха очередь ЧУЖОГО outbox не
// ограничивало: пока писатель одного сокета стоял (CPU занят, медленный CI-раннер), остальные
// успевали накидать ему больше outboxSize записей, hub выбрасывал здоровый сокет, и тест висел до
// таймаута (CI a18b0af1: EOF после seq 11). С волнами в outbox участника не больше presence входов
// (clients) и двух волн (текущая + следующая без его записи: 2·clients−1) — вытеснение исключено
// при любом планировании, и пропуск или перестановка означают настоящий дефект.
func TestRoomSocketConcurrentRelaysArriveInSeqOrder(t *testing.T) {
	const (
		clients = 6
		waves   = 25
	)
	if 3*clients > outboxSize {
		t.Fatalf("%d clients overflow outbox %d: the test would catch eviction, not order", clients, outboxSize)
	}
	ts := roomsTestServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	code := createTestRoom(t, ts)

	type client struct {
		id   string
		send func(payload any) error
		next func() (wsMessage, error)
	}
	all := make([]client, 0, clients)
	for i := 0; i < clients; i++ {
		conn, welcome := dialRoom(t, ctx, ts, code, fmt.Sprintf("P%d", i), "", testVersions())
		defer conn.CloseNow()
		all = append(all, client{
			id:   welcome.SelfID,
			send: func(payload any) error { return wsjson.Write(ctx, conn, envelope("relay", payload)) },
			next: func() (wsMessage, error) {
				var msg wsMessage
				err := wsjson.Read(ctx, conn, &msg)
				return msg, err
			},
		})
	}

	// Первая ошибка отменяет общий ctx: иначе остальные ждали бы записей упавшего до таймаута.
	errs := make(chan error, clients)
	fail := func(err error) {
		errs <- err
		cancel()
	}
	var wg sync.WaitGroup
	for _, c := range all {
		wg.Add(1)
		go func() {
			defer wg.Done()
			own, lastSeq := 0, 0
			for wave := 1; wave <= waves; wave++ {
				if err := c.send(map[string]int{"n": wave}); err != nil {
					fail(err)
					return
				}
				for lastSeq < wave*clients {
					msg, err := c.next()
					if err != nil {
						fail(fmt.Errorf("client %s: read after seq %d: %w", c.id, lastSeq, err))
						return
					}
					if msg.Type != "relay" {
						continue // presence входящих
					}
					var entry service.RelayEntry
					if err := json.Unmarshal(msg.Payload, &entry); err != nil {
						fail(err)
						return
					}
					if entry.Seq != lastSeq+1 {
						fail(fmt.Errorf("client %s: got seq %d after %d", c.id, entry.Seq, lastSeq))
						return
					}
					lastSeq = entry.Seq
					if entry.From == c.id {
						own++
					}
				}
				// Следующую волну никто не шлёт, не увидев эту целиком, — своя запись в ней ровно одна.
				if own != wave {
					fail(fmt.Errorf("client %s: %d own entries after wave %d", c.id, own, wave))
					return
				}
			}
		}()
	}
	wg.Wait()
	select {
	case err := <-errs:
		t.Fatal(err)
	default:
	}
}
