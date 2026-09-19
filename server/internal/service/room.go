// Комнаты Arena (MP0, BACKLOG M10): state-machine лобби БЕЗ сети — transport делает только
// upgrade и кодек протокола (границы ADR 0002). Комнаты живут в памяти одного инстанса
// (Fly v1 — один инстанс, шардинг не нужен); рестарт сервера честно теряет лобби, это
// принятая цена MP0 (игровое состояние забега здесь не живёт).
//
// Ключевые правила:
//   - Комната ПИНИТ версии датасета/баланса первым джойном: клиент с другими версиями получает
//     отказ «обнови» — иначе пулы драфта рассинхронизируются (спека MP0).
//   - Reconnect по токену ЗАМЕНЯЕТ участника, а не добавляет второго: призраки запрещены DoD.
//   - Вместимость = 18 (число команд классической сетки): недобор добьют боты (MP1).
package service

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"math/big"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// RoomCapacity — предел людей в комнате: сетка турнира «18 команд» (PRD §5.12).
const RoomCapacity = 18

// Потолки памяти: комнаты и их relay-логи живут в RAM одного инстанса (VM 256 МБ), а лог при
// входе/reconnect уходит клиенту целиком одним сообщением.
//
// MaxRelayEntries. Реальный максимум матча Арены: start + 10 раундов × (18 пиков + close) = 191
// запись. Серия Дуэли Bo5 ≈ 5 × (10 пиков игроков + до 4 рероллов + ~14 шагов героев + next) +
// start ≈ 150, но реванши копятся в той же комнате. 1024 = Арена ×5 или ~6 серий Bo5 подряд;
// дальше — relay отклоняется, игрокам нужна новая комната.
//
// MaxRelayBytes — настоящий предохранитель памяти: записей мало, но каждая ограничена только
// пределом ws-сообщения (16 КиБ). Легитимный лог — это ~5 КиБ start Арены + записи по 40–80 байт,
// то есть ≤ 20 КиБ на матч и ≤ ~100 КиБ на забитую реваншами Дуэль; 256 КиБ — запас ×2.5–12.
//
// MaxRooms: худший случай 500 × 256 КиБ ≈ 125 МиБ — влезает в VM вместе с процессом. Брошенные
// комнаты снимает PruneRooms (TTL час), так что потолок упирается только при живом наплыве.
const (
	MaxRooms        = 500
	MaxRelayEntries = 1024
	MaxRelayBytes   = 256 << 10
)

// MaxMemberNameRunes — предел длины имени участника. Имя уходит в каждый presence всем и в
// start-сообщение Арены; поле ввода на фронте короче, так что лимит режет только чужие клиенты.
// Длинное имя ОБРЕЗАЕТСЯ, а не отвергается: вход в комнату не должен ломаться из-за ника.
const MaxMemberNameRunes = 32

// NormalizeMemberName — каноническая форма имени: без краевых пробелов, не длиннее лимита.
func NormalizeMemberName(name string) string {
	name = strings.TrimSpace(name)
	if runes := []rune(name); len(runes) > MaxMemberNameRunes {
		name = strings.TrimSpace(string(runes[:MaxMemberNameRunes]))
	}
	return name
}

// Ошибки комнат — доменные; transport маппит их в код протокола/HTTP.
var (
	ErrRoomNotFound    = errors.New("room not found")
	ErrRoomFull        = errors.New("room is full")
	ErrVersionMismatch = errors.New("room versions mismatch")
	ErrMemberNotFound  = errors.New("member not found")
	ErrTooManyRooms    = errors.New("too many rooms")
	ErrRelayLogFull    = errors.New("room relay log is full")
)

// RoomVersions — совместимость клиента: те же оси, что у сейва/share-ссылки
// (runPersist/runLink на фронте). Пустой dataHash легален (клиент мог не знать его на
// момент hello), остальные поля обязательны и сравниваются строго.
type RoomVersions struct {
	SchemaVersion        int    `json:"schemaVersion"`
	RatingModelVersion   string `json:"ratingModelVersion"`
	DataHash             string `json:"dataHash,omitempty"`
	BalanceConfigVersion string `json:"balanceConfigVersion"`
}

func (v RoomVersions) matches(other RoomVersions) bool {
	if v.SchemaVersion != other.SchemaVersion ||
		v.RatingModelVersion != other.RatingModelVersion ||
		v.BalanceConfigVersion != other.BalanceConfigVersion {
		return false
	}
	// dataHash сверяем, только если известен обеим сторонам: паки должны совпасть байт-в-байт.
	if v.DataHash != "" && other.DataHash != "" && v.DataHash != other.DataHash {
		return false
	}
	return true
}

