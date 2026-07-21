// Command api — HTTP-сервер aegis-draft (пользовательское/общее состояние).
// Игровые данные остаются static-first на CDN; сервер держит только динамику
// (аккаунты/сейвы/лидерборд/дейлик). См. docs/adr/0002-backend-now.md.
//
//	PORT=8080 go run ./cmd/api
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/aegis-draft/server/internal/config"
	"github.com/aegis-draft/server/internal/store"
	"github.com/aegis-draft/server/internal/transport"
)

func main() {
	cfg := config.Load()

	// БД подключаем, только если задан DATABASE_URL. Без неё сервер поднимается в
	// skeleton-режиме (liveness работает, /readyz рапортует "disabled") — так локально
	// без Postgres/Docker всё запускается, а прод получает БД через fly secrets.
	var pinger transport.Pinger
	if cfg.DatabaseURL != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		if err := store.Migrate(ctx, cfg.DatabaseURL); err != nil {
			cancel()
			log.Fatalf("[server] migrate: %v", err)
		}
		db, err := store.Open(ctx, cfg.DatabaseURL)
		cancel()
		if err != nil {
			log.Fatalf("[server] db: %v", err)
		}
		defer db.Close()
		pinger = db // non-nil интерфейс только когда БД реально есть (иначе typed-nil)
		log.Printf("[server] postgres подключён, миграции применены")
	} else {
		log.Printf("[server] DATABASE_URL пуст — режим без БД (только liveness)")
	}

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      transport.NewServer(cfg, pinger).Handler(),
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
		IdleTimeout:  cfg.IdleTimeout,
	}

	// Graceful shutdown по SIGINT/SIGTERM.
	go func() {
		log.Printf("[server] listening on %s (env=%s)", srv.Addr, cfg.Env)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("[server] listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	log.Printf("[server] shutting down…")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("[server] shutdown: %v", err)
	}
	log.Printf("[server] stopped")
}
