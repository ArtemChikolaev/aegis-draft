// Package emit пишет Dataset в JSON строго по schema/ (скилл data-contract).
package emit

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/aegis-draft/pipeline/internal/model"
)

type outputFile struct {
	name    string
	payload any
}

// WriteAll сериализует все части Dataset в dir/<name>.json.
func WriteAll(dir string, ds *model.Dataset) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	files := []outputFile{
		{name: "events", payload: nonNilSlice(ds.Events)},
		{name: "heroes", payload: nonNilSlice(ds.Heroes)},
		{name: "packs", payload: nonNilSlice(ds.Packs)},
		{name: "players", payload: nonNilMap(ds.Players)},
		{name: "playerHeroStats", payload: nonNilMap(ds.PlayerHeroStats)},
		{name: "careerPlayerHeroStats", payload: nonNilMap(ds.CareerPlayerHeroStats)},
		{name: "teammates", payload: nonNilMap(ds.Teammates)},
		{name: "squadSynergy", payload: nonNilSlice(ds.SquadSynergy)},
		{name: "eventHeroStats", payload: nonNilMap(ds.EventHeroStats)},
		{name: "teamSuccess", payload: nonNilMap(ds.TeamSuccess)},
	}

	encoded := make([][]byte, len(files))
	hash := sha256.New()
	for i, file := range files {
		b, err := marshalJSON(file.payload)
		if err != nil {
			return fmt.Errorf("encode %s: %w", file.name, err)
		}
		encoded[i] = b
		_, _ = hash.Write([]byte(file.name + ".json\x00"))
		_, _ = hash.Write(b)
	}
	ds.Manifest.DataHash = fmt.Sprintf("sha256:%x", hash.Sum(nil))

	manifest, err := marshalJSON(ds.Manifest)
	if err != nil {
		return fmt.Errorf("encode manifest: %w", err)
	}
	for i, file := range files {
		if err := os.WriteFile(filepath.Join(dir, file.name+".json"), encoded[i], 0o644); err != nil {
			return fmt.Errorf("emit %s: %w", file.name, err)
		}
	}
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), manifest, 0o644); err != nil {
		return fmt.Errorf("emit manifest: %w", err)
	}
	return nil
}

func marshalJSON(v any) ([]byte, error) {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(b, '\n'), nil
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
