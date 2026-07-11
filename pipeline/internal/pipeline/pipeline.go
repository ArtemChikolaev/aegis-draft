// Package pipeline оркестрирует стадии ETL: fetch → normalize → aggregate → rate → emit → validate.
// Скелет (T1.1): стадии-заглушки + реальный emit валидного по схеме (пустого) датасета.
package pipeline

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/aegis-draft/pipeline/internal/aggregate"
	"github.com/aegis-draft/pipeline/internal/artifact"
	"github.com/aegis-draft/pipeline/internal/collect"
	"github.com/aegis-draft/pipeline/internal/emit"
	"github.com/aegis-draft/pipeline/internal/model"
	"github.com/aegis-draft/pipeline/internal/normalize"
	"github.com/aegis-draft/pipeline/internal/opendota"
	"github.com/aegis-draft/pipeline/internal/rating"
	"github.com/aegis-draft/pipeline/internal/sourcehttp"
	"github.com/aegis-draft/pipeline/internal/validate"
)

type Config struct {
	Window           model.Format // формат окна (last_1y/last_2y/last_5y/valve_legacy)
	Out              string       // куда писать JSON (web/public/data)
	CacheDir         string       // raw-кэш
	OpenDotaKey      string       // из env
	FetchOpenDota    bool         // явно разрешить live fetch; по умолчанию offline/cache-safe
	MatchDetailLimit int          // 0 = только /proMatches; >0 = details первых N матчей + normalize
	NormalizedOut    string       // промежуточный snapshot, не public game data
	AggregateOut     string       // player×hero, teammates, squad synergy; event mapping пока отдельно
	CollectWindow    bool         // пагинация полного окна + resumable details/career
	AsOf             string       // фиксированная UTC-дата YYYY-MM-DD для воспроизводимого окна
	MaxPages         int          // 0 = без ограничения; smoke/debug cap
	RequestBudget    int          // реальные HTTP attempts за запуск; cache hits бесплатны; 0 = unlimited
	NodeBinary       string
	SchemaValidator  string
}

