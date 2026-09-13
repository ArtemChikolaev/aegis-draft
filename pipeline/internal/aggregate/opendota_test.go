package aggregate

import (
	"encoding/json"
	"reflect"
	"sort"
	"testing"

	"github.com/aegis-draft/pipeline/internal/model"
	"github.com/aegis-draft/pipeline/internal/normalize"
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

// Chemistry читает только пары, поэтому aggregate эмитит только их: полная сторона — ровно 10
// пар, без троек, четвёрок и пятёрки (они занимали две трети squadSynergy.json).
func TestFromOpenDotaEmitsOnlyPairs(t *testing.T) {
	players := make([]normalize.NormalizedAppearance, 0, 10)
	for account := 1; account <= 10; account++ {
		teamID := 10
		if account > 5 {
			teamID = 20
		}
		players = append(players, normalize.NormalizedAppearance{AccountID: account, TeamID: teamID, HeroID: account})
	}
	snapshot := &normalize.OpenDotaSnapshot{Matches: []normalize.NormalizedMatch{
		{MatchID: 1, RadiantTeamID: 10, DireTeamID: 20, RadiantWin: true, Players: players},
	}}
	result, err := FromOpenDota(snapshot, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.SquadSynergy) != 20 {
		t.Fatalf("two full sides must give 2×10 pairs, got %d", len(result.SquadSynergy))
	}
	for i, group := range result.SquadSynergy {
		if len(group.IDs) != 2 {
			t.Fatalf("only pairs are emitted, got %v", group.IDs)
		}
		if i > 0 {
			prev := result.SquadSynergy[i-1].IDs
			if prev[0] > group.IDs[0] || (prev[0] == group.IDs[0] && prev[1] >= group.IDs[1]) {
				t.Fatalf("pairs must be sorted by ids: %v before %v", prev, group.IDs)
			}
		}
	}
	if pair := findPair(result, 1, 5); pair == nil || pair.Games != 1 || pair.Winrate != 1 {
		t.Fatalf("winning pair=%+v", pair)
	}
	if pair := findPair(result, 6, 10); pair == nil || pair.Games != 1 || pair.Winrate != 0 {
		t.Fatalf("losing pair=%+v", pair)
	}
	if err := Validate(result); err != nil {
		t.Fatal(err)
	}
	result.SquadSynergy = append(result.SquadSynergy, model.SquadGroup{IDs: []int{1, 2, 3}, Games: 1, Winrate: 1})
	if err := Validate(result); err == nil {
		t.Fatal("Validate must reject squad groups larger than a pair")
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

func findPair(result *OpenDotaResult, a, b int) *model.SquadGroup {
	return findGroup(result, a, b)
}

// findGroup — группа ровно из переданных id (в любом порядке; в данных они отсортированы).
func findGroup(result *OpenDotaResult, ids ...int) *model.SquadGroup {
	sort.Ints(ids)
	for i := range result.SquadSynergy {
		group := &result.SquadSynergy[i]
		if len(group.IDs) != len(ids) {
			continue
		}
		match := true
		for k := range ids {
			if group.IDs[k] != ids[k] {
				match = false
				break
			}
		}
		if match {
			return group
		}
	}
	return nil
}
