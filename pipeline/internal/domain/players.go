package domain

import (
	"fmt"
	"sort"
	"strconv"

	"github.com/aegis-draft/pipeline/internal/model"
	"github.com/aegis-draft/pipeline/internal/normalize"
	"github.com/aegis-draft/pipeline/internal/opendota"
	"github.com/aegis-draft/pipeline/internal/rating"
	"github.com/aegis-draft/pipeline/internal/roles"
)

// matchPerformances разворачивает матчи в rating.MatchPerformance. Роль игрока —
// его primaryRole (S2), чтобы все игры легли в один рейтинговый cohort. TeamKills —
// сумма килов команды в матче (гарантирует kills<=teamKills). Матчи без длительности
// пропускаются (RatePlayers требует DurationSeconds>0).
func matchPerformances(matches []normalize.NormalizedMatch, roleByAccount map[int]model.Role) []rating.MatchPerformance {
	out := make([]rating.MatchPerformance, 0)
	for _, match := range matches {
		if match.Duration <= 0 {
			continue
		}
		teamKills := make(map[int]int)
		for _, app := range match.Players {
			teamKills[app.TeamID] += app.Kills
		}
		for _, app := range match.Players {
			role, ok := roleByAccount[app.AccountID]
			if !ok {
				continue
			}
			out = append(out, rating.MatchPerformance{
				MatchID: match.MatchID, AccountID: app.AccountID, Role: role,
				TeamID: app.TeamID, Won: teamWon(match, app.TeamID),
				DurationSeconds: match.Duration, Kills: app.Kills, Deaths: app.Deaths, Assists: app.Assists,
				TeamKills: teamKills[app.TeamID], GoldPerMin: app.GoldPerMin, XPPerMin: app.XPPerMin,
				LastHits: app.LastHits, HeroDamage: app.HeroDamage,
			})
		}
	}
	return out
}

// BuildEventRatings — рейтинг PER EVENT (Base = форма игрока на КОНКРЕТНОМ турнире, PRD §5.4.1,
// как в 322-0). Для каждого события OVR/IMP/ECO/REL считаются из матчей ТОЛЬКО этого события, а
// когорта-нормализация — среди участников этого события. Ключ (eventId → accountId). Так игрок,
// провалившийся на ивенте, получает низкий OVR именно там — в отличие от глобального per-account
// рейтинга (иначе Save-/Noone всегда с максимумом ⇒ выгодно брать только их).
// Роль для когорты — тоже НА СОБЫТИИ (roles.InferMatch), а не глобальный primaryRole:
// перцентиль должен сравнивать игрока с теми, кто играл ту же роль на том же турнире.
func BuildEventRatings(matches []normalize.NormalizedMatch, events []model.EventInfo, cfg rating.Config) (map[string]map[int]rating.PlayerRating, error) {
	leagueToEvent := make(map[int64]string, len(events))
	for _, event := range events {
		if leagueID, ok := parseLeagueID(event.ID); ok {
			leagueToEvent[leagueID] = event.ID
		}
	}
	byEvent := make(map[string][]normalize.NormalizedMatch)
	roleGames := make(map[string]map[int]map[model.Role]int)
	for _, match := range matches {
		eventID, ok := leagueToEvent[match.LeagueID]
		if !ok {
			continue
		}
		byEvent[eventID] = append(byEvent[eventID], match)
		if roleGames[eventID] == nil {
			roleGames[eventID] = make(map[int]map[model.Role]int)
		}
		for accountID, role := range roles.InferMatch(match) {
			if roleGames[eventID][accountID] == nil {
				roleGames[eventID][accountID] = make(map[model.Role]int)
			}
			roleGames[eventID][accountID][role]++
		}
	}
	out := make(map[string]map[int]rating.PlayerRating, len(byEvent))
	for eventID, evMatches := range byEvent {
		roleByAccount := make(map[int]model.Role, len(roleGames[eventID]))
		for accountID, byRole := range roleGames[eventID] {
			roleByAccount[accountID] = eventRole(byRole)
		}
		rated, err := rating.RatePlayers(eventID, matchPerformances(evMatches, roleByAccount), cfg)
		if err != nil {
			return nil, fmt.Errorf("rate event %s: %w", eventID, err)
		}
		byAccount := make(map[int]rating.PlayerRating, len(rated))
		for _, r := range rated {
			byAccount[r.AccountID] = r
		}
		out[eventID] = byAccount
	}
	return out, nil
}

// gamesByAccountTeam считает игры игрока за каждую команду (для players[].teams).
func gamesByAccountTeam(matches []normalize.NormalizedMatch) map[int]map[int]int {
	out := make(map[int]map[int]int)
	for _, match := range matches {
		for _, app := range match.Players {
			if out[app.AccountID] == nil {
				out[app.AccountID] = make(map[int]int)
			}
			out[app.AccountID][app.TeamID]++
		}
	}
	return out
}

// BuildPlayers собирает профили игроков: nickname, primaryRole/rolesPlayed (S2),
// команды с числом игр. Peak (career-best) — deferred (T4.2), не заполняется.
func BuildPlayers(snapshot *normalize.OpenDotaSnapshot, rolesList []roles.PlayerRoles, teams []opendota.Team, matches []normalize.NormalizedMatch) map[string]model.PlayerProfile {
	teamName := make(map[int]string, len(teams))
	for _, team := range teams {
		teamName[int(team.TeamID)] = team.Name
	}
	rolesByAccount := make(map[int]roles.PlayerRoles, len(rolesList))
	for _, pr := range rolesList {
		rolesByAccount[pr.AccountID] = pr
	}
	games := gamesByAccountTeam(matches)
	out := make(map[string]model.PlayerProfile)
	for _, player := range snapshot.Players {
		pr, ok := rolesByAccount[player.AccountID]
		if !ok {
			continue
		}
		teamsList := make([]model.PlayerTeam, 0, len(player.TeamIDs))
		for _, teamID := range player.TeamIDs {
			teamsList = append(teamsList, model.PlayerTeam{
				TeamID: teamID, TeamName: teamName[teamID], Games: games[player.AccountID][teamID],
			})
		}
		sort.Slice(teamsList, func(i, j int) bool { return teamsList[i].TeamID < teamsList[j].TeamID })
		out[strconv.Itoa(player.AccountID)] = model.PlayerProfile{
			AccountID:   player.AccountID,
			Nickname:    nicknameOf(player),
			PrimaryRole: pr.PrimaryRole,
			RolesPlayed: pr.RolesPlayed,
			Teams:       teamsList,
		}
	}
	return out
}

func nicknameOf(player normalize.NormalizedPlayer) string {
	if player.Name != "" {
		return player.Name
	}
	return "Player " + strconv.Itoa(player.AccountID)
}
