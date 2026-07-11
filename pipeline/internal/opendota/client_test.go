package opendota

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
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
		case "/api/players/42/heroes":
			return response(`[{"hero_id":1,"games":10,"win":6}]`), nil
		case "/api/matches/99":
			return response(`{"match_id":99,"players":[{"account_id":42,"hero_id":1}]}`), nil
		default:
			return &http.Response{StatusCode: http.StatusNotFound, Header: make(http.Header), Body: io.NopCloser(strings.NewReader("not found"))}, nil
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
	heroes, err := client.FetchPlayerHeroes(context.Background(), 42)
	if err != nil || len(heroes) != 1 || heroes[0].Wins != 6 {
		t.Fatalf("heroes=%v err=%v", heroes, err)
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
		case "/api/teams/7119388/players":
			return response(`[{"account_id":321580662,"name":"Yatoro","games_played":1273,"wins":798,"is_current_team_member":true},{"account_id":111,"name":"ex","games_played":10,"wins":4,"is_current_team_member":false}]`), nil
		case "/api/leagues":
			return response(`[{"leagueid":12912,"name":"The International 2024","tier":"premium"}]`), nil
		default:
			return &http.Response{StatusCode: http.StatusNotFound, Header: make(http.Header), Body: io.NopCloser(strings.NewReader("not found"))}, nil
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
	roster, err := client.FetchTeamPlayers(context.Background(), 7119388)
	if err != nil || len(roster) != 2 {
		t.Fatalf("roster=%v err=%v", roster, err)
	}
	current := 0
	for _, pl := range roster {
		if pl.IsCurrent {
			current++
			if pl.AccountID == nil || *pl.AccountID != 321580662 {
				t.Fatalf("current member account id = %v", pl.AccountID)
			}
		}
	}
	if current != 1 {
		t.Fatalf("expected 1 current member, got %d", current)
	}
	leagues, err := client.FetchLeagues(context.Background())
	if err != nil || len(leagues) != 1 || leagues[0].Tier != "premium" {
		t.Fatalf("leagues=%v err=%v", leagues, err)
	}
	if _, err := client.FetchTeamPlayers(context.Background(), 0); err == nil {
		t.Fatal("expected error for invalid teamId")
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func response(body string) *http.Response {
	return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}
}
