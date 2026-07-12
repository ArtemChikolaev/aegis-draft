package transport

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/aegis-draft/server/internal/apperr"
)

// writeJSON пишет v как JSON с указанным статусом.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("[transport] encode response: %v", err)
	}
}

// writeError маппит доменную ошибку в HTTP status + JSON {code,message}.
// Не-доменная ошибка → 500 internal (детали не утекают клиенту).
func writeError(w http.ResponseWriter, err error) {
	if appErr, ok := err.(*apperr.Error); ok {
		writeJSON(w, appErr.Status, appErr)
		return
	}
	log.Printf("[transport] unhandled error: %v", err)
	writeJSON(w, http.StatusInternalServerError, apperr.Internal("internal server error"))
}
