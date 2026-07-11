package domain

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/aegis-draft/pipeline/internal/model"
	"github.com/aegis-draft/pipeline/internal/normalize"
	"github.com/aegis-draft/pipeline/internal/opendota"
	"github.com/aegis-draft/pipeline/internal/rating"
)

const rosterSize = 5

type eventLineup struct {
	games  map[int]int         // accountID -> игры в событии
	heroes map[int]map[int]int // accountID -> heroID -> пики
}

// BuildPacks строит Team Packs как реальные составы команд на событии: топ-5 игроков
// по числу игр в событии, с рейтингами (S3c) и ролями (S2). Placement не выводится из
// OpenDota (deferred). Пак включается только при полном составе (>=5 игроков).
func BuildPacks(matches []normalize.NormalizedMatch, events []model.EventInfo, ratings map[int]rating.PlayerRating, roleByAccount map[int]model.Role, nickByAccount map[int]string, teams []opendota.Team) []model.Pack {
	leagueToEvent := make(map[int64]string, len(events))
	for _, event := range events {
		if leagueID, ok := parseLeagueID(event.ID); ok {
			leagueToEvent[leagueID] = event.ID
		}
	}
	teamInfo := make(map[int]opendota.Team, len(teams))
	for _, team := range teams {
		teamInfo[int(team.TeamID)] = team
	}

	// (eventID, teamID) -> состав
	lineups := make(map[string]map[int]*eventLineup)
	for _, match := range matches {
		eventID, ok := leagueToEvent[match.LeagueID]
		if !ok {
			continue
		}
		if lineups[eventID] == nil {
			lineups[eventID] = make(map[int]*eventLineup)
		}
		for _, app := range match.Players {
			team := lineups[eventID][app.TeamID]
			if team == nil {
				team = &eventLineup{games: map[int]int{}, heroes: map[int]map[int]int{}}
				lineups[eventID][app.TeamID] = team
			}
			team.games[app.AccountID]++
			if team.heroes[app.AccountID] == nil {
				team.heroes[app.AccountID] = map[int]int{}
			}
			team.heroes[app.AccountID][app.HeroID]++
		}
	}

	packs := make([]model.Pack, 0)
	for _, eventID := range sortedKeys(lineups) {
		teamIDs := make([]int, 0, len(lineups[eventID]))
		for teamID := range lineups[eventID] {
			teamIDs = append(teamIDs, teamID)
		}
		sort.Ints(teamIDs)
		for _, teamID := range teamIDs {
			pack, ok := buildPack(eventID, teamID, lineups[eventID][teamID], ratings, roleByAccount, nickByAccount, teamInfo)
			if ok {
				packs = append(packs, pack)
			}
		}
	}
	return packs
}

func buildPack(eventID string, teamID int, lineup *eventLineup, ratings map[int]rating.PlayerRating, roleByAccount map[int]model.Role, nickByAccount map[int]string, teamInfo map[int]opendota.Team) (model.Pack, bool) {
	accounts := make([]int, 0, len(lineup.games))
	for accountID := range lineup.games {
		accounts = append(accounts, accountID)
	}
	// Топ по играм (tie: accountID) — ядро состава, стенд-ины отсекаются.
	sort.Slice(accounts, func(i, j int) bool {
		if lineup.games[accounts[i]] != lineup.games[accounts[j]] {
			return lineup.games[accounts[i]] > lineup.games[accounts[j]]
		}
		return accounts[i] < accounts[j]
	})
	if len(accounts) < rosterSize {
		return model.Pack{}, false
	}
	roster := accounts[:rosterSize]

	players := make([]model.PackPlayer, 0, rosterSize)
	for _, accountID := range roster {
		r := ratings[accountID]
		players = append(players, model.PackPlayer{
			AccountID: accountID, Nickname: nickByAccount[accountID], Role: roleByAccount[accountID],
			OVR: r.OVR, Impact: r.Impact, Economy: r.Economy, Reliability: r.Reliability,
			Games: lineup.games[accountID],
		})
	}
	team := teamInfo[teamID]
	name := team.Name
	if name == "" {
		name = "Team " + strconv.Itoa(teamID)
	}
	return model.Pack{
		ID: fmt.Sprintf("%s-%d", eventID, teamID), EventID: eventID, TeamID: teamID,
		TeamName: name, Tag: team.Tag, Players: players,
		SignatureHeroes: signatureHeroes(lineup, roster),
	}, true
}

// signatureHeroes — самые частые герои состава на событии (топ-5, tie по heroID).
func signatureHeroes(lineup *eventLineup, roster []int) []int {
	counts := make(map[int]int)
	for _, accountID := range roster {
		for heroID, n := range lineup.heroes[accountID] {
			if heroID > 0 {
				counts[heroID] += n
			}
		}
	}
	heroes := make([]int, 0, len(counts))
	for heroID := range counts {
		heroes = append(heroes, heroID)
	}
	sort.Slice(heroes, func(i, j int) bool {
		if counts[heroes[i]] != counts[heroes[j]] {
			return counts[heroes[i]] > counts[heroes[j]]
		}
		return heroes[i] < heroes[j]
	})
	if len(heroes) > rosterSize {
		heroes = heroes[:rosterSize]
	}
	sort.Ints(heroes)
	return heroes
}

func parseLeagueID(eventID string) (int64, bool) {
	raw := strings.TrimPrefix(eventID, "league-")
	if raw == eventID {
		return 0, false
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return 0, false
	}
	return id, true
}

func sortedKeys(m map[string]map[int]*eventLineup) []string {
	keys := make([]string, 0, len(m))
	for key := range m {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
