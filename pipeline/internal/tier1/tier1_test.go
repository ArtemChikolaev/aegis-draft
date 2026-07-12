package tier1

import "testing"

func TestIsTier1(t *testing.T) {
	cases := []struct {
		tier, name string
		want       bool
	}{
		{"premium", "The International 2024", true},
		{"premium", "Anything Premium", true},
		{"professional", "Esports World Cup 2026", true}, // мислейбл: professional, но tier-1
		{"professional", "DreamLeague Season 24 powered by Intel", true},
		{"professional", "OGA Dota PIT EU/CIS", true},
		{"professional", "The International 2026 - Regional Qualifier Europe", false}, // квал
		{"professional", "DreamLeague Division 2 Season 4", false},                    // дивизион
		{"professional", "PGL Wallachia Season #7 Closed Qualifiers", false},
		{"professional", "AMD DOTA 2 Beginner’s Challenge", false},
		// низкотировые professional-лиги — НЕ tier-1 (главный дефект include-фикса):
		{"professional", "Snake Trophy", false},
		{"professional", "CCT Dota 2 Season 2 Series 6", false},
		{"professional", "BetBoom Streamers Battle x Динамо 12", false},
		{"professional", "Открытые Киберспортивные Игры Сбера 2025", false},
		{"professional", "Americas Convergence Series 1", false},
		// настоящие tier-1 professional-серии — берём:
		{"professional", "PGL Wallachia 2026 Season 8", true},
		{"professional", "BLAST SLAM VII", true},
		{"professional", "FISSURE Universe Episode 8", true},
		{"professional", "Games of the Future 2025 Abu Dhabi", true},
		{"amateur", "Some Amateur Cup", false},
		{"excluded", "Whatever", false},
		{"", "No tier", false},
	}
	for _, c := range cases {
		if got := IsTier1(c.tier, c.name); got != c.want {
			t.Errorf("IsTier1(%q,%q)=%v want %v", c.tier, c.name, got, c.want)
		}
	}
}

func TestIsValveLegacy(t *testing.T) {
	if !IsValveLegacy(600, "The International 2014") {
		t.Error("TI must be valve_legacy by name")
	}
	if !IsValveLegacy(5157, "Kiev Major") {
		t.Error("curated Valve Major id must be valve_legacy")
	}
	if IsValveLegacy(19785, "Esports World Cup 2026") {
		t.Error("EWC is tier-1 but not valve_legacy")
	}
	if IsValveLegacy(999999, "Random Major League e-Sport") {
		t.Error("junk 'major' name must not be valve_legacy")
	}
}
