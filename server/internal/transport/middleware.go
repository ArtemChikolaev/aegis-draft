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

// corsMiddleware — кросс-ориджин для браузерных клиентов: фронт живёт на GitHub Pages/TMA,
// API — на Fly, это разные origin по построению (ADR 0002). Куки не используются (auth —
// Bearer в заголовке), поэтому wildcard-origin безопасен: политика «любой сайт может позвать
// публичный API» и так выполняется для не-браузерных клиентов.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
