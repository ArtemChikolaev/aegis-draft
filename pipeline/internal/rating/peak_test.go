package rating

import (
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/aegis-draft/pipeline/internal/model"
)

func TestPeakRatingsRejectsAnomalousSmallSample(t *testing.T) {
	cfg := Default()
	cfg.PeakWindowD = 30
	cfg.PeakMinN = 15

	samples := timedGames(1, 100, model.RoleMid, "2026-01-01", 14, 30, 0, 20, 50, 1000, 1000, 500, 60000)
	samples = append(samples, timedGames(1, 200, model.RoleMid, "2026-03-01", 15, 9, 3, 12, 26, 620, 680, 280, 26000)...)
	samples = append(samples, timedGames(2, 300, model.RoleMid, "2026-03-01", 15, 5, 6, 8, 20, 500, 550, 220, 16000)...)

	peaks, err := PeakRatings("career", samples, cfg)
	if err != nil {
		t.Fatal(err)
	}
	peak, exists := peaks[1][model.RoleMid]
	if !exists || peak.Games != 15 || peak.WindowStart < "2026-02-01" {
		t.Fatalf("small January anomaly must not become peak: %+v", peaks[1])
	}
}

func TestPeakRatingsCombinesPeriodsInsideRollingWindow(t *testing.T) {
	cfg := Default()
	cfg.PeakWindowD = 40
	cfg.PeakMinN = 5
	samples := timedGames(1, 100, model.RoleSafelane, "2026-01-01", 3, 10, 3, 9, 25, 650, 700, 310, 28000)
	samples = append(samples, timedGames(1, 200, model.RoleSafelane, "2026-01-21", 3, 11, 3, 10, 27, 670, 710, 320, 29000)...)
	samples = append(samples, timedGames(2, 300, model.RoleSafelane, "2026-01-01", 6, 5, 6, 7, 20, 500, 550, 220, 16000)...)

	peaks, err := PeakRatings("career", samples, cfg)
	if err != nil {
		t.Fatal(err)
	}
	if peak := peaks[1][model.RoleSafelane]; peak.Games != 6 {
		t.Fatalf("rolling window should combine both periods: %+v", peak)
	}
}

func TestPeakRatingsKeepsRolesSeparateAndIsDeterministic(t *testing.T) {
	cfg := Default()
	cfg.PeakWindowD = 20
	cfg.PeakMinN = 3
	samples := timedGames(1, 100, model.RoleSupport, "2026-01-01", 3, 2, 3, 16, 21, 340, 430, 40, 10000)
	samples = append(samples, timedGames(1, 200, model.RoleOfflane, "2026-01-10", 3, 5, 4, 12, 24, 500, 560, 180, 17000)...)
	samples = append(samples, timedGames(2, 300, model.RoleSupport, "2026-01-01", 3, 1, 6, 9, 16, 300, 380, 30, 7000)...)
	samples = append(samples, timedGames(3, 400, model.RoleOfflane, "2026-01-10", 3, 3, 7, 8, 18, 420, 480, 130, 12000)...)

	first, err := PeakRatings("career", samples, cfg)
	if err != nil {
		t.Fatal(err)
	}
	slices.Reverse(samples)
	second, err := PeakRatings("career", samples, cfg)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("peak must be deterministic\nfirst=%+v\nsecond=%+v", first, second)
	}
	if _, ok := first[1][model.RoleSupport]; !ok {
		t.Fatal("support peak missing")
	}
	if _, ok := first[1][model.RoleOfflane]; !ok {
		t.Fatal("offlane peak missing")
	}
}

func TestPeakRatingsUsesInclusiveCalendarBoundary(t *testing.T) {
	cfg := Default()
	cfg.PeakWindowD = 10
	cfg.PeakMinN = 2
	samples := timedGames(1, 100, model.RoleSupport, "2026-01-01", 1, 2, 3, 12, 18, 330, 420, 40, 9000)
	samples = append(samples, timedGamesOnDates(1, 200, model.RoleSupport, []string{"2026-01-10"}, 2, 3, 12, 18, 330, 420, 40, 9000)...)

	peaks, err := PeakRatings("career", samples, cfg)
	if err != nil {
		t.Fatal(err)
	}
	peak := peaks[1][model.RoleSupport]
	if peak.Games != 2 || peak.WindowStart != "2026-01-01" || peak.WindowEnd != "2026-01-10" {
		t.Fatalf("inclusive 10-day window mismatch: %+v", peak)
	}
}

