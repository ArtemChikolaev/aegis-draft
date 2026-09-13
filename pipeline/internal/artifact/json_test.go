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

func TestWriteFileReplacesWithoutLeavingTempFiles(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "data.json")
	if err := os.WriteFile(path, []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := WriteFile(path, []byte("new\n")); err != nil {
		t.Fatal(err)
	}
	body, err := os.ReadFile(path)
	if err != nil || string(body) != "new\n" {
		t.Fatalf("body=%q err=%v", body, err)
	}
	info, err := os.Stat(path)
	if err != nil || info.Mode().Perm() != 0o644 {
		t.Fatalf("stat=%v err=%v", info, err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 {
		t.Fatalf("temp files must not remain: %v err=%v", entries, err)
	}
}
