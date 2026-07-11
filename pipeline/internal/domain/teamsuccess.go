package domain

import (
	"math"
	"sort"
	"strconv"
	"time"

	"github.com/aegis-draft/pipeline/internal/model"
	"github.com/aegis-draft/pipeline/internal/normalize"
	"github.com/aegis-draft/pipeline/internal/opendota"
	"github.com/aegis-draft/pipeline/internal/rating"
)

// tierWeight — насколько «весит» победа в лиге данного tier. Premium (TI/Major/топ
// tier-1) весит больше professional. Прокси престижа без Liquipedia placements/prize.
func tierWeight(tier string) float64 {
	switch tier {
	case "premium":
		return 1.0
	case "professional":
		return 0.7
	default:
		return 0.6
	}
}

var successWindows = []struct {
	format model.Format
	years  int
}{
	{model.Last1y, 1},
	{model.Last2y, 2},
	{model.Last5y, 5},
}

type teamAgg struct {
	games     int
	wins      int
	weightSum float64
}

// BuildTeamSuccess — прокси-успех команд из реальных pro-матчей: сглаженный winrate,
// взвешенный по tier лиги. Titles/prizeUsd/tiPlacement не выводятся из OpenDota
// (deferred до Liquipedia, T1.3) и остаются нулевыми. valve_legacy не заполняется.
func BuildTeamSuccess(matches []normalize.NormalizedMatch, leagues []opendota.League, asOf time.Time, cfg rating.Config) map[string]map[model.Format]model.TeamWindowSuccess {
	tierByLeague := make(map[int64]string, len(leagues))
	for _, league := range leagues {
		tierByLeague[league.LeagueID] = league.Tier
	}
	asOfDay := utcDate(asOf)
	result := make(map[string]map[model.Format]model.TeamWindowSuccess)
	for _, window := range successWindows {
		start := asOfDay.AddDate(-window.years, 0, 0)
		teams := make(map[int]*teamAgg)
		for _, match := range matches {
			if match.StartTime <= 0 {
				continue
			}
			day := utcDate(time.Unix(match.StartTime, 0))
			if day.Before(start) || day.After(asOfDay) {
				continue
			}
			weight := tierWeight(tierByLeague[match.LeagueID])
			addTeamMatch(teams, match.RadiantTeamID, match.RadiantWin, weight)
			addTeamMatch(teams, match.DireTeamID, !match.RadiantWin, weight)
		}
		teamIDs := make([]int, 0, len(teams))
		for teamID := range teams {
			teamIDs = append(teamIDs, teamID)
		}
		sort.Ints(teamIDs)
		for _, teamID := range teamIDs {
			a := teams[teamID]
			key := strconv.Itoa(teamID)
			if result[key] == nil {
				result[key] = make(map[model.Format]model.TeamWindowSuccess)
			}
			result[key][window.format] = scoreTeamProxy(a, cfg)
		}
	}
	return result
}

func addTeamMatch(teams map[int]*teamAgg, teamID int, won bool, weight float64) {
	if teamID <= 0 {
		return
	}
	a := teams[teamID]
	if a == nil {
		a = &teamAgg{}
		teams[teamID] = a
	}
	a.games++
	a.weightSum += weight
	if won {
		a.wins++
	}
}

func scoreTeamProxy(a *teamAgg, cfg rating.Config) model.TeamWindowSuccess {
	smoothed := (float64(a.wins) + cfg.SmoothM*cfg.SmoothMu) / (float64(a.games) + cfg.SmoothM)
	avgWeight := 0.6
	if a.games > 0 {
		avgWeight = a.weightSum / float64(a.games)
	}
	score := clamp100(smoothed * 100 * avgWeight)
	raw := 0.0
	if a.games > 0 {
		raw = float64(a.wins) / float64(a.games)
	}
	return model.TeamWindowSuccess{
		SuccessScore: round2(score),
		Games:        a.games,
		Winrate:      round4(raw),
	}
}

func utcDate(t time.Time) time.Time {
	u := t.UTC()
	return time.Date(u.Year(), u.Month(), u.Day(), 0, 0, 0, 0, time.UTC)
}

func clamp100(v float64) float64 { return math.Max(0, math.Min(100, v)) }
func round2(v float64) float64   { return math.Round(v*100) / 100 }
func round4(v float64) float64   { return math.Round(v*10000) / 10000 }
