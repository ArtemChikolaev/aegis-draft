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
	TeamID          int  // нужен для командного члена OVR — см. teamRanks
	Won             bool // исход матча для команды игрока
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

// teamRanks — ранг каждой команды события по её выступлению НА ЭТОМ событии: сглаженный
// winrate, переведённый в перцентиль среди команд события. Прокси места: настоящего
// placement из OpenDota не достать (deferred), а победы на турнире — прямое его отражение.
//
// Зачем вообще: у 322-0 OVR игрока на 92% определяется тем, как сыграла его команда, и лишь
// на 8% им самим (замер их packs.json: разброс OVR внутри команды 2.0 при общем sd 7.8;
// корреляция места и team base −0.858). У нас было 54/46 — отсюда AMMAR 96 и Malr1ne 71 в
// составе, выигравшем турнир. Индивидуальные IMP/ECO/REL при этом остаются собой.
func teamRanks(samples []MatchPerformance, cfg Config) map[int]float64 {
	type record struct{ games, wins int }
	perTeam := make(map[int]*record)
	seen := make(map[[2]int]struct{}, len(samples)) // матч×команда считаем один раз, не по 5 игрокам
	for _, sample := range samples {
		if sample.TeamID <= 0 {
			continue
		}
		entry := perTeam[sample.TeamID]
		if entry == nil {
			entry = &record{}
			perTeam[sample.TeamID] = entry
		}
		key := [2]int{int(sample.MatchID), sample.TeamID}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		entry.games++
		if sample.Won {
			entry.wins++
		}
	}
	teamIDs := make([]int, 0, len(perTeam))
	for id := range perTeam {
		teamIDs = append(teamIDs, id)
	}
	sort.Ints(teamIDs) // детерминизм
	// Сглаживание обязательно: команда 2-0 на вылете не должна обгонять чемпиона 24-8.
	strength := make(map[int]float64, len(teamIDs))
	for _, id := range teamIDs {
		entry := perTeam[id]
		strength[id] = (float64(entry.wins) + cfg.SmoothM*cfg.SmoothMu) / (float64(entry.games) + cfg.SmoothM)
	}
	out := make(map[int]float64, len(teamIDs))
	for _, id := range teamIDs {
		if len(teamIDs) <= 1 {
			out[id] = 50
			continue
		}
		less, equal := 0, 0
		for _, other := range teamIDs {
			switch {
			case strength[other] < strength[id]:
				less++
			case math.Abs(strength[other]-strength[id]) < 1e-12:
				equal++
			}
		}
		out[id] = 100 * (float64(less) + 0.5*float64(equal-1)) / float64(len(teamIDs)-1)
	}
	return out
}

type group struct {
	key    ratingKey
	teamID int
	games  []gameMetrics
	raw    [metricCount]float64
	shrunk [metricCount]float64
	ranks  [metricCount]float64 // перцентиль-ранг ДО калибровки — из него собирается OVR
	scores [metricCount]float64 // ранг, перенесённый на шкалу OVR — из него IMP/ECO/REL
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
			entry = &group{key: key, teamID: sample.TeamID}
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
	normalizeByRole(ordered, cfg.SamplePriorGames, cfg.CalibrationMid, cfg.CalibrationSpread)
	byTeam := teamRanks(samples, cfg)

	result := make([]PlayerRating, 0, len(ordered))
	for _, entry := range ordered {
		// IMP/ECO/REL — чисто индивидуальные, на калиброванной шкале: их и показываем.
		impact := entry.scores[0]*cfg.ImpactWeights.KDA + entry.scores[1]*cfg.ImpactWeights.Participation + entry.scores[2]*cfg.ImpactWeights.DamagePerMin
		economy := entry.scores[3]*cfg.EconomyWeights.GPM + entry.scores[4]*cfg.EconomyWeights.XPM + entry.scores[5]*cfg.EconomyWeights.LastHitsPerMin
		reliability := entry.scores[6]*cfg.ReliabilityWeights.Survival + entry.scores[7]*cfg.ReliabilityWeights.Consistency
		weights := cfg.RoleWeights[entry.key.role]

		// OVR собирается из РАНГОВ (до калибровки), потому что к ним подмешивается ранг команды.
		// Смешивать на калиброванной шкале нельзя: калибровка аффинна, и повторное применение
		// сдвинуло бы центр. Отсюда же следует, что OVR ПЕРЕСТАЁТ быть взвешенной суммой
		// показанных IMP/ECO/REL — ровно как у 322-0, где расхождение доходит до 21.7.
		individualRank := combine(
			entry.ranks[0]*cfg.ImpactWeights.KDA+entry.ranks[1]*cfg.ImpactWeights.Participation+entry.ranks[2]*cfg.ImpactWeights.DamagePerMin,
			entry.ranks[3]*cfg.EconomyWeights.GPM+entry.ranks[4]*cfg.EconomyWeights.XPM+entry.ranks[5]*cfg.EconomyWeights.LastHitsPerMin,
			entry.ranks[6]*cfg.ReliabilityWeights.Survival+entry.ranks[7]*cfg.ReliabilityWeights.Consistency,
			weights,
		)
		teamRank, hasTeam := byTeam[entry.teamID]
		if !hasTeam {
			teamRank = individualRank // нет команды у сэмпла — падаем на чистую индивидуалку
		}
		rank := cfg.TeamComponentWeight*teamRank + (1-cfg.TeamComponentWeight)*individualRank
		ovr := cfg.CalibrationMid + (rank-50)*cfg.CalibrationSpread

		result = append(result, PlayerRating{
			AccountID: entry.key.accountID, Role: entry.key.role, Games: len(entry.games),
			Impact: rounded(impact), Economy: rounded(economy), Reliability: rounded(reliability),
			OVR: rounded(ovr),
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

// normalizeByRole переводит сглаженную метрику в очки шкалы OVR.
//
// Перцентиль внутри когорты роли даёт ранг, но НЕ шкалу: медиана перцентиля равна 50 по
// построению, поэтому раньше средний про-игрок получал ровно 50, а поле ботов турнира живёт
// на шкале 322-0 (медиана ~84). Разрыв в ~23 очка делал победу арифметически невозможной:
// максимум Team Base по всему датасету был 76.6. Ни один из бонусов (Hero Synergy ≤ +7,
// Chemistry ≤ +4.3) этот разрыв закрыть не мог — крутили не ту ручку (v1.4.0–v1.6.0).
//
// calibrationMid/Spread переносят ранг на шкалу референса (замерено на его публичных packs.json:
// player OVR mean 74.1, sd 7.8, диапазон 55–98). Преобразование АФФИННОЕ и монотонное — порядок
// игроков не меняется, меняется только шкала. Веса ролей в combine() дают в сумме 1, поэтому
// impact/economy/reliability и OVR масштабируются одинаково.
func normalizeByRole(groups []*group, priorGames, calibrationMid, calibrationSpread float64) {
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
				rank := 50 + (percentile-50)*confidence
				entry.ranks[metric] = rank
				entry.scores[metric] = calibrationMid + (rank-50)*calibrationSpread
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
	if !finite(cfg.TeamComponentWeight) || cfg.TeamComponentWeight < 0 || cfg.TeamComponentWeight > 1 {
		return fmt.Errorf("invalid team component weight %v (want 0..1)", cfg.TeamComponentWeight)
	}
	if !finite(cfg.CalibrationMid) || cfg.CalibrationMid <= 0 || cfg.CalibrationMid > 100 ||
		!finite(cfg.CalibrationSpread) || cfg.CalibrationSpread <= 0 {
		return fmt.Errorf("invalid OVR calibration mid/spread")
	}
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
