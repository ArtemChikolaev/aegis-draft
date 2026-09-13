package pipeline

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/aegis-draft/pipeline/internal/model"
)

// Запуск без источника не пишет «скелет»: раньше голый `go run ./cmd/build` с дефолтным --out
// перезаписывал боевой web/public/data пустым датасетом.
func TestRunWithoutSourceFailsAndLeavesOutputUntouched(t *testing.T) {
	out := filepath.Join(t.TempDir(), "data")
	err := Run(context.Background(), Config{Window: model.Last2y, Out: out})
	if !errors.Is(err, errNothingToDo) {
		t.Fatalf("run without a source must fail with errNothingToDo, got %v", err)
	}
	if _, statErr := os.Stat(out); !errors.Is(statErr, os.ErrNotExist) {
		t.Fatalf("run without a source must not create output, stat err=%v", statErr)
	}
}

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
