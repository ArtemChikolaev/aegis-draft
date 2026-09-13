// Command api — HTTP-сервер aegis-draft (пользовательское/общее состояние).
// Игровые данные остаются static-first на CDN; сервер держит только динамику
// (аккаунты/сейвы/лидерборд/дейлик). См. docs/adr/0002-backend-now.md.
//
//	PORT=8080 go run ./cmd/api
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/aegis-draft/server/internal/auth"
	"github.com/aegis-draft/server/internal/config"
	"github.com/aegis-draft/server/internal/service"
	"github.com/aegis-draft/server/internal/store"
	"github.com/aegis-draft/server/internal/transport"
)

// initDataMaxAge — сколько считаем свежим initData Telegram (защита от повторного
// использования старой подписи). TMA выдаёт новый на каждый запуск.
const initDataMaxAge = 24 * time.Hour

func main() {
	if err := run(); err != nil {
		log.Fatalf("[server] %v", err)
	}
}

// run поднимает сервер и возвращает ошибку вместо log.Fatalf: Fatalf завершает процесс мимо
// defer-ов, и пул Postgres не закрывался бы при падении слушателя или неудачном shutdown.
func run() error {
	cfg := config.Load()
	ctx, stopSignals := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stopSignals()

	var deps transport.Deps

	// БД подключаем, только если задан DATABASE_URL. Без неё сервер поднимается в
	// skeleton-режиме (liveness работает, /readyz рапортует "disabled") — так локально
	// без Postgres/Docker всё запускается, а прод получает БД через fly secrets.
	var db *store.DB
	if cfg.DatabaseURL != "" {
		dbCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		if err := store.Migrate(dbCtx, cfg.DatabaseURL); err != nil {
			cancel()
			return fmt.Errorf("migrate: %w", err)
		}
		var err error
		db, err = store.Open(dbCtx, cfg.DatabaseURL)
		cancel()
		if err != nil {
			return fmt.Errorf("db: %w", err)
		}
		defer db.Close()
		deps.DB = db
		log.Printf("[server] postgres подключён, миграции применены")
	} else {
		log.Printf("[server] DATABASE_URL пуст — режим без БД (только liveness)")
	}

	// Auth включаем, только когда есть всё: БД (аккаунты) + секрет сессии + токен бота.
	// Иначе маршрут /api/auth не регистрируется — сервер живёт в урезанном режиме.
	if db != nil && cfg.SessionSecret != "" && cfg.BotToken != "" {
		issuer, err := auth.NewSessionIssuer(cfg.SessionSecret, cfg.SessionTTL)
		if err != nil {
			return fmt.Errorf("session issuer: %w", err)
		}
		deps.Auth = service.NewAuthService(cfg.BotToken, initDataMaxAge, store.NewUserRepo(db), issuer)
		deps.Sessions = issuer                                     // проверка Bearer на защищённых ручках
		deps.Saves = service.NewSaveService(store.NewSaveRepo(db)) // облачные сейвы (T8.4)
		log.Printf("[server] auth + сейвы включены (telegram)")
	} else {
		log.Printf("[server] auth выключен (нужны DATABASE_URL + SESSION_SECRET + BOT_TOKEN)")
	}

	// Комнаты Arena (MP0): память инстанса, БД не нужна — включены всегда. Janitor чистит
	// брошенные лобби (все офлайн > 1 часа), чтобы память одного инстанса не текла.
	rooms := service.NewRoomManager(nil)
	deps.Rooms = rooms
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if removed := rooms.PruneRooms(time.Hour); removed > 0 {
					log.Printf("[rooms] pruned %d abandoned room(s)", removed)
				}
			}
		}
	}()

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      transport.NewServer(cfg, deps).Handler(),
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
		IdleTimeout:  cfg.IdleTimeout,
	}

	// Слушатель сообщает об ошибке в канал, а не через Fatalf: defer-ы run() отработают.
	listenErr := make(chan error, 1)
	go func() {
		log.Printf("[server] listening on %s (env=%s)", srv.Addr, cfg.Env)
		listenErr <- srv.ListenAndServe()
	}()

	// Graceful shutdown по SIGINT/SIGTERM.
	select {
	case err := <-listenErr:
		return fmt.Errorf("listen: %w", err)
	case <-ctx.Done():
	}
	stopSignals() // повторный сигнал во время shutdown завершает процесс сразу

	log.Printf("[server] shutting down…")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	log.Printf("[server] stopped")
	return nil
}
