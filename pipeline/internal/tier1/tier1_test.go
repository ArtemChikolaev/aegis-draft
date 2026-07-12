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
