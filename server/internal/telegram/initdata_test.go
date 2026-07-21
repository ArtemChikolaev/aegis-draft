package telegram

import (
	"encoding/hex"
	"errors"
	"net/url"
	"strconv"
	"testing"
	"time"
)

const testToken = "123456:AA-Fake-Bot-Token-For-Tests_xyz"

// signInitData собирает валидный initData тем же алгоритмом, что и Validate:
// это единственный способ получить корректную подпись без живого Telegram.
// Round-trip доказывает согласованность; отдельные тесты ниже бьют по подписи
// (tamper / чужой токен), поэтому проверка не вырождается в тавтологию.
func signInitData(t *testing.T, values url.Values, token string) string {
	t.Helper()
	secret := hmacSHA256([]byte("WebAppData"), []byte(token))
	mac := hmacSHA256(secret, []byte(dataCheckString(values)))
	values.Set("hash", hex.EncodeToString(mac))
	return values.Encode()
}

func freshValues() url.Values {
	return url.Values{
		"auth_date": {"1700000000"},
		"query_id":  {"AAH-test"},
		"user":      {`{"id":42,"first_name":"Ada","username":"ada","language_code":"en"}`},
	}
}

func TestValidate_RoundTrip(t *testing.T) {
	v := freshValues()
	v.Set("auth_date", itoa(time.Now().Unix()))
	raw := signInitData(t, v, testToken)

	got, err := Validate(raw, testToken, time.Hour)
	if err != nil {
		t.Fatalf("Validate: неожиданная ошибка: %v", err)
	}
	if got.User.ID != 42 || got.User.Username != "ada" {
		t.Fatalf("user разобран неверно: %+v", got.User)
	}
	if got.QueryID != "AAH-test" {
		t.Fatalf("query_id: got %q", got.QueryID)
	}
}

func TestValidate_Tampered(t *testing.T) {
	v := freshValues()
	v.Set("auth_date", itoa(time.Now().Unix()))
	raw := signInitData(t, v, testToken)

	// Подменяем user ПОСЛЕ подписи — hash больше не сходится.
	parsed, _ := url.ParseQuery(raw)
	parsed.Set("user", `{"id":999,"first_name":"Mallory"}`)
	tampered := parsed.Encode()

	_, err := Validate(tampered, testToken, time.Hour)
	if !errors.Is(err, ErrInvalidHash) {
		t.Fatalf("ожидали ErrInvalidHash, got %v", err)
	}
}

func TestValidate_WrongToken(t *testing.T) {
	v := freshValues()
	v.Set("auth_date", itoa(time.Now().Unix()))
	raw := signInitData(t, v, testToken)

	_, err := Validate(raw, "999999:Different-Token", time.Hour)
	if !errors.Is(err, ErrInvalidHash) {
		t.Fatalf("ожидали ErrInvalidHash для чужого токена, got %v", err)
	}
}

func TestValidate_MissingHash(t *testing.T) {
	_, err := Validate("auth_date=1700000000&user=%7B%7D", testToken, 0)
	if !errors.Is(err, ErrMissingHash) {
		t.Fatalf("ожидали ErrMissingHash, got %v", err)
	}
}

func TestValidate_Expired(t *testing.T) {
	v := freshValues() // auth_date = 1700000000 (2023) — заведомо старый
	raw := signInitData(t, v, testToken)

	_, err := Validate(raw, testToken, time.Hour)
	if !errors.Is(err, ErrExpired) {
		t.Fatalf("ожидали ErrExpired, got %v", err)
	}
}

func TestValidate_FreshWithinMaxAge(t *testing.T) {
	v := freshValues()
	v.Set("auth_date", itoa(time.Now().Add(-time.Minute).Unix()))
	raw := signInitData(t, v, testToken)

	if _, err := Validate(raw, testToken, time.Hour); err != nil {
		t.Fatalf("свежий initData не прошёл: %v", err)
	}
}

func TestValidate_EmptyToken(t *testing.T) {
	if _, err := Validate("hash=abc", "", 0); !errors.Is(err, ErrEmptyToken) {
		t.Fatalf("ожидали ErrEmptyToken, got %v", err)
	}
}

func TestValidate_BadHashHex(t *testing.T) {
	if _, err := Validate("auth_date=1&hash=zzzz", testToken, 0); !errors.Is(err, ErrMalformed) {
		t.Fatalf("ожидали ErrMalformed для не-hex hash, got %v", err)
	}
}

func itoa(n int64) string { return strconv.FormatInt(n, 10) }
