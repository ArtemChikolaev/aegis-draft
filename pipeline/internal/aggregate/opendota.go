// Package aggregate derives contract-compatible raw statistics from normalized matches.
// It does not smooth winrates; smoothing remains a client-side scoring concern.
package aggregate

import (
	"fmt"
	"sort"
	"strconv"

	"github.com/aegis-draft/pipeline/internal/model"
	"github.com/aegis-draft/pipeline/internal/normalize"
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

type counter struct {
	games int
	wins  int
}

// squadSize — сколько аккаунтов стороны матча образуют пары сыгранности. В нормальном матче их
// пять; больше бывает только в битых данных (одинаковый team_id у обеих сторон) — тогда, как и
// раньше, пары строятся по первым пяти аккаунтам.
const squadSize = 5

func FromOpenDota(snapshot *normalize.OpenDotaSnapshot, windowStartUnix int64) (*OpenDotaResult, error) {
	if snapshot == nil {
		return nil, fmt.Errorf("normalized snapshot is nil")
	}
	careerHeroes := make(map[int]map[int]*counter)
	windowHeroes := make(map[int]map[int]*counter)
	teammates := make(map[int]map[int]struct{})
	pairs := make(map[[2]int]*counter)
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
			// Сыгранность — только пары: Chemistry v1.13 (web/src/game/score.ts) читает уникальные
			// пары пятёрки, а группы 3–5 занимали две трети squadSynergy.json и в счёт не входили.
			squad := accounts
			if len(squad) > squadSize {
				squad = squad[:squadSize]
			}
			for i := 0; i < len(squad); i++ {
				for j := i + 1; j < len(squad); j++ {
					key := [2]int{squad[i], squad[j]}
					stat := pairs[key]
					if stat == nil {
						stat = &counter{}
						pairs[key] = stat
					}
					stat.games++
					if won {
						stat.wins++
					}
				}
			}
		}
	}

	return &OpenDotaResult{
		MatchCount: len(snapshot.Matches), AppearanceCount: appearances,
		PlayerHeroStats:       encodeHeroStats(windowHeroes),
		CareerPlayerHeroStats: encodeHeroStats(careerHeroes),
		Teammates:             emitTeammates(teammates),
		SquadSynergy:          encodePairs(pairs),
	}, nil
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

// encodePairs — пары в детерминированном порядке (по id): один и тот же snapshot ⇒ один и тот же
// файл (инвариант детерминизма пайплайна).
func encodePairs(pairs map[[2]int]*counter) []model.SquadGroup {
	out := make([]model.SquadGroup, 0, len(pairs))
	for ids, stat := range pairs {
		out = append(out, model.SquadGroup{IDs: []int{ids[0], ids[1]}, Games: stat.games, Winrate: winrate(stat)})
	}
	sort.Slice(out, func(i, j int) bool {
		left, right := out[i].IDs, out[j].IDs
		if left[0] != right[0] {
			return left[0] < right[0]
		}
		return left[1] < right[1]
	})
	return out
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
	seenPairs := make(map[[2]int]struct{}, len(result.SquadSynergy))
	for _, group := range result.SquadSynergy {
		// Схема допускает группы до пяти (ids maxItems), но пайплайн эмитит только пары.
		if len(group.IDs) != 2 {
			return fmt.Errorf("squad group %v must be a pair", group.IDs)
		}
		a, b := group.IDs[0], group.IDs[1]
		if a <= 0 || b <= a {
			return fmt.Errorf("squad pair %v must hold two positive ids in ascending order", group.IDs)
		}
		key := [2]int{a, b}
		if _, exists := seenPairs[key]; exists {
			return fmt.Errorf("duplicate squad pair %v", group.IDs)
		}
		seenPairs[key] = struct{}{}
		if err := validStat(model.Stat{Games: group.Games, Winrate: group.Winrate}); err != nil {
			return fmt.Errorf("squad pair %v: %w", group.IDs, err)
		}
		// Пара обязана быть в teammates — оба выводятся из тех же матчей.
		if !containsSorted(result.Teammates[strconv.Itoa(a)], b) {
			return fmt.Errorf("squad pair %v missing from teammates", group.IDs)
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
