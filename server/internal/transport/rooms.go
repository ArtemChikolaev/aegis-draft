// Комнаты Arena (MP0): REST-создание + ws-подключение. Слой ТОНКИЙ: upgrade, кодек
// протокола `{v, type, payload}` и рассылка — вся комнатная логика в service.RoomManager.
//
// Выбор библиотеки (решение MP0): github.com/coder/websocket (бывш. nhooyr.io/websocket) —
// поддерживается, context-first API, встроенный wsjson и ws-клиент для тестов; gorilla
// отклонена (проект в поддержке-заморозке, API без контекстов).
//
// Протокол v1 (версия — с ПЕРВОГО сообщения, спека MP0):
//
//	клиент → сервер:  hello {name, token?, versions}, ping {}, relay <payload>, leave {}
//	сервер → клиенту: welcome {token, selfId, code, versions, members},
//	                  relay_log {entries}, relay {seq, from, payload},
//	                  presence {event:{kind,id,name}, members}, pong {},
//	                  error {code, message} — фатальная (bad_hello, bad_protocol, room_*,
//	                  version_mismatch: затем close) либо НЕфатальная на отклонённый relay
//	                  (relay_rejected, relay_log_full: сокет остаётся открытым, запись в лог
//	                  не попала)
package transport

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/aegis-draft/server/internal/apperr"
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
	writeDeadline = 5 * time.Second  // одна запись в сокет; зависший клиент не держит писателя
	// replayDeadline — запись relay_log при входе: лог до 256 КиБ одним сообщением, на слабой
	// мобильной сети это дольше одной обычной записи.
	replayDeadline = 15 * time.Second
	outboxSize     = 32
	// maxMessageBytes — предел входящего ws-сообщения. Самое крупное легитимное — start Арены:
	// снапшот 18 участников (uuid 36 + имя до 32 рун, в JSON до ~190 байт с экранированием) ≈ 5 КиБ;
	// пики, ходы Дуэли, hello и ping — десятки-сотни байт. 16 КиБ = запас ×3. Превышение
	// библиотека закрывает статусом 1009 (message too big). Лимит задан явно, а не дефолтом
	// библиотеки (32 КиБ): от него считается худший размер relay-лога комнаты.
	maxMessageBytes = 16 << 10
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

type relayLogPayload struct {
	Entries []service.RelayEntry `json:"entries"`
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
	rooms map[string]map[string]*wsPeer // code → memberToken → живое соединение
}

// wsPeer — одно живое соединение участника. Outbox закрывает ТОЛЬКО владелец (читатель сессии),
// hub лишь отменяет ctx: читатель шлёт в outbox pong, а send в закрытый другим канал — паника,
// от которой select/default не защищает. Отмена ctx прерывает и зависшую запись писателя
// (coder/websocket закрывает сокет по отмене контекста записи), так что выброшенный клиент
// освобождает сессию сразу, а не по таймауту записи.
type wsPeer struct {
	outbox chan wsMessage
	ctx    context.Context
	cancel context.CancelFunc
	// replaced — сокет вытеснен reconnect'ом того же токена. Пишется и читается под roomHub.mu.
	replaced bool
}

// drop просит писателя завершиться (идемпотентно: hub и reconnect могут сойтись на одном сокете).
func (p *wsPeer) drop() { p.cancel() }

func newRoomHub() *roomHub {
	return &roomHub{rooms: make(map[string]map[string]*wsPeer)}
}

// attach регистрирует сокет участника. Прежний сокет того же токена помечается вытесненным:
// reconnect не плодит призраков и на транспортном уровне тоже (DoD MP0).
func (h *roomHub) attach(code, token string) (peer *wsPeer, replaced *wsPeer) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[code] == nil {
		h.rooms[code] = make(map[string]*wsPeer)
	}
	replaced = h.rooms[code][token]
	if replaced != nil {
		replaced.replaced = true
	}
	ctx, cancel := context.WithCancel(context.Background())
	peer = &wsPeer{outbox: make(chan wsMessage, outboxSize), ctx: ctx, cancel: cancel}
	h.rooms[code][token] = peer
	return peer, replaced
}

