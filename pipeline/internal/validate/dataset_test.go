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
		Manifest: model.Manifest{SchemaVersion: 1, RatingModelVersion: "test", BuiltAt: "2026-07-11T00:00:00Z", Counts: map[string]int{"events": 0, "heroes": 0, "packs": 1, "players": 0}},
		Packs:    []model.Pack{{ID: "event-team", EventID: "event", TeamID: 1, TeamName: "team", Players: players}},
	}
}
