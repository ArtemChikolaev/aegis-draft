// Package aggregate derives contract-compatible raw statistics from normalized matches.
// It does not smooth winrates; smoothing remains a client-side scoring concern.
package aggregate

import (
	"fmt"
	"sort"
	"strconv"

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
	SquadSynergy          []model.SquadPair                `json:"squadSynergy"`
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

type pairKey [2]int

func FromOpenDota(snapshot *normalize.OpenDotaSnapshot, windowStartUnix int64) (*OpenDotaResult, error) {
	if snapshot == nil {
		return nil, fmt.Errorf("normalized snapshot is nil")
	}
	careerHeroes := make(map[int]map[int]*counter)
	windowHeroes := make(map[int]map[int]*counter)
	teammates := make(map[int]map[int]struct{})
	pairs := make(map[pairKey]*counter)
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
			for i := 0; i < len(roster); i++ {
				for j := i + 1; j < len(roster); j++ {
					a, b := roster[i].AccountID, roster[j].AccountID
					teammates[a][b] = struct{}{}
					teammates[b][a] = struct{}{}
					key := pairKey{a, b}
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

	result := &OpenDotaResult{
		MatchCount: len(snapshot.Matches), AppearanceCount: appearances,
		PlayerHeroStats:       encodeHeroStats(windowHeroes),
		CareerPlayerHeroStats: encodeHeroStats(careerHeroes),
		Teammates:             make(map[string][]int, len(teammates)),
		SquadSynergy:          make([]model.SquadPair, 0, len(pairs)),
	}
	squad := make(map[pairKey]model.SquadPair, len(pairs))
	for key, stat := range pairs {
		squad[key] = model.SquadPair{IDs: [2]int{key[0], key[1]}, Games: stat.games, Winrate: winrate(stat)}
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

// MergePeers upserts пожизненные совместные игры из /players/{id}/peers в SquadSynergy
// и Teammates. Оставляем только пары, где второй игрок тоже в pro-вселенной (known) —
// pub-тиммейты не протекают. Peers — пожизненные тоталы и имеют приоритет над тонким
// оконным счётом пары: именно это оживляет кросс-командную Chemistry (напр. Saksa+Watson).
func MergePeers(result *OpenDotaResult, accountID int, peers []opendota.Peer, known map[int]struct{}) error {
	if result == nil || accountID <= 0 {
		return fmt.Errorf("invalid peers merge target %d", accountID)
	}
	if _, ok := known[accountID]; !ok {
		return fmt.Errorf("peers source %d is outside the known pro universe", accountID)
	}
	pairs := make(map[pairKey]model.SquadPair, len(result.SquadSynergy))
	for _, pair := range result.SquadSynergy {
		pairs[pairKey(pair.IDs)] = pair
	}
	teammates := teammateSet(result.Teammates)
	for _, peer := range peers {
		peerID := int(peer.AccountID)
		if peerID <= 0 || peerID == accountID {
			continue
		}
		if _, ok := known[peerID]; !ok {
			continue
		}
		if peer.WithGames <= 0 {
			continue
		}
		if peer.WithWins < 0 || peer.WithWins > peer.WithGames {
			return fmt.Errorf("peer %d↔%d has invalid with_win/with_games %d/%d", accountID, peerID, peer.WithWins, peer.WithGames)
		}
		a, b := accountID, peerID
		if a > b {
			a, b = b, a
		}
		key := pairKey{a, b}
		lifetime := model.SquadPair{IDs: [2]int{a, b}, Games: peer.WithGames, Winrate: float64(peer.WithWins) / float64(peer.WithGames)}
		if existing, ok := pairs[key]; !ok || peer.WithGames >= existing.Games {
			pairs[key] = lifetime
		}
		if teammates[a] == nil {
			teammates[a] = make(map[int]struct{})
		}
		if teammates[b] == nil {
			teammates[b] = make(map[int]struct{})
		}
		teammates[a][b] = struct{}{}
		teammates[b][a] = struct{}{}
	}
	result.SquadSynergy = squadSlice(pairs)
	result.Teammates = emitTeammates(teammates)
	return nil
}

func squadSlice(pairs map[pairKey]model.SquadPair) []model.SquadPair {
	out := make([]model.SquadPair, 0, len(pairs))
	for _, pair := range pairs {
		out = append(out, pair)
	}
	sort.Slice(out, func(i, j int) bool {
		left, right := out[i].IDs, out[j].IDs
		return left[0] < right[0] || (left[0] == right[0] && left[1] < right[1])
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
	seenPairs := make(map[pairKey]struct{}, len(result.SquadSynergy))
	for _, pair := range result.SquadSynergy {
		key := pairKey(pair.IDs)
		if key[0] <= 0 || key[0] >= key[1] {
			return fmt.Errorf("invalid squad pair %v", pair.IDs)
		}
		if _, exists := seenPairs[key]; exists {
			return fmt.Errorf("duplicate squad pair %v", pair.IDs)
		}
		seenPairs[key] = struct{}{}
		if err := validStat(model.Stat{Games: pair.Games, Winrate: pair.Winrate}); err != nil {
			return fmt.Errorf("squad pair %v: %w", pair.IDs, err)
		}
		if !containsSorted(result.Teammates[strconv.Itoa(key[0])], key[1]) {
			return fmt.Errorf("squad pair %v missing from teammates", pair.IDs)
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
