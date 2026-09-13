package opendota

import (
	"context"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestClientEndpointsAndAPIKey(t *testing.T) {
	httpClient := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Query().Get("api_key") != "key" {
			t.Errorf("missing api key")
		}
		switch r.URL.Path {
		case "/api/proMatches":
			if r.URL.Query().Get("less_than_match_id") != "100" {
				t.Errorf("missing pagination")
			}
			return response(`[{"match_id":99,"radiant_win":true}]`), nil
		case "/api/matches/99":
			return response(`{"match_id":99,"players":[{"account_id":42,"hero_id":1}]}`), nil
		default:
			return notFound(), nil
		}
	})}

	client, err := New(Config{APIKey: "key", CacheDir: t.TempDir(), BaseURL: "https://example.invalid/api/", MinInterval: -1, HTTPClient: httpClient})
	if err != nil {
		t.Fatal(err)
	}
	matches, err := client.FetchProMatches(context.Background(), 100)
	if err != nil || len(matches) != 1 || matches[0].MatchID != 99 {
		t.Fatalf("matches=%v err=%v", matches, err)
	}
	match, err := client.FetchMatch(context.Background(), 99)
	if err != nil || match.MatchID != 99 || match.Players[0].AccountID == nil || *match.Players[0].AccountID != 42 {
		t.Fatalf("match=%v err=%v", match, err)
	}
}

func TestClientTeamsLeaguesEndpoints(t *testing.T) {
	httpClient := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/api/teams":
			return response(`[{"team_id":7119388,"name":"Team Spirit","tag":"TSpirit","rating":1800.5,"wins":329,"losses":172}]`), nil
		case "/api/teams/7119388":
			return response(`{"team_id":7119388,"name":"Team Spirit","tag":"TSpirit","logo_url":"https://example.invalid/spirit.png"}`), nil
		case "/api/leagues":
			return response(`[{"leagueid":12912,"name":"The International 2024","tier":"premium"}]`), nil
		case "/api/heroes":
			return response(`[{"id":1,"name":"npc_dota_hero_antimage","localized_name":"Anti-Mage"}]`), nil
		default:
			return notFound(), nil
		}
	})}

	client, err := New(Config{CacheDir: t.TempDir(), BaseURL: "https://example.invalid/api/", MinInterval: -1, HTTPClient: httpClient})
	if err != nil {
		t.Fatal(err)
	}
	teams, err := client.FetchTeams(context.Background())
	if err != nil || len(teams) != 1 || teams[0].TeamID != 7119388 || teams[0].Tag != "TSpirit" {
		t.Fatalf("teams=%v err=%v", teams, err)
	}
	team, err := client.FetchTeam(context.Background(), 7119388)
	if err != nil || team.Name != "Team Spirit" || team.LogoURL == "" {
		t.Fatalf("team=%v err=%v", team, err)
	}
	leagues, err := client.FetchLeagues(context.Background())
	if err != nil || len(leagues) != 1 || leagues[0].Tier != "premium" {
		t.Fatalf("leagues=%v err=%v", leagues, err)
	}
	heroes, err := client.FetchHeroes(context.Background())
	if err != nil || len(heroes) != 1 || heroes[0].LocalizedName != "Anti-Mage" {
		t.Fatalf("heroes=%v err=%v", heroes, err)
	}
	if _, err := client.FetchTeam(context.Background(), 0); err == nil {
		t.Fatal("expected error for invalid teamId")
	}
}

// Справочники стареют (DirectoryMaxAge), детали матча — нет: иначе новые лиги и герои не
// попадают в данные, а перезапрос тысяч иммутабельных матчей съел бы весь бюджет.
func TestDirectoriesExpireButMatchDetailsStayCached(t *testing.T) {
	var directoryCalls, matchCalls atomic.Int32
	httpClient := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/api/leagues", "/api/teams", "/api/heroes":
			directoryCalls.Add(1)
			return response(`[]`), nil
		case "/api/matches/7":
			matchCalls.Add(1)
			return response(`{"match_id":7}`), nil
		default:
			return notFound(), nil
		}
	})}
	now := time.Date(2026, 9, 12, 6, 0, 0, 0, time.UTC)
	client, err := New(Config{
		CacheDir: t.TempDir(), BaseURL: "https://example.invalid/api/", MinInterval: -1, HTTPClient: httpClient,
		Now: func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	fetchAll := func() {
		t.Helper()
		ctx := context.Background()
		if _, err := client.FetchLeagues(ctx); err != nil {
			t.Fatal(err)
		}
		if _, err := client.FetchTeams(ctx); err != nil {
			t.Fatal(err)
		}
		if _, err := client.FetchHeroes(ctx); err != nil {
			t.Fatal(err)
		}
		if _, err := client.FetchMatch(ctx, 7); err != nil {
			t.Fatal(err)
		}
	}

	fetchAll()
	now = now.Add(DirectoryMaxAge - time.Minute)
	fetchAll()
	if directoryCalls.Load() != 3 || matchCalls.Load() != 1 {
		t.Fatalf("fresh cache must not hit the network: directories=%d matches=%d", directoryCalls.Load(), matchCalls.Load())
	}
	now = now.Add(2 * time.Minute)
	fetchAll()
	if directoryCalls.Load() != 6 || matchCalls.Load() != 1 {
		t.Fatalf("expired directories must be refetched, match details never: directories=%d matches=%d", directoryCalls.Load(), matchCalls.Load())
	}
}

func TestExplorerMatchIDsBoundsDiscoveryByAsOf(t *testing.T) {
	var sql string
	httpClient := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		sql = r.URL.Query().Get("sql")
		return response(`{"rows":[{"match_id":5,"start_time":100,"leagueid":1}]}`), nil
	})}
	client, err := New(Config{CacheDir: t.TempDir(), BaseURL: "https://example.invalid/api/", MinInterval: -1, HTTPClient: httpClient})
	if err != nil {
		t.Fatal(err)
	}
	rows, err := client.ExplorerMatchIDs(context.Background(), []int64{1, 2}, 50, 1757635200)
	if err != nil || len(rows) != 1 || rows[0].MatchID != 5 || rows[0].LeagueID != 1 {
		t.Fatalf("rows=%v err=%v", rows, err)
	}
	want := "SELECT match_id, start_time, leagueid FROM matches WHERE leagueid IN (1,2) AND start_time >= 50 AND start_time < 1757635200 ORDER BY match_id DESC"
	if sql != want {
		t.Fatalf("explorer SQL:\n got %s\nwant %s", sql, want)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func response(body string) *http.Response {
	return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}
}

func notFound() *http.Response {
	return &http.Response{StatusCode: http.StatusNotFound, Header: make(http.Header), Body: io.NopCloser(strings.NewReader("not found"))}
}
