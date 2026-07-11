// Package teamsuccess calculates team and Mixed Draft player success ratings.
package teamsuccess

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"time"

	"github.com/aegis-draft/pipeline/internal/model"
	"github.com/aegis-draft/pipeline/internal/rating"
)

type EventTier string

const (
	TierTI    EventTier = "ti"
	TierMajor EventTier = "major"
	TierOne   EventTier = "tier1"
)

type TeamEventResult struct {
	EventID   string
	TeamID    int
	EndTime   int64
	Tier      EventTier
	Placement int
	PrizeUSD  int
}

type TeamMatchResult struct {
	MatchID   int64
	TeamID    int
	StartTime int64
	Won       bool
}

type PlayerInput struct {
	AccountID     int
	IndividualOVR int
	Teams         []PlayerTeamGames
}

type PlayerTeamGames struct {
	TeamID int
	Games  int
}

type PlayerScore struct {
	AccountID     int
	Games         int
	TeamScore     float64
	IndividualOVR int
	Score         int
}

type accumulator struct {
	placementPoints float64
	titles, top4    int
	prize, games    int
	wins            int
	tiPlacement     int
}

var timeWindows = []struct {
	format model.Format
	years  int
}{
	{model.Last1y, 1},
	{model.Last2y, 2},
	{model.Last5y, 5},
}

// Calculate builds teamSuccess.json-compatible metrics for last_1y/2y/5y.
// Valve Legacy remains a separately curated event set.
func Calculate(asOf time.Time, events []TeamEventResult, matches []TeamMatchResult, cfg rating.Config) (map[string]map[model.Format]model.TeamWindowSuccess, error) {
	if asOf.IsZero() {
		return nil, fmt.Errorf("team success as-of date is required")
	}
	if err := validateConfig(cfg); err != nil {
		return nil, err
	}
	if err := validateInputs(events, matches); err != nil {
		return nil, err
	}
	asOfDate := utcDate(asOf)
	result := make(map[string]map[model.Format]model.TeamWindowSuccess)
	for _, window := range timeWindows {
		start := asOfDate.AddDate(-window.years, 0, 0)
		teams := make(map[int]*accumulator)
		for _, event := range events {
			date := utcDate(time.Unix(event.EndTime, 0))
			if date.Before(start) || date.After(asOfDate) {
				continue
			}
			entry := ensureAccumulator(teams, event.TeamID)
			entry.placementPoints += prestige(event.Tier, cfg) * placementValue(event.Placement, cfg)
			if entry.prize > maxInt()-event.PrizeUSD {
				return nil, fmt.Errorf("team %d prize total overflows int", event.TeamID)
			}
			entry.prize += event.PrizeUSD
			if event.Placement == 1 {
				entry.titles++
			}
			if event.Placement <= 4 {
				entry.top4++
			}
			if event.Tier == TierTI && (entry.tiPlacement == 0 || event.Placement < entry.tiPlacement) {
				entry.tiPlacement = event.Placement
			}
		}
		for _, match := range matches {
			date := utcDate(time.Unix(match.StartTime, 0))
			if date.Before(start) || date.After(asOfDate) {
				continue
			}
			entry := ensureAccumulator(teams, match.TeamID)
			entry.games++
			if match.Won {
				entry.wins++
			}
		}
		teamIDs := make([]int, 0, len(teams))
		for teamID := range teams {
			teamIDs = append(teamIDs, teamID)
		}
		sort.Ints(teamIDs)
		for _, teamID := range teamIDs {
			key := strconv.Itoa(teamID)
			if result[key] == nil {
				result[key] = make(map[model.Format]model.TeamWindowSuccess)
			}
			result[key][window.format] = scoreTeam(teams[teamID], cfg)
		}
	}
	return result, nil
}

