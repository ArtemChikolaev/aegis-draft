package transport

import "net/http"

type healthResponse struct {
	Status string `json:"status"`
	Env    string `json:"env"`
}

// health — liveness-проба. Не трогает БД (это readiness, добавим с T8.2).
func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, healthResponse{Status: "ok", Env: s.env})
}
