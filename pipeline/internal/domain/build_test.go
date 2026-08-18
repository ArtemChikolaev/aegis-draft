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
// Второе событие обязательно: гейт присутствия не пускает в пул команду, отыгравшую одно.
func fullSnapshot() *normalize.OpenDotaSnapshot {
	return snapshotFromMatches(alsoAt(fixtureMatches(), 200))
}

func snapshotFromMatches(matches []normalize.NormalizedMatch) *normalize.OpenDotaSnapshot {
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
	if len(ds.Packs) != 4 {
		t.Fatalf("packs: %d, want 4 (team10/team20 × 2 события)", len(ds.Packs))
	}
	if ds.Manifest.Counts["heroes"] != 2 || ds.Manifest.Counts["packs"] != 4 {
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

// Событие, всё поле которого — разовые стаки, исчезает из датасета целиком (TDATA3,
// кейс «GOTF 2025»): гейт присутствия уносит все его паки, а событие без паков — мёртвые
// метаданные с недостижимыми eventHeroStats (кандидаты приходят только из паков).
func TestBuildDropsEventsWithoutPacks(t *testing.T) {
	matches := alsoAt(fixtureMatches(), 200) // team10/team20 играют два события — проходят гейт
	// league-400: поле из двух команд, каждая существует ровно в этом розыгрыше.
	stackA := []fplayer{{31, 1, 44, 600, false}, {32, 2, 74, 550, false}, {33, 3, 114, 450, false}, {34, 1, 26, 250, false}, {35, 3, 5, 200, true}}
	stackB := []fplayer{{41, 1, 1, 610, false}, {42, 2, 11, 540, false}, {43, 3, 41, 440, false}, {44, 1, 87, 240, false}, {45, 3, 128, 190, true}}
	for i := 0; i < 3; i++ {
		m := packMatch(int64(1300+i), stackA, stackB, 30, 40)
		m.LeagueID = 400
		matches = append(matches, m)
	}

	in := Input{
		Snapshot: snapshotFromMatches(matches),
		Aggregates: &aggregate.OpenDotaResult{
			PlayerHeroStats: map[string]map[string]model.Stat{},
			Teammates:       map[string][]int{},
		},
		Teams:              fixtureTeams,
		Leagues:            testLeagues,
		Heroes:             []opendota.Hero{{ID: 44, Name: "npc_dota_hero_phantom_assassin", LocalizedName: "Phantom Assassin"}},
		AsOf:               asOf(),
		Config:             rating.Default(),
		RatingModelVersion: "test-1",
	}
	ds, err := Build(in)
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	for _, event := range ds.Events {
		if event.ID == "league-400" {
			t.Fatal("league-400 остался в events, хотя все его паки срезаны гейтом")
		}
	}
	if len(ds.Events) != 2 {
		t.Fatalf("events: %d, want 2 (league-100/league-200)", len(ds.Events))
	}
	if _, ok := ds.EventHeroStats["league-400"]; ok {
		t.Fatal("eventHeroStats мёртвого события должны исчезнуть вместе с ним")
	}
	if ds.Manifest.Counts["events"] != 2 {
		t.Fatalf("manifest count events: %d, want 2", ds.Manifest.Counts["events"])
	}
	// Инвариант validate ловит регрессию фильтра — датасет обязан его проходить.
	if err := validate.Dataset(ds); err != nil {
		t.Fatalf("dataset fails invariants: %v", err)
	}
}

func keysOf(m map[string]map[string]map[string]model.Stat) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}
