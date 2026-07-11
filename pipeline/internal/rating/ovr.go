package rating

import (
	"fmt"
	"math"
	"sort"

	"github.com/aegis-draft/pipeline/internal/model"
)

const metricCount = 8

type MatchPerformance struct {
	MatchID         int64
	AccountID       int
	Role            model.Role
	DurationSeconds int
	Kills           int
	Deaths          int
	Assists         int
	TeamKills       int
	GoldPerMin      int
	XPPerMin        int
	LastHits        int
	HeroDamage      int
}

type PlayerRating struct {
	AccountID   int        `json:"accountId"`
	Role        model.Role `json:"role"`
	Games       int        `json:"games"`
	Impact      int        `json:"impact"`
	Economy     int        `json:"economy"`
	Reliability int        `json:"reliability"`
	OVR         int        `json:"ovr"`
}

type ratingKey struct {
	accountID int
	role      model.Role
}

type group struct {
	key    ratingKey
	games  []gameMetrics
	raw    [metricCount]float64
	shrunk [metricCount]float64
	scores [metricCount]float64
}

type gameMetrics struct {
	kda, participation, damagePerMin float64
	gpm, xpm, lastHitsPerMin         float64
	deathsPer10                      float64
}

// RatePlayers calculates role-relative Event/Base ratings for one explicit
// event/window cohort. Role assignment belongs to normalize/roster data, not here.
func RatePlayers(scopeID string, samples []MatchPerformance, cfg Config) ([]PlayerRating, error) {
	if scopeID == "" {
		return nil, fmt.Errorf("rating scope id is required")
	}
	if err := validateConfig(cfg); err != nil {
		return nil, err
	}
	groups := make(map[ratingKey]*group)
	seen := make(map[[2]int64]struct{}, len(samples))
	for _, sample := range samples {
		if err := validateSample(sample); err != nil {
			return nil, err
		}
		identity := [2]int64{sample.MatchID, int64(sample.AccountID)}
		if _, exists := seen[identity]; exists {
			return nil, fmt.Errorf("duplicate performance for matchId/accountId %d/%d", sample.MatchID, sample.AccountID)
		}
		seen[identity] = struct{}{}
		key := ratingKey{accountID: sample.AccountID, role: sample.Role}
		entry := groups[key]
		if entry == nil {
			entry = &group{key: key}
			groups[key] = entry
		}
		entry.games = append(entry.games, metricsOf(sample))
	}

	ordered := make([]*group, 0, len(groups))
	for _, entry := range groups {
		entry.raw = aggregateMetrics(entry.games)
		ordered = append(ordered, entry)
	}
	sort.Slice(ordered, func(i, j int) bool {
		if ordered[i].key.accountID != ordered[j].key.accountID {
			return ordered[i].key.accountID < ordered[j].key.accountID
		}
		return ordered[i].key.role < ordered[j].key.role
	})
	shrinkByRole(ordered, cfg.SamplePriorGames)
	normalizeByRole(ordered, cfg.SamplePriorGames)

	result := make([]PlayerRating, 0, len(ordered))
	for _, entry := range ordered {
		impact := entry.scores[0]*cfg.ImpactWeights.KDA + entry.scores[1]*cfg.ImpactWeights.Participation + entry.scores[2]*cfg.ImpactWeights.DamagePerMin
		economy := entry.scores[3]*cfg.EconomyWeights.GPM + entry.scores[4]*cfg.EconomyWeights.XPM + entry.scores[5]*cfg.EconomyWeights.LastHitsPerMin
		reliability := entry.scores[6]*cfg.ReliabilityWeights.Survival + entry.scores[7]*cfg.ReliabilityWeights.Consistency
		weights := cfg.RoleWeights[entry.key.role]
		result = append(result, PlayerRating{
			AccountID: entry.key.accountID, Role: entry.key.role, Games: len(entry.games),
			Impact: rounded(impact), Economy: rounded(economy), Reliability: rounded(reliability),
			OVR: rounded(combine(impact, economy, reliability, weights)),
		})
	}
	return result, nil
}

func metricsOf(sample MatchPerformance) gameMetrics {
	minutes := float64(sample.DurationSeconds) / 60
	deaths := math.Max(1, float64(sample.Deaths))
	participation := 0.0
	if sample.TeamKills > 0 {
		participation = math.Min(1, (float64(sample.Kills)+float64(sample.Assists))/float64(sample.TeamKills))
	}
	return gameMetrics{
		kda:           (float64(sample.Kills) + float64(sample.Assists)) / deaths,
		participation: participation,
		damagePerMin:  float64(sample.HeroDamage) / minutes,
		gpm:           float64(sample.GoldPerMin), xpm: float64(sample.XPPerMin),
		lastHitsPerMin: float64(sample.LastHits) / minutes,
		deathsPer10:    float64(sample.Deaths) * 10 / minutes,
	}
}

func aggregateMetrics(games []gameMetrics) [metricCount]float64 {
	var result [metricCount]float64
	for _, game := range games {
		values := [...]float64{game.kda, game.participation, game.damagePerMin, game.gpm, game.xpm, game.lastHitsPerMin, game.deathsPer10}
		for index, value := range values {
			result[index] += value
		}
	}
	for index := 0; index < 7; index++ {
		result[index] /= float64(len(games))
	}
	result[7] = consistency(games)
	return result
}

