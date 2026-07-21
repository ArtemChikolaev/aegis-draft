package service

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/aegis-draft/server/internal/apperr"
	"github.com/aegis-draft/server/internal/model"
	"github.com/aegis-draft/server/internal/telegram"
	"github.com/google/uuid"
)

// userStore — часть store.UserRepo, нужная сервису (зависим от интерфейса, не от БД).
type userStore interface {
	FindOrCreateByIdentity(ctx context.Context, provider, uid, username string) (model.User, bool, error)
}

// tokenIssuer — часть auth.SessionIssuer, нужная сервису.
type tokenIssuer interface {
	Issue(userID uuid.UUID) (string, error)
}

// AuthService связывает готовые куски: проверка Telegram initData → аккаунт → сессия.
type AuthService struct {
	botToken       string
	initDataMaxAge time.Duration
	users          userStore
	issuer         tokenIssuer
}

func NewAuthService(botToken string, initDataMaxAge time.Duration, users userStore, issuer tokenIssuer) *AuthService {
	return &AuthService{botToken: botToken, initDataMaxAge: initDataMaxAge, users: users, issuer: issuer}
}

// Session — результат аутентификации: сессионный токен и аккаунт.
type Session struct {
	Token   string
	User    model.User
	Created bool // true, если аккаунт создан этим входом
}

// AuthenticateTelegram проверяет initData, находит/создаёт аккаунт по telegram-личности
// и выпускает сессионный токен. Ошибки клиента → 401; проблемы сервера → 500.
func (s *AuthService) AuthenticateTelegram(ctx context.Context, initData string) (*Session, error) {
	data, err := telegram.Validate(initData, s.botToken, s.initDataMaxAge)
	if err != nil {
		if errors.Is(err, telegram.ErrEmptyToken) {
			// Не сконфигурен BOT_TOKEN — это дефект сервера, не вина клиента.
			return nil, apperr.Internal("bot token not configured")
		}
		return nil, apperr.Unauthorized("bad_init_data", "invalid Telegram initData")
	}
	if data.User.ID == 0 {
		// initData без поля user (напр. inline-режим) — личности нет, входить нечем.
		return nil, apperr.Unauthorized("no_user", "initData without user")
	}

	uid := strconv.FormatInt(data.User.ID, 10)
	user, created, err := s.users.FindOrCreateByIdentity(ctx, model.ProviderTelegram, uid, data.User.Username)
	if err != nil {
		return nil, apperr.Internal("account lookup failed")
	}

	token, err := s.issuer.Issue(user.ID)
	if err != nil {
		return nil, apperr.Internal("token issue failed")
	}
	return &Session{Token: token, User: user, Created: created}, nil
}
