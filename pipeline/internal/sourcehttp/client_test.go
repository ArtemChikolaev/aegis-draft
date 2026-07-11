package sourcehttp

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestGetJSONRetriesAndUsesCache(t *testing.T) {
	var calls atomic.Int32
	httpClient := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		call := calls.Add(1)
		if r.UserAgent() != "AegisDraft/test" {
			t.Errorf("User-Agent = %q", r.UserAgent())
		}
		if r.URL.Query().Get("api_key") != "secret" {
			t.Errorf("api_key missing")
		}
		if call == 1 {
			return response(http.StatusInternalServerError, `temporary`), nil
		}
		return response(http.StatusOK, `{"ok":true}`), nil
	})}

	client, err := New(Config{
		BaseURL: "https://example.invalid/api/", CacheDir: t.TempDir(), UserAgent: "AegisDraft/test",
		MaxAttempts: 2, Backoff: time.Nanosecond, HTTPClient: httpClient,
	})
	if err != nil {
		t.Fatal(err)
	}
	var first map[string]bool
	if err := client.GetJSON(context.Background(), "proMatches", url.Values{"api_key": {"secret"}}, nil, &first); err != nil {
		t.Fatal(err)
	}
	if !first["ok"] || calls.Load() != 2 {
		t.Fatalf("first=%v calls=%d", first, calls.Load())
	}
	var cached map[string]bool
	if err := client.GetJSON(context.Background(), "proMatches", url.Values{"api_key": {"secret"}}, nil, &cached); err != nil {
		t.Fatal(err)
	}
	if !cached["ok"] || calls.Load() != 2 {
		t.Fatalf("cache miss: cached=%v calls=%d", cached, calls.Load())
	}
	if stats := client.Stats(); stats.NetworkRequests != 2 || stats.CacheHits != 1 {
		t.Fatalf("stats=%+v", stats)
	}
}

func TestGetJSONBudgetCountsNetworkButNotCache(t *testing.T) {
	var calls atomic.Int32
	client, err := New(Config{
		BaseURL: "https://example.invalid/", CacheDir: t.TempDir(), UserAgent: "AegisDraft/test",
		RequestBudget: 1, HTTPClient: &http.Client{Transport: roundTripFunc(func(_ *http.Request) (*http.Response, error) {
			calls.Add(1)
			return response(http.StatusOK, `{"ok":true}`), nil
		})},
	})
	if err != nil {
		t.Fatal(err)
	}
	var target map[string]bool
	if err := client.GetJSON(context.Background(), "cached", nil, nil, &target); err != nil {
		t.Fatal(err)
	}
	if err := client.GetJSON(context.Background(), "cached", nil, nil, &target); err != nil {
		t.Fatalf("cached response must remain available after budget: %v", err)
	}
	if err := client.GetJSON(context.Background(), "uncached", nil, nil, &target); !errors.Is(err, ErrBudgetExhausted) {
		t.Fatalf("got %v, want ErrBudgetExhausted", err)
	}
	stats := client.Stats()
	if calls.Load() != 1 || stats.NetworkRequests != 1 || stats.CacheHits != 1 {
		t.Fatalf("calls=%d stats=%+v", calls.Load(), stats)
	}
}

func TestGetJSONDoesNotCacheInvalidJSON(t *testing.T) {
	httpClient := &http.Client{Transport: roundTripFunc(func(_ *http.Request) (*http.Response, error) {
		return response(http.StatusOK, `not-json`), nil
	})}
	client, err := New(Config{BaseURL: "https://example.invalid/", CacheDir: t.TempDir(), UserAgent: "AegisDraft/test", HTTPClient: httpClient})
	if err != nil {
		t.Fatal(err)
	}
	var target any
	if err := client.GetJSON(context.Background(), "/bad", nil, nil, &target); err == nil {
		t.Fatal("expected JSON error")
	}
}

func TestRedactURL(t *testing.T) {
	got := redactURL("https://example.invalid/api?api_key=secret&x=1")
	if strings.Contains(got, "secret") || !strings.Contains(got, "REDACTED") {
		t.Fatalf("secret was not redacted: %s", got)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func response(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}
