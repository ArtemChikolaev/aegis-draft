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
// От legacy-лиги берётся только МЕЙН-ИВЕНТ (последний непрерывный блок матчей): квалы в
// OpenDota сидят под тем же leagueId, и без этого TI2015 давал 59 команд вместо 16.
// v1.9.0 — BASE стал КОМАНДНЫМ. Замер их packs.json: OVR игрока у 322-0 на 92% объясняется
// тем, как сыграла его команда на событии, и лишь на 8% им самим (разброс OVR внутри команды
// 2.0 при общем sd 7.8; корреляция placement и team base −0.858). У нас было 54/46 — и на
// составе Falcons, ВЫИГРАВШЕМ турнир, выходило 96 у AMMAR_THE_F и 71 у Malr1ne.
// OVR = calib( W·ранг_команды_на_событии + (1−W)·ранг_индивидуальный ), W = TeamComponentWeight.
// Ранг команды — перцентиль по сглаженному winrate НА СОБЫТИИ (teamRanks): настоящий placement
// из OpenDota не достать, победы на турнире — прямой его прокси.
// Следствие, а не баг: OVR больше НЕ равен взвешенной сумме показанных IMP/ECO/REL — у 322-0
// ровно так же, расхождение доходит до 21.7. Компоненты остаются чисто индивидуальными.
// Формулу их Base из бандла достать нельзя (ovr приходит готовым из их пайплайна) — модель
// выведена из поведения их данных.
// v1.10.0 — ХВОСТ. Замер: их распределение OVR НОРМАЛЬНОЕ (skew 0.05, kurtosis −0.69,
// квантили совпадают с N(74.1, 7.8) в пределах 2), их максимум стоит в 3.05σ от среднего.
// Наш стоял в 2.36σ: смесь перцентилей W·T + (1−W)·I ограничена [0,100] и поджата к центру,
// хвостов у неё нет по построению — потолок черри-пика упирался в ~101 против их ~105, и
// собрать 102 было нельзя. Аффинной калибровкой это НЕ лечится: форму хвоста она не меняет,
// а растянуть Spread до нужного максимума значит разнести общий sd.
// Смешивание переведено в Z-ПРОСТРАНСТВО (probit перцентиля до смешивания): смесь нормальных
// нормальна, хвост появляется сам. OVR = Mid + z·Spread, где Spread — сигма в очках.
// Компоненты IMP/ECO/REL развязаны от калибровки OVR и живут в полосе 50..100: у 322-0 у всех
// трёх ровно min=50, max=100, mean=75.0 — это 50 + ранг/2.
// v1.11.0 — Mixed Draft перестал считать base по event OVR. В Mixed пятёрка собрана из разных
// команд, общего события у них нет, и event-форма там несопоставима: замер по packs.json —
// один игрок встречается в 62 паках с OVR 60..91 (разброс 31), то есть число говорит про
// выпавший рандому ивент, а не про игрока. Теперь base = успех его команды за окно
// (teamSuccess) с ограниченной поправкой на личную форму — PRD §5.3/§5.4.3.
// Team Packs НЕ затронут (golden engine-run-team проходит байт-в-байт).
// Отображение успеха в игровую шкалу живёт на фронте (web/src/game/teamSuccess.ts): это
// баланс, как и сам Team OVR, и должно меняться без пересборки датасета. Сам агрегат
// successScore пайплайн отдаёт как раньше — формат данных не менялся.
// ВАЖНО: сейчас successScore — прокси (winrate × вес тира лиги) из domain.BuildTeamSuccess;
// плейсменты/призовые/топ-финиши в данных нулевые до Liquipedia (T1.3 ⛔), полная
// реализация v1.2.0 в internal/teamsuccess не подключена. Когда она приедет — поменяются
// ВХОДНЫЕ числа, а отображение на игровую шкалу останется тем же.
// v1.12.0 — team-success получил окно valve_legacy. Оно пустовало не из-за нехватки данных
// (30 событий 2012–2025, TI/Major, реальные 16–20 команд на событие), а потому что цикл
// агрегации был построен вокруг «N лет назад от asOf», а valve_legacy — курируемый набор лиг.
// Из-за этого Mixed Draft в нём было нечем считать и формат был закрыт SOON. Liquipedia тут
// НЕ нужна: прокси считает winrate × вес тира лиги, обе величины есть на тех же матчах
// (от Liquipedia зависят только titles/prizeUsd, нулевые во всех окнах одинаково).
// Значения last_1y/2y/5y НЕ меняются — добавился лишь новый ключ формата.
// Версию всё равно бампаем: manifest.ratingModelVersion обязан отличать разный output
// модели, а сейвы и так инвалидируются по dataBuiltAt при каждом рефреше.
const ModelVersion = "v1.12.0"

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
	// CalibrationMid/Spread — перенос z на шкалу OVR: OVR = Mid + z·Spread. Mid = среднее,
	// Spread = сигма в очках OVR. Тюнится по ЗАМЕРУ распределения референса, НЕ на глаз:
	//   node .claude/skills/scoring-model/tools/calibrate_ovr.mjs
	// Прогонять после каждого рефреша: состав пула меняет sd, а с ним и Spread.
	CalibrationMid    float64
	CalibrationSpread float64
	// TeamComponentWeight — доля ранга КОМАНДЫ на событии в OVR игрока (0 = чистая
	// индивидуалка, 1 = только команда). У 322-0 замерено 92% дисперсии OVR — командные,
	// 8% — индивидуальные (разброс OVR внутри команды 2.0 при общем sd 7.8). У нас без
	// этого было 54/46, и на выигравшем турнир составе выходило 96 у одного и 71 у другого.
	// Тюнится по ЗАМЕРУ внутрикомандного разброса (цель ~2.0), а не на глаз.
	TeamComponentWeight float64
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
		// Mid — среднее OVR, Spread — СИГМА в очках OVR (z центрирован в 0, см. probit).
		// Цели замерены у 322-0: mean 74.1, sd 7.8, разброс внутри команды 2.0, доля
		// команды 92%. Spread и TeamComponentWeight СВЯЗАНЫ — порознь не тюнить: обе цели
		// зависят от обеих ручек. При sd(teamZ)=1, sd(indivZ)=0.426 и их корреляции 0.86
		// Замер прогона (z-смешивание, W=0.40): sd(z)=0.593, mean(z)=0.024 ⇒
		//   Spread = 7.8 / 0.593 = 13.1,  Mid = 74.1 − 0.024·13.1 = 73.8
		// При них: sd 7.8, внутрикомандный 2.0, доля команды 92% — все три как у 322-0.
		CalibrationMid: 73.8, CalibrationSpread: 13.1,
		TeamComponentWeight: 0.40,
		SamplePriorGames:    8,
		ImpactWeights:       ImpactMetricWeights{KDA: 0.35, Participation: 0.30, DamagePerMin: 0.35},
		EconomyWeights:      EconomyMetricWeights{GPM: 0.45, XPM: 0.35, LastHitsPerMin: 0.20},
		ReliabilityWeights:  ReliabilityMetricWeights{Survival: 0.65, Consistency: 0.35},
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
