// Package transport — HTTP-слой: chi-router, хендлеры, маппинг ошибок.
// Тонкий: бизнес-логику держит service/, доступ к БД — store/ (см. backend-architecture).
package transport

import (
	"context"
	"net/http"
	"time"

	"github.com/aegis-draft/server/internal/config"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// Pinger — минимальная зависимость readiness-пробы. Абстракция, чтобы transport не
// импортировал store напрямую (границы слоёв). Реализуется *store.DB.
type Pinger interface {
	Ping(context.Context) error
}

// Server держит зависимости хендлеров (env + readiness-проба; дальше — services).
type Server struct {
	env string
	db  Pinger // nil, если сервер поднят без БД (DATABASE_URL пуст)
}

// NewServer собирает сервер. db может быть nil — тогда /readyz рапортует "disabled".
func NewServer(cfg config.Config, db Pinger) *Server {
	return &Server{env: cfg.Env, db: db}
}

// Handler строит корневой http.Handler со стандартным middleware-стеком.
func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()
	r.Use(
		middleware.RequestID,
		middleware.RealIP,
		middleware.Recoverer,
		middleware.Timeout(30*time.Second),
	)

	r.Get("/healthz", s.health) // liveness: процесс жив (Fly бьёт сюда)
	r.Get("/readyz", s.ready)   // readiness: БД доступна

	// Динамика (аккаунты/сейвы/лидерборд/дейлик) появится здесь под /api — M8.
	// Игровые данные НЕ проксируем: они static-first через CDN (ADR 0002).
	return r
}
