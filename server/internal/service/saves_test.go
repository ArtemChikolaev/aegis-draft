package service

import (
	"context"
	"testing"

	"github.com/aegis-draft/server/internal/apperr"
	"github.com/aegis-draft/server/internal/model"
	"github.com/google/uuid"
)

type fakeSaveStore struct {
	getSave  model.Save
	getErr   error
	upSave   model.Save
	upErr    error
	gotWrite model.SaveWrite
}

func (f *fakeSaveStore) Get(_ context.Context, _ uuid.UUID, _ string) (model.Save, error) {
	return f.getSave, f.getErr
}

func (f *fakeSaveStore) Upsert(_ context.Context, w model.SaveWrite) (model.Save, error) {
	f.gotWrite = w
	return f.upSave, f.upErr
}

func appErrCode(t *testing.T, err error) string {
	t.Helper()
	ae, ok := err.(*apperr.Error)
	if !ok {
		t.Fatalf("ожидали *apperr.Error, got %T (%v)", err, err)
	}
	return ae.Code
}

func TestSaveService_Get(t *testing.T) {
	svc := NewSaveService(&fakeSaveStore{getSave: model.Save{Kind: model.SaveKindRun, Rev: 3}})
	got, err := svc.Get(context.Background(), uuid.New(), model.SaveKindRun)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Rev != 3 {
		t.Fatalf("rev = %d, want 3", got.Rev)
	}
}

func TestSaveService_Get_NotFound(t *testing.T) {
	svc := NewSaveService(&fakeSaveStore{getErr: model.ErrSaveNotFound})
	_, err := svc.Get(context.Background(), uuid.New(), model.SaveKindRun)
	if code := appErrCode(t, err); code != "no_save" {
		t.Fatalf("code = %q, want no_save", code)
	}
}

func TestSaveService_Get_BadKind(t *testing.T) {
	svc := NewSaveService(&fakeSaveStore{})
	_, err := svc.Get(context.Background(), uuid.New(), "nonsense")
	if code := appErrCode(t, err); code != "bad_kind" {
		t.Fatalf("code = %q, want bad_kind", code)
	}
}

func TestSaveService_Put(t *testing.T) {
	store := &fakeSaveStore{upSave: model.Save{Kind: model.SaveKindRun, Rev: 1}}
	svc := NewSaveService(store)
	got, err := svc.Put(context.Background(), model.SaveWrite{
		Kind: model.SaveKindRun, Payload: []byte(`{"a":1}`), BaseRev: 0,
	})
	if err != nil {
		t.Fatalf("Put: %v", err)
	}
	if got.Rev != 1 || store.gotWrite.Kind != model.SaveKindRun {
		t.Fatalf("got %+v, write %+v", got, store.gotWrite)
	}
}

func TestSaveService_Put_Conflict(t *testing.T) {
	// Стор вернул конфликт + актуальный сейв rev=5.
	store := &fakeSaveStore{upSave: model.Save{Rev: 5}, upErr: model.ErrSaveConflict}
	svc := NewSaveService(store)
	got, err := svc.Put(context.Background(), model.SaveWrite{
		Kind: model.SaveKindRun, Payload: []byte(`{"a":1}`), BaseRev: 1,
	})
	if code := appErrCode(t, err); code != "rev_conflict" {
		t.Fatalf("code = %q, want rev_conflict", code)
	}
	if got == nil || got.Rev != 5 {
		t.Fatalf("при конфликте ждали актуальный сейв rev=5, got %+v", got)
	}
}

func TestSaveService_Put_EmptyPayload(t *testing.T) {
	svc := NewSaveService(&fakeSaveStore{})
	_, err := svc.Put(context.Background(), model.SaveWrite{Kind: model.SaveKindRun})
	if code := appErrCode(t, err); code != "empty_payload" {
		t.Fatalf("code = %q, want empty_payload", code)
	}
}
