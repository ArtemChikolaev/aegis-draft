package transport

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/aegis-draft/server/internal/apperr"
)

type authTelegramRequest struct {
	InitData string `json:"initData"`
}

type authTelegramResponse struct {
	Token   string  `json:"token"`
	User    userDTO `json:"user"`
	Created bool    `json:"created"`
}

type userDTO struct {
	ID string `json:"id"`
}

// authTelegram: клиент шлёт сырой initData Telegram → сервер проверяет подпись,
// находит/создаёт аккаунт и возвращает сессионный JWT (Bearer). Тело ограничено —
// initData маленький, огромный body принимать незачем.
func (s *Server) authTelegram(w http.ResponseWriter, r *http.Request) {
	var req authTelegramRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&req); err != nil {
		writeError(w, apperr.BadRequest("bad_json", "invalid request body"))
		return
	}
	if req.InitData == "" {
		writeError(w, apperr.BadRequest("missing_init_data", "initData required"))
		return
	}

	sess, err := s.auth.AuthenticateTelegram(r.Context(), req.InitData)
	if err != nil {
		writeError(w, err) // *apperr.Error → корректный статус; прочее → 500
		return
	}
	writeJSON(w, http.StatusOK, authTelegramResponse{
		Token:   sess.Token,
		User:    userDTO{ID: sess.User.ID.String()},
		Created: sess.Created,
	})
}
