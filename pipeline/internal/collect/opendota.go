// Package collect coordinates resumable external-source collection.
package collect

import (
	"context"
	"errors"
	"fmt"
	"sort"

	"github.com/aegis-draft/pipeline/internal/opendota"
	"github.com/aegis-draft/pipeline/internal/sourcehttp"
)

type OpenDotaConfig struct {
	WindowStartUnix int64
	MaxPages        int
	MatchLimit      int
	CollectDetails  bool
	// Tier1Leagues — tier-1 фильтр: если не nil, оставляем только матчи из этих лиг.
	// nil = без фильтра (сырой сбор). Пагинация/детект границы окна не зависят от фильтра.
	Tier1Leagues map[int64]struct{}
	// MaxMatchesPerLeague — потолок деталей на событие (0 = без потолка). Все матчи топ-
	// событий не нужны: для ростеров/рейтингов хватает выборки, а Free Tier ограничен.
	MaxMatchesPerLeague int
}

type OpenDotaResult struct {
	ProMatches        []opendota.ProMatch
	Details           []*opendota.Match
	PagesRead         int
	DiscoveryComplete bool
	DetailsComplete   bool
}

// OpenDotaWindow replays cached responses for free and stops cleanly when the
// network budget is exhausted. A later run resumes at the first cache miss.
func OpenDotaWindow(ctx context.Context, client *opendota.Client, cfg OpenDotaConfig) (*OpenDotaResult, error) {
	if client == nil || cfg.WindowStartUnix <= 0 || cfg.MaxPages < 0 || cfg.MatchLimit < 0 {
		return nil, fmt.Errorf("invalid OpenDota collection config")
	}
	result := &OpenDotaResult{ProMatches: []opendota.ProMatch{}, Details: []*opendota.Match{}}
	seen := make(map[int64]struct{})
	cursor := int64(0)
	for cfg.MaxPages == 0 || result.PagesRead < cfg.MaxPages {
		page, err := client.FetchProMatches(ctx, cursor)
		if budgetExhausted(err) {
			return result, nil
		}
		if err != nil {
			return nil, err
		}
		result.PagesRead++
		if len(page) == 0 {
			result.DiscoveryComplete = true
			break
		}
		oldestID := int64(0)
		reachedStart := false
		for _, match := range page {
			if match.MatchID <= 0 {
				return nil, fmt.Errorf("proMatches returned invalid matchId %d", match.MatchID)
			}
			if oldestID == 0 || match.MatchID < oldestID {
				oldestID = match.MatchID
			}
			if match.StartTime < cfg.WindowStartUnix {
				reachedStart = true
				continue
			}
			if cfg.Tier1Leagues != nil {
				if _, ok := cfg.Tier1Leagues[match.LeagueID]; !ok {
					continue // tier-1 scope: не-tier-1 матчи не берём (курсор всё равно продвинут)
				}
			}
			if _, exists := seen[match.MatchID]; !exists {
				seen[match.MatchID] = struct{}{}
				result.ProMatches = append(result.ProMatches, match)
			}
		}
		if reachedStart {
			result.DiscoveryComplete = true
			break
		}
		if oldestID <= 0 || oldestID == cursor {
			return nil, fmt.Errorf("proMatches pagination made no progress at cursor %d", cursor)
		}
		cursor = oldestID
	}
	sort.Slice(result.ProMatches, func(i, j int) bool { return result.ProMatches[i].MatchID > result.ProMatches[j].MatchID })
	if !cfg.CollectDetails {
		return result, nil
	}
	// В режиме полного окна (MaxPages==0) детали тянем только после ПОЛНОЙ дискавери:
	// иначе потолок на событие считался бы по неполному набору. Неполная дискавери →
	// добор в след. прогоне. Bounded/smoke (MaxPages>0) тянет детали сразу.
	if cfg.MaxPages == 0 && !result.DiscoveryComplete {
		return result, nil
	}
	if err := collectDetails(ctx, client, result, cfg.MaxMatchesPerLeague, cfg.MatchLimit); err != nil {
		return nil, err
	}
	return result, nil
}

