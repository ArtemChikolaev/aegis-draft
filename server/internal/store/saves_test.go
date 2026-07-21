package store

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/aegis-draft/server/internal/model"
)

func TestSaves_UpsertGet_AndConflict(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	// Заводим пользователя-владельца сейва.
	uid := "tg-save-" + time.Now().Format("150405.000000000")
	user, _, err := NewUserRepo(db).FindOrCreateByIdentity(ctx, model.ProviderTelegram, uid, "saver")
	if err != nil {
		t.Fatalf("user: %v", err)
	}

	saves := NewSaveRepo(db)

	// Первая запись: base_rev=0 → вставка, rev становится 1.
	s1, err := saves.Upsert(ctx, model.SaveWrite{
		UserID: user.ID, Kind: model.SaveKindRun,
		Payload: []byte(`{"step":1}`), BaseRev: 0, SchemaVersion: "s1", RatingModelVersion: "r1",
	})
	if err != nil {
		t.Fatalf("первая запись: %v", err)
	}
	if s1.Rev != 1 {
		t.Fatalf("rev после вставки = %d, want 1", s1.Rev)
	}

	// Чтение возвращает записанное (payload сравниваем семантически: jsonb переформатирует).
	got, err := saves.Get(ctx, user.ID, model.SaveKindRun)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	var payload struct {
		Step int `json:"step"`
	}
	if err := json.Unmarshal(got.Payload, &payload); err != nil {
		t.Fatalf("payload не JSON: %v", err)
	}
	if got.Rev != 1 || payload.Step != 1 {
		t.Fatalf("get вернул rev=%d step=%d, want rev=1 step=1", got.Rev, payload.Step)
	}

	// Обновление с корректным base_rev=1 → rev 2.
	s2, err := saves.Upsert(ctx, model.SaveWrite{
		UserID: user.ID, Kind: model.SaveKindRun,
		Payload: []byte(`{"step":2}`), BaseRev: 1,
	})
	if err != nil {
		t.Fatalf("обновление: %v", err)
	}
	if s2.Rev != 2 {
		t.Fatalf("rev после обновления = %d, want 2", s2.Rev)
	}

	// Устаревшая запись (base_rev=1, а на сервере уже 2) → конфликт + актуальный сейв.
	current, err := saves.Upsert(ctx, model.SaveWrite{
		UserID: user.ID, Kind: model.SaveKindRun,
		Payload: []byte(`{"step":99}`), BaseRev: 1,
	})
	if !errors.Is(err, model.ErrSaveConflict) {
		t.Fatalf("ожидали ErrSaveConflict, got %v", err)
	}
	if current.Rev != 2 {
		t.Fatalf("при конфликте вернулся rev %d, want актуальный 2", current.Rev)
	}
}

func TestSaves_GetNotFound(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	uid := "tg-nf-" + time.Now().Format("150405.000000000")
	user, _, err := NewUserRepo(db).FindOrCreateByIdentity(ctx, model.ProviderTelegram, uid, "nf")
	if err != nil {
		t.Fatalf("user: %v", err)
	}

	if _, err := NewSaveRepo(db).Get(ctx, user.ID, model.SaveKindCareer); !errors.Is(err, model.ErrSaveNotFound) {
		t.Fatalf("ожидали ErrSaveNotFound, got %v", err)
	}
}
