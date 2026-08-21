// Комнаты Arena (MP0): REST-создание + ws-подключение. Слой ТОНКИЙ: upgrade, кодек
// протокола `{v, type, payload}` и рассылка — вся комнатная логика в service.RoomManager.
//
// Выбор библиотеки (решение MP0): github.com/coder/websocket (бывш. nhooyr.io/websocket) —
// поддерживается, context-first API, встроенный wsjson и ws-клиент для тестов; gorilla
// отклонена (проект в поддержке-заморозке, API без контекстов).
//
// Протокол v1 (версия — с ПЕРВОГО сообщения, спека MP0):
//
//	клиент → сервер:  hello {name, token?, versions}, ping {}
//	сервер → клиенту: welcome {token, selfId, code, versions, members},
//	                  presence {event:{kind,id,name}, members}, pong {},
//	                  error {code, message} (затем close)
package transport

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/aegis-draft/server/internal/service"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/go-chi/chi/v5"
)

// protocolVersion — версия ws-протокола комнат. Несовместимое hello отклоняется кодом
// bad_hello: клиент обязан обновиться, молча гадать по полям запрещено.
const protocolVersion = 1

const (
	helloDeadline = 10 * time.Second // не прислал hello — соединение не занимает слот
	readDeadline  = 75 * time.Second // клиент пингует каждые ~25с; 3 пропуска = обрыв
)

// wsMessage — конверт протокола. Payload разбирается по type.
type wsMessage struct {
	V       int             `json:"v"`
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

type helloPayload struct {
	Name     string               `json:"name"`
	Token    string               `json:"token,omitempty"`
	Versions service.RoomVersions `json:"versions"`
}

type welcomePayload struct {
	Token    string                   `json:"token"`
	SelfID   string                   `json:"selfId"`
	Code     string                   `json:"code"`
	Versions service.RoomVersions     `json:"versions"`
	Members  []service.RoomMemberView `json:"members"`
}

type presencePayload struct {
	Event   presenceEvent            `json:"event"`
	Members []service.RoomMemberView `json:"members"`
}

type presenceEvent struct {
	Kind string `json:"kind"` // joined | reconnected | disconnected | left
	ID   string `json:"id"`
	Name string `json:"name"`
}

type errorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func envelope(msgType string, payload any) wsMessage {
	raw, err := json.Marshal(payload)
	if err != nil {
		// Payload собираем мы сами; несериализуемый — программная ошибка, не рантайм-кейс.
		log.Printf("[rooms] marshal %s: %v", msgType, err)
		raw = []byte("{}")
	}
	return wsMessage{V: protocolVersion, Type: msgType, Payload: raw}
}

// roomHub — реестр живых сокетов комнат (transport-состояние; машина участников — в service).
// Значение — канал исходящих: у каждого соединения один писатель, рассылка не блокируется
// медленным клиентом (переполнение канала = принудительный обрыв, reconnect его починит).
type roomHub struct {
	mu    sync.Mutex
	rooms map[string]map[string]chan wsMessage // code → memberToken → outbox
}

func newRoomHub() *roomHub {
	return &roomHub{rooms: make(map[string]map[string]chan wsMessage)}
}

// attach регистрирует сокет участника. Прежний сокет того же токена закрывается: reconnect
// не плодит призраков и на транспортном уровне тоже (DoD MP0).
func (h *roomHub) attach(code, token string) (outbox chan wsMessage, replaced chan wsMessage) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[code] == nil {
		h.rooms[code] = make(map[string]chan wsMessage)
	}
	replaced = h.rooms[code][token]
	outbox = make(chan wsMessage, 32)
	h.rooms[code][token] = outbox
	return outbox, replaced
}

// detach снимает сокет, если он всё ещё текущий (reconnect мог уже заменить его новым).
func (h *roomHub) detach(code, token string, outbox chan wsMessage) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	current, ok := h.rooms[code][token]
	if !ok || current != outbox {
		return false
	}
	delete(h.rooms[code], token)
	if len(h.rooms[code]) == 0 {
		delete(h.rooms, code)
	}
	return true
}

// broadcast шлёт сообщение всем живым сокетам комнаты. Забитый outbox закрывается:
// висящий клиент не должен тормозить остальных.
func (h *roomHub) broadcast(code string, msg wsMessage) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for token, outbox := range h.rooms[code] {
		select {
		case outbox <- msg:
		default:
			delete(h.rooms[code], token)
			close(outbox)
		}
	}
}

// createRoom — POST /api/rooms: пустое лобби, версии пинит первый ws-джойн.
func (s *Server) createRoom(w http.ResponseWriter, _ *http.Request) {
	room := s.rooms.CreateRoom()
	writeJSON(w, http.StatusCreated, map[string]string{"code": room.Code})
}

