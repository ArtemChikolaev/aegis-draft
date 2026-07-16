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
// v1.6.0 (322-0 parity, 3 правки): (1) Base = PER-EVENT (BuildEventRatings — OVR игрока = форма
// на конкретном турнире, не глобально; иначе Save-/Noone всегда максимум); (2) Hero Synergy value —
// games-driven (насыщение по pro-играм, а не centered-winrate; согласовано с матчингом по играм);
// (3) Chemistry chemMaxPerPair 7→4.3 (калибровка под реальные величины 322-0).
// v1.7.0 — ШКАЛА OVR. v1.4.0–v1.6.0 крутили бонусы (synergy ≤+7, chemistry ≤+4.3) и не могли
// починить главное: перцентиль прибивал медиану OVR к 50, поле ботов турнира живёт на шкале
// 322-0 (медиана ~84), максимум Team Base по датасету был 76.6 ⇒ победа невозможна арифметически.
// Четыре правки: (1) normalizeByRole переносит ранг на шкалу референса (CalibrationMid/Spread);
// (2) роли для составов и когорт рейтинга — НА СОБЫТИИ (roles.InferMatch + assignPackRoles), а не
// глобальный primaryRole (он выбрасывал паки без покрытия ролей: 13 команд на TI2021 из 18);
// (3) квалы/дивизионы не tier-1 ни в одной ветке тира (premium пропускал их мимо tier1Exclude);
// (4) Chemistry — только совместные PRO-игры: /players/{id}/peers убран (его with_games —
// пожизненный тотал с пабами, а фильтр «оба игрока про» пабы не отсекает; он ещё и затирал
// точный pro-счёт пары), и снят chemistryCurrentBaseline — нет совместных игр ⇒ нет бонуса.
// v1.8.0 — Hero Synergy / Chemistry по замеру 322-0 (их бандл + сверка на скриншотах), а не
// на глаз. Обе величины у них — ЛИНЕЙНЫЙ рост до ЖЁСТКОГО потолка, не гипербола; гипербола их
// числа не описывает в принципе (перебор M·g/(g+h) даёт ошибку 0.5 против 0.04 у линейной).
// (1) Hero Synergy = Σ 1.5·min(1, games/25) ⇒ максимум ровно 7.5; ~25 игр на герое = потолок,
// поэтому виабельны десятки героев, а не только 300-игровые (было 2·g/(g+25), без потолка).
// (2) Chemistry = Σ mult[размер]·min(4, games/230), потолок 13; mult {2:1, 3:1.6, 4:2.2, 5:3}.
// Воспроизводит их значения точно: 350 игр → 1.5, 823 → 3.6, 267 → 1.2.
// (3) squadSynergy хранит ГРУППЫ 2–5, а не только пары (контракт данных): сыгравшаяся пятёрка
// весит ×3 и по парам не восстанавливается. Схема: ids maxItems 2 → 5.
// (4) Пороги подписей: base(88, 94), hero(4.5, 6.5), chem(5, 9) — прежние hero(4, 7) метили
// их же ролл с 6.8 как GREAT вместо INSANE.
// (5) valve_legacy больше не режется rolling-окном: коллектор тянул TI2011..TI2019 всей
// историей, а FilterMatchesByWindow тут же их выбрасывал — формат жил на 2021+ вместо 2011+.
const ModelVersion = "v1.8.0"

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
	SmoothMu    float64 // μ базового winrate (~0.5)
	SmoothM     float64 // сила сглаживания (~10)
	PeakWindowD int     // длина окна пика в днях (90–180)
	PeakMinN    int     // минимум игр в окне
	// CalibrationMid/Spread — перенос ранга на шкалу OVR (см. normalizeByRole). Mid = OVR
	// медианного игрока; Spread — во сколько раз сжать ранг вокруг него. Тюнится по ЗАМЕРУ
	// распределения референса, НЕ на глаз:
	//   node .claude/skills/scoring-model/tools/calibrate_ovr.mjs
	// Прогонять после каждого рефреша: состав пула меняет sd, а с ним и Spread.
	CalibrationMid      float64
	CalibrationSpread   float64
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
		// Замерено на сухом прогоне 2026-07-16 (1075 паков после фильтра квалов) против
		// референса (322-0 packs.json, 3516 игроков: mean 74.1, sd 7.8). Прошлые 74.1/0.606
		// давали mean 74.7 / sd 7.4 — ранг центрирован не ровно в 50 (перцентиль с ties +
		// веса ролей + округление), поэтому Mid — это поправка, а не цель.
		CalibrationMid: 73.5, CalibrationSpread: 0.639,
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
