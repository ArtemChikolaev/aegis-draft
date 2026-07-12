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
	"github.com/aegis-draft/pipeline/internal/tier1"
)

type leagueAgg struct {
	minStart int64
	maxStart int64
	matches  int
}

// BuildEvents строит события из лиг, реально встреченных в матчах. Scope — tier-1
// (tier1.IsTier1: premium ∪ professional-минус-шум); события с < minMatches матчей в
// окне отбрасываются (порог гасит мелкий шум и недосбор). Формат — через formats.Assign
// от даты окончания, valve_legacy — через tier1.IsValveLegacy. Пустой formats тоже отбрасывается.
func BuildEvents(matches []normalize.NormalizedMatch, leagues []opendota.League, asOf time.Time, minMatches int) []model.EventInfo {
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
		if !known || !tier1.IsTier1(league.Tier, league.Name) {
			continue // не tier-1 (amateur/excluded или professional-шум)
		}
		a := agg[id]
		if a.matches < minMatches {
			continue // порог: мелкое событие (шум/недосбор) не берём
		}
		end := time.Unix(a.maxStart, 0)
		fmts := formats.Assign(end, asOf, tier1.IsValveLegacy(id, league.Name))
		if len(fmts) == 0 {
			continue // событие вне всех окон и не valve_legacy
		}
		// Всё в scope — tier-1 сцена; ярлык лишь уточняет престиж. TI и Valve/DPC
		// Major метим отдельно, остальное (EWC, DreamLeague, PGL, BLAST, FISSURE…) — tier1.
		// «tier2» больше не эмитим: низкотировые лиги отсекает tier1.IsTier1 ещё в scope.
		eventType := "tier1"
		switch {
		case tier1.IsTI(league.Name):
			eventType = "ti"
		case tier1.IsValveLegacy(id, league.Name):
			eventType = "major"
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
