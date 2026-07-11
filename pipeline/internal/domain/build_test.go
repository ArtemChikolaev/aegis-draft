package domain

import (
	"sort"
	"testing"

	"github.com/aegis-draft/pipeline/internal/aggregate"
	"github.com/aegis-draft/pipeline/internal/model"
	"github.com/aegis-draft/pipeline/internal/normalize"
	"github.com/aegis-draft/pipeline/internal/opendota"
	"github.com/aegis-draft/pipeline/internal/rating"
	"github.com/aegis-draft/pipeline/internal/validate"
)

// fullSnapshot строит snapshot со ВСЕМИ аккаунтами фикстуры (как делает normalize).
func fullSnapshot() *normalize.OpenDotaSnapshot {
	matches := fixtureMatches()
	teamsByAccount := make(map[int]map[int]struct{})
	for _, match := range matches {
		for _, app := range match.Players {
			if teamsByAccount[app.AccountID] == nil {
				teamsByAccount[app.AccountID] = make(map[int]struct{})
			}
			teamsByAccount[app.AccountID][app.TeamID] = struct{}{}
		}
	}
	accountIDs := make([]int, 0, len(teamsByAccount))
	for accountID := range teamsByAccount {
		accountIDs = append(accountIDs, accountID)
	}
	sort.Ints(accountIDs)
	players := make([]normalize.NormalizedPlayer, 0, len(accountIDs))
	for _, accountID := range accountIDs {
		teamIDs := make([]int, 0, len(teamsByAccount[accountID]))
		for teamID := range teamsByAccount[accountID] {
			teamIDs = append(teamIDs, teamID)
		}
		sort.Ints(teamIDs)
		players = append(players, normalize.NormalizedPlayer{AccountID: accountID, TeamIDs: teamIDs})
	}
	return &normalize.OpenDotaSnapshot{Matches: matches, Players: players}
}

func TestBuildDatasetPassesInvariants(t *testing.T) {
	in := Input{
		Snapshot: fullSnapshot(),
		Aggregates: &aggregate.OpenDotaResult{
			PlayerHeroStats: map[string]map[string]model.Stat{},
			Teammates:       map[string][]int{},
		},
		Teams:   fixtureTeams,
		Leagues: testLeagues,
		Heroes: []opendota.Hero{
			{ID: 44, Name: "npc_dota_hero_phantom_assassin", LocalizedName: "Phantom Assassin"},
			{ID: 1, Name: "npc_dota_hero_antimage", LocalizedName: "Anti-Mage"},
		},
		AsOf:               asOf(),
		Config:             rating.Default(),
		RatingModelVersion: "test-1",
	}
	ds, err := Build(in)
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if err := validate.Dataset(ds); err != nil {
		t.Fatalf("dataset fails invariants: %v", err)
	}
	if len(ds.Packs) != 2 {
		t.Fatalf("packs: %d, want 2", len(ds.Packs))
	}
	if ds.Manifest.Counts["heroes"] != 2 || ds.Manifest.Counts["packs"] != 2 {
		t.Fatalf("manifest counts: %+v", ds.Manifest.Counts)
	}
	// Героев конвертнули (id-сортировка, picture-slug).
	if ds.Heroes[0].ID != 1 || ds.Heroes[0].Picture != "antimage" || ds.Heroes[0].Name != "Anti-Mage" {
		t.Fatalf("hero conversion: %+v", ds.Heroes[0])
	}
	if len(ds.Manifest.Formats) == 0 {
		t.Fatal("expected non-empty manifest formats")
	}
	if _, ok := ds.EventHeroStats["league-100"]; !ok {
		t.Fatalf("expected eventHeroStats for league-100, got keys %v", keysOf(ds.EventHeroStats))
	}
}

func keysOf(m map[string]map[string]map[string]model.Stat) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}
