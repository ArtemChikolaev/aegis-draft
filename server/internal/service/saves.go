package service

import (
	"context"
	"errors"

	"github.com/aegis-draft/server/internal/apperr"
	"github.com/aegis-draft/server/internal/model"
	"github.com/google/uuid"
)

// saveStore — часть store.SaveRepo, нужная сервису (зависим от интерфейса, не от БД).
type saveStore interface {
	Get(ctx context.Context, userID uuid.UUID, kind string) (model.Save, error)
	Upsert(ctx context.Context, w model.SaveWrite) (model.Save, error)
}

// SaveService — облачные сейвы поверх аккаунта. Содержимое не интерпретирует.
type SaveService struct {
	saves saveStore
}

func NewSaveService(saves saveStore) *SaveService { return &SaveService{saves: saves} }

// Get возвращает сейв вида kind. Нет сейва → 404, неизвестный kind → 400.
func (s *SaveService) Get(ctx context.Context, userID uuid.UUID, kind string) (*model.Save, error) {
	if !model.ValidSaveKind(kind) {
		return nil, apperr.BadRequest("bad_kind", "unknown save kind")
	}
	sv, err := s.saves.Get(ctx, userID, kind)
	if errors.Is(err, model.ErrSaveNotFound) {
		return nil, apperr.NotFound("no_save", "save not found")
	}
	if err != nil {
		return nil, apperr.Internal("save read failed")
	}
	return &sv, nil
}

// Put применяет запись сейва (CAS по BaseRev). При конфликте rev возвращает 409 И
// актуальный серверный сейв (первым значением) — клиент по нему мёржит/перечитывает.
func (s *SaveService) Put(ctx context.Context, w model.SaveWrite) (*model.Save, error) {
	if !model.ValidSaveKind(w.Kind) {
		return nil, apperr.BadRequest("bad_kind", "unknown save kind")
	}
	if len(w.Payload) == 0 {
		return nil, apperr.BadRequest("empty_payload", "payload required")
	}
	sv, err := s.saves.Upsert(ctx, w)
	if errors.Is(err, model.ErrSaveConflict) {
		return &sv, apperr.Conflict("rev_conflict", "save revision conflict")
	}
	if err != nil {
		return nil, apperr.Internal("save write failed")
	}
	return &sv, nil
}