// ScorePlayers uses team success as the main signal and individual OVR as a
// bounded correction. Multi-team careers are weighted by games.
func ScorePlayers(format model.Format, teams map[string]map[model.Format]model.TeamWindowSuccess, players []PlayerInput, cfg rating.Config) ([]PlayerScore, error) {
	if format != model.Last1y && format != model.Last2y && format != model.Last5y {
		return nil, fmt.Errorf("unsupported team-success format %q", format)
	}
	if err := validateConfig(cfg); err != nil {
		return nil, err
	}
	result := make([]PlayerScore, 0, len(players))
	seenPlayers := make(map[int]struct{}, len(players))
	for _, player := range players {
		if player.AccountID <= 0 || player.IndividualOVR < 0 || player.IndividualOVR > 100 || len(player.Teams) == 0 {
			return nil, fmt.Errorf("invalid team-success player input: %+v", player)
		}
		if _, exists := seenPlayers[player.AccountID]; exists {
			return nil, fmt.Errorf("duplicate team-success player %d", player.AccountID)
		}
		seenPlayers[player.AccountID] = struct{}{}
		seenTeams := make(map[int]struct{}, len(player.Teams))
		weighted, games := 0.0, 0
		for _, stint := range player.Teams {
			if stint.TeamID <= 0 || stint.Games <= 0 {
				return nil, fmt.Errorf("invalid team stint for player %d: %+v", player.AccountID, stint)
			}
			if _, exists := seenTeams[stint.TeamID]; exists {
				return nil, fmt.Errorf("duplicate team %d for player %d", stint.TeamID, player.AccountID)
			}
			seenTeams[stint.TeamID] = struct{}{}
			windows, exists := teams[strconv.Itoa(stint.TeamID)]
			metric, existsForWindow := windows[format]
			if !exists || !existsForWindow {
				return nil, fmt.Errorf("missing team success for team %d format %s", stint.TeamID, format)
			}
			if !finite(metric.SuccessScore) || metric.SuccessScore < 0 || metric.SuccessScore > 100 {
				return nil, fmt.Errorf("invalid success score for team %d format %s", stint.TeamID, format)
			}
			if games > maxInt()-stint.Games {
				return nil, fmt.Errorf("player %d games overflow int", player.AccountID)
			}
			weighted += metric.SuccessScore * float64(stint.Games)
			games += stint.Games
		}
		teamScore := weighted / float64(games)
		factor := cfg.PlayerFormMinFactor + (cfg.PlayerFormMaxFactor-cfg.PlayerFormMinFactor)*float64(player.IndividualOVR)/100
		result = append(result, PlayerScore{
			AccountID: player.AccountID, Games: games, TeamScore: round2(teamScore),
			IndividualOVR: player.IndividualOVR, Score: rounded(teamScore * factor),
		})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].AccountID < result[j].AccountID })
	return result, nil
}

func scoreTeam(entry *accumulator, cfg rating.Config) model.TeamWindowSuccess {
	placementScore := clamp100(entry.placementPoints * cfg.PlacementPointScale)
	prizeScore := 0.0
	if entry.prize > 0 {
		prizeScore = clamp100(100 * math.Log1p(float64(entry.prize)) / math.Log1p(cfg.PrizeReferenceUSD))
	}
	smoothedWinrate := (float64(entry.wins) + cfg.SmoothM*cfg.SmoothMu) / (float64(entry.games) + cfg.SmoothM)
	topScore := clamp100(float64(entry.titles)*cfg.TitlePoints + float64(entry.top4)*cfg.TopFinishPoints)
	score := placementScore*cfg.TeamSuccessWeights.Placement + prizeScore*cfg.TeamSuccessWeights.Prize +
		smoothedWinrate*100*cfg.TeamSuccessWeights.Winrate + topScore*cfg.TeamSuccessWeights.TopFinish
	rawWinrate := 0.0
	if entry.games > 0 {
		rawWinrate = float64(entry.wins) / float64(entry.games)
	}
	return model.TeamWindowSuccess{
		SuccessScore: round2(score), Titles: entry.titles, TopFinishes: entry.top4,
		PrizeUsd: entry.prize, Games: entry.games, Winrate: rawWinrate, TIPlacement: entry.tiPlacement,
	}
}

func validateInputs(events []TeamEventResult, matches []TeamMatchResult) error {
	type eventTeamKey struct {
		eventID string
		teamID  int
	}
	seenEvents := make(map[eventTeamKey]struct{}, len(events))
	for _, event := range events {
		if event.EventID == "" || event.TeamID <= 0 || event.EndTime <= 0 || event.Placement <= 0 || event.PrizeUSD < 0 || !validTier(event.Tier) {
			return fmt.Errorf("invalid team event result: %+v", event)
		}
		key := eventTeamKey{eventID: event.EventID, teamID: event.TeamID}
		if _, exists := seenEvents[key]; exists {
			return fmt.Errorf("duplicate event/team result %s/%d", event.EventID, event.TeamID)
		}
		seenEvents[key] = struct{}{}
	}
	seenMatches := make(map[[2]int64]struct{}, len(matches))
	for _, match := range matches {
		if match.MatchID <= 0 || match.TeamID <= 0 || match.StartTime <= 0 {
			return fmt.Errorf("invalid team match result: %+v", match)
		}
		key := [2]int64{match.MatchID, int64(match.TeamID)}
		if _, exists := seenMatches[key]; exists {
			return fmt.Errorf("duplicate match/team result %d/%d", match.MatchID, match.TeamID)
		}
		seenMatches[key] = struct{}{}
	}
	return nil
}

