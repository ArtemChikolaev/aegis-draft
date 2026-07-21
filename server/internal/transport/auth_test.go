package transport

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/aegis-draft/server/internal/apperr"
	"github.com/aegis-draft/server/internal/config"
	"github.com/aegis-draft/server/internal/model"
	"github.com/aegis-draft/server/internal/service"
	"github.com/google/uuid"
)

// fakeAuth изолирует HTTP-слой от логики валидации/БД: транспорт-тест проверяет
// разбор тела, статусы и маппинг ошибок, а не подпись initData (это service_test).
type fakeAuth struct {
	sess *service.Session
	err  error
}

func (f *fakeAuth) AuthenticateTelegram(_ context.Context, _ string) (*service.Session, error) {
	return f.sess, f.err
}

func newAuthHandler(a Authenticator) http.Handler {
	return NewServer(config.Config{Env: "test"}, Deps{Auth: a}).Handler()
}

func TestAuthTelegram_OK(t *testing.T) {
	id := uuid.New()
	h := newAuthHandler(&fakeAuth{sess: &service.Session{
		Token:   "jwt.abc.def",
		User:    model.User{ID: id},
		Created: true,
	}})

	req := httptest.NewRequest(http.MethodPost, "/api/auth/telegram", strings.NewReader(`{"initData":"x"}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %s)", rec.Code, rec.Body)
	}
	var body authTelegramResponse
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Token != "jwt.abc.def" || body.User.ID != id.String() || !body.Created {
		t.Fatalf("body = %+v", body)
	}
}

func TestAuthTelegram_MissingInitData(t *testing.T) {
	h := newAuthHandler(&fakeAuth{})
	req := httptest.NewRequest(http.MethodPost, "/api/auth/telegram", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestAuthTelegram_Unauthorized(t *testing.T) {
	h := newAuthHandler(&fakeAuth{err: apperr.Unauthorized("bad_init_data", "invalid")})
	req := httptest.NewRequest(http.MethodPost, "/api/auth/telegram", strings.NewReader(`{"initData":"bad"}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestAuthTelegram_RouteAbsentWithoutAuth(t *testing.T) {
	// Без Auth в Deps маршрут не регистрируется — сервер без БД/секрета.
	h := NewServer(config.Config{Env: "test"}, Deps{}).Handler()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/telegram", strings.NewReader(`{"initData":"x"}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (маршрут должен отсутствовать)", rec.Code)
	}
}
