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
	teamInfo := make(map[int]opendota.Team, len(teams))
	for _, team := range teams {
		teamInfo[int(team.TeamID)] = team
	}
	lineups := buildLineups(matches, events)

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

// buildLineups строит составы (eventID, teamID) -> {игры, герои} по появлениям в матчах
// tier-1 событий. Общая основа для BuildPacks и PackPlayerIDs.
func buildLineups(matches []normalize.NormalizedMatch, events []model.EventInfo) map[string]map[int]*eventLineup {
	leagueToEvent := make(map[int64]string, len(events))
	for _, event := range events {
		if leagueID, ok := parseLeagueID(event.ID); ok {
			leagueToEvent[leagueID] = event.ID
		}
	}
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
	return lineups
}

// selectRoster — ростер пака: кандидаты по ролям (primaryRole), внутри роли — по числу игр
// (стенд-ины отсекаются). Ровно safelane/mid/offlane + 2 support (инвариант validate.Dataset);
// без полного покрытия ролей ok=false (обычно data-quality шум). Не зависит от career/peers.
func selectRoster(lineup *eventLineup, roleByAccount map[int]model.Role) ([]int, bool) {
	byRole := make(map[model.Role][]int)
	for accountID := range lineup.games {
		role := roleByAccount[accountID]
		byRole[role] = append(byRole[role], accountID)
	}
	for role := range byRole {
		accounts := byRole[role]
		sort.Slice(accounts, func(i, j int) bool {
			if lineup.games[accounts[i]] != lineup.games[accounts[j]] {
				return lineup.games[accounts[i]] > lineup.games[accounts[j]]
			}
			return accounts[i] < accounts[j]
		})
	}
	roster := make([]int, 0, rosterSize)
	roster = append(roster, top(byRole[model.RoleSafelane], 1)...)
	roster = append(roster, top(byRole[model.RoleMid], 1)...)
	roster = append(roster, top(byRole[model.RoleOfflane], 1)...)
	roster = append(roster, top(byRole[model.RoleSupport], 2)...)
	if len(roster) < rosterSize {
		return nil, false
	}
	return roster, true
}

// PackPlayerIDs — множество аккаунтов, реально попадающих в паки (топ-5 составов на событиях).
// Обогащать career/peers имеет смысл только для них: непаковые игроки (стенд-ины, неполные
// ростеры) в датасет не входят. Вычисляется из тех же входов, что и BuildPacks, но БЕЗ
// рейтингов/справочников — то есть доступно ДО дорогого сетевого обогащения.
func PackPlayerIDs(matches []normalize.NormalizedMatch, events []model.EventInfo, roleByAccount map[int]model.Role) map[int]struct{} {
	ids := make(map[int]struct{})
	for _, byTeam := range buildLineups(matches, events) {
		for _, lineup := range byTeam {
			roster, ok := selectRoster(lineup, roleByAccount)
			if !ok {
				continue
			}
			for _, accountID := range roster {
				ids[accountID] = struct{}{}
			}
		}
	}
	return ids
}

func buildPack(eventID string, teamID int, lineup *eventLineup, ratings map[int]rating.PlayerRating, roleByAccount map[int]model.Role, nickByAccount map[int]string, teamInfo map[int]opendota.Team) (model.Pack, bool) {
	roster, ok := selectRoster(lineup, roleByAccount)
	if !ok {
		return model.Pack{}, false
	}

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

// top возвращает до n первых аккаунтов роли (меньше — если кандидатов не хватает).
func top(accounts []int, n int) []int {
	if len(accounts) < n {
		return accounts
	}
	return accounts[:n]
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
