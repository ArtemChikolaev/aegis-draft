package sourcehttp

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
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

func TestGetJSONRateLimitStopsForResume(t *testing.T) {
	httpClient := &http.Client{Transport: roundTripFunc(func(_ *http.Request) (*http.Response, error) {
		return response(http.StatusTooManyRequests, `{"error":"minute rate limit exceeded"}`), nil
	})}
	client, err := New(Config{
		BaseURL: "https://example.invalid/", CacheDir: t.TempDir(), UserAgent: "AegisDraft/test",
		MaxAttempts: 2, Backoff: time.Nanosecond, MinInterval: -1, HTTPClient: httpClient,
		RateLimitCooldown: time.Nanosecond, MaxRateLimitWaits: 3,
	})
	if err != nil {
		t.Fatal(err)
	}
	var out map[string]any
	getErr := client.GetJSON(context.Background(), "proMatches", nil, nil, &out)
	if !errors.Is(getErr, ErrBudgetExhausted) {
		t.Fatalf("устойчивый 429 после ожиданий должен возвращать ErrBudgetExhausted (resumable-стоп), got %v", getErr)
	}
}

func TestGetJSONPersistentUpstream5xxStopsForResume(t *testing.T) {
	// Cloudflare 522 (origin timeout) и другие устойчивые 5xx — временная недоступность
	// источника. После всех ретраев должны останавливаться мягко (ErrBudgetExhausted → resume),
	// а не ронять весь прогон одним неудачным матчем.
	httpClient := &http.Client{Transport: roundTripFunc(func(_ *http.Request) (*http.Response, error) {
		return response(http.StatusBadGateway, `Error 522: Connection timed out`), nil
	})}
	client, err := New(Config{
		BaseURL: "https://example.invalid/", CacheDir: t.TempDir(), UserAgent: "AegisDraft/test",
		MaxAttempts: 3, Backoff: time.Nanosecond, MinInterval: -1, HTTPClient: httpClient,
	})
	if err != nil {
		t.Fatal(err)
	}
	var out map[string]any
	if getErr := client.GetJSON(context.Background(), "matches/1", nil, nil, &out); !errors.Is(getErr, ErrBudgetExhausted) {
		t.Fatalf("устойчивый 5xx должен возвращать ErrBudgetExhausted (resumable-стоп), got %v", getErr)
	}
}

