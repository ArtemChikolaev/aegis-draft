package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/aegis-draft/server/internal/apperr"
	"github.com/aegis-draft/server/internal/auth"
	"github.com/aegis-draft/server/internal/model"
	"github.com/google/uuid"
)

const (
	testBotToken = "123456:AA-Fake-Bot-Token"
	testSecret   = "svc-test-secret-0123456789"
)

// signInitData повторяет алгоритм Telegram — единственный способ получить валидную
// подпись в тесте (сам валидатор бьётся отдельно в internal/telegram).
func signInitData(values url.Values, token string) string {
	secret := hmac256([]byte("WebAppData"), []byte(token))

	keys := make([]string, 0, len(values))
	for k := range values {
		if k != "hash" {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	var b strings.Builder
	for i, k := range keys {
		if i > 0 {
			b.WriteByte('\n')
		}
		b.WriteString(k + "=" + values.Get(k))
	}
	values.Set("hash", hex.EncodeToString(hmac256(secret, []byte(b.String()))))
	return values.Encode()
}

func hmac256(key, msg []byte) []byte {
	m := hmac.New(sha256.New, key)
	m.Write(msg)
	return m.Sum(nil)
}

type fakeStore struct {
	user                             model.User
	created                          bool
	gotProvider, gotUID, gotUsername string
}

func (f *fakeStore) FindOrCreateByIdentity(_ context.Context, provider, uid, username string) (model.User, bool, error) {
	f.gotProvider, f.gotUID, f.gotUsername = provider, uid, username
	return f.user, f.created, nil
}

func newService(t *testing.T, store userStore) (*AuthService, *auth.SessionIssuer) {
	t.Helper()
	iss, err := auth.NewSessionIssuer(testSecret, time.Hour)
	if err != nil {
		t.Fatalf("issuer: %v", err)
	}
	return NewAuthService(testBotToken, time.Hour, store, iss), iss
}

func TestAuthenticateTelegram_HappyPath(t *testing.T) {
	want := model.User{ID: uuid.New()}
	store := &fakeStore{user: want, created: true}
	svc, iss := newService(t, store)

	v := url.Values{
		"auth_date": {itoa(time.Now().Unix())},
		"user":      {`{"id":42,"first_name":"Ada","username":"ada"}`},
	}
	initData := signInitData(v, testBotToken)

	sess, err := svc.AuthenticateTelegram(context.Background(), initData)
	if err != nil {
		t.Fatalf("AuthenticateTelegram: %v", err)
	}
	if !sess.Created || sess.User.ID != want.ID {
		t.Fatalf("session: %+v", sess)
	}
	// В стор ушла telegram-личность с id из initData.
	if store.gotProvider != model.ProviderTelegram || store.gotUID != "42" || store.gotUsername != "ada" {
		t.Fatalf("store got provider=%q uid=%q username=%q", store.gotProvider, store.gotUID, store.gotUsername)
	}
	// Токен валиден и указывает на выданного пользователя.
	got, err := iss.Verify(sess.Token)
	if err != nil {
		t.Fatalf("Verify выданного токена: %v", err)
	}
	if got != want.ID {
		t.Fatalf("token subject: got %v, want %v", got, want.ID)
	}
}

func TestAuthenticateTelegram_BadInitData(t *testing.T) {
	svc, _ := newService(t, &fakeStore{})
	_, err := svc.AuthenticateTelegram(context.Background(), "user=%7B%7D&hash=deadbeef")

	appErr, ok := err.(*apperr.Error)
	if !ok || appErr.Status != 401 {
		t.Fatalf("ожидали apperr 401, got %v", err)
	}
}

func TestAuthenticateTelegram_NoUser(t *testing.T) {
	svc, _ := newService(t, &fakeStore{})
	// Подписанный, но без поля user.
	v := url.Values{"auth_date": {itoa(time.Now().Unix())}}
	initData := signInitData(v, testBotToken)

	_, err := svc.AuthenticateTelegram(context.Background(), initData)
	appErr, ok := err.(*apperr.Error)
	if !ok || appErr.Code != "no_user" {
		t.Fatalf("ожидали apperr no_user, got %v", err)
	}
}

func itoa(n int64) string { return strconv.FormatInt(n, 10) }
