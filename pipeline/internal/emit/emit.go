// Package emit пишет Dataset в JSON строго по schema/ (скилл data-contract).
package emit

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/aegis-draft/pipeline/internal/model"
)

// WriteAll сериализует все части Dataset в dir/<name>.json.
func WriteAll(dir string, ds *model.Dataset) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	files := map[string]any{
		"manifest":              ds.Manifest,
		"events":                nonNilSlice(ds.Events),
		"heroes":                nonNilSlice(ds.Heroes),
		"packs":                 nonNilSlice(ds.Packs),
		"players":               nonNilMap(ds.Players),
		"playerHeroStats":       nonNilMap(ds.PlayerHeroStats),
		"careerPlayerHeroStats": nonNilMap(ds.CareerPlayerHeroStats),
		"teammates":             nonNilMap(ds.Teammates),
		"squadSynergy":          nonNilSlice(ds.SquadSynergy),
		"eventHeroStats":        nonNilMap(ds.EventHeroStats),
		"teamSuccess":           nonNilMap(ds.TeamSuccess),
	}
	for name, payload := range files {
		if err := writeJSON(filepath.Join(dir, name+".json"), payload); err != nil {
			return fmt.Errorf("emit %s: %w", name, err)
		}
	}
	return nil
}

func writeJSON(path string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(b, '\n'), 0o644)
}

// Пустой срез должен сериализоваться как [], а не null (иначе валидатор схемы упадёт).
func nonNilSlice[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}

// Пустая карта должна сериализоваться как {}, а не null.
func nonNilMap[K comparable, V any](m map[K]V) map[K]V {
	if m == nil {
		return map[K]V{}
	}
	return m
}
