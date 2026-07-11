// Package liquipedia provides an authenticated boundary for the Liquipedia API.
// Endpoint paths and DTOs must follow the OpenAPI specification issued with access;
// the project deliberately does not scrape public wiki HTML/MediaWiki endpoints.
package liquipedia

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"github.com/aegis-draft/pipeline/internal/sourcehttp"
)

type Config struct {
	BaseURL         string
	AuthHeaderName  string
	AuthHeaderValue string
	UserAgent       string
	CacheDir        string
	MinInterval     time.Duration
	HTTPClient      *http.Client
}

type Client struct {
	authHeaderName  string
	authHeaderValue string
	transport       *sourcehttp.Client
}

func New(cfg Config) (*Client, error) {
	if strings.TrimSpace(cfg.BaseURL) == "" {
		return nil, errors.New("Liquipedia API base URL is required; use the URL supplied with API access")
	}
	if strings.TrimSpace(cfg.AuthHeaderName) == "" || strings.TrimSpace(cfg.AuthHeaderValue) == "" {
		return nil, errors.New("Liquipedia API auth header is required; use the scheme issued with access")
	}
	if !strings.Contains(cfg.UserAgent, "contact:") {
		return nil, errors.New("Liquipedia User-Agent must contain contact:<email>")
	}
	interval := cfg.MinInterval
	if interval == 0 {
		interval = time.Minute // conservative until the issued plan documents its limit
	}
	transport, err := sourcehttp.New(sourcehttp.Config{
		BaseURL: cfg.BaseURL, CacheDir: filepath.Join(cfg.CacheDir, "liquipedia"),
		UserAgent: cfg.UserAgent, MinInterval: interval,
		MaxAttempts: 4, Backoff: time.Second, HTTPClient: cfg.HTTPClient,
	})
	if err != nil {
		return nil, err
	}
	return &Client{authHeaderName: cfg.AuthHeaderName, authHeaderValue: cfg.AuthHeaderValue, transport: transport}, nil
}

// FetchJSON fetches an authorized LPDB resource. Add typed wrappers only after
// the access-specific OpenAPI specification is available.
func (c *Client) FetchJSON(ctx context.Context, resource string, query url.Values, out any) error {
	headers := make(http.Header)
	headers.Set(c.authHeaderName, c.authHeaderValue)
	return c.transport.GetJSON(ctx, resource, query, headers, out)
}
