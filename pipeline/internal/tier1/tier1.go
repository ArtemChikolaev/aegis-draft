// Package tier1 классифицирует лиги OpenDota как tier-1 сцену.
//
// OpenDota-тир ненадёжен: premium — всего ~214 лиг за всю историю; при этом «professional»
// смешивает реальные tier-1 турниры (EWC, DreamLeague, PGL Wallachia, BLAST Slam, ESL One,
// FISSURE) с кучей tier-2/3 (Snake Trophy, CCT Series, BetBoom Streamers Battle, региональные
// кубки). exclude-based фильтр (professional − шум) пропускал этот мусор, поэтому tier-1 scope =
// premium ∪ (professional, чьё имя совпало с курируемым списком реальных tier-1 серий).
// Решение 2026-07-12, PRD §5.4.1 (data-contract не трогаем).
package tier1

import "regexp"

// tier1Series — курируемые паттерны имён реальных tier-1 серий (проверены на live-именах OpenDota).
var tier1Series = []*regexp.Regexp{
	regexp.MustCompile(`(?i)the international \d{4}`),
	regexp.MustCompile(`(?i)esports world cup`),
	regexp.MustCompile(`(?i)^dreamleague`),
	regexp.MustCompile(`(?i)^esl one `),
	regexp.MustCompile(`(?i)pgl wallachia`),
	regexp.MustCompile(`(?i)pgl .*major`),
	regexp.MustCompile(`(?i)^blast slam`),
	regexp.MustCompile(`(?i)^blast\.tv`),
	regexp.MustCompile(`(?i)blast bounty`),
	regexp.MustCompile(`(?i)fissure (universe|playground|special)`),
	regexp.MustCompile(`(?i)riyadh masters`),
	regexp.MustCompile(`(?i)games of the future`),
	regexp.MustCompile(`(?i)^elite league`),
	regexp.MustCompile(`(?i)snow.?ruyi`),
	regexp.MustCompile(`(?i)clavision.*masters`),
	regexp.MustCompile(`(?i)oga .*dota pit`),
	regexp.MustCompile(`(?i)(epicenter|starladder|imbatv|weplay|mdl) .*major`),
	regexp.MustCompile(`(?i)(singapore|berlin|lima|bali|arlington|bucharest|stockholm|kyiv|kiev|chongqing|kuala lumpur|frankfurt|shanghai|manila|boston|winter|fall) major`),
	regexp.MustCompile(`(?i)china dota\s?2? super ?major`),
}

// tier1Exclude — отсекает квалы/дивизионы у совпавших серий (напр. «DreamLeague Division 2»).
var tier1Exclude = []*regexp.Regexp{
	regexp.MustCompile(`(?i)qualifier`),
	regexp.MustCompile(`(?i)division`),
	regexp.MustCompile(`(?i)closed`),
	regexp.MustCompile(`(?i)relegation`),
	regexp.MustCompile(`(?i)ticket`),
}

// IsTier1 — лига относится к tier-1 сцене: premium, либо professional, чьё имя совпало с
// курируемым списком tier-1 серий (и не является квалом/дивизионом). Это отсекает низкотировые
// professional-лиги (Snake Trophy, CCT, региональные кубки). amateur/excluded/пустой — не tier-1.
func IsTier1(tier, name string) bool {
	switch tier {
	case "premium":
		return true
	case "professional":
		for _, ex := range tier1Exclude {
			if ex.MatchString(name) {
				return false
			}
		}
		for _, p := range tier1Series {
			if p.MatchString(name) {
				return true
			}
		}
		return false
	default:
		return false
	}
}

var tiName = regexp.MustCompile(`(?i)^the international \d{4}$`)

// valveMajors — курируемые id Valve/DPC Major. Классические (Kiev/Fall/Winter) в OpenDota
// помечены professional, поэтому по имени/тиру их надёжно не выделить. Дополняется вручную
// по мере появления новых мейджоров (id из /leagues).
var valveMajors = map[int64]struct{}{
	4266: {}, 4874: {}, 5157: {}, 9584: {}, 9943: {}, 10296: {}, 10482: {}, 10810: {},
	10826: {}, 11280: {}, 12906: {}, 12964: {}, 14173: {}, 14417: {}, 15089: {}, 15251: {}, 15438: {},
}

// IsValveLegacy — формат valve_legacy: все The International + курируемые Valve/DPC Majors.
func IsValveLegacy(id int64, name string) bool {
	if tiName.MatchString(name) {
		return true
	}
	_, ok := valveMajors[id]
	return ok
}
