package store

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/aegis-draft/server/internal/model"
	"github.com/google/uuid"
)

// testDB поднимает стор на реальном Postgres из DATABASE_URL. Без переменной тест
// ПРОПУСКАЕТСЯ (локально без Docker зелено); в CI её задаёт postgres service-container.
func testDB(t *testing.T) *DB {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL не задан — интеграционный тест стора пропущен (нужен Postgres)")
	}
	ctx := context.Background()
	if err := Migrate(ctx, dsn); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	db, err := Open(ctx, dsn)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(db.Close)
	return db
}

func TestFindOrCreateByIdentity(t *testing.T) {
	repo := NewUserRepo(testDB(t))
	ctx := context.Background()

	// Уникальный uid на прогон — тест переживает повторный запуск против той же БД.
	uid := "tg-" + time.Now().Format("150405.000000000")

	u1, created, err := repo.FindOrCreateByIdentity(ctx, model.ProviderTelegram, uid, "ada")
	if err != nil {
		t.Fatalf("первый вызов: %v", err)
	}
	if !created {
		t.Fatalf("ожидали created=true при первом вызове")
	}
	if u1.ID == uuid.Nil {
		t.Fatalf("user создан без id")
	}

	u2, created2, err := repo.FindOrCreateByIdentity(ctx, model.ProviderTelegram, uid, "ada")
	if err != nil {
		t.Fatalf("повторный вызов: %v", err)
	}
	if created2 {
		t.Fatalf("ожидали created=false при повторе той же личности")
	}
	if u2.ID != u1.ID {
		t.Fatalf("та же личность → тот же user, got %v vs %v", u2.ID, u1.ID)
	}
}

func TestFindOrCreateByIdentity_DistinctIdentities(t *testing.T) {
	repo := NewUserRepo(testDB(t))
	ctx := context.Background()
	base := time.Now().Format("150405.000000000")

	a, _, err := repo.FindOrCreateByIdentity(ctx, model.ProviderTelegram, "tg-a-"+base, "a")
	if err != nil {
		t.Fatalf("a: %v", err)
	}
	b, _, err := repo.FindOrCreateByIdentity(ctx, model.ProviderTelegram, "tg-b-"+base, "b")
	if err != nil {
		t.Fatalf("b: %v", err)
	}
	if a.ID == b.ID {
		t.Fatalf("разные личности → разные users, оба %v", a.ID)
	}
}
