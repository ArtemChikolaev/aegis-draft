package liquipedia

import "testing"

func TestNewRequiresAuthorizedAccess(t *testing.T) {
	_, err := New(Config{UserAgent: "AegisDraft/0.2 (contact:test@example.com)"})
	if err == nil {
		t.Fatal("expected missing access error")
	}
	_, err = New(Config{BaseURL: "https://example.invalid/api/", AuthHeaderName: "Authorization", AuthHeaderValue: "issued-value", CacheDir: t.TempDir(), UserAgent: "generic"})
	if err == nil {
		t.Fatal("expected contact User-Agent error")
	}
}
