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

	cfg := Default()
	ratings, err := RatePlayers("event-a", samples, cfg)
	if err != nil {
		t.Fatal(err)
	}
	outlier := findRating(t, ratings, 3)
	// Нейтраль — CalibrationMid (шкала референса), а не 50: перцентиль-ранг переносится на
	// шкалу OVR аффинно. Порог выражен через конфиг, иначе тест протухает на каждой калибровке.
	// 6 — допуск в очках РАНГА (как было), на шкале OVR это 6*Spread.
	limit := cfg.CalibrationMid + 6*cfg.CalibrationSpread
	if float64(outlier.OVR) > limit || float64(outlier.Impact) > limit || float64(outlier.Economy) > limit {
		t.Fatalf("one-game outlier escaped confidence shrinkage (limit %.1f): %+v", limit, outlier)
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

// v1.9.0: OVR игрока на большую часть определяется тем, как сыграла его КОМАНДА на событии.
// Без этого на выигравшем турнир составе выходило 96 у одного игрока и 71 у другого (замер
// 322-0: 92% дисперсии OVR — командные, разброс внутри команды 2.0 при общем sd 7.8).
func TestRatePlayersOVRFollowsTeamResultNotOnlyIndividualStats(t *testing.T) {
	cfg := Default()
	// Две команды. Слабый по личной статистике игрок (acc 2) в команде-победителе против
	// сильного по личной статистике (acc 11) в команде, проигравшей всё.
	var samples []MatchPerformance
	for i := 0; i < 10; i++ {
		winner := i%2 == 0 // команда 100 выигрывает все матчи, команда 200 — ни одного
		samples = append(samples,
			// Победители: скромная личная статистика.
			perf(int64(i*2+1), 1, 100, true, model.RoleMid, 6, 3, 8, 500),
			perf(int64(i*2+1), 2, 100, true, model.RoleSafelane, 5, 4, 6, 450),
			// Проигравшие: раздутая личная статистика (фарм на проигранной карте).
			perf(int64(i*2+1), 11, 200, false, model.RoleMid, 12, 5, 10, 800),
			perf(int64(i*2+1), 12, 200, false, model.RoleSafelane, 11, 5, 9, 780),
		)
		_ = winner
	}
	ratings, err := RatePlayers("event-team", samples, cfg)
	if err != nil {
		t.Fatal(err)
	}
	winnerCarry := findRating(t, ratings, 2)
	loserMid := findRating(t, ratings, 11)

	// Личная статистика у проигравшего мида ВЫШЕ — это ожидаемо и остаётся в компонентах.
	if loserMid.Economy <= winnerCarry.Economy {
		t.Fatalf("фикстура не воспроизводит случай: ECO проигравшего (%d) должен быть выше победителя (%d)",
			loserMid.Economy, winnerCarry.Economy)
	}
	// Но OVR обязан следовать за результатом команды.
	if winnerCarry.OVR <= loserMid.OVR {
		t.Errorf("OVR игрока команды-победителя (%d) должен быть выше игрока команды, проигравшей всё (%d)",
			winnerCarry.OVR, loserMid.OVR)
	}
}

// Внутри одной команды OVR не должен разъезжаться так, как личная статистика.
func TestRatePlayersOVRSpreadWithinTeamIsTighterThanComponents(t *testing.T) {
	cfg := Default()
	var samples []MatchPerformance
	for i := 0; i < 10; i++ {
		samples = append(samples,
			perf(int64(i*2+1), 1, 100, true, model.RoleMid, 14, 2, 12, 900),    // звезда
			perf(int64(i*2+1), 2, 100, true, model.RoleSafelane, 3, 7, 4, 300), // тащат
			perf(int64(i*2+1), 11, 200, false, model.RoleMid, 6, 6, 6, 500),
			perf(int64(i*2+1), 12, 200, false, model.RoleSafelane, 6, 6, 6, 500),
		)
	}
	ratings, err := RatePlayers("event-spread", samples, cfg)
	if err != nil {
		t.Fatal(err)
	}
	star := findRating(t, ratings, 1)
	passenger := findRating(t, ratings, 2)
	ovrGap := abs(star.OVR - passenger.OVR)
	ecoGap := abs(star.Economy - passenger.Economy)
	if ovrGap >= ecoGap {
		t.Errorf("разрыв OVR внутри команды (%d) должен быть МЕНЬШЕ разрыва ECO (%d): командный член его гасит",
			ovrGap, ecoGap)
	}
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

func perf(matchID int64, acc, team int, won bool, role model.Role, kills, deaths, assists, gpm int) MatchPerformance {
	return MatchPerformance{
		MatchID: matchID, AccountID: acc, TeamID: team, Won: won, Role: role,
		DurationSeconds: 2400, Kills: kills, Deaths: deaths, Assists: assists, TeamKills: 30,
		GoldPerMin: gpm, XPPerMin: gpm - 40, LastHits: gpm / 3, HeroDamage: gpm * 30,
	}
}