func validateConfig(cfg rating.Config) error {
	weights := cfg.TeamSuccessWeights
	if !weightsSumToOne(weights.Placement, weights.Prize, weights.Winrate, weights.TopFinish) ||
		!finite(cfg.SmoothMu) || !finite(cfg.SmoothM) || cfg.SmoothMu < 0 || cfg.SmoothMu > 1 || cfg.SmoothM <= 0 ||
		!finite(cfg.EventPrestige.TI) || !finite(cfg.EventPrestige.Major) || !finite(cfg.EventPrestige.Tier1) ||
		cfg.EventPrestige.TI <= cfg.EventPrestige.Major || cfg.EventPrestige.Major <= cfg.EventPrestige.Tier1 || cfg.EventPrestige.Tier1 <= 0 ||
		!finite(cfg.PlacementWeights.Champion) || !finite(cfg.PlacementWeights.RunnerUp) || !finite(cfg.PlacementWeights.Top4) || !finite(cfg.PlacementWeights.Top8) ||
		cfg.PlacementWeights.Champion < cfg.PlacementWeights.RunnerUp || cfg.PlacementWeights.RunnerUp < cfg.PlacementWeights.Top4 ||
		cfg.PlacementWeights.Top4 < cfg.PlacementWeights.Top8 || cfg.PlacementWeights.Top8 < 0 ||
		!finite(cfg.PlacementPointScale) || !finite(cfg.PrizeReferenceUSD) || !finite(cfg.TitlePoints) || !finite(cfg.TopFinishPoints) ||
		cfg.PlacementPointScale <= 0 || cfg.PrizeReferenceUSD <= 0 || cfg.TitlePoints < 0 || cfg.TopFinishPoints < 0 ||
		!finite(cfg.PlayerFormMinFactor) || !finite(cfg.PlayerFormMaxFactor) ||
		cfg.PlayerFormMinFactor < 0 || cfg.PlayerFormMaxFactor < cfg.PlayerFormMinFactor ||
		math.Abs((cfg.PlayerFormMinFactor+cfg.PlayerFormMaxFactor)/2-1) > 1e-9 {
		return fmt.Errorf("invalid team-success rating config")
	}
	return nil
}

func prestige(tier EventTier, cfg rating.Config) float64 {
	switch tier {
	case TierTI:
		return cfg.EventPrestige.TI
	case TierMajor:
		return cfg.EventPrestige.Major
	default:
		return cfg.EventPrestige.Tier1
	}
}

func placementValue(placement int, cfg rating.Config) float64 {
	switch {
	case placement == 1:
		return cfg.PlacementWeights.Champion
	case placement == 2:
		return cfg.PlacementWeights.RunnerUp
	case placement <= 4:
		return cfg.PlacementWeights.Top4
	case placement <= 8:
		return cfg.PlacementWeights.Top8
	default:
		return 0
	}
}

func validTier(tier EventTier) bool { return tier == TierTI || tier == TierMajor || tier == TierOne }

func ensureAccumulator(teams map[int]*accumulator, teamID int) *accumulator {
	if teams[teamID] == nil {
		teams[teamID] = &accumulator{}
	}
	return teams[teamID]
}

func weightsSumToOne(weights ...float64) bool {
	sum := 0.0
	for _, weight := range weights {
		if math.IsNaN(weight) || math.IsInf(weight, 0) || weight < 0 {
			return false
		}
		sum += weight
	}
	return math.Abs(sum-1) <= 1e-9
}

func finite(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }

func clamp100(value float64) float64 { return math.Max(0, math.Min(100, value)) }
func rounded(value float64) int      { return int(math.Round(clamp100(value))) }
func round2(value float64) float64   { return math.Round(value*100) / 100 }
func maxInt() int                    { return int(^uint(0) >> 1) }

func utcDate(value time.Time) time.Time {
	utc := value.UTC()
	return time.Date(utc.Year(), utc.Month(), utc.Day(), 0, 0, 0, 0, time.UTC)
}