// ExplorerConfig — discovery по league_id через /explorer.
// RollingLeagues и LegacyLeagues: WindowStartUnix=0 → all-time pro career; иначе rolling-окно.
type ExplorerConfig struct {
	RollingLeagues      []int64
	LegacyLeagues       []int64
	WindowStartUnix     int64
	ChunkSize           int // лиг на explorer-запрос (guard длины URL); 0 => 100
	CollectDetails      bool
	MaxMatchesPerLeague int
	MatchLimit          int
}

// OpenDotaExplorer собирает tier-1 (+ valve_legacy) матчи через /explorer: один запрос на набор
// лиг вместо сотен страниц proMatches, и достаёт старые TI/Major вне rolling-окна. Cache-aware и
// budget-resumable (explorer-запросы кэшируются; details добираются в след. прогонах).
func OpenDotaExplorer(ctx context.Context, client *opendota.Client, cfg ExplorerConfig) (*OpenDotaResult, error) {
	if client == nil {
		return nil, fmt.Errorf("nil OpenDota client")
	}
	chunk := cfg.ChunkSize
	if chunk <= 0 {
		chunk = 100
	}
	result := &OpenDotaResult{ProMatches: []opendota.ProMatch{}, Details: []*opendota.Match{}}
	seen := make(map[int64]struct{})
	discover := func(leagues []int64, since int64) (bool, error) {
		for i := 0; i < len(leagues); i += chunk {
			end := i + chunk
			if end > len(leagues) {
				end = len(leagues)
			}
			rows, err := client.ExplorerMatchIDs(ctx, leagues[i:end], since)
			if budgetExhausted(err) {
				return false, nil
			}
			if err != nil {
				return false, err
			}
			result.PagesRead++
			for _, match := range rows {
				if match.MatchID <= 0 {
					continue
				}
				if _, ok := seen[match.MatchID]; !ok {
					seen[match.MatchID] = struct{}{}
					result.ProMatches = append(result.ProMatches, match)
				}
			}
		}
		return true, nil
	}

	completeRolling, err := discover(cfg.RollingLeagues, cfg.WindowStartUnix)
	if err != nil {
		return nil, err
	}
	completeLegacy, err := discover(cfg.LegacyLeagues, 0)
	if err != nil {
		return nil, err
	}
	result.DiscoveryComplete = completeRolling && completeLegacy

	sort.Slice(result.ProMatches, func(i, j int) bool { return result.ProMatches[i].MatchID > result.ProMatches[j].MatchID })
	// Details — только после ПОЛНОЙ дискавери (иначе потолок на лигу считался бы по неполному набору).
	if !cfg.CollectDetails || !result.DiscoveryComplete {
		return result, nil
	}
	if err := collectDetails(ctx, client, result, cfg.MaxMatchesPerLeague, cfg.MatchLimit); err != nil {
		return nil, err
	}
	return result, nil
}

// collectDetails тянет /matches/{id} для найденных матчей (потолок на лигу + общий лимит),
// budget-resumable: на исчерпании бюджета возвращает частичный результат (DetailsComplete=false).
func collectDetails(ctx context.Context, client *opendota.Client, result *OpenDotaResult, maxPerLeague, matchLimit int) error {
	if maxPerLeague > 0 {
		result.ProMatches = capPerLeague(result.ProMatches, maxPerLeague)
	}
	target := len(result.ProMatches)
	if matchLimit > 0 && matchLimit < target {
		target = matchLimit
	}
	for _, match := range result.ProMatches[:target] {
		detail, err := client.FetchMatch(ctx, match.MatchID)
		if budgetExhausted(err) {
			return nil // частичный сбор; добор в след. прогоне
		}
		if err != nil {
			return err
		}
		result.Details = append(result.Details, detail)
	}
	result.DetailsComplete = len(result.Details) == len(result.ProMatches)
	return nil
}

// capPerLeague оставляет не более max матчей на лигу, сохраняя исходный порядок
// (match_id desc — самые свежие матчи события). Детерминированно.
func capPerLeague(matches []opendota.ProMatch, max int) []opendota.ProMatch {
	perLeague := make(map[int64]int)
	out := make([]opendota.ProMatch, 0, len(matches))
	for _, match := range matches {
		if perLeague[match.LeagueID] >= max {
			continue
		}
		perLeague[match.LeagueID]++
		out = append(out, match)
	}
	return out
}

func budgetExhausted(err error) bool {
	return errors.Is(err, sourcehttp.ErrBudgetExhausted)
}
