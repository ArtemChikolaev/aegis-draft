package teamsuccess

import (
	"math"
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/aegis-draft/pipeline/internal/model"
	"github.com/aegis-draft/pipeline/internal/rating"
)

func TestCalculateRanksChampionAboveOutsider(t *testing.T) {
	events := []TeamEventResult{
		{EventID: "ti", TeamID: 1, EndTime: unixDate("2026-06-01"), Tier: TierTI, Placement: 1, PrizeUSD: 5_000_000},
		{EventID: "league", TeamID: 2, EndTime: unixDate("2026-06-01"), Tier: TierOne, Placement: 5, PrizeUSD: 100_000},
	}
	matches := append(teamMatches(1, 100, "2026-05-01", 20, 14), teamMatches(2, 200, "2026-05-01", 20, 9)...)
	result, err := Calculate(mustDate("2026-07-11"), events, matches, rating.Default())
	if err != nil {
		t.Fatal(err)
	}
	champion := result["1"][model.Last1y]
	outsider := result["2"][model.Last1y]
	if champion.SuccessScore <= outsider.SuccessScore || champion.Titles != 1 || champion.TopFinishes != 1 || champion.TIPlacement != 1 {
		t.Fatalf("champion=%+v outsider=%+v", champion, outsider)
	}
	if champion.Games != 20 || champion.Winrate != 0.7 {
		t.Fatalf("raw match confidence lost: %+v", champion)
	}
}

func TestCalculateAppliesTIPrestigeAboveMajorAndTierOne(t *testing.T) {
	events := []TeamEventResult{
		{EventID: "ti", TeamID: 1, EndTime: unixDate("2026-06-01"), Tier: TierTI, Placement: 1},
		{EventID: "major", TeamID: 2, EndTime: unixDate("2026-06-01"), Tier: TierMajor, Placement: 1},
		{EventID: "tier1", TeamID: 3, EndTime: unixDate("2026-06-01"), Tier: TierOne, Placement: 1},
	}
	result, err := Calculate(mustDate("2026-07-11"), events, nil, rating.Default())
	if err != nil {
		t.Fatal(err)
	}
	ti := result["1"][model.Last1y].SuccessScore
	major := result["2"][model.Last1y].SuccessScore
	tierOne := result["3"][model.Last1y].SuccessScore
	if ti <= major || major <= tierOne {
		t.Fatalf("prestige order broken: TI=%f Major=%f tier1=%f", ti, major, tierOne)
	}
}

func TestCalculateUsesNestedCalendarWindows(t *testing.T) {
	events := []TeamEventResult{
		{EventID: "old", TeamID: 1, EndTime: unixDate("2024-07-10"), Tier: TierMajor, Placement: 1, PrizeUSD: 1_000_000},
		{EventID: "recent", TeamID: 1, EndTime: unixDate("2026-01-01"), Tier: TierOne, Placement: 2, PrizeUSD: 250_000},
	}
	result, err := Calculate(mustDate("2026-07-11"), events, nil, rating.Default())
	if err != nil {
		t.Fatal(err)
	}
	windows := result["1"]
	if windows[model.Last1y].PrizeUsd != 250_000 || windows[model.Last2y].PrizeUsd != 250_000 || windows[model.Last5y].PrizeUsd != 1_250_000 {
		t.Fatalf("window filtering mismatch: %+v", windows)
	}
}

func TestCalculateSmoothsSmallWinrateSample(t *testing.T) {
	matches := append(teamMatches(1, 100, "2026-05-01", 1, 1), teamMatches(2, 200, "2026-05-01", 20, 15)...)
	result, err := Calculate(mustDate("2026-07-11"), nil, matches, rating.Default())
	if err != nil {
		t.Fatal(err)
	}
	oneGame := result["1"][model.Last1y]
	stable := result["2"][model.Last1y]
	if oneGame.Winrate != 1 || oneGame.SuccessScore >= stable.SuccessScore {
		t.Fatalf("1-0 must not outrank stable 15-5: one=%+v stable=%+v", oneGame, stable)
	}
}

func TestScorePlayersWeightsTeamsByGamesAndBoundsIndividualForm(t *testing.T) {
	teams := map[string]map[model.Format]model.TeamWindowSuccess{
		"1": {model.Last2y: {SuccessScore: 90}},
		"2": {model.Last2y: {SuccessScore: 30}},
	}
	players := []PlayerInput{
		{AccountID: 3, IndividualOVR: 50, Teams: []PlayerTeamGames{{TeamID: 1, Games: 3}, {TeamID: 2, Games: 1}}},
		{AccountID: 1, IndividualOVR: 0, Teams: []PlayerTeamGames{{TeamID: 1, Games: 4}}},
		{AccountID: 2, IndividualOVR: 100, Teams: []PlayerTeamGames{{TeamID: 1, Games: 4}}},
	}
	result, err := ScorePlayers(model.Last2y, teams, players, rating.Default())
	if err != nil {
		t.Fatal(err)
	}
	if result[0].Score != 72 || result[1].Score != 100 || result[2].TeamScore != 75 || result[2].Score != 75 {
		t.Fatalf("unexpected player team-success scores: %+v", result)
	}
}

func TestTeamSuccessIsDeterministicAndRejectsBrokenLinks(t *testing.T) {
	events := []TeamEventResult{
		{EventID: "a", TeamID: 2, EndTime: unixDate("2026-01-01"), Tier: TierMajor, Placement: 2, PrizeUSD: 500_000},
		{EventID: "b", TeamID: 1, EndTime: unixDate("2026-02-01"), Tier: TierOne, Placement: 1, PrizeUSD: 300_000},
	}
	first, err := Calculate(mustDate("2026-07-11"), events, nil, rating.Default())
	if err != nil {
		t.Fatal(err)
	}
	slices.Reverse(events)
	second, err := Calculate(mustDate("2026-07-11"), events, nil, rating.Default())
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("team success must be deterministic: first=%+v second=%+v", first, second)
	}
	_, err = ScorePlayers(model.Last2y, first, []PlayerInput{{AccountID: 1, IndividualOVR: 50, Teams: []PlayerTeamGames{{TeamID: 999, Games: 1}}}}, rating.Default())
	if err == nil {
		t.Fatal("missing canonical team link must fail")
	}
	broken := rating.Default()
	broken.PrizeReferenceUSD = math.NaN()
	if _, err := Calculate(mustDate("2026-07-11"), events, nil, broken); err == nil {
		t.Fatal("non-finite config must fail")
	}
	invalidScore := map[string]map[model.Format]model.TeamWindowSuccess{"1": {model.Last2y: {SuccessScore: 101}}}
	if _, err := ScorePlayers(model.Last2y, invalidScore, []PlayerInput{{AccountID: 1, IndividualOVR: 50, Teams: []PlayerTeamGames{{TeamID: 1, Games: 1}}}}, rating.Default()); err == nil {
		t.Fatal("out-of-contract team score must fail")
	}
}

func teamMatches(teamID int, matchBase int64, start string, games, wins int) []TeamMatchResult {
	date := mustDate(start)
	result := make([]TeamMatchResult, 0, games)
	for index := 0; index < games; index++ {
		result = append(result, TeamMatchResult{
			MatchID: matchBase + int64(index), TeamID: teamID,
			StartTime: date.AddDate(0, 0, index).Unix(), Won: index < wins,
		})
	}
	return result
}

func mustDate(value string) time.Time {
	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		panic(err)
	}
	return parsed
}

func unixDate(value string) int64 { return mustDate(value).Unix() }