// Run прогоняет пайплайн. Пока стадии сбора — заглушки; emit пишет валидный пустой датасет,
// чтобы контракт данных проверялся сразу (Go эмитит → Node-валидатор проверяет).
func Run(ctx context.Context, cfg Config) error {
	if cfg.MatchDetailLimit < 0 {
		return fmt.Errorf("match-detail-limit must be non-negative")
	}
	if cfg.MaxPages < 0 || cfg.RequestBudget < 0 {
		return fmt.Errorf("max-pages and request-budget must be non-negative")
	}
	if cfg.CollectWindow && !cfg.FetchOpenDota {
		return fmt.Errorf("collect-window requires --fetch-opendota")
	}
	if cfg.MatchDetailLimit > 0 && !cfg.FetchOpenDota {
		return fmt.Errorf("match-detail-limit requires --fetch-opendota")
	}
	rcfg := rating.Default()

	if cfg.FetchOpenDota {
		if cfg.OpenDotaKey == "" {
			log.Printf("[fetch] OpenDota Free Tier без API key (лимит сервиса ниже premium)")
		}
		od, err := opendota.New(opendota.Config{APIKey: cfg.OpenDotaKey, CacheDir: cfg.CacheDir, RequestBudget: cfg.RequestBudget})
		if err != nil {
			return err
		}
		windowStart, asOf, err := collectionWindow(cfg)
		if err != nil {
			return err
		}
		maxPages := 1
		matchLimit := cfg.MatchDetailLimit
		if cfg.CollectWindow {
			maxPages = cfg.MaxPages
		} else if matchLimit == 0 {
			matchLimit = 0
		}
		log.Printf("[fetch] OpenDota pro matches (окно %s, as-of %s, budget %d)…", cfg.Window, asOf, cfg.RequestBudget)
		collected, err := collect.OpenDotaWindow(ctx, od, collect.OpenDotaConfig{
			WindowStartUnix: windowStart, MaxPages: maxPages, MatchLimit: matchLimit,
			CollectDetails: cfg.CollectWindow || cfg.MatchDetailLimit > 0,
		})
		if err != nil {
			return err
		}
		log.Printf("[fetch] OpenDota: %d matches discovered, %d details, %d pages (raw cache: %s)",
			len(collected.ProMatches), len(collected.Details), collected.PagesRead, cfg.CacheDir)
		if cfg.CollectWindow && !collected.DiscoveryComplete && len(collected.Details) == 0 {
			stats := od.Stats()
			log.Printf("[progress] discovery=false; network=%d cache=%d; artifacts preserved until details are available",
				stats.NetworkRequests, stats.CacheHits)
			return nil
		}
		if cfg.MatchDetailLimit > 0 || cfg.CollectWindow {
			if cfg.NormalizedOut == "" || cfg.AggregateOut == "" {
				return fmt.Errorf("normalized and aggregate output paths are required for detail collection")
			}
			snapshot, err := normalize.FromOpenDota(collected.Details)
			if err != nil {
				return fmt.Errorf("normalize OpenDota: %w", err)
			}
			aggregates, err := aggregate.FromOpenDota(snapshot)
			if err != nil {
				return fmt.Errorf("aggregate OpenDota: %w", err)
			}
			careerComplete := 0
			if cfg.CollectWindow {
				for _, player := range snapshot.Players {
					heroes, fetchErr := od.FetchPlayerHeroes(ctx, int64(player.AccountID))
					if errors.Is(fetchErr, sourcehttp.ErrBudgetExhausted) {
						break
					}
					if fetchErr != nil {
						return fetchErr
					}
					if err := aggregate.AddCareerPlayerHeroes(aggregates, player.AccountID, heroes); err != nil {
						return err
					}
					careerComplete++
				}
			}
			target := len(collected.ProMatches)
			if cfg.MatchDetailLimit > 0 && cfg.MatchDetailLimit < target {
				target = cfg.MatchDetailLimit
			}
			stats := od.Stats()
			status := &normalize.CollectionStatus{
				Window: string(cfg.Window), AsOf: asOf, WindowStart: windowStart,
				PagesRead: collected.PagesRead, DiscoveredMatches: len(collected.ProMatches), DiscoveryComplete: collected.DiscoveryComplete,
				DetailTargetMatches: target, DetailsComplete: collected.DetailsComplete,
				CareerTargetPlayers: len(snapshot.Players), CareerPlayersComplete: careerComplete,
				CareerComplete: cfg.CollectWindow && collected.DiscoveryComplete && collected.DetailsComplete && careerComplete == len(snapshot.Players),
				CacheHits:      stats.CacheHits, NetworkRequests: stats.NetworkRequests,
			}
			snapshot.Collection = status
			aggregates.Collection = status
			if err := aggregate.Validate(aggregates); err != nil {
				return fmt.Errorf("validate OpenDota aggregates: %w", err)
			}
			if err := normalize.WriteOpenDotaSnapshot(cfg.NormalizedOut, snapshot); err != nil {
				return fmt.Errorf("write normalized OpenDota snapshot: %w", err)
			}
			if err := artifact.WriteJSON(cfg.AggregateOut, aggregates); err != nil {
				return fmt.Errorf("write OpenDota aggregates: %w", err)
			}
			log.Printf("[progress] discovery=%t details=%d/%d (complete=%t) career=%d/%d (complete=%t); network=%d cache=%d",
				collected.DiscoveryComplete, len(collected.Details), target, collected.DetailsComplete,
				careerComplete, len(snapshot.Players), status.CareerComplete, stats.NetworkRequests, stats.CacheHits)
		}
		log.Printf("[fetch] raw-only завершён; emit отключён, пока T1.3–T1.4 не собирают доменный датасет")
		return nil
	} else {
		log.Printf("[fetch] offline: live OpenDota disabled (use --fetch-opendota)")
	}
	log.Printf("[normalize] канонизация id (единый accountId)…")
	log.Printf("[aggregate] player×hero, squad synergy, teammates…")
	log.Printf("[rate] модель %s (sm μ=%.2f m=%.0f, peak %dd/N≥%d)…",
		rating.ModelVersion, rcfg.SmoothMu, rcfg.SmoothM, rcfg.PeakWindowD, rcfg.PeakMinN)

	ds := emptyDataset(cfg)
	if err := validate.Dataset(ds); err != nil {
		return fmt.Errorf("validate dataset: %w", err)
	}

	log.Printf("[emit] → %s", cfg.Out)
	if err := emit.WriteAll(cfg.Out, ds); err != nil {
		return err
	}
	if cfg.SchemaValidator != "" {
		log.Printf("[validate] JSON Schema → %s", cfg.Out)
		if err := validate.RunNode(ctx, cfg.NodeBinary, cfg.SchemaValidator, cfg.Out); err != nil {
			return err
		}
	}
	log.Printf("готово (скелет: датасет пустой, но валидный по схеме)")
	return nil
}

func collectionWindow(cfg Config) (int64, string, error) {
	if !cfg.CollectWindow {
		return 1, "single-page", nil
	}
	if cfg.AsOf == "" {
		return 0, "", fmt.Errorf("collect-window requires fixed --as-of YYYY-MM-DD")
	}
	asOf, err := time.Parse("2006-01-02", cfg.AsOf)
	if err != nil {
		return 0, "", fmt.Errorf("invalid as-of date %q: %w", cfg.AsOf, err)
	}
	years := 0
	switch cfg.Window {
	case model.Last1y:
		years = 1
	case model.Last2y:
		years = 2
	case model.Last5y:
		years = 5
	default:
		return 0, "", fmt.Errorf("resumable time-window collection does not support %q", cfg.Window)
	}
	return asOf.AddDate(-years, 0, 0).Unix(), cfg.AsOf, nil
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
