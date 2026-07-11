package normalize

import "testing"

func TestAccountID(t *testing.T) {
	account := int64(42)
	steam := SteamID64Base + 42
	got, err := AccountID(&account, &steam)
	if err != nil || got != 42 {
		t.Fatalf("got=%d err=%v", got, err)
	}
	other := SteamID64Base + 43
	if _, err := AccountID(&account, &other); err == nil {
		t.Fatal("expected conflicting ids error")
	}
}

func TestUniqueAccountIDs(t *testing.T) {
	if err := UniqueAccountIDs([]int{1, 2, 3}); err != nil {
		t.Fatal(err)
	}
	if err := UniqueAccountIDs([]int{1, 2, 1}); err == nil {
		t.Fatal("expected duplicate error")
	}
}
