// Package rating — модель рейтингов (скилл scoring-model). Версионируется: любое
// изменение формул/весов/окна ⇒ бампни ModelVersion (и manifest.ratingModelVersion).
package rating

import "github.com/aegis-draft/pipeline/internal/model"

// ModelVersion — версия модели рейтингов. Меняй при правке любой формулы.
// v1.3.0: назначение героев (Hero Synergy) использует careerPlayerHeroStats как базу
// player×hero (окно/событие уточняют свежесть) — раньше базой было только окно.
// v1.4.0: подняты масштабы Hero Synergy/Chemistry (synergyScale 20→50, chemistryScale 16→45,
// former-mult 0.35→0.55, current-baseline 0.12→0.15) — прежние +0.1-бонусы были несерьёзными.
// v1.5.0: рекалибровка клиентского слоя синергии/химии (TS-числа; Go-агрегаты те же, модель
// версионируется вместе): (1) heroStatsForAssignment = только pro window (playerHeroStats), career
// — только UI; (2) снят event-оверlay; (3) Hero Synergy = сумма по 5 героям; (4) Chemistry =
// сыгранность (совместные игры), не winrate.
// v1.5.2: synergyScale 50→20 (калибровка Hero Synergy под 322-0).
const ModelVersion = "v1.5.2"

type ImpactMetricWeights struct {
	KDA           float64
	Participation float64
	DamagePerMin  float64
}

type EconomyMetricWeights struct {
	GPM            float64
	XPM            float64
	LastHitsPerMin float64
}

type ReliabilityMetricWeights struct {
	Survival    float64
	Consistency float64
}

type ComponentWeights struct {
	Impact      float64
	Economy     float64
	Reliability float64
}

type TeamSuccessWeights struct {
	Placement float64
	Prize     float64
	Winrate   float64
	TopFinish float64
}

type EventPrestigeWeights struct {
	TI    float64
	Major float64
	Tier1 float64
}

type PlacementWeights struct {
	Champion float64
	RunnerUp float64
	Top4     float64
	Top8     float64
}

// Config — параметры модели в одном месте (не размазывать по коду).
// Зафиксированные решения PRD §5: без деления саппортов 4/5; сглаживание winrate;
// Peak = скользящее окно; team-success для Mixed.
type Config struct {
	SmoothMu            float64 // μ базового winrate (~0.5)
	SmoothM             float64 // сила сглаживания (~10)
	PeakWindowD         int     // длина окна пика в днях (90–180)
	PeakMinN            int     // минимум игр в окне
	SamplePriorGames    float64
	ImpactWeights       ImpactMetricWeights
	EconomyWeights      EconomyMetricWeights
	ReliabilityWeights  ReliabilityMetricWeights
	RoleWeights         map[model.Role]ComponentWeights
	TeamSuccessWeights  TeamSuccessWeights
	EventPrestige       EventPrestigeWeights
	PlacementWeights    PlacementWeights
	PlacementPointScale float64
	PrizeReferenceUSD   float64
	TitlePoints         float64
	TopFinishPoints     float64
	PlayerFormMinFactor float64
	PlayerFormMaxFactor float64
}

// Default — стартовые параметры (тюнинг на данных — PRD §10-C).
func Default() Config {
	return Config{
		SmoothMu: 0.5, SmoothM: 10, PeakWindowD: 120, PeakMinN: 15,
		SamplePriorGames:   8,
		ImpactWeights:      ImpactMetricWeights{KDA: 0.35, Participation: 0.30, DamagePerMin: 0.35},
		EconomyWeights:     EconomyMetricWeights{GPM: 0.45, XPM: 0.35, LastHitsPerMin: 0.20},
		ReliabilityWeights: ReliabilityMetricWeights{Survival: 0.65, Consistency: 0.35},
		RoleWeights: map[model.Role]ComponentWeights{
			model.RoleSafelane: {Impact: 0.40, Economy: 0.45, Reliability: 0.15},
			model.RoleMid:      {Impact: 0.45, Economy: 0.40, Reliability: 0.15},
			model.RoleOfflane:  {Impact: 0.45, Economy: 0.25, Reliability: 0.30},
			model.RoleSupport:  {Impact: 0.45, Economy: 0.15, Reliability: 0.40},
		},
		TeamSuccessWeights:  TeamSuccessWeights{Placement: 0.40, Prize: 0.20, Winrate: 0.25, TopFinish: 0.15},
		EventPrestige:       EventPrestigeWeights{TI: 3, Major: 2, Tier1: 1},
		PlacementWeights:    PlacementWeights{Champion: 1, RunnerUp: 0.65, Top4: 0.40, Top8: 0.15},
		PlacementPointScale: 25, PrizeReferenceUSD: 10_000_000,
		TitlePoints: 30, TopFinishPoints: 10,
		PlayerFormMinFactor: 0.8, PlayerFormMaxFactor: 1.2,
	}
}
