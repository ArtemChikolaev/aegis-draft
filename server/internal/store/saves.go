package store

import (
	"context"
	"errors"

	"github.com/aegis-draft/server/internal/model"
	"github.com/aegis-draft/server/internal/store/sqlcgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SaveRepo — доступ к облачным сейвам.
type SaveRepo struct {
	pool *pgxpool.Pool
}

func NewSaveRepo(db *DB) *SaveRepo { return &SaveRepo{pool: db.pool} }

// Get возвращает сейв или model.ErrSaveNotFound.
func (r *SaveRepo) Get(ctx context.Context, userID uuid.UUID, kind string) (model.Save, error) {
	q := sqlcgen.New(r.pool)
	row, err := q.GetSave(ctx, sqlcgen.GetSaveParams{UserID: userID, Kind: kind})
	if errors.Is(err, pgx.ErrNoRows) {
		return model.Save{}, model.ErrSaveNotFound
	}
	if err != nil {
		return model.Save{}, err
	}
	return model.Save{
		Kind:               row.Kind,
		Payload:            row.Payload,
		Rev:                row.Rev,
		SchemaVersion:      row.SchemaVersion,
		RatingModelVersion: row.RatingModelVersion,
		UpdatedAt:          row.UpdatedAt,
	}, nil
}

// Upsert применяет запись с CAS по rev. При несовпадении rev возвращает model.ErrSaveConflict
// и текущий серверный сейв (для мержа/перечитывания на клиенте).
func (r *SaveRepo) Upsert(ctx context.Context, w model.SaveWrite) (model.Save, error) {
	q := sqlcgen.New(r.pool)
	row, err := q.UpsertSave(ctx, sqlcgen.UpsertSaveParams{
		UserID:             w.UserID,
		Kind:               w.Kind,
		Payload:            []byte(w.Payload),
		SchemaVersion:      w.SchemaVersion,
		RatingModelVersion: w.RatingModelVersion,
		BaseRev:            w.BaseRev,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		// Пустой RETURNING = CAS не прошёл (rev на сервере уже другой). Отдаём текущий.
		current, gerr := r.Get(ctx, w.UserID, w.Kind)
		if gerr != nil {
			return model.Save{}, gerr
		}
		return current, model.ErrSaveConflict
	}
	if err != nil {
		return model.Save{}, err
	}
	return model.Save{
		Kind:               row.Kind,
		Payload:            row.Payload,
		Rev:                row.Rev,
		SchemaVersion:      row.SchemaVersion,
		RatingModelVersion: row.RatingModelVersion,
		UpdatedAt:          row.UpdatedAt,
	}, nil
}
