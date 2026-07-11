package roles

import (
	"testing"

	"github.com/aegis-draft/pipeline/internal/model"
	"github.com/aegis-draft/pipeline/internal/normalize"
)

// app — краткий конструктор появления игрока.
func app(accountID, teamID, lane, gpm, xpm int, roaming bool) normalize.NormalizedAppearance {
	return normalize.NormalizedAppearance{
		AccountID: accountID, TeamID: teamID, LaneRole: lane,
		GoldPerMin: gpm, XPPerMin: xpm, LastHits: gpm, IsRoaming: roaming,
	}
}

// Классическая пятёрка: 3 кора + 2 саппорта, включая second safe/off support и роумера.
func fullTeam(teamID int) []normalize.NormalizedAppearance {
	return []normalize.NormalizedAppearance{
		app(1, teamID, laneSafe, 700, 600, false), // pos1 carry
		app(2, teamID, laneMid, 550, 650, false),  // mid
		app(3, teamID, laneOff, 450, 500, false),  // pos3 offlane
		app(4, teamID, laneSafe, 250, 300, false), // pos5 support (safe lane, low farm)
		app(5, teamID, laneOff, 200, 250, true),   // pos4 roaming support
	}
}

func rolesOf(match normalize.NormalizedMatch) map[int]model.Role {
	return inferMatchRoles(match)
}

func TestInferTeamFiveRoles(t *testing.T) {
	match := normalize.NormalizedMatch{MatchID: 1, Players: fullTeam(10)}
	got := rolesOf(match)
	want := map[int]model.Role{
		1: model.RoleSafelane, 2: model.RoleMid, 3: model.RoleOfflane,
		4: model.RoleSupport, 5: model.RoleSupport,
	}
	for accountID, role := range want {
		if got[accountID] != role {
			t.Errorf("account %d: got %q, want %q", accountID, got[accountID], role)
		}
	}
	// Ровно 2 саппорта и по одному из cores.
	counts := map[model.Role]int{}
	for _, role := range got {
		counts[role]++
	}
	if counts[model.RoleSupport] != 2 || counts[model.RoleSafelane] != 1 || counts[model.RoleMid] != 1 || counts[model.RoleOfflane] != 1 {
		t.Fatalf("unexpected role distribution: %v", counts)
	}
}

func TestPickMidByXPMWhenNoLaneRole(t *testing.T) {
	// Нет lane_role==2: мид определяется по максимальному XPM.
	team := []normalize.NormalizedAppearance{
		app(1, 10, laneSafe, 700, 600, false),
		app(2, 10, laneSafe, 500, 720, false), // макс XPM → mid
		app(3, 10, laneOff, 450, 500, false),
		app(4, 10, laneSafe, 250, 300, false),
		app(5, 10, laneOff, 200, 250, true),
	}
	got := inferTeamRoles(team)
	if got[2] != model.RoleMid {
		t.Fatalf("expected account 2 as mid by XPM, got %q", got[2])
	}
}

func TestInferFallbackNonFiveTeam(t *testing.T) {
	// Команда без полной пятёрки: per-player маппинг по линии.
	team := []normalize.NormalizedAppearance{
		app(1, 10, laneMid, 550, 650, false),
		app(2, 10, laneJungle, 300, 300, false), // джангл → support
		app(3, 10, laneSafe, 700, 600, false),
	}
	got := inferTeamRoles(team)
	want := map[int]model.Role{1: model.RoleMid, 2: model.RoleSupport, 3: model.RoleSafelane}
	for accountID, role := range want {
		if got[accountID] != role {
			t.Errorf("fallback account %d: got %q, want %q", accountID, got[accountID], role)
		}
	}
}

func TestInferAggregatesPrimaryRole(t *testing.T) {
	// Игрок 1 дважды carry, один раз (в деградированном матче) mid → primary safelane.
	matches := []normalize.NormalizedMatch{
		{MatchID: 1, Players: fullTeam(10)},
		{MatchID: 2, Players: fullTeam(10)},
		{MatchID: 3, Players: []normalize.NormalizedAppearance{app(1, 10, laneMid, 600, 650, false)}},
	}
	result := Infer(matches)
	var found bool
	for _, pr := range result {
		if pr.AccountID != 1 {
			continue
		}
		found = true
		if pr.PrimaryRole != model.RoleSafelane {
			t.Fatalf("account 1 primary: got %q, want safelane", pr.PrimaryRole)
		}
		if pr.Appearances != 3 {
			t.Fatalf("account 1 appearances: got %d, want 3", pr.Appearances)
		}
		if len(pr.RolesPlayed) != 2 || pr.RolesPlayed[0] != model.RoleSafelane {
			t.Fatalf("account 1 rolesPlayed: got %v, want [safelane mid]", pr.RolesPlayed)
		}
	}
	if !found {
		t.Fatal("account 1 missing from result")
	}
	// Детерминизм: выход отсортирован по accountID.
	for i := 1; i < len(result); i++ {
		if result[i-1].AccountID >= result[i].AccountID {
			t.Fatalf("result not sorted by accountID at %d", i)
		}
	}
}
