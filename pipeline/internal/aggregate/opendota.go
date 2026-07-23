// Package aggregate derives contract-compatible raw statistics from normalized matches.
// It does not smooth winrates; smoothing remains a client-side scoring concern.
package aggregate

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/aegis-draft/pipeline/internal/model"
	"github.com/aegis-draft/pipeline/internal/normalize"
	"github.com/aegis-draft/pipeline/internal/opendota"
)

type OpenDotaResult struct {
	MatchCount            int                              `json:"matchCount"`
	AppearanceCount       int                              `json:"appearanceCount"`
	Collection            *normalize.CollectionStatus      `json:"collection,omitempty"`
	PlayerHeroStats       map[string]map[string]model.Stat `json:"playerHeroStats"`
	CareerPlayerHeroStats map[string]map[string]model.Stat `json:"careerPlayerHeroStats"`
	Teammates             map[string][]int                 `json:"teammates"`
	SquadSynergy          []model.SquadGroup               `json:"squadSynergy"`
}

// AddCareerPlayerHeroes upserts rows from OpenDota /players/{id}/heroes (pub+pro lifetime).
// Deprecated for emit-domain: careerPlayerHeroStats теперь агрегируется из tier-1 pro match details.
func AddCareerPlayerHeroes(result *OpenDotaResult, accountID int, heroes []opendota.PlayerHero) error {
	if result == nil || accountID <= 0 {
		return fmt.Errorf("invalid career player target %d", accountID)
	}
	if result.CareerPlayerHeroStats == nil {
		result.CareerPlayerHeroStats = make(map[string]map[string]model.Stat)
	}
	stats := make(map[string]model.Stat)
	for _, hero := range heroes {
		if hero.HeroID <= 0 || hero.Games < 0 || hero.Wins < 0 || hero.Wins > hero.Games {
			return fmt.Errorf("player %d has invalid career hero row %+v", accountID, hero)
		}
		if hero.Games == 0 {
			continue
		}
		stats[strconv.Itoa(hero.HeroID)] = model.Stat{Games: hero.Games, Winrate: float64(hero.Wins) / float64(hero.Games)}
	}
	result.CareerPlayerHeroStats[strconv.Itoa(accountID)] = stats
	return nil
}

type counter struct {
	games int
	wins  int
}

const (
	minGroupSize = 2
	maxGroupSize = 5
)

// groupKey — канонический ключ группы: id по возрастанию через запятую. Строка, а не массив,
// потому что Go не сравнивает слайсы; размер группы ≤5, так что цена приемлема.
func groupKey(sorted []int) string {
	parts := make([]string, len(sorted))
	for i, id := range sorted {
		parts[i] = strconv.Itoa(id)
	}
	return strings.Join(parts, ",")
}

func parseGroupKey(key string) []int {
	parts := strings.Split(key, ",")
	out := make([]int, 0, len(parts))
	for _, part := range parts {
		id, err := strconv.Atoi(part)
		if err != nil {
			return nil
		}
		out = append(out, id)
	}
	return out
}

// forEachSubset вызывает visit для каждой подгруппы items размера [min..max].
// items обязан быть отсортирован — тогда и подгруппы выходят отсортированными.
func forEachSubset(items []int, min, max int, visit func([]int)) {
	n := len(items)
	if n > maxGroupSize {
		n = maxGroupSize
	}
	var current []int
	var walk func(start int)
	walk = func(start int) {
		if len(current) >= min && len(current) <= max {
			visit(current)
		}
		if len(current) == max {
			return
		}
		for i := start; i < n; i++ {
			current = append(current, items[i])
			walk(i + 1)
			current = current[:len(current)-1]
		}
	}
	walk(0)
}