func consistency(games []gameMetrics) float64 {
	if len(games) < 2 {
		return 0
	}
	series := [3][]float64{{}, {}, {}}
	for _, game := range games {
		series[0] = append(series[0], game.kda)
		series[1] = append(series[1], game.gpm)
		series[2] = append(series[2], game.damagePerMin)
	}
	variation, observed := 0.0, 0
	for _, values := range series {
		mean := average(values)
		if mean == 0 {
			continue
		}
		deviation := 0.0
		for _, value := range values {
			deviation += math.Abs(value - mean)
		}
		variation += deviation / float64(len(values)) / mean
		observed++
	}
	if observed == 0 {
		return 0
	}
	return -(variation / float64(observed)) // higher (closer to zero) is more consistent
}

func shrinkByRole(groups []*group, priorGames float64) {
	for metric := 0; metric < metricCount; metric++ {
		for _, role := range roles() {
			priorSum, observations := 0.0, 0.0
			for _, entry := range groups {
				if entry.key.role != role {
					continue
				}
				effective := effectiveGames(entry, metric)
				priorSum += entry.raw[metric] * effective
				observations += effective
			}
			prior := 0.0
			if observations > 0 {
				prior = priorSum / observations
			}
			for _, entry := range groups {
				if entry.key.role != role {
					continue
				}
				effective := effectiveGames(entry, metric)
				entry.shrunk[metric] = (entry.raw[metric]*effective + prior*priorGames) / (effective + priorGames)
			}
		}
	}
}

func normalizeByRole(groups []*group, priorGames float64) {
	for metric := 0; metric < metricCount; metric++ {
		for _, role := range roles() {
			cohort := make([]*group, 0)
			for _, entry := range groups {
				if entry.key.role == role {
					cohort = append(cohort, entry)
				}
			}
			for _, entry := range cohort {
				percentile := percentileRank(entry.shrunk[metric], cohort, metric, metric != 6)
				confidence := effectiveGames(entry, metric) / (effectiveGames(entry, metric) + priorGames)
				entry.scores[metric] = 50 + (percentile-50)*confidence
			}
		}
	}
}

func percentileRank(value float64, cohort []*group, metric int, higherBetter bool) float64 {
	if len(cohort) <= 1 {
		return 50
	}
	less, equal := 0, 0
	for _, other := range cohort {
		comparison, target := other.shrunk[metric], value
		if !higherBetter {
			comparison, target = -comparison, -target
		}
		if comparison < target {
			less++
		} else if math.Abs(comparison-target) < 1e-12 {
			equal++
		}
	}
	return 100 * (float64(less) + 0.5*float64(equal-1)) / float64(len(cohort)-1)
}

func effectiveGames(entry *group, metric int) float64 {
	games := len(entry.games)
	if metric == 7 {
		games--
	}
	if games < 0 {
		return 0
	}
	return float64(games)
}

func combine(impact, economy, reliability float64, weights ComponentWeights) float64 {
	return impact*weights.Impact + economy*weights.Economy + reliability*weights.Reliability
}

func rounded(value float64) int {
	return int(math.Round(math.Max(0, math.Min(100, value))))
}

func average(values []float64) float64 {
	sum := 0.0
	for _, value := range values {
		sum += value
	}
	return sum / float64(len(values))
}

func validateSample(sample MatchPerformance) error {
	if sample.MatchID <= 0 || sample.AccountID <= 0 || !validRole(sample.Role) || sample.DurationSeconds <= 0 {
		return fmt.Errorf("invalid performance identity/role/duration: %+v", sample)
	}
	values := []int{sample.Kills, sample.Deaths, sample.Assists, sample.TeamKills, sample.GoldPerMin, sample.XPPerMin, sample.LastHits, sample.HeroDamage}
	for _, value := range values {
		if value < 0 {
			return fmt.Errorf("performance contains negative metric: %+v", sample)
		}
	}
	if sample.Kills > sample.TeamKills {
		return fmt.Errorf("player kills %d exceed team kills %d", sample.Kills, sample.TeamKills)
	}
	return nil
}

func validateConfig(cfg Config) error {
	if !finite(cfg.SamplePriorGames) || cfg.SamplePriorGames <= 0 ||
		!validWeights(cfg.ImpactWeights.KDA, cfg.ImpactWeights.Participation, cfg.ImpactWeights.DamagePerMin) ||
		!validWeights(cfg.EconomyWeights.GPM, cfg.EconomyWeights.XPM, cfg.EconomyWeights.LastHitsPerMin) ||
		!validWeights(cfg.ReliabilityWeights.Survival, cfg.ReliabilityWeights.Consistency) {
		return fmt.Errorf("invalid rating metric weights/prior")
	}
	if len(cfg.RoleWeights) != len(roles()) {
		return fmt.Errorf("rating config must define exactly %d roles", len(roles()))
	}
	for _, role := range roles() {
		weights, exists := cfg.RoleWeights[role]
		if !exists || !finite(weights.Impact) || !finite(weights.Economy) || !finite(weights.Reliability) ||
			weights.Impact < 0 || weights.Economy < 0 || weights.Reliability < 0 ||
			math.Abs(weights.Impact+weights.Economy+weights.Reliability-1) > 1e-9 {
			return fmt.Errorf("invalid OVR weights for role %s", role)
		}
	}
	return nil
}

func validWeights(weights ...float64) bool {
	sum := 0.0
	for _, weight := range weights {
		if !finite(weight) || weight < 0 {
			return false
		}
		sum += weight
	}
	return math.Abs(sum-1) <= 1e-9
}

func finite(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }

func validRole(role model.Role) bool {
	for _, candidate := range roles() {
		if role == candidate {
			return true
		}
	}
	return false
}

func roles() []model.Role {
	return []model.Role{model.RoleSafelane, model.RoleMid, model.RoleOfflane, model.RoleSupport}
}
