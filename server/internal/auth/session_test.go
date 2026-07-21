package auth

import (
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

const testSecret = "test-session-secret-0123456789"

func TestIssueVerify_RoundTrip(t *testing.T) {
	iss, err := NewSessionIssuer(testSecret, time.Hour)
	if err != nil {
		t.Fatalf("NewSessionIssuer: %v", err)
	}
	id := uuid.New()

	tok, err := iss.Issue(id)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	got, err := iss.Verify(tok)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if got != id {
		t.Fatalf("subject: got %v, want %v", got, id)
	}
}

func TestVerify_WrongSecret(t *testing.T) {
	iss, _ := NewSessionIssuer(testSecret, time.Hour)
	other, _ := NewSessionIssuer("another-secret-entirely", time.Hour)

	tok, _ := iss.Issue(uuid.New())
	if _, err := other.Verify(tok); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("ожидали ErrInvalidToken для чужого секрета, got %v", err)
	}
}

func TestVerify_Expired(t *testing.T) {
	iss, _ := NewSessionIssuer(testSecret, time.Hour)
	// Выпускаем «в прошлом», чтобы срок истёк к моменту проверки.
	iss.now = func() time.Time { return time.Now().Add(-2 * time.Hour) }
	tok, _ := iss.Issue(uuid.New())

	iss.now = time.Now // проверяем «сейчас»
	if _, err := iss.Verify(tok); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("ожидали ErrInvalidToken для истёкшего токена, got %v", err)
	}
}

func TestVerify_Garbage(t *testing.T) {
	iss, _ := NewSessionIssuer(testSecret, time.Hour)
	if _, err := iss.Verify("not.a.jwt"); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("ожидали ErrInvalidToken для мусора, got %v", err)
	}
}

func TestNewSessionIssuer_EmptySecret(t *testing.T) {
	if _, err := NewSessionIssuer("", time.Hour); !errors.Is(err, ErrEmptySecret) {
		t.Fatalf("ожидали ErrEmptySecret, got %v", err)
	}
}
