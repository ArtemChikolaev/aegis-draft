package emit

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/aegis-draft/pipeline/internal/model"
)

func TestWriteAllDataHashTracksContentNotBuiltAt(t *testing.T) {
	ds := &model.Dataset{
		Manifest: model.Manifest{
			SchemaVersion:      1,
			RatingModelVersion: "test",
			BuiltAt:            "2026-07-22T00:00:00Z",
			Formats:            []model.Format{model.Last1y},
		},
		Heroes: []model.Hero{{ID: 1, Name: "Anti-Mage", Picture: "antimage"}},
	}

	firstDir := t.TempDir()
	if err := WriteAll(firstDir, ds); err != nil {
		t.Fatal(err)
	}
	firstHash := ds.Manifest.DataHash
	if len(firstHash) != len("sha256:")+64 {
		t.Fatalf("unexpected dataHash %q", firstHash)
	}

	var written model.Manifest
	manifestJSON, err := os.ReadFile(filepath.Join(firstDir, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(manifestJSON, &written); err != nil {
		t.Fatal(err)
	}
	if written.DataHash != firstHash {
		t.Fatalf("manifest dataHash = %q, want %q", written.DataHash, firstHash)
	}

	ds.Manifest.BuiltAt = "2026-07-23T00:00:00Z"
	if err := WriteAll(t.TempDir(), ds); err != nil {
		t.Fatal(err)
	}
	if ds.Manifest.DataHash != firstHash {
		t.Fatalf("builtAt-only refresh changed dataHash: %q → %q", firstHash, ds.Manifest.DataHash)
	}

	ds.Heroes[0].Name = "Changed"
	if err := WriteAll(t.TempDir(), ds); err != nil {
		t.Fatal(err)
	}
	if ds.Manifest.DataHash == firstHash {
		t.Fatal("content change did not change dataHash")
	}
}
