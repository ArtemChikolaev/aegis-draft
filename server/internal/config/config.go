// Package config читает конфигурацию сервера из env (секреты не в коде, как в
// пайплайне). Значения по умолчанию — для локального запуска.
package config

import (
	"os"
	"time"
)

type Config struct {
	Env           string // dev|prod
	Port          string // HTTP-порт
	DatabaseURL   string // Postgres DSN; пусто = БД не подключена (skeleton)
	BotToken      string // Telegram bot token; пусто = проверка initData недоступна
	SessionSecret string // ключ подписи сессионных JWT; пусто = auth выключен
	SessionTTL    time.Duration
	ReadTimeout   time.Duration
	WriteTimeout  time.Duration
	IdleTimeout   time.Duration
}

// Load собирает конфиг из env с дефолтами. Секреты (DATABASE_URL, BOT_TOKEN) —
// только из env, не в коде; в проде инъектит `fly secrets set` (см. server/README).
func Load() Config {
	return Config{
		Env:           env("APP_ENV", "dev"),
		Port:          env("PORT", "8080"),
		DatabaseURL:   env("DATABASE_URL", ""),
		BotToken:      env("BOT_TOKEN", ""),
		SessionSecret: env("SESSION_SECRET", ""),
		SessionTTL:    30 * 24 * time.Hour, // 30 дней; веб-вход хочет персистентности
		ReadTimeout:   10 * time.Second,
		WriteTimeout:  15 * time.Second,
		IdleTimeout:   60 * time.Second,
	}
}

func env(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok && value != "" {
		return value
	}
	return fallback
}
