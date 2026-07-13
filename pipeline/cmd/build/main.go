// Command aegis-build — сборка игровых данных из внешних источников (скилл external-data-etl).
// Опциональный premium-секрет — из env: OPENDOTA_API_KEY. Steam API key не используется.
//
//	go run ./cmd/build --window last_2y --out ../web/public/data
package main

import (
	"context"
	"flag"
	"log"
	"os"

	"github.com/aegis-draft/pipeline/internal/model"
	"github.com/aegis-draft/pipeline/internal/pipeline"
)

func main() {
	window := flag.String("window", "last_2y", "формат окна: last_1y|last_2y|last_5y|valve_legacy")
	out := flag.String("out", "../web/public/data", "каталог для игровых JSON")
	cache := flag.String("cache", "./data/raw", "каталог raw-кэша")
	fetchOpenDota := flag.Bool("fetch-opendota", false, "разрешить OpenDota fetch в raw cache, без public emit; OPENDOTA_API_KEY опционален")
	matchDetailLimit := flag.Int("match-detail-limit", 0, "cap details первыми N матчами; 0 = только список в простом режиме, всё окно с --collect-window")
	collectWindow := flag.Bool("collect-window", false, "resumable-сбор полного временного окна: pagination + details + career heroes")
	asOf := flag.String("as-of", "", "фиксированная UTC-дата окна YYYY-MM-DD (обязательна с --collect-window)")
	maxPages := flag.Int("max-pages", 0, "ограничить число страниц /proMatches за прогон; 0 = всё окно")
	requestBudget := flag.Int("request-budget", 100, "максимум реальных HTTP attempts за прогон; cache hits не расходуют бюджет; 0 = unlimited")
	normalizedOut := flag.String("normalized-out", "./data/normalized/opendota.json", "промежуточный OpenDota snapshot (не public game data)")
	aggregateOut := flag.String("aggregate-out", "./data/aggregate/opendota.json", "player×hero, teammates и squad synergy из normalized matches")
	schemaValidator := flag.String("schema-validator", "../.claude/skills/data-contract/tools/validate_data.mjs", "путь к Node JSON Schema validator; пусто = пропустить")
	nodeBinary := flag.String("node", "node", "Node.js binary для JSON Schema validation")
	emitDomain := flag.Bool("emit-domain", false, "собрать доменный датасет из OpenDota (teams/leagues/heroes + матчи) и записать в --out")
	minEventMatches := flag.Int("min-event-matches", 8, "порог матчей на событие: tier-1 события с меньшим числом матчей отбрасываются (гасит шум/недосбор); 0 = без порога")
	maxMatchesPerLeague := flag.Int("max-matches-per-league", 150, "потолок деталей на событие (~150 покрывает полный TI 120-150 матчей → плотные ростеры/player×hero); 0 = без потолка")
	flag.Parse()

	cfg := pipeline.Config{
		Window:              model.Format(*window),
		Out:                 *out,
		CacheDir:            *cache,
		OpenDotaKey:         os.Getenv("OPENDOTA_API_KEY"),
		FetchOpenDota:       *fetchOpenDota,
		MatchDetailLimit:    *matchDetailLimit,
		NormalizedOut:       *normalizedOut,
		AggregateOut:        *aggregateOut,
		CollectWindow:       *collectWindow,
		AsOf:                *asOf,
		MaxPages:            *maxPages,
		RequestBudget:       *requestBudget,
		NodeBinary:          *nodeBinary,
		SchemaValidator:     *schemaValidator,
		EmitDomain:          *emitDomain,
		MinEventMatches:     *minEventMatches,
		MaxMatchesPerLeague: *maxMatchesPerLeague,
	}

	if err := pipeline.Run(context.Background(), cfg); err != nil {
		log.Fatalf("pipeline: %v", err)
	}
}
