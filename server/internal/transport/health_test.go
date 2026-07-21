package transport

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/aegis-draft/server/internal/config"
)

func TestHealthz(t *testing.T) {
	handler := NewServer(config.Config{Env: "test"}, Deps{}).Handler()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body healthResponse
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Status != "ok" || body.Env != "test" {
		t.Fatalf("body = %+v", body)
	}
}

// Без БД readiness рапортует "disabled" и 200 (сервер работает в skeleton-режиме).
func TestReadyz_NoDB(t *testing.T) {
	handler := NewServer(config.Config{Env: "test"}, Deps{}).Handler()
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body readyResponse
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Status != "ok" || body.DB != "disabled" {
		t.Fatalf("body = %+v", body)
	}
}
