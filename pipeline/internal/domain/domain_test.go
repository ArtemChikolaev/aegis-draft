package domain

import (
	"testing"
	"time"

	"github.com/aegis-draft/pipeline/internal/model"
	"github.com/aegis-draft/pipeline/internal/normalize"
	"github.com/aegis-draft/pipeline/internal/opendota"
	"github.com/aegis-draft/pipeline/internal/rating"
)

func asOf() time.Time { return time.Date(2026, 7, 11, 0, 0, 0, 0, time.UTC) }

func md(matchID, leagueID int64, start time.Time, radiant, dire int, radiantWin bool) normalize.NormalizedMatch {
	return normalize.NormalizedMatch{
		MatchID: matchID, LeagueID: leagueID, StartTime: start.Unix(),
		RadiantTeamID: radiant, DireTeamID: dire, RadiantWin: radiantWin,
	}
}

var testLeagues = []opendota.League{
	{LeagueID: 100, Name: "Premium Cup", Tier: "premium"},
	{LeagueID: 200, Name: "DreamLeague Season 20", Tier: "professional"},
	{LeagueID: 300, Name: "Amateur Ladder", Tier: "amateur"},
}

func TestBuildEvents(t *testing.T) {
	recent := time.Date(2025, 9, 10, 0, 0, 0, 0, time.UTC) // last_1y/2y/5y
	old := time.Date(2023, 8, 20, 0, 0, 0, 0, time.UTC)    // только last_5y
	matches := []normalize.NormalizedMatch{
		md(1, 100, recent, 1, 2, true),
		md(2, 200, old, 3, 4, true),
		md(3, 300, recent, 5, 6, true), // amateur → отброшен
		md(4, 999, recent, 7, 8, true), // неизвестная лига → отброшена
	}
	events := BuildEvents(matches, testLeagues, asOf(), 0)
	if len(events) != 2 {
		t.Fatalf("expected 2 events, got %d: %+v", len(events), events)
	}
	// Отсортированы по id (league-100 < league-200).
	if events[0].ID != "league-100" || events[1].ID != "league-200" {
		t.Fatalf("event ids/order: %s, %s", events[0].ID, events[1].ID)
	}
	premium := events[0]
	if premium.Type != "tier1" || premium.EndDate != "2025-09-10" || premium.Year != 2025 {
		t.Fatalf("premium event fields: %+v", premium)
	}
	if !hasFormat(premium.Formats, model.Last1y) || !hasFormat(premium.Formats, model.Last5y) {
		t.Fatalf("premium formats: %v", premium.Formats)
	}
	pro := events[1]
	if pro.Type != "tier2" || hasFormat(pro.Formats, model.Last1y) || !hasFormat(pro.Formats, model.Last5y) {
		t.Fatalf("pro event formats: %+v", pro)
	}
}

func TestBuildTeamSuccessTierAndSmoothing(t *testing.T) {
	when := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC) // внутри last_1y
	var matches []normalize.NormalizedMatch
	id := int64(1)
	add := func(league int64, team, opp, wins, total int) {
		for i := 0; i < total; i++ {
			matches = append(matches, md(id, league, when, team, opp, i < wins))
			id++
		}
	}
	add(100, 1, 91, 7, 10)  // premium, 70%
	add(200, 2, 92, 7, 10)  // professional, 70%
	add(100, 3, 93, 1, 1)   // premium, 1-0
	add(100, 4, 94, 15, 20) // premium, 15-5

	ts := BuildTeamSuccess(matches, testLeagues, asOf(), rating.Default())

	get := func(team string) model.TeamWindowSuccess {
		w, ok := ts[team]
		if !ok {
			t.Fatalf("no team success for %s", team)
		}
		return w[model.Last2y]
	}
	// Тот же winrate, но premium tier весит выше professional.
	if get("1").SuccessScore <= get("2").SuccessScore {
		t.Fatalf("premium %.2f should beat professional %.2f", get("1").SuccessScore, get("2").SuccessScore)
	}
	// Сглаживание: устойчивые 15-5 обгоняют 1-0.
	if get("4").SuccessScore <= get("3").SuccessScore {
		t.Fatalf("15-5 %.2f should beat 1-0 %.2f", get("4").SuccessScore, get("3").SuccessScore)
	}
	// Сырые метрики.
	if get("1").Games != 10 || round2(get("1").Winrate) != 0.7 {
		t.Fatalf("team1 raw: games=%d winrate=%.4f", get("1").Games, get("1").Winrate)
	}
	// Titles/prize deferred (нулевые).
	if get("1").Titles != 0 || get("1").PrizeUsd != 0 || get("1").TIPlacement != 0 {
		t.Fatalf("expected deferred zero titles/prize, got %+v", get("1"))
	}
	// Вложенность окон: все матчи в last_1y ⇒ идентичны в трёх окнах.
	if ts["1"][model.Last1y].SuccessScore != ts["1"][model.Last5y].SuccessScore {
		t.Fatalf("windows should nest identically for in-1y matches")
	}
	// valve_legacy не заполняется (deferred).
	if _, ok := ts["1"][model.ValveLegacy]; ok {
		t.Fatal("valve_legacy should be deferred, not built")
	}
}

func hasFormat(formats []model.Format, target model.Format) bool {
	for _, f := range formats {
		if f == target {
			return true
		}
	}
	return false
}