func FromOpenDota(snapshot *normalize.OpenDotaSnapshot, windowStartUnix int64) (*OpenDotaResult, error) {
	if snapshot == nil {
		return nil, fmt.Errorf("normalized snapshot is nil")
	}
	careerHeroes := make(map[int]map[int]*counter)
	windowHeroes := make(map[int]map[int]*counter)
	teammates := make(map[int]map[int]struct{})
	groups := make(map[string]*counter)
	appearances := 0

	for _, match := range snapshot.Matches {
		inWindow := windowStartUnix <= 0 || match.StartTime >= windowStartUnix
		teams := map[int][]normalize.NormalizedAppearance{
			match.RadiantTeamID: {},
			match.DireTeamID:    {},
		}
		for _, player := range match.Players {
			if player.AccountID <= 0 || player.HeroID <= 0 {
				return nil, fmt.Errorf("match %d has invalid player/hero %d/%d", match.MatchID, player.AccountID, player.HeroID)
			}
			if player.TeamID != match.RadiantTeamID && player.TeamID != match.DireTeamID {
				return nil, fmt.Errorf("match %d player %d has unknown teamId %d", match.MatchID, player.AccountID, player.TeamID)
			}
			appearances++
			teams[player.TeamID] = append(teams[player.TeamID], player)
			accumulateHero(careerHeroes, player.AccountID, player.HeroID, match, player.TeamID)
			if inWindow {
				accumulateHero(windowHeroes, player.AccountID, player.HeroID, match, player.TeamID)
			}
			if teammates[player.AccountID] == nil {
				teammates[player.AccountID] = make(map[int]struct{})
			}
		}

		for teamID, roster := range teams {
			sort.Slice(roster, func(i, j int) bool { return roster[i].AccountID < roster[j].AccountID })
			won := teamWon(match, teamID)
			accounts := make([]int, 0, len(roster))
			for _, player := range roster {
				accounts = append(accounts, player.AccountID)
			}
			for i := 0; i < len(accounts); i++ {
				for j := i + 1; j < len(accounts); j++ {
					teammates[accounts[i]][accounts[j]] = struct{}{}
					teammates[accounts[j]][accounts[i]] = struct{}{}
				}
			}
			// Все подгруппы 2..5 сыгравшего состава остаются историческим агрегатом.
			// Chemistry v1.13 читает только пары, не складывая поверх них вложенные группы.
			forEachSubset(accounts, minGroupSize, maxGroupSize, func(group []int) {
				key := groupKey(group)
				stat := groups[key]
				if stat == nil {
					stat = &counter{}
					groups[key] = stat
				}
				stat.games++
				if won {
					stat.wins++
				}
			})
		}
	}

	result := &OpenDotaResult{
		MatchCount: len(snapshot.Matches), AppearanceCount: appearances,
		PlayerHeroStats:       encodeHeroStats(windowHeroes),
		CareerPlayerHeroStats: encodeHeroStats(careerHeroes),
		Teammates:             make(map[string][]int, len(teammates)),
		SquadSynergy:          make([]model.SquadGroup, 0, len(groups)),
	}
	squad := make([]model.SquadGroup, 0, len(groups))
	for key, stat := range groups {
		ids := parseGroupKey(key)
		if ids == nil {
			return nil, fmt.Errorf("corrupt squad group key %q", key)
		}
		squad = append(squad, model.SquadGroup{IDs: ids, Games: stat.games, Winrate: winrate(stat)})
	}
	result.SquadSynergy = squadSlice(squad)
	result.Teammates = emitTeammates(teammates)
	return result, nil
}

func accumulateHero(
	heroes map[int]map[int]*counter,
	accountID, heroID int,
	match normalize.NormalizedMatch,
	teamID int,
) {
	byHero := heroes[accountID]
	if byHero == nil {
		byHero = make(map[int]*counter)
		heroes[accountID] = byHero
	}
	stat := byHero[heroID]
	if stat == nil {
		stat = &counter{}
		byHero[heroID] = stat
	}
	stat.games++
	if teamWon(match, teamID) {
		stat.wins++
	}
}

func encodeHeroStats(heroes map[int]map[int]*counter) map[string]map[string]model.Stat {
	out := make(map[string]map[string]model.Stat, len(heroes))
	for accountID, byHero := range heroes {
		encoded := make(map[string]model.Stat, len(byHero))
		for heroID, stat := range byHero {
			encoded[strconv.Itoa(heroID)] = model.Stat{Games: stat.games, Winrate: winrate(stat)}
		}
		out[strconv.Itoa(accountID)] = encoded
	}
	return out
}

// squadSlice — детерминированный порядок: сначала по размеру группы, затем лексикографически
// по id. Один и тот же snapshot ⇒ один и тот же файл (инвариант детерминизма пайплайна).
func squadSlice(out []model.SquadGroup) []model.SquadGroup {
	sort.Slice(out, func(i, j int) bool {
		left, right := out[i].IDs, out[j].IDs
		if len(left) != len(right) {
			return len(left) < len(right)
		}
		for k := range left {
			if left[k] != right[k] {
				return left[k] < right[k]
			}
		}
		return false
	})
	return out
}

func teammateSet(teammates map[string][]int) map[int]map[int]struct{} {
	set := make(map[int]map[int]struct{}, len(teammates))
	for key, peers := range teammates {
		id, err := strconv.Atoi(key)
		if err != nil {
			continue
		}
		if set[id] == nil {
			set[id] = make(map[int]struct{}, len(peers))
		}
		for _, peer := range peers {
			set[id][peer] = struct{}{}
		}
	}
	return set
}

func emitTeammates(set map[int]map[int]struct{}) map[string][]int {
	out := make(map[string][]int, len(set))
	for id, peers := range set {
		ids := make([]int, 0, len(peers))
		for peer := range peers {
			ids = append(ids, peer)
		}
		sort.Ints(ids)
		out[strconv.Itoa(id)] = ids
	}
	return out
}