// detach снимает сокет с hub и сообщает, была ли эта сессия у участника последней. false —
// сокет вытеснен reconnect'ом (или слот уже занят новым сокетом): участник живёт в новой сессии,
// трогать его нельзя. true — сокет снят сейчас или раньше выброшен broadcast'ом за переполненный
// outbox: участника нужно отпустить, иначе он навсегда Connected и PruneRooms не удалит комнату.
func (h *roomHub) detach(code, token string, peer *wsPeer) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	current, ok := h.rooms[code][token]
	switch {
	case ok && current == peer:
		h.removeLocked(code, token)
		return true
	case ok:
		return false
	default:
		return !peer.replaced
	}
}

// removeLocked снимает слот и чистит опустевшую комнату. Вызывать под h.mu.
func (h *roomHub) removeLocked(code, token string) {
	delete(h.rooms[code], token)
	if len(h.rooms[code]) == 0 {
		delete(h.rooms, code)
	}
}

// broadcast шлёт сообщение всем живым сокетам комнаты. Забитый outbox выбрасывается из hub и
// получает drop: висящий клиент не должен тормозить остальных, а его канал закроет владелец.
func (h *roomHub) broadcast(code string, msg wsMessage) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for token, peer := range h.rooms[code] {
		select {
		case peer.outbox <- msg:
		default:
			h.removeLocked(code, token)
			peer.drop()
		}
	}
}

