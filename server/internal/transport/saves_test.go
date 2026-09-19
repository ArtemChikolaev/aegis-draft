package transport

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/aegis-draft/server/internal/apperr"
	"github.com/aegis-draft/server/internal/config"
	"github.com/aegis-draft/server/internal/model"
	"github.com/google/uuid"
)

type fakeVerifier struct {
	id uuid.UUID
}

func (f fakeVerifier) Verify(token string) (uuid.UUID, error) {
	if token == "good" {
		return f.id, nil
	}
	return uuid.Nil, errors.New("bad token")
}

type fakeSaves struct {
	get     *model.Save
	getErr  error
	put     *model.Save
	putErr  error
	gotUser uuid.UUID
	gotKind string
}

func (f *fakeSaves) Get(_ context.Context, userID uuid.UUID, kind string) (*model.Save, error) {
	f.gotUser, f.gotKind = userID, kind
	return f.get, f.getErr
}

func (f *fakeSaves) Put(_ context.Context, w model.SaveWrite) (*model.Save, error) {
	f.gotUser, f.gotKind = w.UserID, w.Kind
	return f.put, f.putErr
}

func savesHandler(v Verifier, s Saves) http.Handler {
	return NewServer(config.Config{Env: "test"}, Deps{Sessions: v, Saves: s}).Handler()
}

func TestGetSave_OK(t *testing.T) {
	uid := uuid.New()
	saves := &fakeSaves{get: &model.Save{Kind: model.SaveKindRun, Rev: 2, Payload: []byte(`{"x":1}`)}}
	h := savesHandler(fakeVerifier{id: uid}, saves)

	req := httptest.NewRequest(http.MethodGet, "/api/saves/run", nil)
	req.Header.Set("Authorization", "Bearer good")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (%s)", rec.Code, rec.Body)
	}
	var body saveDTO
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Rev != 2 || saves.gotUser != uid || saves.gotKind != "run" {
		t.Fatalf("body=%+v user=%v kind=%q", body, saves.gotUser, saves.gotKind)
	}
}

func TestGetSave_NoToken(t *testing.T) {
	h := savesHandler(fakeVerifier{}, &fakeSaves{})
	req := httptest.NewRequest(http.MethodGet, "/api/saves/run", nil) // без Authorization
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestGetSave_BadToken(t *testing.T) {
	h := savesHandler(fakeVerifier{}, &fakeSaves{})
	req := httptest.NewRequest(http.MethodGet, "/api/saves/run", nil)
	req.Header.Set("Authorization", "Bearer nope")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestPutSave_Conflict(t *testing.T) {
	uid := uuid.New()
	// Сервис вернул 409 + актуальный сейв rev=7.
	saves := &fakeSaves{
		put:    &model.Save{Kind: model.SaveKindRun, Rev: 7},
		putErr: apperr.Conflict("rev_conflict", "save revision conflict"),
	}
	h := savesHandler(fakeVerifier{id: uid}, saves)

	req := httptest.NewRequest(http.MethodPut, "/api/saves/run", strings.NewReader(`{"payload":{"x":1},"baseRev":1}`))
	req.Header.Set("Authorization", "Bearer good")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", rec.Code)
	}
	var body saveConflictResponse
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Current.Rev != 7 {
		t.Fatalf("409 должен нести актуальный сейв rev=7, got %+v", body.Current)
	}
}

// Тело больше лимита — честный 413 too_large, а не 400 bad_json от молча обрезанного JSON;
// до сервиса такой запрос не доходит. Тело ровно под лимитом проходит.
func TestPutSave_TooLarge(t *testing.T) {
	uid := uuid.New()
	saves := &fakeSaves{put: &model.Save{Kind: model.SaveKindRun, Rev: 1}}
	h := savesHandler(fakeVerifier{id: uid}, saves)

	put := func(body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPut, "/api/saves/run", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer good")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}
	const head, tail = `{"payload":{"blob":"`, `"},"baseRev":0}`

	rec := put(head + strings.Repeat("x", maxSaveBodyBytes) + tail)
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want 413 (%s)", rec.Code, rec.Body)
	}
	var fail apperr.Error
	if err := json.NewDecoder(rec.Body).Decode(&fail); err != nil || fail.Code != "too_large" {
		t.Fatalf("code = %q (%v), want too_large", fail.Code, err)
	}
	if saves.gotKind != "" {
		t.Fatal("oversized save must not reach the service")
	}

	rec = put(head + strings.Repeat("x", maxSaveBodyBytes-len(head)-len(tail)) + tail)
	if rec.Code != http.StatusOK || saves.gotKind != "run" {
		t.Fatalf("body at the limit must pass: status = %d (%s)", rec.Code, rec.Body)
	}
}