func Validate(result *OpenDotaResult) error {
	if result == nil {
		return fmt.Errorf("aggregate result is nil")
	}
	for accountKey, heroes := range result.PlayerHeroStats {
		accountID, err := positiveID(accountKey)
		if err != nil {
			return fmt.Errorf("playerHeroStats: %w", err)
		}
		for heroKey, stat := range heroes {
			if _, err := positiveID(heroKey); err != nil {
				return fmt.Errorf("playerHeroStats[%d]: %w", accountID, err)
			}
			if err := validStat(stat); err != nil {
				return fmt.Errorf("playerHeroStats[%d][%s]: %w", accountID, heroKey, err)
			}
		}
	}
	for accountKey, heroes := range result.CareerPlayerHeroStats {
		accountID, err := positiveID(accountKey)
		if err != nil {
			return fmt.Errorf("careerPlayerHeroStats: %w", err)
		}
		for heroKey, stat := range heroes {
			if _, err := positiveID(heroKey); err != nil {
				return fmt.Errorf("careerPlayerHeroStats[%d]: %w", accountID, err)
			}
			if err := validStat(stat); err != nil {
				return fmt.Errorf("careerPlayerHeroStats[%d][%s]: %w", accountID, heroKey, err)
			}
		}
	}
	for accountKey, peers := range result.Teammates {
		accountID, err := positiveID(accountKey)
		if err != nil {
			return fmt.Errorf("teammates: %w", err)
		}
		for i, peer := range peers {
			if peer <= 0 || peer == accountID {
				return fmt.Errorf("teammates[%d] contains invalid peer %d", accountID, peer)
			}
			if i > 0 && peers[i-1] >= peer {
				return fmt.Errorf("teammates[%d] is not strictly sorted/unique", accountID)
			}
			reverse := result.Teammates[strconv.Itoa(peer)]
			if !containsSorted(reverse, accountID) {
				return fmt.Errorf("teammates relation %d→%d is not symmetric", accountID, peer)
			}
		}
	}
	seenGroups := make(map[string]struct{}, len(result.SquadSynergy))
	for _, group := range result.SquadSynergy {
		if len(group.IDs) < minGroupSize || len(group.IDs) > maxGroupSize {
			return fmt.Errorf("squad group %v must have %d..%d members", group.IDs, minGroupSize, maxGroupSize)
		}
		for i, id := range group.IDs {
			if id <= 0 {
				return fmt.Errorf("invalid squad group member %v", group.IDs)
			}
			if i > 0 && group.IDs[i-1] >= id {
				return fmt.Errorf("squad group %v is not strictly sorted/unique", group.IDs)
			}
		}
		key := groupKey(group.IDs)
		if _, exists := seenGroups[key]; exists {
			return fmt.Errorf("duplicate squad group %v", group.IDs)
		}
		seenGroups[key] = struct{}{}
		if err := validStat(model.Stat{Games: group.Games, Winrate: group.Winrate}); err != nil {
			return fmt.Errorf("squad group %v: %w", group.IDs, err)
		}
		// Каждая пара внутри группы обязана быть в teammates — оба выводятся из тех же матчей.
		for i := 0; i < len(group.IDs); i++ {
			for j := i + 1; j < len(group.IDs); j++ {
				if !containsSorted(result.Teammates[strconv.Itoa(group.IDs[i])], group.IDs[j]) {
					return fmt.Errorf("squad group %v missing pair %d/%d from teammates", group.IDs, group.IDs[i], group.IDs[j])
				}
			}
		}
	}
	return nil
}

func teamWon(match normalize.NormalizedMatch, teamID int) bool {
	return (teamID == match.RadiantTeamID && match.RadiantWin) ||
		(teamID == match.DireTeamID && !match.RadiantWin)
}

func winrate(stat *counter) float64 {
	if stat == nil || stat.games == 0 {
		return 0
	}
	return float64(stat.wins) / float64(stat.games)
}

func positiveID(value string) (int, error) {
	id, err := strconv.Atoi(value)
	if err != nil || id <= 0 {
		return 0, fmt.Errorf("invalid id key %q", value)
	}
	return id, nil
}

func validStat(stat model.Stat) error {
	if stat.Games <= 0 {
		return fmt.Errorf("games must be positive, got %d", stat.Games)
	}
	if stat.Winrate < 0 || stat.Winrate > 1 {
		return fmt.Errorf("winrate must be in [0,1], got %f", stat.Winrate)
	}
	return nil
}

func containsSorted(values []int, target int) bool {
	index := sort.SearchInts(values, target)
	return index < len(values) && values[index] == target
}
