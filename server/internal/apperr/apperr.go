// Package apperr — единый доменный тип ошибки для сервера. Хендлеры возвращают
// *apperr.Error, transport маппит его в HTTP status + JSON {code,message}.
// Один контракт ошибок на весь сервис (см. скилл backend-architecture).
package apperr

import "net/http"

// Error — доменная ошибка: машинный code, человекочитаемое message и HTTP status.
type Error struct {
	Status  int    `json:"-"`
	Code    string `json:"code"`
	Message string `json:"message"`
	// Err — внутренняя причина (драйвер БД, подписант токена). В ответ клиенту не попадает,
	// transport пишет её в лог для 5xx: без этого сбой хранилища был невидим в проде.
	Err error `json:"-"`
}

func (e *Error) Error() string { return e.Message }

// Unwrap — чтобы errors.Is/As видели причину сквозь доменную ошибку.
func (e *Error) Unwrap() error { return e.Err }

// Wrap прикладывает причину и возвращает ту же ошибку (для цепочки apperr.Internal("…").Wrap(err)).
func (e *Error) Wrap(err error) *Error {
	e.Err = err
	return e
}

// New конструирует доменную ошибку.
func New(status int, code, message string) *Error {
	return &Error{Status: status, Code: code, Message: message}
}

// Типовые конструкторы — чтобы не плодить форматы по хендлерам.
func BadRequest(code, message string) *Error   { return New(http.StatusBadRequest, code, message) }
func Unauthorized(code, message string) *Error { return New(http.StatusUnauthorized, code, message) }
func NotFound(code, message string) *Error     { return New(http.StatusNotFound, code, message) }
func Conflict(code, message string) *Error     { return New(http.StatusConflict, code, message) }
func Internal(message string) *Error           { return New(http.StatusInternalServerError, "internal", message) }
