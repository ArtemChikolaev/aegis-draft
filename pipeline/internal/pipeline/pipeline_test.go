package pipeline

import (
	"testing"
	"time"

	"github.com/aegis-draft/pipeline/internal/model"
)

func TestCollectionWindowUsesFixedCalendarBoundary(t *testing.T) {
	start, asOf, err := collectionWindow(Config{CollectWindow: true, Window: model.Last2y, AsOf: "2026-07-11"})
	if err != nil {
		t.Fatal(err)
	}
	want := time.Date(2024, 7, 11, 0, 0, 0, 0, time.UTC).Unix()
	if start != want || asOf != "2026-07-11" {
		t.Fatalf("start=%d asOf=%q", start, asOf)
	}
}

func TestCollectionWindowRejectsMovingOrLegacyWindow(t *testing.T) {
	if _, _, err := collectionWindow(Config{CollectWindow: true, Window: model.Last2y}); err == nil {
		t.Fatal("expected fixed as-of requirement")
	}
	if _, _, err := collectionWindow(Config{CollectWindow: true, Window: model.ValveLegacy, AsOf: "2026-07-11"}); err == nil {
		t.Fatal("expected unsupported legacy window")
	}
}
