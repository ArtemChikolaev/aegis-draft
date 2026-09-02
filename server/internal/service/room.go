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
	"sync"
	"time"

	"github.com/google/uuid"
)

// RoomCapacity — предел людей в комнате: сетка турнира «18 команд» (PRD §5.12).
const RoomCapacity = 18

// Ошибки комнат — доменные; transport маппит их в код протокола/HTTP.
var (
	ErrRoomNotFound    = errors.New("room not found")
	ErrRoomFull        = errors.New("room is full")
	ErrVersionMismatch = errors.New("room versions mismatch")
	ErrMemberNotFound  = errors.New("member not found")
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
	JoinedAt  time.Time
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
// комнату может открыть страница, ещё не загрузившая манифест.
func (m *RoomManager) CreateRoom() *Room {
	m.mu.Lock()
	defer m.mu.Unlock()
	for {
		code := randomRoomCode()
		if _, exists := m.rooms[code]; exists {
			continue
		}
		room := &Room{Code: code, CreatedAt: m.now()}
		m.rooms[code] = room
		return room
	}
}

// JoinRoom — вход/переподключение. token пустой → новый участник; знакомый token →
// reconnect того же участника (без второго «призрака»). Первый вход пинит версии комнаты.
func (m *RoomManager) JoinRoom(code, name, token string, versions RoomVersions) (RoomJoin, error) {
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
		JoinedAt:  now,
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
// только из живого слота.
func (m *RoomManager) AppendRelay(code, token string, payload json.RawMessage) (RelayEntry, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	room, ok := m.rooms[code]
	if !ok {
		return RelayEntry{}, ErrRoomNotFound
	}
	for _, member := range room.members {
		if member.token == token {
			entry := RelayEntry{Seq: len(room.relay) + 1, From: member.ID, Payload: payload}
			room.relay = append(room.relay, entry)
			member.LastSeen = m.now()
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
