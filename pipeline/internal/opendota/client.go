// Package opendota — клиент OpenDota API (скилл external-data-etl).
// Правила: ~60 req/min, ключ из env, кэш raw, ретраи с бэк-оффом на 429/5xx.
// Эндпоинты: /proMatches, /matches/{id}, /players/{id}/heroes.
package opendota

import "time"

const BaseURL = "https://api.opendota.com/api"

type Client struct {
	apiKey      string        // из env OPENDOTA_API_KEY, не хардкод
	minInterval time.Duration // троттлинг под лимит
}

// New создаёт клиент. apiKey — из окружения (секреты не в коде).
func New(apiKey string) *Client {
	return &Client{apiKey: apiKey, minInterval: time.Second} // ~60 req/min
}

// FetchProMatches — заглушка (реализация на этапе T1.2): тянет /proMatches в raw-кэш.
func (c *Client) FetchProMatches() error {
	// TODO(T1.2): rate-limited fetch + кэш + ретраи. Пока скелет.
	return nil
}
