package transport

import (
	"testing"

	"github.com/aegis-draft/server/internal/config"
)

// 504 от middleware.Timeout достижим, только если дедлайн хендлера короче WriteTimeout сервера.
func TestRequestTimeoutFitsWriteTimeout(t *testing.T) {
	if write := config.Load().WriteTimeout; requestTimeout >= write {
		t.Fatalf("requestTimeout %s must be shorter than WriteTimeout %s", requestTimeout, write)
	}
}
