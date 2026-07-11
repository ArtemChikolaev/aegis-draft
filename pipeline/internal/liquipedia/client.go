// Package liquipedia — клиент Liquipedia (скилл external-data-etl).
// ЖЁСТКО: кастомный User-Agent с контактом (дженерик HTTP-агенты банятся),
// ≤1 req/2s (parse ≤1/30s), кэш, gzip, атрибуция CC-BY-SA в manifest.source.
package liquipedia

import "time"

const APIBase = "https://liquipedia.net/dota2/api.php"

type Client struct {
	userAgent   string        // ОБЯЗАТЕЛЬНО: "AegisDraft/0.1 (contact: <email>)"
	minInterval time.Duration // ≤1 req/2s
}

// New требует непустой кастомный User-Agent с контактом.
func New(userAgent string) *Client {
	return &Client{userAgent: userAgent, minInterval: 2 * time.Second}
}

// FetchTournaments — заглушка (реализация на этапе T1.3): турниры/ростеры/placement.
func (c *Client) FetchTournaments() error {
	// TODO(T1.3): MediaWiki-запросы с UA, троттлингом, кэшем и атрибуцией. Пока скелет.
	return nil
}
