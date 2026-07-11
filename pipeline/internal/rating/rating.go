// Package rating — модель рейтингов (скилл scoring-model). Версионируется: любое
// изменение формул/весов/окна ⇒ бампни ModelVersion (и manifest.ratingModelVersion).
package rating

// ModelVersion — версия модели рейтингов. Меняй при правке любой формулы.
const ModelVersion = "v0-skeleton"

// Config — параметры модели в одном месте (не размазывать по коду).
// Зафиксированные решения PRD §5: без деления саппортов 4/5; сглаживание winrate;
// Peak = скользящее окно; team-success для Mixed.
type Config struct {
	SmoothMu    float64 // μ базового winrate (~0.5)
	SmoothM     float64 // сила сглаживания (~10)
	PeakWindowD int     // длина окна пика в днях (90–180)
	PeakMinN    int     // минимум игр в окне
}

// Default — стартовые параметры (тюнинг на данных — PRD §10-C).
func Default() Config {
	return Config{SmoothMu: 0.5, SmoothM: 10, PeakWindowD: 120, PeakMinN: 15}
}
