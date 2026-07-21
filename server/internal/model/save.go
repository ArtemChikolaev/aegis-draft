package model

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
)

// Доменные ошибки сейвов (производит store, маппит service).
var (
	// ErrSaveNotFound — сейва такого вида у пользователя ещё нет.
	ErrSaveNotFound = errors.New("save not found")
	// ErrSaveConflict — запись отвергнута: на сервере более свежий rev (CAS).
	ErrSaveConflict = errors.New("save revision conflict")
)

// Save — облачный сейв: непрозрачный клиентский стейт + версии. Сервер содержимое
// не интерпретирует (совместимость решает клиент по SchemaVersion/RatingModelVersion).
type Save struct {
	Kind               string
	Payload            json.RawMessage
	Rev                int64 // монотонный; клиент шлёт известный rev для CAS-записи
	SchemaVersion      string
	RatingModelVersion string
	UpdatedAt          time.Time
}

// SaveWrite — данные на запись сейва. BaseRev — rev, который клиент считает актуальным
// (0 для первой записи); сервер применяет запись только если серверный rev совпал (CAS).
type SaveWrite struct {
	UserID             uuid.UUID
	Kind               string
	Payload            json.RawMessage
	BaseRev            int64
	SchemaVersion      string
	RatingModelVersion string
}

// Виды сейвов. Зеркалят ключи клиентского persist (aegis:run / aegis:career).
const (
	SaveKindRun    = "run"
	SaveKindCareer = "career"
)

// ValidSaveKind — вайтлист, чтобы в БД не попадали произвольные ключи.
func ValidSaveKind(kind string) bool {
	return kind == SaveKindRun || kind == SaveKindCareer
}