// RoomMember — участник лобби. Token — секрет reconnection (наружу уходит только владельцу).
type RoomMember struct {
	ID        string
	Name      string
	Connected bool
	LastSeen  time.Time
	token     string
}

// RoomMemberView — то, что видят ВСЕ участники (без чужих токенов).
type RoomMemberView struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Connected bool   `json:"connected"`
}

// Room — лобби. Поля читаются только под мьютексом менеджера (методы ниже).
type Room struct {
	Code      string
	CreatedAt time.Time
	versions  *RoomVersions // nil до первого джойна — он и пинит
	members   []*RoomMember // порядок входа стабилен (посадка/змейка MP2 обопрётся на него)
	relay     []RelayEntry  // упорядоченный лог relay-сообщений (Дуэль M-DUEL; Arena MP2 — тот же слой)
	// relayBytes — суммарный размер payload лога (потолок MaxRelayBytes).
	relayBytes int
}

// RelayEntry — одно упорядоченное сообщение комнаты. Сервер режима НЕ понимает: он источник
// ПОРЯДКА и ОТПРАВИТЕЛЯ, полезная нагрузка непрозрачна (протокол режима — на клиентах,
// детерминированная логика обеих сторон применяет один и тот же лог). Лог в памяти комнаты:
// reconnect получает его целиком и реплеит с нуля; рестарт сервера честно теряет партию —
// та же принятая цена, что у лобби MP0.
type RelayEntry struct {
	Seq     int             `json:"seq"`
	From    string          `json:"from"`
	Payload json.RawMessage `json:"payload"`
}

// RoomJoin — результат JoinRoom: всё, что нужно transport для welcome + presence.
type RoomJoin struct {
	Member      *RoomMember
	Token       string
	Reconnected bool
	Versions    RoomVersions
	Members     []RoomMemberView
}

// RoomManager — все комнаты инстанса. Потокобезопасен.
type RoomManager struct {
	mu    sync.Mutex
	rooms map[string]*Room
	now   func() time.Time
}

func NewRoomManager(now func() time.Time) *RoomManager {
	if now == nil {
		now = time.Now
	}
	return &RoomManager{rooms: make(map[string]*Room), now: now}
}

// Алфавит кодов без неоднозначных символов (0/O, 1/I): код диктуют голосом в войсе.
const roomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const roomCodeLength = 5

func randomRoomCode() string {
	out := make([]byte, roomCodeLength)
	max := big.NewInt(int64(len(roomCodeAlphabet)))
	for i := range out {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			// crypto/rand не отвечает только при сломанной системе; комнатному коду хватит
			// детерминированного фолбэка, уникальность всё равно проверяется по map.
			out[i] = roomCodeAlphabet[i%len(roomCodeAlphabet)]
			continue
		}
		out[i] = roomCodeAlphabet[n.Int64()]
	}
	return string(out)
}

// CreateRoom создаёт пустое лобби и возвращает код. Версии пинит ПЕРВЫЙ джойн, не создание:
// комнату может открыть страница, ещё не загрузившая манифест. Потолок MaxRooms —
// ErrTooManyRooms: память инстанса конечна, а создание комнаты ничем не авторизовано.
func (m *RoomManager) CreateRoom() (*Room, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.rooms) >= MaxRooms {
		return nil, ErrTooManyRooms
	}
	for {
		code := randomRoomCode()
		if _, exists := m.rooms[code]; exists {
			continue
		}
		room := &Room{Code: code, CreatedAt: m.now()}
		m.rooms[code] = room
		return room, nil
	}
}

// JoinRoom — вход/переподключение. token пустой → новый участник; знакомый token →
// reconnect того же участника (без второго «призрака»). Первый вход пинит версии комнаты.
func (m *RoomManager) JoinRoom(code, name, token string, versions RoomVersions) (RoomJoin, error) {
	name = NormalizeMemberName(name)
	m.mu.Lock()
	defer m.mu.Unlock()
	room, ok := m.rooms[code]
	if !ok {
		return RoomJoin{}, ErrRoomNotFound
	}
	if room.versions == nil {
		pinned := versions
		room.versions = &pinned
	} else if !room.versions.matches(versions) {
		return RoomJoin{}, ErrVersionMismatch
	}

	now := m.now()
	if token != "" {
		for _, member := range room.members {
			if member.token == token {
				member.Connected = true
				member.LastSeen = now
				if name != "" {
					member.Name = name
				}
				return RoomJoin{
					Member: member, Token: member.token, Reconnected: true,
					Versions: *room.versions, Members: room.memberViews(),
				}, nil
			}
		}
		// Неизвестный токен (комната пересоздана после рестарта) — обычный новый вход.
	}

	if len(room.members) >= RoomCapacity {
		return RoomJoin{}, ErrRoomFull
	}
	member := &RoomMember{
		ID:        uuid.NewString(),
		Name:      name,
		Connected: true,
		LastSeen:  now,
		token:     uuid.NewString(),
	}
	room.members = append(room.members, member)
	return RoomJoin{
		Member: member, Token: member.token, Reconnected: false,
		Versions: *room.versions, Members: room.memberViews(),
	}, nil
}

