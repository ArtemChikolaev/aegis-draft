// Package tier1 классифицирует лиги OpenDota как tier-1 сцену.
//
// OpenDota-тир ненадёжен: premium — всего ~214 лиг за всю историю и не покрывает
// реальные tier-1 турниры (EWC, DreamLeague S19/23/24, OGA PIT, EPICENTER помечены
// professional). Поэтому tier-1 scope = premium ∪ (professional − явный шум): квалы,
// дивизионы, регионалки, минорки и т.п. Мелкий остаток шума гасит порог матчей на
// событие в domain.BuildEvents. Решение 2026-07-12, PRD §5.4.1 (data-contract не трогаем).
package tier1

import "regexp"

// noise — паттерны professional-лиг, которые НЕ являются tier-1 (квалы/дивизионы/регионалки/минорки).
var noise = []*regexp.Regexp{
	regexp.MustCompile(`(?i)qualifier`),
	regexp.MustCompile(`(?i)\bquals?\b`),
	regexp.MustCompile(`(?i)division`),
	regexp.MustCompile(`(?i)\bdiv\.? ?\d`),
	regexp.MustCompile(`(?i)closed`),
	regexp.MustCompile(`(?i)\bopen\b`),
	regexp.MustCompile(`(?i)regional`),
	regexp.MustCompile(`(?i)relegation`),
	regexp.MustCompile(`(?i)ticket`),
	regexp.MustCompile(`(?i)wildcard`),
	regexp.MustCompile(`(?i)\bminor\b`),
	regexp.MustCompile(`(?i)last chance`),
	regexp.MustCompile(`(?i)road to`),
	regexp.MustCompile(`(?i)\bladder\b`),
	regexp.MustCompile(`(?i)tryout`),
	regexp.MustCompile(`(?i)showmatch`),
	regexp.MustCompile(`(?i)university|collegiate|community`),
	regexp.MustCompile(`(?i)beginner|starter`),
}

// IsTier1 — лига относится к tier-1 сцене: premium, либо professional без явного шума.
// amateur/excluded/пустой tier — не tier-1.
func IsTier1(tier, name string) bool {
	switch tier {
	case "premium":
		return true
	case "professional":
		for _, p := range noise {
			if p.MatchString(name) {
				return false
			}
		}
		return true
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