// createRoom — POST /api/rooms: пустое лобби, версии пинит первый ws-джойн.
// Потолок числа комнат — 503 rooms_limit: состояние временное (брошенные комнаты снимает prune).
func (s *Server) createRoom(w http.ResponseWriter, _ *http.Request) {
	room, err := s.rooms.CreateRoom()
	if errors.Is(err, service.ErrTooManyRooms) {
		writeError(w, apperr.Unavailable("rooms_limit", "too many rooms, try again later"))
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
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
	conn.SetReadLimit(maxMessageBytes)

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
	memberID, memberName := joined.Member.ID, joined.Member.Name

	peer, replaced := s.roomHub.attach(code, token)
	defer peer.drop() // освобождает контекст пира на любом выходе
	outbox := peer.outbox
	if replaced != nil {
		replaced.drop() // старый писатель завершится и закроет прежний сокет
	}

	// Конец сессии — в defer: JoinRoom уже пометил участника Connected, и ЛЮБОЙ выход после attach
	// (welcome/реплей не дошли, обрыв, leave, паника в обработке сообщения — Recoverer её ловит,
	// но код после цикла не выполнился бы) обязан его отпустить. Иначе участник навсегда
	// Connected, и PruneRooms никогда не удалит комнату.
	explicitLeave := false
	var writerDone chan struct{} // nil, пока писатель не запущен
	defer func() {
		// Сокет вытеснен reconnect'ом — участника не трогаем: его новая сессия живёт. Иначе сессия
		// была последней (даже если hub уже выбросил сокет за переполнение).
		if !s.roomHub.detach(code, token, peer) {
			return
		}
		if writerDone != nil {
			close(outbox) // после detach в канал пишет только этот читатель — он уже закончил
			<-writerDone
		}
		if !explicitLeave {
			s.markDisconnected(code, token, memberID, memberName)
			return
		}
		if members, member, err := s.rooms.LeaveRoom(code, token); err == nil {
			s.roomHub.broadcast(code, envelope("presence", presencePayload{
				Event:   presenceEvent{Kind: "left", ID: member.ID, Name: member.Name},
				Members: members,
			}))
		}
	}()

	// welcome — лично; presence — всем (включая нового: единый источник списка). Личные записи
	// идут до запуска писателя, но под тем же правилом: не читающий клиент не держит сессию.
	welcome := envelope("welcome", welcomePayload{
		Token: token, SelfID: memberID, Code: code,
		Versions: joined.Versions, Members: joined.Members,
	})
	if err := writeWithDeadline(ctx, conn, welcome, writeDeadline); err != nil {
		return
	}
	// Реплей relay-лога — лично и ДО presence: вошедший (и переподключившийся) клиент обязан
	// восстановить состояние режима раньше, чем начнёт получать живые relay-сообщения через hub.
	if log, err := s.rooms.RelayLog(code); err == nil && len(log) > 0 {
		replay := envelope("relay_log", relayLogPayload{Entries: log})
		if err := writeWithDeadline(ctx, conn, replay, replayDeadline); err != nil {
			return
		}
	}
	kind := "joined"
	if joined.Reconnected {
		kind = "reconnected"
	}
	s.roomHub.broadcast(code, envelope("presence", presencePayload{
		Event:   presenceEvent{Kind: kind, ID: memberID, Name: memberName},
		Members: joined.Members,
	}))

	// Писатель: единственная горутина, пишущая в сокет после welcome. На выходе CloseNow, не Close:
	// closing handshake ждёт эха пира до 5с, а пир может не читать — это стойло задерживало бы
	// teardown-рассылки (поймано транспортным тестом).
	writerDone = make(chan struct{})
	go func(done chan<- struct{}) {
		defer close(done)
		for {
			var msg wsMessage
			select {
			case <-peer.ctx.Done():
				// Сессию заменил reconnect или hub выкинул медленный сокет.
				_ = conn.CloseNow()
				return
			case m, ok := <-outbox:
				if !ok {
					// Владелец закрыл канал: сессия завершилась штатно.
					_ = conn.CloseNow()
					return
				}
				msg = m
			}
			writeCtx, cancel := context.WithTimeout(peer.ctx, writeDeadline)
			err := wsjson.Write(writeCtx, conn, msg)
			cancel()
			if err != nil {
				return
			}
		}
	}(writerDone)

	// Читатель: ping/presence-жизнь. Любое валидное сообщение продлевает дедлайн.
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
		case "relay":
			// Универсальный релей комнаты (Дуэль M-DUEL; Arena MP2 — тот же слой): сервер
			// штампует порядок и отправителя, полезную нагрузку не понимает. Отказ записи
			// сообщается ОТПРАВИТЕЛЮ: иначе ход молча исчезает, а клиент ждёт эха, которого не
			// будет. Ошибка не фатальная (сокет живёт) и идёт через outbox — порядок с relay
			// сохраняется, писатель у сокета один.
			if err := s.relay(code, token, msg.Payload); err != nil {
				select {
				case outbox <- envelope("error", errorPayload{Code: relayErrorCode(err), Message: err.Error()}):
				default: // забитый собственный outbox — пусть решает writer/hub
				}
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
	// Конец сессии (detach, закрытие outbox, presence) — в defer выше.
}

// writeWithDeadline — личная запись в сокет до запуска писателя, с тем же правилом, что у него:
// зависший клиент не держит сессию дольше дедлайна.
func writeWithDeadline(ctx context.Context, conn *websocket.Conn, msg wsMessage, deadline time.Duration) error {
	writeCtx, cancel := context.WithTimeout(ctx, deadline)
	defer cancel()
	return wsjson.Write(writeCtx, conn, msg)
}

// relay штампует сообщение и ставит его в outbox участников в ОДНОЙ критической секции: рассылка
// идёт колбэком под мьютексом RoomManager, поэтому порядок в outbox каждого клиента совпадает с
// порядком seq (клиенты отбрасывают seq <= lastSeq — перестановка означала бы потерянный ход).
// Порядок замков: RoomManager.mu → roomHub.mu. Обратного пути нет и быть не должно: методы hub
// не зовут service. broadcast не блокируется (select/default), так что замок комнат он не держит.
func (s *Server) relay(code, token string, payload json.RawMessage) error {
	_, err := s.rooms.AppendRelay(code, token, payload, func(entry service.RelayEntry) {
		s.roomHub.broadcast(code, envelope("relay", entry))
	})
	return err
}

// markDisconnected помечает участника отключённым (reconnect по токену остаётся возможен) и
// рассылает presence оставшимся.
func (s *Server) markDisconnected(code, token, memberID, memberName string) {
	members, _, err := s.rooms.DisconnectMember(code, token)
	if err != nil {
		return
	}
	s.roomHub.broadcast(code, envelope("presence", presencePayload{
		Event:   presenceEvent{Kind: "disconnected", ID: memberID, Name: memberName},
		Members: members,
	}))
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
	if err := json.Unmarshal(msg.Payload, &hello); err != nil {
		return helloPayload{}, errors.New("hello payload must carry a name")
	}
	// Имя без краевых пробелов и не длиннее лимита (обрезаем, не отвергаем); из одних пробелов —
	// то же, что пустое.
	hello.Name = service.NormalizeMemberName(hello.Name)
	if hello.Name == "" {
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

// relayErrorCode — код НЕфатальной ошибки на отклонённый relay (сокет остаётся открытым).
// relay_log_full отделён от общего relay_rejected: для партии он окончателен (комната больше
// не примет ни одного хода), клиенту есть что сказать игроку — «создайте новую комнату».
func relayErrorCode(err error) string {
	if errors.Is(err, service.ErrRelayLogFull) {
		return "relay_log_full"
	}
	return "relay_rejected"
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
