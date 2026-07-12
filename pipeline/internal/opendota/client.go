// Package opendota fetches OpenDota raw data with cache, throttling and retries.
package opendota

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"time"

	"github.com/aegis-draft/pipeline/internal/sourcehttp"
)

const BaseURL = "https://api.opendota.com/api/"

type Config struct {
	APIKey        string
	CacheDir      string
	BaseURL       string
	MinInterval   time.Duration
	HTTPClient    *http.Client
	RequestBudget int
}

type Client struct {
	apiKey    string
	transport *sourcehttp.Client
}

type ProMatch struct {
	MatchID       int64  `json:"match_id"`
	Duration      int    `json:"duration"`
	StartTime     int64  `json:"start_time"`
	RadiantTeamID int64  `json:"radiant_team_id"`
	RadiantName   string `json:"radiant_name"`
	DireTeamID    int64  `json:"dire_team_id"`
	DireName      string `json:"dire_name"`
	LeagueID      int64  `json:"leagueid"`
	LeagueName    string `json:"league_name"`
	RadiantWin    bool   `json:"radiant_win"`
}

type PlayerHero struct {
	HeroID       int   `json:"hero_id"`
	LastPlayed   int64 `json:"last_played"`
	Games        int   `json:"games"`
	Wins         int   `json:"win"`
	WithGames    int   `json:"with_games"`
	WithWins     int   `json:"with_win"`
	AgainstGames int   `json:"against_games"`
	AgainstWins  int   `json:"against_win"`
}

type Match struct {
	MatchID       int64         `json:"match_id"`
	Duration      int           `json:"duration"`
	StartTime     int64         `json:"start_time"`
	LeagueID      int64         `json:"leagueid"`
	RadiantTeamID int64         `json:"radiant_team_id"`
	DireTeamID    int64         `json:"dire_team_id"`
	RadiantWin    bool          `json:"radiant_win"`
	Players       []MatchPlayer `json:"players"`
}

type MatchPlayer struct {
	AccountID   *int64 `json:"account_id"`
	Name        string `json:"name"`
	Personaname string `json:"personaname"`
	PlayerSlot  int    `json:"player_slot"`
	HeroID      int    `json:"hero_id"`
	LaneRole    int    `json:"lane_role"`
	IsRoaming   bool   `json:"is_roaming"`
	Kills       int    `json:"kills"`
	Deaths      int    `json:"deaths"`
	Assists     int    `json:"assists"`
	GoldPerMin  int    `json:"gold_per_min"`
	XPPerMin    int    `json:"xp_per_min"`
	LastHits    int    `json:"last_hits"`
	HeroDamage  int    `json:"hero_damage"`
}

// Peer — запись из /players/{id}/peers: пожизненная сыгранность с другим игроком.
// WithGames/WithWins — игры/победы на ОДНОЙ команде (основа Chemistry); Against* — против.
type Peer struct {
	AccountID    int64  `json:"account_id"`
	Personaname  string `json:"personaname"`
	Games        int    `json:"games"`
	Wins         int    `json:"win"`
	WithGames    int    `json:"with_games"`
	WithWins     int    `json:"with_win"`
	AgainstGames int    `json:"against_games"`
	AgainstWins  int    `json:"against_win"`
}

// Team — запись из /teams (топ команд по рейтингу).
type Team struct {
	TeamID        int64   `json:"team_id"`
	Rating        float64 `json:"rating"`
	Wins          int     `json:"wins"`
	Losses        int     `json:"losses"`
	LastMatchTime int64   `json:"last_match_time"`
	Name          string  `json:"name"`
	Tag           string  `json:"tag"`
	LogoURL       string  `json:"logo_url"`
}

// TeamPlayer — запись из /teams/{id}/players. Ростер = is_current_team_member.
type TeamPlayer struct {
	AccountID   *int64 `json:"account_id"`
	Name        string `json:"name"`
	GamesPlayed int    `json:"games_played"`
	Wins        int    `json:"wins"`
	IsCurrent   bool   `json:"is_current_team_member"`
}

// League — запись из /leagues. tier: premium|professional|amateur|excluded.
type League struct {
	LeagueID int64  `json:"leagueid"`
	Name     string `json:"name"`
	Tier     string `json:"tier"`
}

// Hero — запись из /heroes. Name — npc-идентификатор (npc_dota_hero_antimage),
// LocalizedName — отображаемое имя (Anti-Mage).
type Hero struct {
	ID            int    `json:"id"`
	Name          string `json:"name"`
	LocalizedName string `json:"localized_name"`
}

