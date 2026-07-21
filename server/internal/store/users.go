package store

import (
	"context"
	"errors"

	"github.com/aegis-draft/server/internal/model"
	"github.com/aegis-draft/server/internal/store/sqlcgen"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// UserRepo — доступ к аккаунтам. Наружу отдаёт доменные model-типы, не sqlcgen:
// верхние слои про sqlc/SQL не знают (граница store).
type UserRepo struct {
	pool *pgxpool.Pool
}

func NewUserRepo(db *DB) *UserRepo { return &UserRepo{pool: db.pool} }

// FindOrCreateByIdentity находит пользователя по внешней личности (provider+uid)
// или создаёт нового вместе с identity в одной транзакции. created=true — если создан.
func (r *UserRepo) FindOrCreateByIdentity(ctx context.Context, provider, uid, username string) (model.User, bool, error) {
	q := sqlcgen.New(r.pool)

	if u, ok, err := r.lookup(ctx, q, provider, uid); err != nil || ok {
		return u, false, err
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return model.User{}, false, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback после Commit — no-op

	qtx := q.WithTx(tx)
	created, err := qtx.CreateUser(ctx)
	if err != nil {
		return model.User{}, false, err
	}
	if _, err := qtx.CreateIdentity(ctx, sqlcgen.CreateIdentityParams{
		UserID:      created.ID,
		Provider:    provider,
		ProviderUid: uid,
		Username:    username,
	}); err != nil {
		// Гонка: параллельный запрос успел создать ту же личность (UNIQUE → 23505).
		// Откатываемся и перечитываем — find-or-create остаётся идемпотентным.
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			_ = tx.Rollback(ctx)
			if u, ok, lerr := r.lookup(ctx, q, provider, uid); lerr == nil && ok {
				return u, false, nil
			}
		}
		return model.User{}, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return model.User{}, false, err
	}
	return toModelUser(created), true, nil
}

// lookup ищет user по identity; ok=false без ошибки, если личности ещё нет.
func (r *UserRepo) lookup(ctx context.Context, q *sqlcgen.Queries, provider, uid string) (model.User, bool, error) {
	idn, err := q.GetIdentity(ctx, sqlcgen.GetIdentityParams{Provider: provider, ProviderUid: uid})
	if errors.Is(err, pgx.ErrNoRows) {
		return model.User{}, false, nil
	}
	if err != nil {
		return model.User{}, false, err
	}
	u, err := q.GetUserByID(ctx, idn.UserID)
	if err != nil {
		return model.User{}, false, err
	}
	return toModelUser(u), true, nil
}

func toModelUser(u sqlcgen.User) model.User {
	return model.User{ID: u.ID, CreatedAt: u.CreatedAt, UpdatedAt: u.UpdatedAt}
}