// roomSocket — GET /api/ws/rooms/{code}: upgrade + сессия участника.
func (s *Server) roomSocket(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		// Кросс-ориджин по построению: фронт на Pages/TMA, API на Fly. Auth-модели у комнат
		// нет (вход по коду), CSRF-поверхности нет — токен участника не кука.
		OriginPatterns: []string{"*"},
	})
	if err != nil {
		return // Accept сам ответил клиенту
	}
	// Дальше жизнью соединения управляет сессия; Close на выходе — страховка.
	defer conn.CloseNow()

	ctx := r.Context()
	hello, err := readHello(ctx, conn)
	if err != nil {
		closeWithError(ctx, conn, "bad_hello", err.Error())
		return
	}
	joined, err := s.rooms.JoinRoom(code, hello.Name, hello.Token, hello.Versions)
	if err != nil {
		closeWithError(ctx, conn, roomErrorCode(err), err.Error())
		return
	}
	token := joined.Token

	outbox, replaced := s.roomHub.attach(code, token)
	if replaced != nil {
		close(replaced) // старый писатель завершится и закроет прежний сокет
	}

	// welcome — лично; presence — всем (включая нового: единый источник списка).
	welcome := envelope("welcome", welcomePayload{
		Token: token, SelfID: joined.Member.ID, Code: code,
		Versions: joined.Versions, Members: joined.Members,
	})
	if err := wsjson.Write(ctx, conn, welcome); err != nil {
		s.roomHub.detach(code, token, outbox)
		return
	}
	kind := "joined"
	if joined.Reconnected {
		kind = "reconnected"
	}
	s.roomHub.broadcast(code, envelope("presence", presencePayload{
		Event:   presenceEvent{Kind: kind, ID: joined.Member.ID, Name: joined.Member.Name},
		Members: joined.Members,
	}))

	// Писатель: единственная горутина, пишущая в сокет после welcome.
	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		for msg := range outbox {
			writeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			err := wsjson.Write(writeCtx, conn, msg)
			cancel()
			if err != nil {
				return
			}
		}
		// Канал закрыт: либо сессию заменил reconnect, либо hub выкинул медленный сокет.
		// CloseNow, не Close: closing handshake ждёт эха пира до 5с, а пир может не читать —
		// это стойло задерживало бы teardown-рассылки (поймано транспортным тестом).
		_ = conn.CloseNow()
	}()

	// Читатель: ping/presence-жизнь. Любое валидное сообщение продлевает дедлайн.
	memberID, memberName := joined.Member.ID, joined.Member.Name
	explicitLeave := false
	for {
		readCtx, cancel := context.WithTimeout(ctx, readDeadline)
		var msg wsMessage
		err := wsjson.Read(readCtx, conn, &msg)
		cancel()
		if err != nil {
			break
		}
		if msg.V != protocolVersion {
			closeWithError(ctx, conn, "bad_protocol", "unsupported protocol version")
			break
		}
		switch msg.Type {
		case "ping":
			select {
			case outbox <- envelope("pong", struct{}{}):
			default: // забитый собственный outbox — пусть решает writer/hub
			}
		case "leave":
			explicitLeave = true
		default:
			// Неизвестный тип — молча игнорируем: forward-совместимость внутри v1.
		}
		if explicitLeave {
			break
		}
	}

	// Сессия закончилась. Если сокет уже заменён reconnect'ом — участника не трогаем:
	// его новая сессия живёт, а этот обрыв — просто смерть старого соединения.
	if !s.roomHub.detach(code, token, outbox) {
		return
	}
	close(outbox)
	<-writerDone
	if explicitLeave {
		if members, member, err := s.rooms.LeaveRoom(code, token); err == nil {
			s.roomHub.broadcast(code, envelope("presence", presencePayload{
				Event:   presenceEvent{Kind: "left", ID: member.ID, Name: member.Name},
				Members: members,
			}))
		}
		_ = conn.CloseNow()
		return
	}
	if members, _, err := s.rooms.DisconnectMember(code, token); err == nil {
		s.roomHub.broadcast(code, envelope("presence", presencePayload{
			Event:   presenceEvent{Kind: "disconnected", ID: memberID, Name: memberName},
			Members: members,
		}))
	}
}

func readHello(ctx context.Context, conn *websocket.Conn) (helloPayload, error) {
	readCtx, cancel := context.WithTimeout(ctx, helloDeadline)
	defer cancel()
	var msg wsMessage
	if err := wsjson.Read(readCtx, conn, &msg); err != nil {
		return helloPayload{}, errors.New("hello expected as the first message")
	}
	if msg.V != protocolVersion || msg.Type != "hello" {
		return helloPayload{}, errors.New("hello v1 expected as the first message")
	}
	var hello helloPayload
	if err := json.Unmarshal(msg.Payload, &hello); err != nil || hello.Name == "" {
		return helloPayload{}, errors.New("hello payload must carry a name")
	}
	return hello, nil
}

func closeWithError(ctx context.Context, conn *websocket.Conn, code, message string) {
	writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	_ = wsjson.Write(writeCtx, conn, envelope("error", errorPayload{Code: code, Message: message}))
	_ = conn.Close(websocket.StatusPolicyViolation, code)
}

func roomErrorCode(err error) string {
	switch {
	case errors.Is(err, service.ErrRoomNotFound):
		return "room_not_found"
	case errors.Is(err, service.ErrRoomFull):
		return "room_full"
	case errors.Is(err, service.ErrVersionMismatch):
		return "version_mismatch"
	default:
		return "internal"
	}
}
