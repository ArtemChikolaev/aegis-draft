// Package transport — HTTP-слой: chi-router, хендлеры, маппинг ошибок.
// Тонкий: бизнес-логику держит service/, доступ к БД — store/ (см. backend-architecture).
package transport

import (
	"net/http"
	"time"

	"github.com/aegis-draft/server/internal/config"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// Server держит зависимости хендлеров (пока только env; дальше — services).
type Server struct {
	env string
}

func NewServer(cfg config.Config) *Server {
	return &Server{env: cfg.Env}
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

	r.Get("/healthz", s.health)

	// Динамика (аккаунты/сейвы/лидерборд/дейлик) появится здесь под /api — M8.
	// Игровые данные НЕ проксируем: они static-first через CDN (ADR 0002).
	return r
}
