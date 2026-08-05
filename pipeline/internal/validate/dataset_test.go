package validate

import (
	"testing"

	"github.com/aegis-draft/pipeline/internal/model"
)

func TestDatasetRejectsDuplicatePlayer(t *testing.T) {
	ds := validDataset()
	ds.Packs[0].Players[4].AccountID = ds.Packs[0].Players[0].AccountID
	if err := Dataset(ds); err == nil {
		t.Fatal("expected duplicate accountId error")
	}
}

// Гейт присутствия умеет только СУЖАТЬ окна пака. Формат, которого нет у события, дал бы пак,
// недостижимый ни из одного пула (poolForFormat берёт пересечение), — это дефект сборки.
func TestDatasetRejectsPackFormatOutsideEvent(t *testing.T) {
	ds := validDataset()
	ds.Packs[0].Formats = append(ds.Packs[0].Formats, model.Last2y) // у события только 1y/5y
	if err := Dataset(ds); err == nil {
		t.Fatal("expected error: pack declares a format its event does not have")
	}

	ds = validDataset()
	ds.Packs[0].Formats = nil
	if err := Dataset(ds); err == nil {
		t.Fatal("expected error: pack without formats is unreachable from any pool")
	}
}

func TestDatasetAcceptsSubstitutes(t *testing.T) {
	ds := validDataset()
	ds.Packs[0].Players = append(ds.Packs[0].Players, model.PackPlayer{AccountID: 6, Nickname: "sub", Role: model.RoleSupport})
	if err := Dataset(ds); err != nil {
		t.Fatal(err)
	}
}

func validDataset() *model.Dataset {
	players := []model.PackPlayer{
		{AccountID: 1, Nickname: "p1", Role: model.RoleSafelane},
		{AccountID: 2, Nickname: "p2", Role: model.RoleMid},
		{AccountID: 3, Nickname: "p3", Role: model.RoleOfflane},
		{AccountID: 4, Nickname: "p4", Role: model.RoleSupport},
		{AccountID: 5, Nickname: "p5", Role: model.RoleSupport},
	}
	return &model.Dataset{
		Manifest: model.Manifest{SchemaVersion: 1, RatingModelVersion: "test", BuiltAt: "2026-07-11T00:00:00Z", Counts: map[string]int{"events": 1, "heroes": 0, "packs": 1, "players": 0}},
		Events:   []model.EventInfo{{ID: "event", Name: "Event", Type: "tier1", StartDate: "2025-09-10", Formats: []model.Format{model.Last1y, model.Last5y}}},
		Packs: []model.Pack{{
			ID: "event-team", EventID: "event", TeamID: 1, TeamName: "team",
			Formats: []model.Format{model.Last1y}, Players: players,
		}},
	}
}
