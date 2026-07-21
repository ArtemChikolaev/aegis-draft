package transport

import (
	"context"
	"net/http"
	"time"
)

type healthResponse struct {
	Status string `json:"status"`
	Env    string `json:"env"`
}

// health — liveness-проба. Не трогает БД: сигнал «процесс жив», а не «готов».
func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, healthResponse{Status: "ok", Env: s.env})
}

type readyResponse struct {
	Status string `json:"status"`
	DB     string `json:"db"`
}

// ready — readiness-проба: пингует БД. Без БД (DATABASE_URL пуст) рапортует
// "disabled" и 200 — сервер намеренно работает в режиме без динамики.
func (s *Server) ready(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		writeJSON(w, http.StatusOK, readyResponse{Status: "ok", DB: "disabled"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.db.Ping(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, readyResponse{Status: "unready", DB: "down"})
		return
	}
	writeJSON(w, http.StatusOK, readyResponse{Status: "ok", DB: "up"})
}
