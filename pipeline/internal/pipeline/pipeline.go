// Package pipeline оркестрирует стадии ETL: fetch → normalize → aggregate → rate → emit → validate.
// Скелет (T1.1): стадии-заглушки + реальный emit валидного по схеме (пустого) датасета.
package pipeline

import (
	"log"
	"time"

	"github.com/aegis-draft/pipeline/internal/emit"
	"github.com/aegis-draft/pipeline/internal/liquipedia"
	"github.com/aegis-draft/pipeline/internal/model"
	"github.com/aegis-draft/pipeline/internal/opendota"
	"github.com/aegis-draft/pipeline/internal/rating"
)

type Config struct {
	Window       model.Format // формат окна (last_1y/last_2y/last_5y/valve_legacy)
	Out          string       // куда писать JSON (web/public/data)
	CacheDir     string       // raw-кэш
	OpenDotaKey  string       // из env
	LiquipediaUA string       // кастомный User-Agent с контактом
}

// Run прогоняет пайплайн. Пока стадии сбора — заглушки; emit пишет валидный пустой датасет,
// чтобы контракт данных проверялся сразу (Go эмитит → Node-валидатор проверяет).
func Run(cfg Config) error {
	od := opendota.New(cfg.OpenDotaKey)
	lp := liquipedia.New(cfg.LiquipediaUA)
	rcfg := rating.Default()

	log.Printf("[fetch] OpenDota + Liquipedia (окно %s)…", cfg.Window)
	if err := od.FetchProMatches(); err != nil {
		return err
	}
	if err := lp.FetchTournaments(); err != nil {
		return err
	}
	log.Printf("[normalize] канонизация id (единый accountId)…")
	log.Printf("[aggregate] player×hero, squad synergy, teammates…")
	log.Printf("[rate] модель %s (sm μ=%.2f m=%.0f, peak %dd/N≥%d)…",
		rating.ModelVersion, rcfg.SmoothMu, rcfg.SmoothM, rcfg.PeakWindowD, rcfg.PeakMinN)

	ds := emptyDataset(cfg)

	log.Printf("[emit] → %s", cfg.Out)
	if err := emit.WriteAll(cfg.Out, ds); err != nil {
		return err
	}
	log.Printf("[validate] прогони: node .claude/skills/data-contract/tools/validate_data.mjs %s", cfg.Out)
	log.Printf("готово (скелет: датасет пустой, но валидный по схеме)")
	return nil
}

func emptyDataset(cfg Config) *model.Dataset {
	return &model.Dataset{
		Manifest: model.Manifest{
			SchemaVersion:      1,
			RatingModelVersion: rating.ModelVersion,
			BuiltAt:            time.Now().UTC().Format(time.RFC3339),
			Source: &model.Source{
				OpenDota:   "OpenDota API — https://www.opendota.com",
				Liquipedia: "Liquipedia (CC-BY-SA 3.0) — https://liquipedia.net",
			},
			Formats: []model.Format{cfg.Window},
			Counts:  map[string]int{"events": 0, "heroes": 0, "packs": 0, "players": 0},
		},
	}
}
