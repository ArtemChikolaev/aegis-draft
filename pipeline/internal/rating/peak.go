package rating

import (
	"fmt"
	"sort"
	"time"

	"github.com/aegis-draft/pipeline/internal/model"
)

const dateLayout = "2006-01-02"

type TimedPerformance struct {
	MatchPerformance
	StartTime int64
}

type peakKey struct {
	accountID int
	role      model.Role
}

// PeakRatings finds the best role-specific Base Rating over a rolling calendar
// window. Candidate dates are exactly the dates where the window membership changes.
func PeakRatings(scopeID string, samples []TimedPerformance, cfg Config) (map[int]map[model.Role]model.PlayerPeak, error) {
	if scopeID == "" {
		return nil, fmt.Errorf("peak rating scope id is required")
	}
	if err := validatePeakConfig(cfg); err != nil {
		return nil, err
	}
	if len(samples) == 0 {
		return map[int]map[model.Role]model.PlayerPeak{}, nil
	}

	dated := make([]datedPerformance, 0, len(samples))
	seen := make(map[[2]int64]struct{}, len(samples))
	var maxDate time.Time
	for _, sample := range samples {
		if sample.StartTime <= 0 {
			return nil, fmt.Errorf("match %d has invalid start time %d", sample.MatchID, sample.StartTime)
		}
		if err := validateSample(sample.MatchPerformance); err != nil {
			return nil, err
		}
		identity := [2]int64{sample.MatchID, int64(sample.AccountID)}
		if _, exists := seen[identity]; exists {
			return nil, fmt.Errorf("duplicate timed performance for matchId/accountId %d/%d", sample.MatchID, sample.AccountID)
		}
		seen[identity] = struct{}{}
		date := utcDate(time.Unix(sample.StartTime, 0))
		if date.After(maxDate) {
			maxDate = date
		}
		dated = append(dated, datedPerformance{performance: sample.MatchPerformance, date: date})
	}

	candidates := candidateDates(dated, maxDate, cfg.PeakWindowD)
	best := make(map[peakKey]model.PlayerPeak)
	for _, end := range candidates {
		start := end.AddDate(0, 0, -(cfg.PeakWindowD - 1))
		window := make([]MatchPerformance, 0)
		for _, sample := range dated {
			if !sample.date.Before(start) && !sample.date.After(end) {
				window = append(window, sample.performance)
			}
		}
		ratings, err := RatePlayers(scopeID+"@"+end.Format(dateLayout), window, cfg)
		if err != nil {
			return nil, fmt.Errorf("rate peak window ending %s: %w", end.Format(dateLayout), err)
		}
		for _, player := range ratings {
			if player.Games < cfg.PeakMinN {
				continue
			}
			candidate := model.PlayerPeak{
				OVR: player.OVR, WindowStart: start.Format(dateLayout),
				WindowEnd: end.Format(dateLayout), Games: player.Games,
			}
			key := peakKey{accountID: player.AccountID, role: player.Role}
			if current, exists := best[key]; !exists || betterPeak(candidate, current) {
				best[key] = candidate
			}
		}
	}

	result := make(map[int]map[model.Role]model.PlayerPeak)
	for key, peak := range best {
		if result[key.accountID] == nil {
			result[key.accountID] = make(map[model.Role]model.PlayerPeak)
		}
		result[key.accountID][key.role] = peak
	}
	return result, nil
}

func validatePeakConfig(cfg Config) error {
	if err := validateConfig(cfg); err != nil {
		return err
	}
	if cfg.PeakWindowD <= 0 || cfg.PeakMinN <= 0 {
		return fmt.Errorf("peak window and minimum games must be positive")
	}
	return nil
}

type datedPerformance struct {
	performance MatchPerformance
	date        time.Time
}

func candidateDates(samples []datedPerformance, maxDate time.Time, windowDays int) []time.Time {
	unique := make(map[time.Time]struct{}, len(samples)*2)
	for _, sample := range samples {
		unique[sample.date] = struct{}{}
		exitDate := sample.date.AddDate(0, 0, windowDays)
		if !exitDate.After(maxDate) {
			unique[exitDate] = struct{}{}
		}
	}
	result := make([]time.Time, 0, len(unique))
	for date := range unique {
		result = append(result, date)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Before(result[j]) })
	return result
}

func betterPeak(candidate, current model.PlayerPeak) bool {
	if candidate.OVR != current.OVR {
		return candidate.OVR > current.OVR
	}
	if candidate.Games != current.Games {
		return candidate.Games > current.Games
	}
	return candidate.WindowEnd < current.WindowEnd
}

func utcDate(value time.Time) time.Time {
	utc := value.UTC()
	return time.Date(utc.Year(), utc.Month(), utc.Day(), 0, 0, 0, 0, time.UTC)
}
