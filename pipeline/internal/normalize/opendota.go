package normalize

import (
	"fmt"
	"sort"

	"github.com/aegis-draft/pipeline/internal/artifact"
	"github.com/aegis-draft/pipeline/internal/opendota"
)

// OpenDotaSnapshot is an intermediate deterministic artifact between fetch and aggregate.
// It intentionally is not part of the public game-data schema.
type OpenDotaSnapshot struct {
	Source         string             `json:"source"`
	Matches        []NormalizedMatch  `json:"matches"`
	Players        []NormalizedPlayer `json:"players"`
	SkippedPlayers int                `json:"skippedPlayers"`
	SkippedMatches int                `json:"skippedMatches"`
	Collection     *CollectionStatus  `json:"collection,omitempty"`
}

type CollectionStatus struct {
	Window                string `json:"window"`
	AsOf                  string `json:"asOf"`
	WindowStart           int64  `json:"windowStart"`
	PagesRead             int    `json:"pagesRead"`
	DiscoveredMatches     int    `json:"discoveredMatches"`
	DiscoveryComplete     bool   `json:"discoveryComplete"`
	DetailTargetMatches   int    `json:"detailTargetMatches"`
	DetailsComplete       bool   `json:"detailsComplete"`
	CareerTargetPlayers   int    `json:"careerTargetPlayers"`
	CareerPlayersComplete int    `json:"careerPlayersComplete"`
	CareerComplete        bool   `json:"careerComplete"`
	CacheHits             int    `json:"cacheHits"`
	NetworkRequests       int    `json:"networkRequests"`
}

type NormalizedMatch struct {
	MatchID       int64                  `json:"matchId"`
	StartTime     int64                  `json:"startTime"`
	Duration      int                    `json:"duration"`
	LeagueID      int64                  `json:"leagueId"`
	RadiantTeamID int                    `json:"radiantTeamId"`
	DireTeamID    int                    `json:"direTeamId"`
	RadiantWin    bool                   `json:"radiantWin"`
	Players       []NormalizedAppearance `json:"players"`
}

type NormalizedAppearance struct {
	AccountID  int  `json:"accountId"`
	TeamID     int  `json:"teamId"`
	PlayerSlot int  `json:"playerSlot"`
	HeroID     int  `json:"heroId"`
	LaneRole   int  `json:"laneRole,omitempty"`
	IsRoaming  bool `json:"isRoaming,omitempty"`
	Kills      int  `json:"kills"`
	Deaths     int  `json:"deaths"`
	Assists    int  `json:"assists"`
	GoldPerMin int  `json:"goldPerMin"`
	XPPerMin   int  `json:"xpPerMin"`
	LastHits   int  `json:"lastHits"`
	HeroDamage int  `json:"heroDamage"`
}

type NormalizedPlayer struct {
	AccountID int     `json:"accountId"`
	Name      string  `json:"name,omitempty"`
	TeamIDs   []int   `json:"teamIds"`
	MatchIDs  []int64 `json:"matchIds"`
}

type playerAccumulator struct {
	name     string
	teamIDs  map[int]struct{}
	matchIDs map[int64]struct{}
}

