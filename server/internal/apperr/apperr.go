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
}

func (e *Error) Error() string { return e.Message }

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