func TestPeakRatingsEvaluatesDateWhenOldMatchExits(t *testing.T) {
	cfg := Default()
	cfg.PeakWindowD = 5
	cfg.PeakMinN = 2
	samples := timedGamesOnDates(1, 100, model.RoleMid, []string{"2026-01-01"}, 0, 12, 0, 10, 100, 100, 10, 1000)
	samples = append(samples, timedGamesOnDates(1, 200, model.RoleMid, []string{"2026-01-02", "2026-01-03"}, 8, 3, 10, 24, 600, 650, 260, 24000)...)
	samples = append(samples, timedGamesOnDates(2, 300, model.RoleMid, []string{"2026-01-02", "2026-01-03", "2026-01-10"}, 5, 5, 8, 20, 500, 550, 220, 16000)...)

	peaks, err := PeakRatings("career", samples, cfg)
	if err != nil {
		t.Fatal(err)
	}
	peak := peaks[1][model.RoleMid]
	if peak.WindowEnd != "2026-01-06" || peak.Games != 2 {
		t.Fatalf("peak should be recalculated when January 1 match exits: %+v", peak)
	}
}

func TestPeakRatingsThresholdAndTieBreak(t *testing.T) {
	cfg := Default()
	cfg.PeakWindowD = 30
	cfg.PeakMinN = 5
	samples := timedGames(1, 100, model.RoleMid, "2026-01-01", 4, 8, 3, 10, 23, 600, 650, 260, 23000)
	peaks, err := PeakRatings("career", samples, cfg)
	if err != nil {
		t.Fatal(err)
	}
	if len(peaks) != 0 {
		t.Fatalf("sub-threshold window must not emit peak: %+v", peaks)
	}
	early := model.PlayerPeak{OVR: 80, Games: 20, WindowEnd: "2026-01-01"}
	late := model.PlayerPeak{OVR: 80, Games: 20, WindowEnd: "2026-02-01"}
	if !betterPeak(early, late) || betterPeak(late, early) {
		t.Fatal("equal peaks must choose the earlier window")
	}
}

func TestPeakRatingsRejectsInvalidWindowWithoutCouplingBaseRating(t *testing.T) {
	cfg := Default()
	cfg.PeakWindowD = 0
	sample := timedGames(1, 100, model.RoleSupport, "2026-01-01", 1, 2, 3, 12, 18, 330, 420, 40, 9000)
	if _, err := PeakRatings("career", sample, cfg); err == nil {
		t.Fatal("expected invalid peak window rejection")
	}
	if _, err := RatePlayers("event", []MatchPerformance{sample[0].MatchPerformance}, cfg); err != nil {
		t.Fatalf("base rating must not depend on peak config: %v", err)
	}
}

func timedGames(accountID int, matchBase int64, role model.Role, start string, games, kills, deaths, assists, teamKills, gpm, xpm, lastHits, damage int) []TimedPerformance {
	startDate := mustDate(start)
	dates := make([]string, games)
	for index := range dates {
		dates[index] = startDate.AddDate(0, 0, index).Format(dateLayout)
	}
	return timedGamesOnDates(accountID, matchBase, role, dates, kills, deaths, assists, teamKills, gpm, xpm, lastHits, damage)
}

func timedGamesOnDates(accountID int, matchBase int64, role model.Role, dates []string, kills, deaths, assists, teamKills, gpm, xpm, lastHits, damage int) []TimedPerformance {
	result := make([]TimedPerformance, 0, len(dates))
	for index, date := range dates {
		result = append(result, TimedPerformance{
			MatchPerformance: MatchPerformance{
				MatchID: matchBase + int64(index), AccountID: accountID, Role: role, DurationSeconds: 2400,
				Kills: kills, Deaths: deaths, Assists: assists, TeamKills: teamKills,
				GoldPerMin: gpm, XPPerMin: xpm, LastHits: lastHits, HeroDamage: damage,
			},
			StartTime: mustDate(date).Unix(),
		})
	}
	return result
}

func mustDate(value string) time.Time {
	parsed, err := time.Parse(dateLayout, value)
	if err != nil {
		panic(err)
	}
	return parsed
}
