package model

import (
	"time"

	"github.com/google/uuid"
)

// User — личность пользователя приложения. Это НЕ игровой accountId (тот в schema/
// про players/heroes). Способ входа хранится в таблице identities (ADR 0002: «любой один»).
type User struct {
	ID        uuid.UUID
	CreatedAt time.Time
	UpdatedAt time.Time
}

// ProviderTelegram — провайдер входа из initData Telegram (см. internal/telegram). Остальные
// провайдеры ADR 0002 добавляются вместе со своим Validate.
const ProviderTelegram = "telegram"
