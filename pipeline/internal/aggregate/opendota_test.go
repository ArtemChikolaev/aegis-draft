package aggregate

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/aegis-draft/pipeline/internal/model"
	"github.com/aegis-draft/pipeline/internal/normalize"
	"github.com/aegis-draft/pipeline/internal/opendota"
)

func TestFromOpenDotaAggregatesHeroesAndTeammates(t *testing.T) {
	result, err := FromOpenDota(fixture(), 0)
	if err != nil {
		t.Fatal(err)
	}
	if result.MatchCount != 2 || result.AppearanceCount != 8 {
		t.Fatalf("counts=%+v", result)
	}
	stat := result.PlayerHeroStats["1"]["10"]
	if stat.Games != 2 || stat.Winrate != 0.5 {
		t.Fatalf("player hero stat=%+v", stat)
	}
	if !reflect.DeepEqual(result.Teammates["1"], []int{2, 3}) {
		t.Fatalf("teammates=%v", result.Teammates["1"])
	}
	if pair := findPair(result, 1, 2); pair == nil || pair.Games != 1 || pair.Winrate != 1 {
		t.Fatalf("winning pair=%+v", pair)
	}
	if pair := findPair(result, 1, 3); pair == nil || pair.Games != 1 || pair.Winrate != 0 {
		t.Fatalf("losing pair=%+v", pair)
	}
	if pair := findPair(result, 1, 4); pair != nil {
		t.Fatalf("opponents must not become squad pair: %+v", pair)
	}
	if err := Validate(result); err != nil {
		t.Fatal(err)
	}
}

func TestFromOpenDotaSplitsWindowAndProCareer(t *testing.T) {
	snap := fixture()
	snap.Matches[0].StartTime = 100
	snap.Matches[1].StartTime = 200
	result, err := FromOpenDota(snap, 150)
	if err != nil {
		t.Fatal(err)
	}
	if stat := result.CareerPlayerHeroStats["1"]["10"]; stat.Games != 2 {
		t.Fatalf("pro career=%+v", stat)
	}
	if stat := result.PlayerHeroStats["1"]["10"]; stat.Games != 1 {
		t.Fatalf("window stat=%+v", stat)
	}
	if err := Validate(result); err != nil {
		t.Fatal(err)
	}
}

func TestAddCareerPlayerHeroesUsesEndpointTotals(t *testing.T) {
	result, err := FromOpenDota(fixture(), 0)
	if err != nil {
		t.Fatal(err)
	}
	err = AddCareerPlayerHeroes(result, 1, []opendota.PlayerHero{
		{HeroID: 10, Games: 20, Wins: 12}, {HeroID: 11, Games: 0, Wins: 0},
	})
	if err != nil {
		t.Fatal(err)
	}
	stat := result.CareerPlayerHeroStats["1"]["10"]
	if stat.Games != 20 || stat.Winrate != 0.6 {
		t.Fatalf("career stat=%+v", stat)
	}
	if _, exists := result.CareerPlayerHeroStats["1"]["11"]; exists {
		t.Fatal("zero-game career rows must be omitted")
	}
	if err := Validate(result); err != nil {
		t.Fatal(err)
	}
}

func TestValidateRejectsAsymmetricTeammates(t *testing.T) {
	result, err := FromOpenDota(fixture(), 0)
	if err != nil {
		t.Fatal(err)
	}
	result.Teammates["2"] = nil
	if err := Validate(result); err == nil {
		t.Fatal("expected asymmetric teammates error")
	}
}

func TestFromOpenDotaIsDeterministic(t *testing.T) {
	first, err := FromOpenDota(fixture(), 0)
	if err != nil {
		t.Fatal(err)
	}
	reversed := fixture()
	reversed.Matches[0], reversed.Matches[1] = reversed.Matches[1], reversed.Matches[0]
	second, err := FromOpenDota(reversed, 0)
	if err != nil {
		t.Fatal(err)
	}
	a, _ := json.Marshal(first)
	b, _ := json.Marshal(second)
	if string(a) != string(b) {
		t.Fatalf("non-deterministic output\n%s\n%s", a, b)
	}
}

func fixture() *normalize.OpenDotaSnapshot {
	return &normalize.OpenDotaSnapshot{Matches: []normalize.NormalizedMatch{
		{
			MatchID: 1, RadiantTeamID: 10, DireTeamID: 20, RadiantWin: true,
			Players: []normalize.NormalizedAppearance{
				{AccountID: 1, TeamID: 10, HeroID: 10}, {AccountID: 2, TeamID: 10, HeroID: 20},
				{AccountID: 3, TeamID: 20, HeroID: 30}, {AccountID: 4, TeamID: 20, HeroID: 40},
			},
		},
		{
			MatchID: 2, RadiantTeamID: 30, DireTeamID: 40, RadiantWin: false,
			Players: []normalize.NormalizedAppearance{
				{AccountID: 1, TeamID: 30, HeroID: 10}, {AccountID: 3, TeamID: 30, HeroID: 31},
				{AccountID: 2, TeamID: 40, HeroID: 21}, {AccountID: 4, TeamID: 40, HeroID: 41},
			},
		},
	}}
}

func findPair(result *OpenDotaResult, a, b int) *model.SquadPair {
	for i := range result.SquadSynergy {
		pair := &result.SquadSynergy[i]
		if pair.IDs == [2]int{a, b} {
			return pair
		}
	}
	return nil
}
