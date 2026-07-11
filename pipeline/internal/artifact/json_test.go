package artifact

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestWriteJSON(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "artifact.json")
	if err := WriteJSON(path, map[string]any{"b": 2, "a": 1}); err != nil {
		t.Fatal(err)
	}
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(body, []byte("{\n  \"a\": 1,\n  \"b\": 2\n}\n")) {
		t.Fatalf("unexpected JSON: %s", body)
	}
}