// DisconnectMember — обрыв сокета: участник остаётся в комнате (reconnect по токену),
// но помечается отключённым.
func (m *RoomManager) DisconnectMember(code, token string) ([]RoomMemberView, *RoomMember, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	room, ok := m.rooms[code]
	if !ok {
		return nil, nil, ErrRoomNotFound
	}
	for _, member := range room.members {
		if member.token == token {
			member.Connected = false
			member.LastSeen = m.now()
			return room.memberViews(), member, nil
		}
	}
	return nil, nil, ErrMemberNotFound
}

// LeaveRoom — явный выход: участник удаляется (его слот освобождается).
func (m *RoomManager) LeaveRoom(code, token string) ([]RoomMemberView, *RoomMember, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	room, ok := m.rooms[code]
	if !ok {
		return nil, nil, ErrRoomNotFound
	}
	for index, member := range room.members {
		if member.token == token {
			room.members = append(room.members[:index], room.members[index+1:]...)
			return room.memberViews(), member, nil
		}
	}
	return nil, nil, ErrMemberNotFound
}

// AppendRelay добавляет relay-сообщение в лог комнаты от участника с данным токеном и
// возвращает проштампованную запись (seq и подтверждённый серверм ID отправителя — клиенту
// поле from доверять нельзя). Неизвестный токен — ErrMemberNotFound: писать в лог можно
// только из живого слота. Лог упёрся в MaxRelayEntries/MaxRelayBytes — ErrRelayLogFull.
//
// deliver (может быть nil) вызывается ПОД мьютексом менеджера сразу после штампа — штамп seq и
// постановка записи в очереди получателей образуют одну критическую секцию, поэтому порядок
// вызовов deliver совпадает с порядком seq. Без этого два одновременных relay могли уйти клиентам
// как 6, 5: клиент отбрасывает seq <= lastSeq, и ход терялся у всех онлайн, оставаясь в логе.
// Контракт deliver: не блокироваться (только неблокирующая постановка в очередь) и не звать
// методы менеджера — иначе взаимная блокировка.
func (m *RoomManager) AppendRelay(code, token string, payload json.RawMessage, deliver func(RelayEntry)) (RelayEntry, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	room, ok := m.rooms[code]
	if !ok {
		return RelayEntry{}, ErrRoomNotFound
	}
	for _, member := range room.members {
		if member.token == token {
			if len(room.relay) >= MaxRelayEntries || room.relayBytes+len(payload) > MaxRelayBytes {
				return RelayEntry{}, ErrRelayLogFull
			}
			entry := RelayEntry{Seq: len(room.relay) + 1, From: member.ID, Payload: payload}
			room.relay = append(room.relay, entry)
			room.relayBytes += len(payload)
			member.LastSeen = m.now()
			if deliver != nil {
				deliver(entry)
			}
			return entry, nil
		}
	}
	return RelayEntry{}, ErrMemberNotFound
}

// RelayLog — копия лога комнаты (для реплея при входе/reconnect).
func (m *RoomManager) RelayLog(code string) ([]RelayEntry, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	room, ok := m.rooms[code]
	if !ok {
		return nil, ErrRoomNotFound
	}
	out := make([]RelayEntry, len(room.relay))
	copy(out, room.relay)
	return out, nil
}

// PruneRooms удаляет комнаты, где никого нет онлайн дольше ttl (и пустые старше ttl):
// память одного инстанса не должна течь от брошенных лобби. Возвращает число удалённых.
func (m *RoomManager) PruneRooms(ttl time.Duration) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := m.now()
	removed := 0
	for code, room := range m.rooms {
		lastAlive := room.CreatedAt
		anyConnected := false
		for _, member := range room.members {
			if member.Connected {
				anyConnected = true
				break
			}
			if member.LastSeen.After(lastAlive) {
				lastAlive = member.LastSeen
			}
		}
		if !anyConnected && now.Sub(lastAlive) > ttl {
			delete(m.rooms, code)
			removed++
		}
	}
	return removed
}

func (r *Room) memberViews() []RoomMemberView {
	out := make([]RoomMemberView, 0, len(r.members))
	for _, member := range r.members {
		out = append(out, RoomMemberView{ID: member.ID, Name: member.Name, Connected: member.Connected})
	}
	return out
}
