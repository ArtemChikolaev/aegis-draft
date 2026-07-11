// Command aegis-build — сборка игровых данных из внешних источников (скилл external-data-etl).
// Секреты — из env: OPENDOTA_API_KEY, LIQUIPEDIA_CONTACT (для User-Agent).
//
//	go run ./cmd/build --window last_2y --out ../web/public/data
package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/aegis-draft/pipeline/internal/model"
	"github.com/aegis-draft/pipeline/internal/pipeline"
)

func main() {
	window := flag.String("window", "last_2y", "формат окна: last_1y|last_2y|last_5y|valve_legacy")
	out := flag.String("out", "../web/public/data", "каталог для игровых JSON")
	cache := flag.String("cache", "./data/raw", "каталог raw-кэша")
	flag.Parse()

	contact := os.Getenv("LIQUIPEDIA_CONTACT")
	if contact == "" {
		contact = "unset@example.com"
	}
	cfg := pipeline.Config{
		Window:       model.Format(*window),
		Out:          *out,
		CacheDir:     *cache,
		OpenDotaKey:  os.Getenv("OPENDOTA_API_KEY"),
		LiquipediaUA: fmt.Sprintf("AegisDraft/0.1 (contact: %s)", contact),
	}

	if err := pipeline.Run(cfg); err != nil {
		log.Fatalf("pipeline: %v", err)
	}
}