func FromOpenDota(matches []*opendota.Match) (*OpenDotaSnapshot, error) {
	snapshot := &OpenDotaSnapshot{
		Source:  "OpenDota API — https://www.opendota.com",
		Matches: make([]NormalizedMatch, 0, len(matches)),
		Players: []NormalizedPlayer{},
	}
	players := make(map[int]*playerAccumulator)
	seenMatches := make(map[int64]struct{}, len(matches))
	orderedMatches := append([]*opendota.Match(nil), matches...)
	sort.Slice(orderedMatches, func(i, j int) bool {
		if orderedMatches[i] == nil {
			return false
		}
		if orderedMatches[j] == nil {
			return true
		}
		return orderedMatches[i].MatchID < orderedMatches[j].MatchID
	})

	for _, raw := range orderedMatches {
		if raw == nil || raw.MatchID <= 0 {
			return nil, fmt.Errorf("invalid OpenDota match")
		}
		if _, exists := seenMatches[raw.MatchID]; exists {
			return nil, fmt.Errorf("duplicate matchId %d", raw.MatchID)
		}
		seenMatches[raw.MatchID] = struct{}{}
		// Реальные pro-матчи иногда без зарегистрированного team_id (0): такой матч
		// нельзя привязать к команде (нет пака) — пропускаем, а не роняем весь сбор.
		if raw.RadiantTeamID <= 0 || raw.DireTeamID <= 0 {
			snapshot.SkippedMatches++
			continue
		}
		match := NormalizedMatch{
			MatchID: raw.MatchID, StartTime: raw.StartTime, Duration: raw.Duration,
			LeagueID: raw.LeagueID, RadiantTeamID: int(raw.RadiantTeamID),
			DireTeamID: int(raw.DireTeamID), RadiantWin: raw.RadiantWin,
			Players: []NormalizedAppearance{},
		}
		seenInMatch := make(map[int]struct{}, len(raw.Players))
		seenSlots := make(map[int]struct{}, len(raw.Players))
		for _, rawPlayer := range raw.Players {
			if _, exists := seenSlots[rawPlayer.PlayerSlot]; exists {
				return nil, fmt.Errorf("match %d has duplicate playerSlot %d", raw.MatchID, rawPlayer.PlayerSlot)
			}
			seenSlots[rawPlayer.PlayerSlot] = struct{}{}
			if rawPlayer.AccountID == nil || *rawPlayer.AccountID <= 0 {
				snapshot.SkippedPlayers++
				continue
			}
			accountID, err := AccountID(rawPlayer.AccountID, nil)
			if err != nil {
				return nil, fmt.Errorf("match %d: %w", raw.MatchID, err)
			}
			if _, exists := seenInMatch[accountID]; exists {
				return nil, fmt.Errorf("match %d has duplicate accountId %d", raw.MatchID, accountID)
			}
			seenInMatch[accountID] = struct{}{}
			teamID := match.RadiantTeamID
			if rawPlayer.PlayerSlot >= 128 {
				teamID = match.DireTeamID
			}
			match.Players = append(match.Players, NormalizedAppearance{
				AccountID: accountID, TeamID: teamID, PlayerSlot: rawPlayer.PlayerSlot,
				HeroID: rawPlayer.HeroID, LaneRole: rawPlayer.LaneRole, IsRoaming: rawPlayer.IsRoaming,
				Kills: rawPlayer.Kills, Deaths: rawPlayer.Deaths, Assists: rawPlayer.Assists,
				GoldPerMin: rawPlayer.GoldPerMin, XPPerMin: rawPlayer.XPPerMin,
				LastHits: rawPlayer.LastHits, HeroDamage: rawPlayer.HeroDamage,
			})

			acc := players[accountID]
			if acc == nil {
				acc = &playerAccumulator{teamIDs: map[int]struct{}{}, matchIDs: map[int64]struct{}{}}
				players[accountID] = acc
			}
			name := rawPlayer.Name
			if name == "" {
				name = rawPlayer.Personaname
			}
			if acc.name == "" && name != "" {
				acc.name = name
			}
			acc.teamIDs[teamID] = struct{}{}
			acc.matchIDs[raw.MatchID] = struct{}{}
		}
		if len(match.Players) == 0 {
			// Все игроки анонимны (нет account_id) — матч бесполезен, пропускаем.
			snapshot.SkippedMatches++
			continue
		}
		sort.Slice(match.Players, func(i, j int) bool { return match.Players[i].PlayerSlot < match.Players[j].PlayerSlot })
		snapshot.Matches = append(snapshot.Matches, match)
	}

	sort.Slice(snapshot.Matches, func(i, j int) bool { return snapshot.Matches[i].MatchID < snapshot.Matches[j].MatchID })
	accountIDs := make([]int, 0, len(players))
	for accountID := range players {
		accountIDs = append(accountIDs, accountID)
	}
	sort.Ints(accountIDs)
	for _, accountID := range accountIDs {
		acc := players[accountID]
		player := NormalizedPlayer{AccountID: accountID, Name: acc.name, TeamIDs: sortedInts(acc.teamIDs), MatchIDs: sortedInt64s(acc.matchIDs)}
		snapshot.Players = append(snapshot.Players, player)
	}
	return snapshot, nil
}

func WriteOpenDotaSnapshot(path string, snapshot *OpenDotaSnapshot) error {
	if snapshot == nil {
		return fmt.Errorf("normalized snapshot is nil")
	}
	return artifact.WriteJSON(path, snapshot)
}

func sortedInts(values map[int]struct{}) []int {
	result := make([]int, 0, len(values))
	for value := range values {
		result = append(result, value)
	}
	sort.Ints(result)
	return result
}

func sortedInt64s(values map[int64]struct{}) []int64 {
	result := make([]int64, 0, len(values))
	for value := range values {
		result = append(result, value)
	}
	sort.Slice(result, func(i, j int) bool { return result[i] < result[j] })
	return result
}
