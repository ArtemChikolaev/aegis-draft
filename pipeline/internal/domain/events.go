// Package domain собирает доменный датасет (web/public/data) из OpenDota-входов:
// нормализованных матчей, лиг, ростеров, ролей и рейтингов. Liquipedia-зависимые
// поля (точные placements/призовые/престиж TI-Major) не выводятся из OpenDota —
// они deferred до T1.3 (см. BACKLOG M2.5). Всё детерминировано.
package domain

import (
	"fmt"
	"sort"
	"time"

	"github.com/aegis-draft/pipeline/internal/formats"
	"github.com/aegis-draft/pipeline/internal/model"
	"github.com/aegis-draft/pipeline/internal/normalize"
	"github.com/aegis-draft/pipeline/internal/opendota"
)

// tierToType маппит грубый OpenDota tier в тип события. TI/Major из OpenDota
// достоверно не различить — они приходят курируемым набором (T4.3), поэтому
// premium/professional дают tier1/tier2, остальное отбрасывается.
func tierToType(tier string) string {
	switch tier {
	case "premium":
		return "tier1"
	case "professional":
		return "tier2"
	default:
		return ""
	}
}

type leagueAgg struct {
	minStart int64
	maxStart int64
	matches  int
}

// BuildEvents строит события из лиг, реально встреченных в матчах. Тип — из tier,
// даты — из диапазона матчей лиги, формат — через formats.Assign от даты окончания.
// События вне всех окон (пустой formats) отбрасываются (schema требует minItems 1).
func BuildEvents(matches []normalize.NormalizedMatch, leagues []opendota.League, asOf time.Time) []model.EventInfo {
	byID := make(map[int64]opendota.League, len(leagues))
	for _, league := range leagues {
		byID[league.LeagueID] = league
	}
	agg := make(map[int64]*leagueAgg)
	for _, match := range matches {
		if match.LeagueID <= 0 || match.StartTime <= 0 {
			continue
		}
		a := agg[match.LeagueID]
		if a == nil {
			a = &leagueAgg{minStart: match.StartTime, maxStart: match.StartTime}
			agg[match.LeagueID] = a
		}
		if match.StartTime < a.minStart {
			a.minStart = match.StartTime
		}
		if match.StartTime > a.maxStart {
			a.maxStart = match.StartTime
		}
		a.matches++
	}

	leagueIDs := make([]int64, 0, len(agg))
	for id := range agg {
		leagueIDs = append(leagueIDs, id)
	}
	sort.Slice(leagueIDs, func(i, j int) bool { return leagueIDs[i] < leagueIDs[j] })

	events := make([]model.EventInfo, 0, len(leagueIDs))
	for _, id := range leagueIDs {
		league, known := byID[id]
		eventType := tierToType(league.Tier)
		if !known || eventType == "" {
			continue // неизвестная или неигровая лига (amateur/excluded)
		}
		a := agg[id]
		end := time.Unix(a.maxStart, 0)
		fmts := formats.Assign(end, asOf, false)
		if len(fmts) == 0 {
			continue // событие вне всех окон
		}
		events = append(events, model.EventInfo{
			ID:        fmt.Sprintf("league-%d", id),
			Name:      league.Name,
			Type:      eventType,
			Year:      end.UTC().Year(),
			StartDate: utcDateString(a.minStart),
			EndDate:   utcDateString(a.maxStart),
			Formats:   fmts,
		})
	}
	return events
}

func utcDateString(unix int64) string {
	return time.Unix(unix, 0).UTC().Format("2006-01-02")
}
