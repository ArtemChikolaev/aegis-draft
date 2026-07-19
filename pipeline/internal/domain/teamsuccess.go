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
	"github.com/aegis-draft/pipeline/internal/tier1"
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

var rollingWindows = []struct {
	format model.Format
	years  int
}{
	{model.Last1y, 1},
	{model.Last2y, 2},
	{model.Last5y, 5},
}

// successWindow — «окно» агрегации успеха. Раньше окно было только диапазоном дат, поэтому
// valve_legacy оставался пустым: это не последние N лет, а курируемый набор лиг (все TI +
// Valve/DPC Major, 2012–2025). Из-за этого Mixed Draft в valve_legacy было нечем считать.
// Прокси-успеху Liquipedia для него НЕ нужен: winrate и tier лиги у нас есть на тех же
// матчах (нужны только titles/prizeUsd, а они нулевые во всех окнах одинаково).
type successWindow struct {
	format  model.Format
	include func(match normalize.NormalizedMatch, day time.Time) bool
}

// buildSuccessWindows — rolling-окна от asOf + valve_legacy по набору лиг.
func buildSuccessWindows(asOfDay time.Time, nameByLeague map[int64]string) []successWindow {
	windows := make([]successWindow, 0, len(rollingWindows)+1)
	for _, w := range rollingWindows {
		start := asOfDay.AddDate(-w.years, 0, 0)
		windows = append(windows, successWindow{
			format: w.format,
			include: func(_ normalize.NormalizedMatch, day time.Time) bool {
				return !day.Before(start) && !day.After(asOfDay)
			},
		})
	}
	windows = append(windows, successWindow{
		format: model.ValveLegacy,
		include: func(match normalize.NormalizedMatch, day time.Time) bool {
			// Верхнюю границу держим и здесь: набор курируемый, но детерминизм важнее.
			return !day.After(asOfDay) && tier1.IsValveLegacy(match.LeagueID, nameByLeague[match.LeagueID])
		},
	})
	return windows
}

type teamAgg struct {
	games     int
	wins      int
	weightSum float64
}

// BuildTeamSuccess — прокси-успех команд из реальных pro-матчей: сглаженный winrate,
// взвешенный по tier лиги. Titles/prizeUsd/tiPlacement не выводятся из OpenDota
// (deferred до Liquipedia, T1.3) и остаются нулевыми — одинаково во всех окнах.
// Окна: три rolling (1/2/5 лет от asOf) + valve_legacy по курируемому набору лиг.
//
// ТРЕБОВАНИЕ К ВХОДУ: matches обязаны быть пропущены через FilterMatchesByWindow —
// он отделяет мейн-ивент legacy-лиги от её же квалов (в OpenDota они сидят под ТЕМ ЖЕ
// leagueId: у TI2015 59 команд вместо 16, у TI2017 — 70 вместо 18, регрессия v1.8.0).
// Без этого valve_legacy-окно посчитает квалификационные матчи как турнирные и исказит
// winrate. domain.Build этот порядок соблюдает (Filter → Build*), не ломать при рефакторинге.
func BuildTeamSuccess(matches []normalize.NormalizedMatch, leagues []opendota.League, asOf time.Time, cfg rating.Config) map[string]map[model.Format]model.TeamWindowSuccess {
	tierByLeague := make(map[int64]string, len(leagues))
	nameByLeague := make(map[int64]string, len(leagues))
	for _, league := range leagues {
		tierByLeague[league.LeagueID] = league.Tier
		nameByLeague[league.LeagueID] = league.Name
	}
	asOfDay := utcDate(asOf)
	result := make(map[string]map[model.Format]model.TeamWindowSuccess)
	for _, window := range buildSuccessWindows(asOfDay, nameByLeague) {
		teams := make(map[int]*teamAgg)
		for _, match := range matches {
			if match.StartTime <= 0 {
				continue
			}
			day := utcDate(time.Unix(match.StartTime, 0))
			if !window.include(match, day) {
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
