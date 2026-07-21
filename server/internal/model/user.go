package model

import (
	"time"

	"github.com/google/uuid"
)

// User — личность пользователя приложения. Это НЕ игровой accountId (тот в schema/
// про players/heroes). Способ входа хранится в Identity (ADR 0002: «любой один»).
type User struct {
	ID        uuid.UUID
	CreatedAt time.Time
	UpdatedAt time.Time
}

// Identity — привязка внешнего провайдера входа к User.
type Identity struct {
	ID          uuid.UUID
	UserID      uuid.UUID
	Provider    string
	ProviderUID string
	Username    string
	CreatedAt   time.Time
}

// Провайдеры входа. Telegram приходит из initData (см. internal/telegram).
const (
	ProviderTelegram = "telegram"
	ProviderGoogle   = "google"
	ProviderSteam    = "steam"
)
