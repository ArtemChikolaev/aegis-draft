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

func TestMergePeersAddsLifetimeCrossTeamPairs(t *testing.T) {
	result, err := FromOpenDota(fixture(), 0)
	if err != nil {
		t.Fatal(err)
	}
	if findPair(result, 1, 4) != nil {
		t.Fatal("precondition: 1 и 4 всегда соперники — оконной пары быть не должно")
	}
	known := map[int]struct{}{1: {}, 2: {}, 3: {}, 4: {}}
	err = MergePeers(result, 1, []opendota.Peer{
		{AccountID: 4, WithGames: 185, WithWins: 110}, // кросс-командная пожизненная пара
		{AccountID: 2, WithGames: 200, WithWins: 120}, // перекрывает тонкий оконный счёт
		{AccountID: 999, WithGames: 50, WithWins: 25}, // вне pro-вселенной — игнор
		{AccountID: 1, WithGames: 10, WithWins: 5},    // сам себе — игнор
		{AccountID: 3, WithGames: 0, WithWins: 0},     // нет совместных игр — игнор
	}, known)
	if err != nil {
		t.Fatal(err)
	}
	if pair := findPair(result, 1, 4); pair == nil || pair.Games != 185 || pair.Winrate < 0.59 || pair.Winrate > 0.60 {
		t.Fatalf("кросс-командная пожизненная пара=%+v", pair)
	}
	if pair := findPair(result, 1, 2); pair == nil || pair.Games != 200 {
		t.Fatalf("пожизненные тоталы должны перекрыть оконный счёт: %+v", pair)
	}
	if findPair(result, 1, 999) != nil {
		t.Fatal("peer вне pro-вселенной не должен попадать в пары")
	}
	if !containsSorted(result.Teammates["1"], 4) || !containsSorted(result.Teammates["4"], 1) {
		t.Fatalf("teammates не симметричны: %v / %v", result.Teammates["1"], result.Teammates["4"])
	}
	if err := Validate(result); err != nil {
		t.Fatal(err)
	}
}

func TestMergePeersRejectsBadSourceAndStat(t *testing.T) {
	result, err := FromOpenDota(fixture(), 0)
	if err != nil {
		t.Fatal(err)
	}
	known := map[int]struct{}{1: {}, 2: {}}
	if err := MergePeers(result, 5, nil, known); err == nil {
		t.Fatal("ожидалась ошибка: источник вне pro-вселенной")
	}
	if err := MergePeers(result, 1, []opendota.Peer{{AccountID: 2, WithGames: 10, WithWins: 11}}, known); err == nil {
		t.Fatal("ожидалась ошибка: with_win > with_games")
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
