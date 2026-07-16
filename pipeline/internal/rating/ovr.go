package rating

import (
	"fmt"
	"math"
	"sort"

	"github.com/aegis-draft/pipeline/internal/model"
)

const metricCount = 8

// probit — обратная функция стандартного нормального распределения (Acklam, |ошибка| < 1.15e-9).
//
// Зачем: перцентиль ограничен [0,100], и смесь перцентилей (командный + индивидуальный) поджата
// к центру — хвостов у неё нет по построению. Замер: наш максимум стоял в 2.36σ от среднего,
// у 322-0 — в 3.05σ, а для нормального такой выборки ожидается 3.63σ. При этом их распределение
// именно НОРМАЛЬНОЕ (skew 0.05, kurtosis −0.69, квантили совпадают с N(74.1, 7.8) в пределах 2).
// Переводим перцентили в z ДО смешивания: смесь нормальных нормальна, и хвост появляется сам —
// без него потолок черри-пика упирался в ~101 против их ~105.
func probit(p float64) float64 {
	a := [6]float64{-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00}
	b := [5]float64{-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01}
	c := [6]float64{-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00}
	d := [4]float64{7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00}
	const low, high = 0.02425, 1 - 0.02425
	switch {
	case p <= 0:
		return -maxAbsZ
	case p >= 1:
		return maxAbsZ
	case p < low:
		q := math.Sqrt(-2 * math.Log(p))
		return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q + c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q + 1)
	case p <= high:
		q := p - 0.5
		r := q * q
		return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r + a[5]) * q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r + 1)
	default:
		q := math.Sqrt(-2 * math.Log(1-p))
		return -((((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q + c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q + 1))
	}
}

// maxAbsZ — потолок |z| для краёв когорты: probit(0) = −∞, а лучший игрок события не должен
// улетать в бесконечность. 3.5σ — чуть выше ожидаемого максимума нормальной выборки нашего
// размера (3.63σ), так что реальные края в него не упираются.
const maxAbsZ = 3.5

// percentileToZ переводит перцентиль [0,100] в z с поправкой на непрерывность: края когорты
// (0 и 100) иначе дают ±∞. n — размер когорты.
func percentileToZ(percentile float64, n int) float64 {
	if n < 2 {
		return 0
	}
	p := percentile / 100
	edge := 0.5 / float64(n)
	p = math.Max(edge, math.Min(1-edge, p))
	return math.Max(-maxAbsZ, math.Min(maxAbsZ, probit(p)))
}

type MatchPerformance struct {
	MatchID         int64
	AccountID       int
	Role            model.Role
	TeamID          int  // нужен для командного члена OVR — см. teamZ
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

// teamZ — сила каждой команды события в z-единицах: сглаженный winrate НА ЭТОМ событии,
// переведённый в перцентиль среди команд события, а затем в z (см. probit — иначе хвост
// срезается). Прокси места: настоящего placement из OpenDota не достать (deferred), а
// победы на турнире — прямое его отражение.
//
// Зачем вообще: у 322-0 OVR игрока на 92% определяется тем, как сыграла его команда, и лишь
// на 8% им самим (замер их packs.json: разброс OVR внутри команды 2.0 при общем sd 7.8;
// корреляция места и team base −0.858). У нас было 54/46 — отсюда AMMAR 96 и Malr1ne 71 в
// составе, выигравшем турнир. Индивидуальные IMP/ECO/REL при этом остаются собой.
func teamZ(samples []MatchPerformance, cfg Config) map[int]float64 {
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
			out[id] = 0
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
		percentile := 100 * (float64(less) + 0.5*float64(equal-1)) / float64(len(teamIDs)-1)
		out[id] = percentileToZ(percentile, len(teamIDs))
	}
	return out
}

type group struct {
	key    ratingKey
	teamID int
	games  []gameMetrics
	raw    [metricCount]float64
	shrunk [metricCount]float64
	zs     [metricCount]float64 // метрика в z-единицах — из них собирается OVR (хвост!)
	scores [metricCount]float64 // полоса 50..100 — из неё IMP/ECO/REL (не шкала OVR!)
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
	normalizeByRole(ordered, cfg.SamplePriorGames)
	byTeam := teamZ(samples, cfg)

	result := make([]PlayerRating, 0, len(ordered))
	for _, entry := range ordered {
		// IMP/ECO/REL — чисто индивидуальные, на калиброванной шкале: их и показываем.
		impact := entry.scores[0]*cfg.ImpactWeights.KDA + entry.scores[1]*cfg.ImpactWeights.Participation + entry.scores[2]*cfg.ImpactWeights.DamagePerMin
		economy := entry.scores[3]*cfg.EconomyWeights.GPM + entry.scores[4]*cfg.EconomyWeights.XPM + entry.scores[5]*cfg.EconomyWeights.LastHitsPerMin
		reliability := entry.scores[6]*cfg.ReliabilityWeights.Survival + entry.scores[7]*cfg.ReliabilityWeights.Consistency
		weights := cfg.RoleWeights[entry.key.role]

		// OVR собирается в Z-ПРОСТРАНСТВЕ, а не на перцентилях. Перцентиль ограничен [0,100],
		// и смесь перцентилей поджата к центру: наш максимум стоял в 2.36σ от среднего против
		// 3.05σ у 322-0, из-за чего потолок черри-пика упирался в ~101 против их ~105. Смесь
		// нормальных — нормальна, и хвост появляется сам. Их распределение как раз нормальное
		// (skew 0.05, квантили совпадают с N(74.1, 7.8)).
		//
		// Отсюда же следует, что OVR НЕ равен взвешенной сумме показанных IMP/ECO/REL — ровно
		// как у 322-0, где расхождение доходит до 21.7.
		individualZ := combine(
			entry.zs[0]*cfg.ImpactWeights.KDA+entry.zs[1]*cfg.ImpactWeights.Participation+entry.zs[2]*cfg.ImpactWeights.DamagePerMin,
			entry.zs[3]*cfg.EconomyWeights.GPM+entry.zs[4]*cfg.EconomyWeights.XPM+entry.zs[5]*cfg.EconomyWeights.LastHitsPerMin,
			entry.zs[6]*cfg.ReliabilityWeights.Survival+entry.zs[7]*cfg.ReliabilityWeights.Consistency,
			weights,
		)
		teamComponent, hasTeam := byTeam[entry.teamID]
		if !hasTeam {
			teamComponent = individualZ // нет команды у сэмпла — падаем на чистую индивидуалку
		}
		z := cfg.TeamComponentWeight*teamComponent + (1-cfg.TeamComponentWeight)*individualZ
		ovr := cfg.CalibrationMid + z*cfg.CalibrationSpread

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
				// z — для OVR (нормальная шкала, есть хвост). Стягивание по confidence тянет
				// к нулю, то есть к середине когорты, — та же семантика, что и на рангах.
				entry.zs[metric] = percentileToZ(percentile, len(cohort)) * confidence
				// score — для отображаемых IMP/ECO/REL. Полоса 50..100, НЕ шкала OVR: замер
				// 322-0 даёт у всех трёх компонент ровно min=50, max=100, mean=75.0 — это
				// и есть 50 + ранг/2. Компоненты намеренно живут отдельно от калибровки OVR:
				// в OVR подмешан командный член, в них — нет.
				rank := 50 + (percentile-50)*confidence
				entry.scores[metric] = 50 + rank/2
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
