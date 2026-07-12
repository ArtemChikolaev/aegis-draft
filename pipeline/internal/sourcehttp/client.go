// Package sourcehttp provides the shared rate-limited, cached and retrying HTTP transport
// used by external ETL sources. Cached responses never consume rate-limit budget.
package sourcehttp

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const maxResponseBytes = 128 << 20

var ErrBudgetExhausted = errors.New("source HTTP request budget exhausted")

type Stats struct {
	CacheHits       int `json:"cacheHits"`
	NetworkRequests int `json:"networkRequests"`
}

type Config struct {
	BaseURL       string
	CacheDir      string
	UserAgent     string
	MinInterval   time.Duration
	MaxAttempts   int
	Backoff       time.Duration
	HTTPClient    *http.Client
	RequestBudget int
	// RateLimitCooldown — пауза после 429 без внятного Retry-After (по умолчанию 60с,
	// чтобы переждать минутное окно). MaxRateLimitWaits — сколько раз ждём на один
	// запрос, прежде чем отдать resumable-стоп (по умолчанию 6).
	RateLimitCooldown time.Duration
	MaxRateLimitWaits int
}

type Client struct {
	baseURL     *url.URL
	cacheDir    string
	userAgent   string
	minInterval time.Duration
	maxAttempts int
	backoff     time.Duration
	httpClient  *http.Client

	rateLimitCooldown time.Duration
	maxRateLimitWaits int

	mu            sync.Mutex
	lastRequest   time.Time
	stats         Stats
	requestBudget int
}

func New(cfg Config) (*Client, error) {
	baseURL, err := url.Parse(cfg.BaseURL)
	if err != nil || baseURL.Scheme == "" || baseURL.Host == "" {
		return nil, fmt.Errorf("invalid source base URL %q", cfg.BaseURL)
	}
	if strings.TrimSpace(cfg.UserAgent) == "" {
		return nil, errors.New("source User-Agent is required")
	}
	if strings.TrimSpace(cfg.CacheDir) == "" {
		return nil, errors.New("source cache directory is required")
	}
	if cfg.RequestBudget < 0 {
		return nil, errors.New("source request budget must be non-negative")
	}
	if cfg.MaxAttempts <= 0 {
		cfg.MaxAttempts = 4
	}
	if cfg.Backoff <= 0 {
		cfg.Backoff = 500 * time.Millisecond
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 30 * time.Second}
	}
	if cfg.RateLimitCooldown <= 0 {
		cfg.RateLimitCooldown = 60 * time.Second
	}
	if cfg.MaxRateLimitWaits <= 0 {
		cfg.MaxRateLimitWaits = 6
	}
	return &Client{
		baseURL: baseURL, cacheDir: cfg.CacheDir, userAgent: cfg.UserAgent,
		minInterval: cfg.MinInterval, maxAttempts: cfg.MaxAttempts,
		backoff: cfg.Backoff, httpClient: cfg.HTTPClient,
		rateLimitCooldown: cfg.RateLimitCooldown, maxRateLimitWaits: cfg.MaxRateLimitWaits,
		requestBudget: cfg.RequestBudget,
	}, nil
}

func (c *Client) Stats() Stats {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.stats
}

