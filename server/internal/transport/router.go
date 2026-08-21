// Package transport — HTTP-слой: chi-router, хендлеры, маппинг ошибок.
// Тонкий: бизнес-логику держит service/, доступ к БД — store/ (см. backend-architecture).
package transport

import (
	"context"
	"net/http"
	"time"

	"github.com/aegis-draft/server/internal/config"
	"github.com/aegis-draft/server/internal/service"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// Pinger — минимальная зависимость readiness-пробы. Абстракция, чтобы transport не
// импортировал store напрямую (границы слоёв). Реализуется *store.DB.
type Pinger interface {
	Ping(context.Context) error
}

// Authenticator — зависимость auth-хендлеров. Интерфейс (а не *service.AuthService)
// ради изоляции HTTP-слоя в тестах. Реализуется *service.AuthService.
type Authenticator interface {
	AuthenticateTelegram(ctx context.Context, initData string) (*service.Session, error)
}

// Deps — зависимости сервера. Поля-nil → соответствующие маршруты не регистрируются
// (сервер поднимается в урезанном режиме — напр. без БД/auth локально).
type Deps struct {
	DB       Pinger
	Auth     Authenticator
	Sessions Verifier // проверка Bearer на защищённых маршрутах
	Saves    Saves
	// Rooms — комнаты Arena (MP0). Память одного инстанса, БД не требует.
	Rooms *service.RoomManager
}

// Server держит зависимости хендлеров.
type Server struct {
	env      string
	db       Pinger
	auth     Authenticator
	sessions Verifier
	saves    Saves
	rooms    *service.RoomManager
	roomHub  *roomHub
}

// NewServer собирает сервер из зависимостей. nil-поля Deps выключают свои маршруты.
func NewServer(cfg config.Config, deps Deps) *Server {
	return &Server{
		env: cfg.Env, db: deps.DB, auth: deps.Auth, sessions: deps.Sessions, saves: deps.Saves,
		rooms: deps.Rooms, roomHub: newRoomHub(),
	}
}

// Handler строит корневой http.Handler со стандартным middleware-стеком.
func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()
	r.Use(
		middleware.RequestID,
		middleware.RealIP,
		middleware.Recoverer,
		corsMiddleware, // фронт на Pages/TMA ↔ API на Fly: разные origin по построению
	)

	// ws-комнаты Arena (MP0) живут ВНЕ HTTP-таймаута: соединение долгоживущее, а
	// middleware.Timeout отменил бы его контекст через 30 секунд. Свои дедлайны у
	// сессии есть (hello 10с, чтение 75с) — вечно висеть сокет не может.
	if s.rooms != nil {
		r.Get("/api/ws/rooms/{code}", s.roomSocket)
	}

	// Обычные HTTP-маршруты — под общим таймаутом, как раньше.
	r.Group(func(r chi.Router) {
		r.Use(middleware.Timeout(30 * time.Second))

		r.Get("/healthz", s.health) // liveness: процесс жив (Fly бьёт сюда)
		r.Get("/readyz", s.ready)   // readiness: БД доступна

		// Динамика под /api. Игровые данные НЕ проксируем: static-first через CDN (ADR 0002).
		if s.auth != nil {
			r.Route("/api/auth", func(r chi.Router) {
				r.Post("/telegram", s.authTelegram)
			})
		}
		// Комнаты Arena (MP0): создание — обычный HTTP. Память инстанса — работает и без БД.
		if s.rooms != nil {
			r.Post("/api/rooms", s.createRoom)
		}
		// Облачные сейвы — под Bearer (первый защищённый маршрут). Требуют и сессии, и стор.
		if s.saves != nil && s.sessions != nil {
			r.Route("/api/saves", func(r chi.Router) {
				r.Use(s.requireAuth)
				r.Get("/{kind}", s.getSave)
				r.Put("/{kind}", s.putSave)
			})
		}
	})
	return r
}
