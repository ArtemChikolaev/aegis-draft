package transport

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/aegis-draft/server/internal/apperr"
	"github.com/aegis-draft/server/internal/model"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// Saves — зависимость save-хендлеров (реализуется *service.SaveService).
type Saves interface {
	Get(ctx context.Context, userID uuid.UUID, kind string) (*model.Save, error)
	Put(ctx context.Context, w model.SaveWrite) (*model.Save, error)
}

type saveDTO struct {
	Kind               string          `json:"kind"`
	Payload            json.RawMessage `json:"payload"`
	Rev                int64           `json:"rev"`
	SchemaVersion      string          `json:"schemaVersion"`
	RatingModelVersion string          `json:"ratingModelVersion"`
	UpdatedAt          time.Time       `json:"updatedAt"`
}

func toSaveDTO(s model.Save) saveDTO {
	return saveDTO{
		Kind:               s.Kind,
		Payload:            s.Payload,
		Rev:                s.Rev,
		SchemaVersion:      s.SchemaVersion,
		RatingModelVersion: s.RatingModelVersion,
		UpdatedAt:          s.UpdatedAt,
	}
}

type putSaveRequest struct {
	Payload            json.RawMessage `json:"payload"`
	BaseRev            int64           `json:"baseRev"`
	SchemaVersion      string          `json:"schemaVersion"`
	RatingModelVersion string          `json:"ratingModelVersion"`
}

// saveConflictResponse — тело 409: актуальный серверный сейв, чтобы клиент смёржил.
type saveConflictResponse struct {
	Error   *apperr.Error `json:"error"`
	Current saveDTO       `json:"current"`
}

// getSave: GET /api/saves/{kind} — сейв текущего пользователя (из Bearer).
func (s *Server) getSave(w http.ResponseWriter, r *http.Request) {
	userID, _ := userIDFrom(r.Context()) // гарантирован requireAuth
	sv, err := s.saves.Get(r.Context(), userID, chi.URLParam(r, "kind"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toSaveDTO(*sv))
}

// putSave: PUT /api/saves/{kind} — запись сейва с CAS по baseRev. Конфликт → 409 с текущим.
func (s *Server) putSave(w http.ResponseWriter, r *http.Request) {
	userID, _ := userIDFrom(r.Context())
	var req putSaveRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
		writeError(w, apperr.BadRequest("bad_json", "invalid request body"))
		return
	}

	sv, err := s.saves.Put(r.Context(), model.SaveWrite{
		UserID:             userID,
		Kind:               chi.URLParam(r, "kind"),
		Payload:            req.Payload,
		BaseRev:            req.BaseRev,
		SchemaVersion:      req.SchemaVersion,
		RatingModelVersion: req.RatingModelVersion,
	})
	if err != nil {
		var appErr *apperr.Error
		if errors.As(err, &appErr) && appErr.Code == "rev_conflict" && sv != nil {
			writeJSON(w, http.StatusConflict, saveConflictResponse{Error: appErr, Current: toSaveDTO(*sv)})
			return
		}
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toSaveDTO(*sv))
}
