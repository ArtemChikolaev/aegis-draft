package collect

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/aegis-draft/pipeline/internal/opendota"
)

func TestOpenDotaWindowResumesFromRawCache(t *testing.T) {
	httpClient := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		body := ""
		switch r.URL.Path {
		case "/proMatches":
			if r.URL.Query().Get("less_than_match_id") == "4" {
				body = `[{"match_id":3,"start_time":80}]`
				break
			}
			body = `[{"match_id":5,"start_time":200},{"match_id":4,"start_time":190}]`
		case "/matches/5":
			body = `{"match_id":5}`
		case "/matches/4":
			body = `{"match_id":4}`
		default:
			return nil, fmt.Errorf("unexpected path %s", r.URL.Path)
		}
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}, nil
	})}

	cache := t.TempDir()
	config := OpenDotaConfig{WindowStartUnix: 100, CollectDetails: true}
	first := newClient(t, cache, 2, httpClient)
	one, err := OpenDotaWindow(context.Background(), first, config)
	if err != nil || !one.DiscoveryComplete || len(one.ProMatches) != 2 || len(one.Details) != 0 {
		t.Fatalf("first=%+v err=%v", one, err)
	}

	second := newClient(t, cache, 1, httpClient)
	two, err := OpenDotaWindow(context.Background(), second, config)
	if err != nil || len(two.Details) != 1 || two.DetailsComplete {
		t.Fatalf("second=%+v err=%v", two, err)
	}

	third := newClient(t, cache, 1, httpClient)
	three, err := OpenDotaWindow(context.Background(), third, config)
	if err != nil || len(three.Details) != 2 || !three.DetailsComplete {
		t.Fatalf("third=%+v err=%v", three, err)
	}
	if stats := third.Stats(); stats.CacheHits != 3 || stats.NetworkRequests != 1 {
		t.Fatalf("resume stats=%+v", stats)
	}

	capped := newClient(t, cache, 1, httpClient)
	four, err := OpenDotaWindow(context.Background(), capped, OpenDotaConfig{WindowStartUnix: 100, MatchLimit: 1, CollectDetails: true})
	if err != nil || len(four.Details) != 1 || four.DetailsComplete {
		t.Fatalf("a capped smoke must not claim full detail completeness: result=%+v err=%v", four, err)
	}
}

func TestOpenDotaWindowFiltersTier1Leagues(t *testing.T) {
	httpClient := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/proMatches" {
			return nil, fmt.Errorf("unexpected path %s", r.URL.Path)
		}
		// leagueid 1 = премьер, 2 = не-премьер; вторая страница пустая = конец дискавери.
		body := `[]`
		if r.URL.Query().Get("less_than_match_id") == "" {
			body = `[{"match_id":5,"start_time":200,"leagueid":1},{"match_id":4,"start_time":190,"leagueid":2},{"match_id":3,"start_time":180,"leagueid":1}]`
		}
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}, nil
	})}
	cache := t.TempDir()
	client := newClient(t, cache, 5, httpClient)
	result, err := OpenDotaWindow(context.Background(), client, OpenDotaConfig{
		WindowStartUnix: 100,
		Tier1Leagues:    map[int64]struct{}{1: {}},
	})
	if err != nil || !result.DiscoveryComplete {
		t.Fatalf("result=%+v err=%v", result, err)
	}
	if len(result.ProMatches) != 2 {
		t.Fatalf("tier-1 фильтр должен оставить только премьер-матчи, got %d", len(result.ProMatches))
	}
	for _, m := range result.ProMatches {
		if m.LeagueID != 1 {
			t.Fatalf("не-премьер лига просочилась: match %d league %d", m.MatchID, m.LeagueID)
		}
	}
}

func TestCapPerLeague(t *testing.T) {
	matches := []opendota.ProMatch{
		{MatchID: 5, LeagueID: 1}, {MatchID: 4, LeagueID: 1}, {MatchID: 3, LeagueID: 1},
		{MatchID: 2, LeagueID: 2}, {MatchID: 1, LeagueID: 2},
	}
	out := capPerLeague(matches, 2)
	perLeague := map[int64]int{}
	for _, m := range out {
		perLeague[m.LeagueID]++
	}
	if perLeague[1] != 2 || perLeague[2] != 2 || len(out) != 4 {
		t.Fatalf("cap 2/league: ожидали league1=2, league2=2, total=4; got %v total %d", perLeague, len(out))
	}
	// Порядок сохранён (свежие match_id первыми): league 1 → 5,4.
	if out[0].MatchID != 5 || out[1].MatchID != 4 {
		t.Fatalf("cap должен сохранять порядок (свежие первыми): %+v", out[:2])
	}
}

func TestOpenDotaExplorerDiscoversAndResumes(t *testing.T) {
	httpClient := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		body := ""
		switch r.URL.Path {
		case "/explorer":
			// rolling-ось имеет "start_time >=" в SQL; valve_legacy (since=0) — нет.
			if strings.Contains(r.URL.Query().Get("sql"), "start_time >=") {
				body = `{"rows":[{"match_id":5,"start_time":200,"leagueid":100}]}`
			} else {
				body = `{"rows":[{"match_id":9,"start_time":50,"leagueid":900}]}` // старый valve_legacy вне окна
			}
		case "/matches/5":
			body = `{"match_id":5}`
		case "/matches/9":
			body = `{"match_id":9}`
		default:
			return nil, fmt.Errorf("unexpected path %s", r.URL.Path)
		}
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}, nil
	})}

	cache := t.TempDir()
	cfg := ExplorerConfig{RollingLeagues: []int64{100}, LegacyLeagues: []int64{900}, WindowStartUnix: 100, CollectDetails: true}

	// Прогон 1, budget 2: обе explorer-дискавери проходят (2 сети), детали упираются в бюджет.
	one, err := OpenDotaExplorer(context.Background(), newClient(t, cache, 2, httpClient), cfg)
	if err != nil || !one.DiscoveryComplete || len(one.ProMatches) != 2 || len(one.Details) != 0 {
		t.Fatalf("first=%+v err=%v", one, err)
	}

	// Прогон 2, budget 1: дискавери из кэша (0 сети), 1 деталь.
	two, err := OpenDotaExplorer(context.Background(), newClient(t, cache, 1, httpClient), cfg)
	if err != nil || len(two.Details) != 1 || two.DetailsComplete {
		t.Fatalf("second=%+v err=%v", two, err)
	}

	// Прогон 3, budget 1: добирает вторую деталь, всё из кэша кроме одной сети.
	third := newClient(t, cache, 1, httpClient)
	three, err := OpenDotaExplorer(context.Background(), third, cfg)
	if err != nil || len(three.Details) != 2 || !three.DetailsComplete {
		t.Fatalf("third=%+v err=%v", three, err)
	}
	if stats := third.Stats(); stats.NetworkRequests != 1 {
		t.Fatalf("resume должен быть из кэша кроме одной сети: stats=%+v", stats)
	}
}

func newClient(t *testing.T, cache string, budget int, httpClient *http.Client) *opendota.Client {
	t.Helper()
	client, err := opendota.New(opendota.Config{
		BaseURL: "https://example.invalid/", CacheDir: cache, MinInterval: -1, RequestBudget: budget, HTTPClient: httpClient,
	})
	if err != nil {
		t.Fatal(err)
	}
	return client
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) { return fn(request) }
