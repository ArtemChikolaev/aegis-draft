package store

import (
	"context"
	"database/sql"
	"embed"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib" // database/sql-драйвер "pgx" для goose-миграций
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// DB — пул соединений с Postgres. Единственная точка доступа к БД (слой store).
type DB struct {
	pool *pgxpool.Pool
}

// Open открывает пул и проверяет связь ping-ом (иначе ошибка конфигурации всплывёт
// только на первом запросе).
func Open(ctx context.Context, dsn string) (*DB, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("store: pgxpool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("store: ping: %w", err)
	}
	return &DB{pool: pool}, nil
}

// Close закрывает пул.
func (db *DB) Close() { db.pool.Close() }

// Ping — readiness-проба (обслуживает /readyz).
func (db *DB) Ping(ctx context.Context) error { return db.pool.Ping(ctx) }

// Migrate прогоняет goose-миграции из embed. Идемпотентно, безопасно вызывать на
// старте. Работает через database/sql поверх pgx-stdlib — goose оперирует *sql.DB.
func Migrate(ctx context.Context, dsn string) error {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return fmt.Errorf("store: open for migrate: %w", err)
	}
	defer db.Close()

	goose.SetBaseFS(migrationsFS)
	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("store: goose dialect: %w", err)
	}
	if err := goose.UpContext(ctx, db, "migrations"); err != nil {
		return fmt.Errorf("store: migrate up: %w", err)
	}
	return nil
}
