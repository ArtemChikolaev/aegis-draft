package normalize

import (
	"encoding/json"
	"testing"

	"github.com/aegis-draft/pipeline/internal/opendota"
)

func TestFromOpenDotaCanonicalizesAndSorts(t *testing.T) {
	a := int64(42)
	b := int64(7)
	matches := []*opendota.Match{{
		MatchID: 20, RadiantTeamID: 10, DireTeamID: 11,
		Players: []opendota.MatchPlayer{
			{AccountID: &a, Name: "A", PlayerSlot: 0, HeroID: 1},
			{AccountID: nil, PlayerSlot: 1, HeroID: 2},
			{AccountID: &b, Name: "B", PlayerSlot: 128, HeroID: 3},
		},
	}, {
		MatchID: 10, RadiantTeamID: 12, DireTeamID: 13,
		Players: []opendota.MatchPlayer{{AccountID: &a, PlayerSlot: 128, HeroID: 4}},
	}}
	snapshot, err := FromOpenDota(matches)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.SkippedPlayers != 1 || len(snapshot.Players) != 2 || len(snapshot.Matches) != 2 {
		t.Fatalf("snapshot=%+v", snapshot)
	}
	if snapshot.Matches[0].MatchID != 10 || snapshot.Players[0].AccountID != 7 {
		t.Fatalf("output is not sorted: %+v", snapshot)
	}
	if snapshot.Players[1].TeamIDs[0] != 10 || snapshot.Players[1].TeamIDs[1] != 13 {
		t.Fatalf("team history=%v", snapshot.Players[1].TeamIDs)
	}
	first, _ := json.Marshal(snapshot)
	again, err := FromOpenDota([]*opendota.Match{matches[1], matches[0]})
	if err != nil {
		t.Fatal(err)
	}
	second, _ := json.Marshal(again)
	if string(first) != string(second) {
		t.Fatal("snapshot must be deterministic regardless of input order")
	}
}

func TestFromOpenDotaRejectsDuplicateAccountInMatch(t *testing.T) {
	accountID := int64(42)
	_, err := FromOpenDota([]*opendota.Match{{
		MatchID: 1, RadiantTeamID: 10, DireTeamID: 11,
		Players: []opendota.MatchPlayer{{AccountID: &accountID}, {AccountID: &accountID, PlayerSlot: 1}},
	}})
	if err == nil {
		t.Fatal("expected duplicate accountId error")
	}
}

func TestFromOpenDotaRejectsDuplicateSlot(t *testing.T) {
	a := int64(1)
	b := int64(2)
	_, err := FromOpenDota([]*opendota.Match{{
		MatchID: 1, RadiantTeamID: 10, DireTeamID: 11,
		Players: []opendota.MatchPlayer{{AccountID: &a, PlayerSlot: 0}, {AccountID: &b, PlayerSlot: 0}},
	}})
	if err == nil {
		t.Fatal("expected duplicate playerSlot error")
	}
}

// Реальные bulk-данные содержат матчи с team_id=0 или полностью анонимными
// игроками — их пропускаем, а не роняем весь сбор.
func TestFromOpenDotaSkipsDirtyMatches(t *testing.T) {
	a := int64(1)
	good := int64(2)
	matches := []*opendota.Match{
		{MatchID: 1, RadiantTeamID: 10, DireTeamID: 0, // невалидный team_id → skip
			Players: []opendota.MatchPlayer{{AccountID: &a, PlayerSlot: 0}}},
		{MatchID: 2, RadiantTeamID: 10, DireTeamID: 11}, // нет канонических игроков → skip
		{MatchID: 3, RadiantTeamID: 12, DireTeamID: 13, // валидный
			Players: []opendota.MatchPlayer{{AccountID: &good, PlayerSlot: 0}}},
	}
	snapshot, err := FromOpenDota(matches)
	if err != nil {
		t.Fatalf("dirty matches must not fail the run: %v", err)
	}
	if snapshot.SkippedMatches != 2 || len(snapshot.Matches) != 1 || snapshot.Matches[0].MatchID != 3 {
		t.Fatalf("expected 2 skipped + only match 3 kept: %+v", snapshot)
	}
}
