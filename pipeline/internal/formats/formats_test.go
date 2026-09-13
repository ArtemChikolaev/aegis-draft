package formats

import (
	"reflect"
	"testing"
	"time"

	"github.com/aegis-draft/pipeline/internal/model"
)

func day(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestRollingWindowLookupAndStart(t *testing.T) {
	w, ok := RollingWindow(model.Last2y)
	if !ok || w.Years != 2 {
		t.Fatalf("last_2y window = %+v ok=%t", w, ok)
	}
	// Граница — UTC-полночь календарной даты: время суток и пояс asOf на неё не влияют.
	evening := time.Date(2026, 7, 11, 23, 30, 0, 0, time.FixedZone("UTC+3", 3*3600))
	if got, want := w.Start(evening), day("2024-07-11"); !got.Equal(want) {
		t.Fatalf("start = %s, want %s", got, want)
	}
	if _, ok := RollingWindow(model.ValveLegacy); ok {
		t.Fatal("valve_legacy is a curated league set, not a rolling window")
	}
	copied := RollingWindows()
	copied[0].Years = 99
	if again, _ := RollingWindow(model.Last1y); again.Years != 1 {
		t.Fatal("RollingWindows must return a copy")
	}
}

func TestAssignNestedWindows(t *testing.T) {
	asOf := day("2026-07-11")
	cases := []struct {
		name        string
		end         string
		valveLegacy bool
		want        []model.Format
	}{
		{"within last_1y", "2026-04-26", false, []model.Format{model.Last1y, model.Last2y, model.Last5y}},
		{"last_1y boundary inclusive", "2025-07-11", false, []model.Format{model.Last1y, model.Last2y, model.Last5y}},
		{"just outside last_1y", "2025-07-10", false, []model.Format{model.Last2y, model.Last5y}},
		{"within last_2y not 1y", "2024-09-15", false, []model.Format{model.Last2y, model.Last5y}},
		{"within last_5y not 2y", "2023-08-20", false, []model.Format{model.Last5y}},
		{"just outside last_5y", "2021-07-10", false, []model.Format{}},
		{"future event excluded", "2027-01-01", false, []model.Format{}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := Assign(day(tc.end), asOf, tc.valveLegacy)
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("Assign(%s) = %v, want %v", tc.end, got, tc.want)
			}
		})
	}
}

func TestAssignValveLegacyIndependentOfWindow(t *testing.T) {
	asOf := day("2026-07-11")
	// Старый TI вне даже last_5y всё равно valve_legacy (курируемый набор).
	got := Assign(day("2019-08-25"), asOf, true)
	want := []model.Format{model.ValveLegacy}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("legacy-only = %v, want %v", got, want)
	}
	// Свежий TI: и окна, и valve_legacy.
	got = Assign(day("2025-09-14"), asOf, true)
	want = []model.Format{model.Last1y, model.Last2y, model.Last5y, model.ValveLegacy}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("recent TI = %v, want %v", got, want)
	}
}

func TestAssignIgnoresTimeOfDay(t *testing.T) {
	asOf := time.Date(2026, 7, 11, 23, 59, 0, 0, time.UTC)
	end := time.Date(2025, 7, 11, 1, 0, 0, 0, time.UTC) // ровно на границе last_1y
	got := Assign(end, asOf, false)
	if len(got) == 0 || got[0] != model.Last1y {
		t.Fatalf("boundary with time-of-day should keep last_1y, got %v", got)
	}
}