// GetJSON reads a cached JSON response or performs a rate-limited GET and atomically caches it.
func (c *Client) GetJSON(ctx context.Context, path string, query url.Values, headers http.Header, out any) error {
	requestURL, err := c.resolve(path, query)
	if err != nil {
		return err
	}
	cachePath := c.cachePath(requestURL)
	if cached, err := os.ReadFile(cachePath); err == nil {
		if err := json.Unmarshal(cached, out); err != nil {
			return fmt.Errorf("decode cached %s: %w", cachePath, err)
		}
		c.mu.Lock()
		c.stats.CacheHits++
		c.mu.Unlock()
		return nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("read cache %s: %w", cachePath, err)
	}

	safeURL := redactURL(requestURL)
	var lastErr error
	serverAttempts := 0 // ретраи сетевых/5xx ошибок (ограничены maxAttempts)
	rateLimitWaits := 0 // сколько раз пережидали 429 на этот запрос
	for {
		if err := c.reserveRequest(); err != nil {
			return fmt.Errorf("GET %s: %w", safeURL, err)
		}
		if err := c.wait(ctx); err != nil {
			return err
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
		if err != nil {
			return err
		}
		req.Header.Set("Accept", "application/json")
		req.Header.Set("User-Agent", c.userAgent)
		for key, values := range headers {
			for _, value := range values {
				req.Header.Add(key, value)
			}
		}

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = err
			serverAttempts++
			if serverAttempts >= c.maxAttempts {
				break
			}
			if err := sleepContext(ctx, c.backoffFor(serverAttempts-1, "")); err != nil {
				return err
			}
			continue
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes+1))
		closeErr := resp.Body.Close()
		if readErr != nil {
			return fmt.Errorf("read %s: %w", safeURL, readErr)
		}
		if closeErr != nil {
			return fmt.Errorf("close %s: %w", safeURL, closeErr)
		}
		if len(body) > maxResponseBytes {
			return fmt.Errorf("response too large from %s", safeURL)
		}
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			if err := json.Unmarshal(body, out); err != nil {
				return fmt.Errorf("decode %s: %w", safeURL, err)
			}
			if err := writeAtomic(cachePath, body); err != nil {
				return fmt.Errorf("cache %s: %w", safeURL, err)
			}
			return nil
		}

		lastErr = fmt.Errorf("GET %s: HTTP %d: %s", safeURL, resp.StatusCode, truncate(body, 256))
		if resp.StatusCode == http.StatusTooManyRequests {
			// Rate-limit — это throttle, а не ошибка: пережидаем окно (Retry-After или
			// cooldown) и продолжаем, НЕ расходуя maxAttempts, чтобы за один прогон
			// добрать до реального бюджета. Исчерпали ожидания → resumable-стоп.
			rateLimitWaits++
			if rateLimitWaits > c.maxRateLimitWaits {
				return fmt.Errorf("GET %s rate limited (%d waits), stopping for resume: %w", safeURL, c.maxRateLimitWaits, ErrBudgetExhausted)
			}
			if err := sleepContext(ctx, c.rateLimitWait(resp.Header.Get("Retry-After"))); err != nil {
				return err
			}
			continue
		}
		if resp.StatusCode < 500 {
			return lastErr
		}
		serverAttempts++
		if serverAttempts >= c.maxAttempts {
			break
		}
		if err := sleepContext(ctx, c.backoffFor(serverAttempts-1, "")); err != nil {
			return err
		}
	}
	return fmt.Errorf("GET %s failed after %d attempts: %w", safeURL, c.maxAttempts, lastErr)
}

// rateLimitWait — пауза после 429: Retry-After, если сервер его прислал, иначе cooldown,
// достаточный чтобы переждать минутное окно.
func (c *Client) rateLimitWait(retryAfter string) time.Duration {
	retryAfter = strings.TrimSpace(retryAfter)
	if seconds, err := strconv.Atoi(retryAfter); err == nil && seconds > 0 {
		return time.Duration(seconds) * time.Second
	}
	if deadline, err := http.ParseTime(retryAfter); err == nil {
		if wait := time.Until(deadline); wait > 0 {
			return wait
		}
	}
	return c.rateLimitCooldown
}

func (c *Client) reserveRequest() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.requestBudget > 0 && c.stats.NetworkRequests >= c.requestBudget {
		return ErrBudgetExhausted
	}
	c.stats.NetworkRequests++
	return nil
}

func (c *Client) resolve(path string, query url.Values) (string, error) {
	relative, err := url.Parse(strings.TrimPrefix(path, "/"))
	if err != nil {
		return "", err
	}
	if relative.IsAbs() || relative.Host != "" {
		return "", fmt.Errorf("source path must be relative: %q", path)
	}
	resolved := c.baseURL.ResolveReference(relative)
	resolved.RawQuery = query.Encode()
	return resolved.String(), nil
}

func (c *Client) cachePath(requestURL string) string {
	digest := sha256.Sum256([]byte(requestURL))
	return filepath.Join(c.cacheDir, hex.EncodeToString(digest[:])+".json")
}

func (c *Client) wait(ctx context.Context) error {
	if c.minInterval <= 0 {
		return nil
	}
	c.mu.Lock()
	wait := time.Until(c.lastRequest.Add(c.minInterval))
	if wait < 0 {
		wait = 0
	}
	c.lastRequest = time.Now().Add(wait)
	c.mu.Unlock()
	return sleepContext(ctx, wait)
}

func (c *Client) backoffFor(attempt int, retryAfter string) time.Duration {
	retryAfter = strings.TrimSpace(retryAfter)
	if seconds, err := strconv.Atoi(retryAfter); err == nil && seconds >= 0 {
		return time.Duration(seconds) * time.Second
	}
	if deadline, err := http.ParseTime(retryAfter); err == nil {
		if wait := time.Until(deadline); wait > 0 {
			return wait
		}
		return 0
	}
	return c.backoff * time.Duration(1<<attempt)
}

func sleepContext(ctx context.Context, duration time.Duration) error {
	if duration <= 0 {
		return nil
	}
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func writeAtomic(path string, body []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".raw-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if _, err := tmp.Write(body); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}

func truncate(body []byte, limit int) string {
	if len(body) > limit {
		body = body[:limit]
	}
	return strings.TrimSpace(string(body))
}

func redactURL(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil {
		return "<invalid-url>"
	}
	query := parsed.Query()
	for _, key := range []string{"api_key", "apikey", "token", "access_token"} {
		if query.Has(key) {
			query.Set(key, "REDACTED")
		}
	}
	parsed.RawQuery = query.Encode()
	return parsed.String()
}
