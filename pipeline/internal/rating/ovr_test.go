package rating

import (
	"encoding/json"
	"slices"
	"testing"

	"github.com/aegis-draft/pipeline/internal/model"
)

func TestRatePlayersIsDeterministicAndRoleRelative(t *testing.T) {
	samples := append(playerGames(1, model.RoleSafelane, 20, 12, 3, 11, 28, 720, 760, 360, 32000),
		playerGames(2, model.RoleSafelane, 20, 7, 6, 8, 22, 560, 610, 260, 19000)...)
	samples = append(samples, playerGames(3, model.RoleSafelane, 20, 3, 9, 5, 15, 420, 470, 170, 11000)...)

	first, err := RatePlayers("event-a", samples, Default())
	if err != nil {
		t.Fatal(err)
	}
	slices.Reverse(samples)
	second, err := RatePlayers("event-a", samples, Default())
	if err != nil {
		t.Fatal(err)
	}
	a, _ := json.Marshal(first)
	b, _ := json.Marshal(second)
	if string(a) != string(b) {
		t.Fatalf("rating must be deterministic\n%s\n%s", a, b)
	}
	if len(first) != 3 || first[0].AccountID != 1 || first[0].OVR <= first[1].OVR || first[1].OVR <= first[2].OVR {
		t.Fatalf("unexpected ordering: %+v", first)
	}
}

func TestRatePlayersShrinksOneGameOutlierTowardNeutral(t *testing.T) {
	samples := append(playerGames(1, model.RoleMid, 20, 10, 3, 12, 28, 650, 700, 300, 28000),
		playerGames(2, model.RoleMid, 20, 5, 6, 7, 20, 500, 550, 220, 16000)...)
	samples = append(samples, MatchPerformance{
		MatchID: 999, AccountID: 3, Role: model.RoleMid, DurationSeconds: 1800,
		Kills: 30, Deaths: 0, Assists: 20, TeamKills: 50, GoldPerMin: 1000, XPPerMin: 1000, LastHits: 500, HeroDamage: 60000,
	})

	ratings, err := RatePlayers("event-a", samples, Default())
	if err != nil {
		t.Fatal(err)
	}
	outlier := findRating(t, ratings, 3)
	if outlier.OVR > 56 || outlier.Impact > 56 || outlier.Economy > 56 {
		t.Fatalf("one-game outlier escaped confidence shrinkage: %+v", outlier)
	}
}

func TestRoleWeightsValueEconomyAndReliabilityDifferently(t *testing.T) {
	cfg := Default()
	carry := combine(40, 80, 60, cfg.RoleWeights[model.RoleSafelane])
	support := combine(40, 80, 60, cfg.RoleWeights[model.RoleSupport])
	if carry <= support {
		t.Fatalf("carry should value economy profile more: carry=%f support=%f", carry, support)
	}
	carry = combine(60, 40, 80, cfg.RoleWeights[model.RoleSafelane])
	support = combine(60, 40, 80, cfg.RoleWeights[model.RoleSupport])
	if support <= carry {
		t.Fatalf("support should value reliability profile more: carry=%f support=%f", carry, support)
	}
}

func TestReliabilityRewardsSurvivalAndConsistency(t *testing.T) {
	stable := playerGames(1, model.RoleSupport, 12, 4, 3, 14, 22, 380, 460, 55, 12000)
	volatile := make([]MatchPerformance, 0, 12)
	for index := 0; index < 12; index++ {
		low := index%2 == 0
		kills, assists, gpm, damage := 1, 7, 220, 3000
		if !low {
			kills, assists, gpm, damage = 7, 21, 540, 21000
		}
		volatile = append(volatile, MatchPerformance{
			MatchID: int64(2000 + index), AccountID: 2, Role: model.RoleSupport, DurationSeconds: 2400,
			Kills: kills, Deaths: 3, Assists: assists, TeamKills: 30,
			GoldPerMin: gpm, XPPerMin: 460, LastHits: 55, HeroDamage: damage,
		})
	}
	fragile := playerGames(3, model.RoleSupport, 12, 4, 8, 14, 22, 380, 460, 55, 12000)
	ratings, err := RatePlayers("event-a", append(append(stable, volatile...), fragile...), Default())
	if err != nil {
		t.Fatal(err)
	}
	stableRating := findRating(t, ratings, 1)
	volatileRating := findRating(t, ratings, 2)
	fragileRating := findRating(t, ratings, 3)
	if stableRating.Reliability <= volatileRating.Reliability || stableRating.Reliability <= fragileRating.Reliability {
		t.Fatalf("stable survivor should lead REL: stable=%+v volatile=%+v fragile=%+v", stableRating, volatileRating, fragileRating)
	}
}

func TestRatePlayersRejectsDuplicateAndInvalidWeights(t *testing.T) {
	sample := playerGames(1, model.RoleSupport, 1, 1, 1, 1, 2, 300, 350, 20, 3000)[0]
	if _, err := RatePlayers("event-a", []MatchPerformance{sample, sample}, Default()); err == nil {
		t.Fatal("expected duplicate match/account rejection")
	}
	cfg := Default()
	cfg.RoleWeights[model.RoleSupport] = ComponentWeights{Impact: 1, Economy: 1, Reliability: 1}
	if _, err := RatePlayers("event-a", []MatchPerformance{sample}, cfg); err == nil {
		t.Fatal("expected invalid role weights rejection")
	}
	if _, err := RatePlayers("", []MatchPerformance{sample}, Default()); err == nil {
		t.Fatal("expected missing scope rejection")
	}
}

func playerGames(accountID int, role model.Role, games, kills, deaths, assists, teamKills, gpm, xpm, lastHits, damage int) []MatchPerformance {
	result := make([]MatchPerformance, 0, games)
	for index := 0; index < games; index++ {
		result = append(result, MatchPerformance{
			MatchID: int64(accountID*1000 + index + 1), AccountID: accountID, Role: role, DurationSeconds: 2400,
			Kills: kills, Deaths: deaths, Assists: assists, TeamKills: teamKills,
			GoldPerMin: gpm, XPPerMin: xpm, LastHits: lastHits, HeroDamage: damage,
		})
	}
	return result
}

func findRating(t *testing.T, ratings []PlayerRating, accountID int) PlayerRating {
	t.Helper()
	for _, rating := range ratings {
		if rating.AccountID == accountID {
			return rating
		}
	}
	t.Fatalf("missing rating for %d", accountID)
	return PlayerRating{}
}