func TestGetJSONRateLimitThenSucceeds(t *testing.T) {
	var calls atomic.Int32
	httpClient := &http.Client{Transport: roundTripFunc(func(_ *http.Request) (*http.Response, error) {
		if calls.Add(1) <= 2 {
			return response(http.StatusTooManyRequests, `{"error":"minute rate limit exceeded"}`), nil
		}
		return response(http.StatusOK, `{"ok":true}`), nil
	})}
	client, err := New(Config{
		BaseURL: "https://example.invalid/", CacheDir: t.TempDir(), UserAgent: "AegisDraft/test",
		MaxAttempts: 2, Backoff: time.Nanosecond, MinInterval: -1, HTTPClient: httpClient,
		RateLimitCooldown: time.Nanosecond, MaxRateLimitWaits: 5,
	})
	if err != nil {
		t.Fatal(err)
	}
	var out map[string]bool
	if err := client.GetJSON(context.Background(), "proMatches", nil, nil, &out); err != nil {
		t.Fatalf("после переждённых 429 запрос должен успеть: %v", err)
	}
	if !out["ok"] || calls.Load() != 3 {
		t.Fatalf("out=%v calls=%d (ждали 2 × 429 + успех)", out, calls.Load())
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

func TestCachePathIgnoresAuthParamsAndMigratesLegacyFiles(t *testing.T) {
	client, err := New(Config{BaseURL: "https://example.invalid/api/", CacheDir: t.TempDir(), UserAgent: "AegisDraft/test"})
	if err != nil {
		t.Fatal(err)
	}
	plain := "https://example.invalid/api/proMatches?less_than_match_id=5"
	keyed := "https://example.invalid/api/proMatches?api_key=secret&less_than_match_id=5"
	if client.cachePath(plain) != client.cachePath(keyed) {
		t.Fatalf("api_key must not change the cache key: %s vs %s", client.cachePath(plain), client.cachePath(keyed))
	}
	if client.cachePath(plain) == client.cachePath(plain+"&x=1") {
		t.Fatal("other query params must still separate cache entries")
	}
	// Файл, записанный старой схемой (хеш URL вместе с ключом), подхватывается и переезжает.
	legacy := client.cacheFile(keyed)
	if err := os.WriteFile(legacy, []byte(`{"legacy":true}`), 0o644); err != nil {
		t.Fatal(err)
	}
	migrated := client.cachePath(keyed)
	if _, err := os.Stat(migrated); err != nil {
		t.Fatalf("legacy cache file was not migrated: %v", err)
	}
	if _, err := os.Stat(legacy); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("legacy cache file should be renamed, stat err=%v", err)
	}
}

type fakeClock struct{ now time.Time }

func (c *fakeClock) Now() time.Time { return c.now }

type versionedBody struct {
	V int `json:"v"`
}

// counterClient — клиент с фейковым HTTP: каждый сетевой ответ несёт номер вызова {"v": N}.
func counterClient(t *testing.T, clock *fakeClock, budget int, calls *atomic.Int32) *Client {
	t.Helper()
	client, err := New(Config{
		BaseURL: "https://example.invalid/", CacheDir: t.TempDir(), UserAgent: "AegisDraft/test",
		MinInterval: -1, MaxAttempts: 1, RequestBudget: budget, Now: clock.Now,
		HTTPClient: &http.Client{Transport: roundTripFunc(func(_ *http.Request) (*http.Response, error) {
			return response(http.StatusOK, `{"v":`+strconv.Itoa(int(calls.Add(1)))+`}`), nil
		})},
	})
	if err != nil {
		t.Fatal(err)
	}
	return client
}

func getVersion(t *testing.T, client *Client, path string, maxAge time.Duration) int {
	t.Helper()
	var out versionedBody
	if err := client.GetJSONMaxAge(context.Background(), path, nil, nil, maxAge, &out); err != nil {
		t.Fatalf("GET %s: %v", path, err)
	}
	return out.V
}

func TestGetJSONMaxAgeRefreshesOnlyExpiredEntries(t *testing.T) {
	var calls atomic.Int32
	clock := &fakeClock{now: time.Date(2026, 9, 12, 6, 0, 0, 0, time.UTC)}
	client := counterClient(t, clock, 0, &calls)
	const maxAge = 20 * time.Hour

	if v := getVersion(t, client, "leagues", maxAge); v != 1 {
		t.Fatalf("empty cache must hit the network, got v=%d", v)
	}
	clock.now = clock.now.Add(time.Hour)
	if v := getVersion(t, client, "leagues", maxAge); v != 1 || calls.Load() != 1 {
		t.Fatalf("fresh entry must be served without network: v=%d calls=%d", v, calls.Load())
	}
	clock.now = clock.now.Add(maxAge)
	if v := getVersion(t, client, "leagues", maxAge); v != 2 || calls.Load() != 2 {
		t.Fatalf("expired entry must be refetched: v=%d calls=%d", v, calls.Load())
	}
	if v := getVersion(t, client, "leagues", maxAge); v != 2 || calls.Load() != 2 {
		t.Fatalf("refetched entry must be fresh again: v=%d calls=%d", v, calls.Load())
	}
	if stats := client.Stats(); stats.NetworkRequests != 2 || stats.CacheHits != 2 || stats.StaleCacheHits != 0 {
		t.Fatalf("stats=%+v", stats)
	}
}

func TestGetJSONMaxAgeTreatsEntryWithoutMetadataAsExpired(t *testing.T) {
	var calls atomic.Int32
	clock := &fakeClock{now: time.Date(2026, 9, 12, 6, 0, 0, 0, time.UTC)}
	client := counterClient(t, clock, 0, &calls)

	// Вечный GetJSON (как /matches/{id}) пишет тело без метаданных и не стареет.
	for i := 0; i < 2; i++ {
		var out versionedBody
		if err := client.GetJSON(context.Background(), "leagues", nil, nil, &out); err != nil || out.V != 1 {
			t.Fatalf("eternal read %d: v=%d err=%v", i, out.V, err)
		}
		clock.now = clock.now.Add(1000 * time.Hour)
	}
	// Тело без метаданных записано до появления срока годности — оно просрочено: справочники из
	// кэша старого пайплайна обновятся первым же прогоном.
	if v := getVersion(t, client, "leagues", 20*time.Hour); v != 2 {
		t.Fatalf("entry without metadata must be refetched, got v=%d", v)
	}
	if v := getVersion(t, client, "leagues", 20*time.Hour); v != 2 || calls.Load() != 2 {
		t.Fatalf("metadata must be written with the refetched body: v=%d calls=%d", v, calls.Load())
	}
}

func TestGetJSONMaxAgeServesStaleEntryOnlyWhenRefreshIsResumable(t *testing.T) {
	var calls atomic.Int32
	clock := &fakeClock{now: time.Date(2026, 9, 12, 6, 0, 0, 0, time.UTC)}
	client := counterClient(t, clock, 1, &calls)
	if v := getVersion(t, client, "leagues", 20*time.Hour); v != 1 {
		t.Fatalf("first read v=%d", v)
	}
	clock.now = clock.now.Add(21 * time.Hour)
	// Бюджет прогона исчерпан: просроченный справочник отдаётся как есть, прогон продолжается.
	if v := getVersion(t, client, "leagues", 20*time.Hour); v != 1 || calls.Load() != 1 {
		t.Fatalf("stale entry must be served when refresh is resumable: v=%d calls=%d", v, calls.Load())
	}
	if stats := client.Stats(); stats.StaleCacheHits != 1 {
		t.Fatalf("stale fallback must be counted: %+v", stats)
	}
	// Без прежнего тела подменять нечем — resumable-стоп, как и раньше.
	var out versionedBody
	if err := client.GetJSONMaxAge(context.Background(), "teams", nil, nil, 20*time.Hour, &out); !errors.Is(err, ErrBudgetExhausted) {
		t.Fatalf("missing entry with exhausted budget: got %v, want ErrBudgetExhausted", err)
	}

	// Жёсткая ошибка обновления (4xx, не 429) не маскируется просроченным телом.
	var hardCalls atomic.Int32
	hard, err := New(Config{
		BaseURL: "https://example.invalid/", CacheDir: t.TempDir(), UserAgent: "AegisDraft/test",
		MinInterval: -1, Now: clock.Now,
		HTTPClient: &http.Client{Transport: roundTripFunc(func(_ *http.Request) (*http.Response, error) {
			if hardCalls.Add(1) == 1 {
				return response(http.StatusOK, `{"v":1}`), nil
			}
			return response(http.StatusNotFound, `gone`), nil
		})},
	})
	if err != nil {
		t.Fatal(err)
	}
	if v := getVersion(t, hard, "heroes", 20*time.Hour); v != 1 {
		t.Fatalf("hard client first read v=%d", v)
	}
	clock.now = clock.now.Add(21 * time.Hour)
	if err := hard.GetJSONMaxAge(context.Background(), "heroes", nil, nil, 20*time.Hour, &out); err == nil || errors.Is(err, ErrBudgetExhausted) {
		t.Fatalf("hard refresh error must surface, got %v", err)
	}
}
