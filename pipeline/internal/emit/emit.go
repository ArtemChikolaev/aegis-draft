// Package emit пишет Dataset в JSON строго по schema/ (скилл data-contract).
package emit

import (
	"crypto/sha256"
	"fmt"
	"path/filepath"

	"github.com/aegis-draft/pipeline/internal/artifact"
	"github.com/aegis-draft/pipeline/internal/model"
)

type outputFile struct {
	name    string
	payload any
}

// WriteAll сериализует все части Dataset в dir/<name>.json. Каждый файл пишется атомарно
// (artifact.WriteFile): упавший посреди записи прогон не оставит усечённый JSON. manifest.json —
// последним: его dataHash описывает уже записанные файлы.
func WriteAll(dir string, ds *model.Dataset) error {
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
		b, err := artifact.EncodeJSON(file.payload)
		if err != nil {
			return fmt.Errorf("encode %s: %w", file.name, err)
		}
		encoded[i] = b
		_, _ = hash.Write([]byte(file.name + ".json\x00"))
		_, _ = hash.Write(b)
	}
	ds.Manifest.DataHash = fmt.Sprintf("sha256:%x", hash.Sum(nil))

	manifest, err := artifact.EncodeJSON(ds.Manifest)
	if err != nil {
		return fmt.Errorf("encode manifest: %w", err)
	}
	for i, file := range files {
		if err := artifact.WriteFile(filepath.Join(dir, file.name+".json"), encoded[i]); err != nil {
			return fmt.Errorf("emit %s: %w", file.name, err)
		}
	}
	if err := artifact.WriteFile(filepath.Join(dir, "manifest.json"), manifest); err != nil {
		return fmt.Errorf("emit manifest: %w", err)
	}
	return nil
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
