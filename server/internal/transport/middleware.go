package transport

import (
	"context"
	"net/http"
	"strings"

	"github.com/aegis-draft/server/internal/apperr"
	"github.com/google/uuid"
)

type ctxKey int

const userIDKey ctxKey = iota

// Verifier проверяет сессионный токен и возвращает userID. Реализуется auth.SessionIssuer.
type Verifier interface {
	Verify(token string) (uuid.UUID, error)
}

// requireAuth — middleware защищённых маршрутов: требует валидный Bearer-токен и кладёт
// userID в контекст (дальше хендлеры берут его через userIDFrom).
func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, ok := bearerToken(r)
		if !ok {
			writeError(w, apperr.Unauthorized("no_token", "missing bearer token"))
			return
		}
		userID, err := s.sessions.Verify(token)
		if err != nil {
			writeError(w, apperr.Unauthorized("bad_token", "invalid session token"))
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userIDKey, userID)))
	})
}

func bearerToken(r *http.Request) (string, bool) {
	const prefix = "Bearer "
	h := r.Header.Get("Authorization")
	if len(h) <= len(prefix) || !strings.EqualFold(h[:len(prefix)], prefix) {
		return "", false
	}
	return strings.TrimSpace(h[len(prefix):]), true
}

func userIDFrom(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(userIDKey).(uuid.UUID)
	return id, ok
}
