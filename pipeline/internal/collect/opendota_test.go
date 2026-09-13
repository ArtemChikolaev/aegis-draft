package collect

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync/atomic"
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
	cfg := ExplorerConfig{RollingLeagues: []int64{100}, LegacyLeagues: []int64{900}, WindowStartUnix: 100, BeforeUnix: 1000, CollectDetails: true}

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

// Discovery ограничен as-of: вчерашний кэш explorer не отвечает на запрос с новым as-of (новый
// ключ ⇒ сеть, новые матчи видны), а повтор с тем же as-of идёт из кэша без сети.
func TestOpenDotaExplorerRefreshesDiscoveryWhenAsOfMoves(t *testing.T) {
	var explorerCalls atomic.Int32
	played := []struct{ id, start int64 }{{5, 100}, {6, 200}} // матч 6 сыгран «сегодня»
	httpClient := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		body := ""
		switch {
		case r.URL.Path == "/explorer":
			explorerCalls.Add(1)
			sql := r.URL.Query().Get("sql")
			_, bound, found := strings.Cut(sql, "start_time < ")
			if !found {
				return nil, fmt.Errorf("explorer SQL must be bounded by as-of: %q", sql)
			}
			before, err := strconv.ParseInt(strings.Fields(bound)[0], 10, 64)
			if err != nil {
				return nil, err
			}
			rows := make([]string, 0, len(played))
			for _, match := range played {
				if match.start < before {
					rows = append(rows, fmt.Sprintf(`{"match_id":%d,"start_time":%d,"leagueid":100}`, match.id, match.start))
				}
			}
			body = `{"rows":[` + strings.Join(rows, ",") + `]}`
		case strings.HasPrefix(r.URL.Path, "/matches/"):
			body = `{"match_id":` + strings.TrimPrefix(r.URL.Path, "/matches/") + `}`
		default:
			return nil, fmt.Errorf("unexpected path %s", r.URL.Path)
		}
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}, nil
	})}

	cache := t.TempDir()
	yesterday := ExplorerConfig{RollingLeagues: []int64{100}, BeforeUnix: 150, CollectDetails: true}
	first, err := OpenDotaExplorer(context.Background(), newClient(t, cache, 0, httpClient), yesterday)
	if err != nil || len(first.ProMatches) != 1 || !first.DetailsComplete || explorerCalls.Load() != 1 {
		t.Fatalf("first=%+v explorer=%d err=%v", first, explorerCalls.Load(), err)
	}

	// Тот же as-of: discovery и детали из кэша, сети нет — повторный прогон детерминирован.
	replay := newClient(t, cache, 0, httpClient)
	again, err := OpenDotaExplorer(context.Background(), replay, yesterday)
	if err != nil || len(again.ProMatches) != 1 || explorerCalls.Load() != 1 || replay.Stats().NetworkRequests != 0 {
		t.Fatalf("same as-of must replay the cache: again=%+v explorer=%d stats=%+v err=%v", again, explorerCalls.Load(), replay.Stats(), err)
	}

	// Новый as-of: новый ключ explorer — сетевой запрос, и discovery видит матч 6.
	today := yesterday
	today.BeforeUnix = 250
	next := newClient(t, cache, 0, httpClient)
	fresh, err := OpenDotaExplorer(context.Background(), next, today)
	if err != nil || len(fresh.ProMatches) != 2 || !fresh.DetailsComplete || explorerCalls.Load() != 2 {
		t.Fatalf("new as-of must refresh discovery: fresh=%+v explorer=%d err=%v", fresh, explorerCalls.Load(), err)
	}
	// Сеть — только explorer и детали нового матча; /matches/5 остаётся в вечном кэше.
	if stats := next.Stats(); stats.NetworkRequests != 2 || stats.CacheHits != 1 {
		t.Fatalf("stats=%+v", stats)
	}

	if _, err := OpenDotaExplorer(context.Background(), next, ExplorerConfig{RollingLeagues: []int64{100}}); err == nil {
		t.Fatal("explorer discovery without an as-of bound must be rejected: its raw cache would never refresh")
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
