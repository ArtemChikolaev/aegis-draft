// Package auth выпускает и проверяет сессионные JWT (HS256). Stateless: подпись
// сверяется секретом, БД не трогается. Переносится через Authorization: Bearer.
// Отзыв до истечения не поддерживается намеренно (короткий TTL) — отзываемые
// сессии, если понадобятся, добавятся отдельно (таблица sessions).
package auth

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var (
	ErrEmptySecret  = errors.New("auth: empty session secret")
	ErrInvalidToken = errors.New("auth: invalid session token")
)

// SessionIssuer подписывает и проверяет сессионные токены одним секретом.
type SessionIssuer struct {
	secret []byte
	ttl    time.Duration
	now    func() time.Time // подменяется в тестах
}

// NewSessionIssuer создаёт эмиттер. secret — из env (SESSION_SECRET), не из кода.
func NewSessionIssuer(secret string, ttl time.Duration) (*SessionIssuer, error) {
	if secret == "" {
		return nil, ErrEmptySecret
	}
	return &SessionIssuer{secret: []byte(secret), ttl: ttl, now: time.Now}, nil
}

// Issue выпускает подписанный токен на userID с TTL от текущего момента.
func (s *SessionIssuer) Issue(userID uuid.UUID) (string, error) {
	now := s.now()
	claims := jwt.RegisteredClaims{
		Subject:   userID.String(),
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(s.ttl)),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString(s.secret)
	if err != nil {
		return "", fmt.Errorf("auth: sign: %w", err)
	}
	return signed, nil
}

// Verify проверяет подпись и срок, возвращает userID из subject. Алгоритм жёстко
// зафиксирован HS256 — иначе возможна alg-confusion атака (подмена на none/RS).
func (s *SessionIssuer) Verify(token string) (uuid.UUID, error) {
	var claims jwt.RegisteredClaims
	_, err := jwt.ParseWithClaims(token, &claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("%w: unexpected alg %v", ErrInvalidToken, t.Header["alg"])
		}
		return s.secret, nil
	}, jwt.WithValidMethods([]string{"HS256"}), jwt.WithTimeFunc(s.now))
	if err != nil {
		return uuid.Nil, fmt.Errorf("%w: %v", ErrInvalidToken, err)
	}
	id, err := uuid.Parse(claims.Subject)
	if err != nil {
		return uuid.Nil, fmt.Errorf("%w: bad subject", ErrInvalidToken)
	}
	return id, nil
}