func New(cfg Config) (*Client, error) {
	baseURL := cfg.BaseURL
	if baseURL == "" {
		baseURL = BaseURL
	}
	interval := cfg.MinInterval
	if interval == 0 {
		// ~50 req/min: запас под Free Tier 60/min, чтобы не ловить 429 «minute rate limit».
		interval = 1200 * time.Millisecond
	}
	transport, err := sourcehttp.New(sourcehttp.Config{
		BaseURL: baseURL, CacheDir: filepath.Join(cfg.CacheDir, "opendota"),
		UserAgent:   "AegisDraft/0.2 (+https://github.com/aegis-draft)",
		MinInterval: interval, MaxAttempts: 4, Backoff: 500 * time.Millisecond,
		HTTPClient:    cfg.HTTPClient,
		RequestBudget: cfg.RequestBudget,
	})
	if err != nil {
		return nil, err
	}
	return &Client{apiKey: cfg.APIKey, transport: transport}, nil
}

func (c *Client) Stats() sourcehttp.Stats { return c.transport.Stats() }

func (c *Client) FetchProMatches(ctx context.Context, lessThanMatchID int64) ([]ProMatch, error) {
	query := c.query()
	if lessThanMatchID > 0 {
		query.Set("less_than_match_id", strconv.FormatInt(lessThanMatchID, 10))
	}
	var matches []ProMatch
	if err := c.transport.GetJSON(ctx, "proMatches", query, nil, &matches); err != nil {
		return nil, fmt.Errorf("fetch pro matches: %w", err)
	}
	return matches, nil
}

func (c *Client) FetchPlayerHeroes(ctx context.Context, accountID int64) ([]PlayerHero, error) {
	if accountID <= 0 {
		return nil, fmt.Errorf("invalid accountId %d", accountID)
	}
	var heroes []PlayerHero
	path := fmt.Sprintf("players/%d/heroes", accountID)
	if err := c.transport.GetJSON(ctx, path, c.query(), nil, &heroes); err != nil {
		return nil, fmt.Errorf("fetch player heroes %d: %w", accountID, err)
	}
	return heroes, nil
}

// FetchPlayerPeers возвращает /players/{id}/peers — пожизненные совместные игры игрока
// с каждым тиммейтом/соперником. Прямой источник Chemistry (with_games/with_win).
func (c *Client) FetchPlayerPeers(ctx context.Context, accountID int64) ([]Peer, error) {
	if accountID <= 0 {
		return nil, fmt.Errorf("invalid accountId %d", accountID)
	}
	var peers []Peer
	path := fmt.Sprintf("players/%d/peers", accountID)
	if err := c.transport.GetJSON(ctx, path, c.query(), nil, &peers); err != nil {
		return nil, fmt.Errorf("fetch player peers %d: %w", accountID, err)
	}
	return peers, nil
}

func (c *Client) FetchMatch(ctx context.Context, matchID int64) (*Match, error) {
	if matchID <= 0 {
		return nil, fmt.Errorf("invalid matchId %d", matchID)
	}
	var match Match
	if err := c.transport.GetJSON(ctx, fmt.Sprintf("matches/%d", matchID), c.query(), nil, &match); err != nil {
		return nil, fmt.Errorf("fetch match %d: %w", matchID, err)
	}
	return &match, nil
}

// FetchTeams возвращает /teams (топ ~1000 команд по рейтингу).
func (c *Client) FetchTeams(ctx context.Context) ([]Team, error) {
	var teams []Team
	if err := c.transport.GetJSON(ctx, "teams", c.query(), nil, &teams); err != nil {
		return nil, fmt.Errorf("fetch teams: %w", err)
	}
	return teams, nil
}

// FetchTeamPlayers возвращает /teams/{id}/players (карьера игроков в команде; ростер = IsCurrent).
func (c *Client) FetchTeamPlayers(ctx context.Context, teamID int64) ([]TeamPlayer, error) {
	if teamID <= 0 {
		return nil, fmt.Errorf("invalid teamId %d", teamID)
	}
	var players []TeamPlayer
	path := fmt.Sprintf("teams/%d/players", teamID)
	if err := c.transport.GetJSON(ctx, path, c.query(), nil, &players); err != nil {
		return nil, fmt.Errorf("fetch team players %d: %w", teamID, err)
	}
	return players, nil
}

// FetchLeagues возвращает /leagues (все лиги с tier для классификации событий).
func (c *Client) FetchLeagues(ctx context.Context) ([]League, error) {
	var leagues []League
	if err := c.transport.GetJSON(ctx, "leagues", c.query(), nil, &leagues); err != nil {
		return nil, fmt.Errorf("fetch leagues: %w", err)
	}
	return leagues, nil
}

// FetchHeroes возвращает /heroes (справочник героев для heroes.json).
func (c *Client) FetchHeroes(ctx context.Context) ([]Hero, error) {
	var heroes []Hero
	if err := c.transport.GetJSON(ctx, "heroes", c.query(), nil, &heroes); err != nil {
		return nil, fmt.Errorf("fetch heroes: %w", err)
	}
	return heroes, nil
}

func (c *Client) query() url.Values {
	query := make(url.Values)
	if c.apiKey != "" {
		query.Set("api_key", c.apiKey)
	}
	return query
}
