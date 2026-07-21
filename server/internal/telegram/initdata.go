// Package telegram проверяет подпись initData Telegram Mini App.
//
// Алгоритм (docs Telegram, «Validating data received via the Mini App»):
//
//	secret_key       = HMAC_SHA256(key="WebAppData", msg=bot_token)
//	computed_hash    = hex(HMAC_SHA256(key=secret_key, msg=data_check_string))
//	valid            = computed_hash == initData.hash
//
// где data_check_string — все поля initData КРОМЕ hash, в виде `key=value`,
// отсортированные по ключу и склеенные через '\n'. Проверка возможна ТОЛЬКО на
// сервере: bot_token секретный. Пакет чистый (без HTTP/БД) и юнит-тестируем.
package telegram

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Ошибки валидации — sentinel, transport маппит их в apperr.Unauthorized/BadRequest.
var (
	ErrEmptyToken  = errors.New("telegram: empty bot token")
	ErrMalformed   = errors.New("telegram: malformed initData")
	ErrMissingHash = errors.New("telegram: initData without hash")
	ErrInvalidHash = errors.New("telegram: initData hash mismatch")
	ErrExpired     = errors.New("telegram: initData expired")
)

// User — минимум профиля из поля `user`. Храним только необходимое: это ПДн.
type User struct {
	ID           int64  `json:"id"`
	FirstName    string `json:"first_name"`
	LastName     string `json:"last_name"`
	Username     string `json:"username"`
	LanguageCode string `json:"language_code"`
}

// InitData — разобранные и проверенные поля.
type InitData struct {
	User     User
	AuthDate time.Time
	QueryID  string
	Raw      url.Values // все поля as-is (декодированные), кроме доверия к hash
}

// Validate проверяет подпись initData ботом botToken. Если maxAge > 0 — отвергает
// данные старше maxAge по auth_date (защита от повторного использования старой подписи).
func Validate(initData, botToken string, maxAge time.Duration) (*InitData, error) {
	if botToken == "" {
		return nil, ErrEmptyToken
	}
	values, err := url.ParseQuery(initData)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrMalformed, err)
	}
	hash := values.Get("hash")
	if hash == "" {
		return nil, ErrMissingHash
	}

	secret := hmacSHA256([]byte("WebAppData"), []byte(botToken))
	want := hmacSHA256(secret, []byte(dataCheckString(values)))
	got, err := hex.DecodeString(hash)
	if err != nil {
		return nil, fmt.Errorf("%w: hash не hex", ErrMalformed)
	}
	// Постоянное по времени сравнение — не сравнивать подписи побайтово через ==.
	if !hmac.Equal(want, got) {
		return nil, ErrInvalidHash
	}

	out := &InitData{QueryID: values.Get("query_id"), Raw: values}
	if ad := values.Get("auth_date"); ad != "" {
		sec, err := strconv.ParseInt(ad, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("%w: auth_date не число", ErrMalformed)
		}
		out.AuthDate = time.Unix(sec, 0)
		if maxAge > 0 && time.Since(out.AuthDate) > maxAge {
			return nil, ErrExpired
		}
	}
	if u := values.Get("user"); u != "" {
		if err := json.Unmarshal([]byte(u), &out.User); err != nil {
			return nil, fmt.Errorf("%w: user не JSON", ErrMalformed)
		}
	}
	return out, nil
}

// dataCheckString собирает все пары кроме hash в отсортированный по ключу
// `key=value`-список через '\n' — ровно то, что подписывает Telegram.
func dataCheckString(values url.Values) string {
	keys := make([]string, 0, len(values))
	for k := range values {
		if k == "hash" {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var b strings.Builder
	for i, k := range keys {
		if i > 0 {
			b.WriteByte('\n')
		}
		b.WriteString(k)
		b.WriteByte('=')
		b.WriteString(values.Get(k))
	}
	return b.String()
}

func hmacSHA256(key, msg []byte) []byte {
	m := hmac.New(sha256.New, key)
	m.Write(msg)
	return m.Sum(nil)
}
