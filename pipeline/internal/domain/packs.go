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
	"github.com/aegis-draft/pipeline/internal/roles"
)

const rosterSize = 5

// signaturePoolSize — сколько сигнатурных героев кладём в пак. Клиент показывает
// HERO_TARGET (5) случайных из них, поэтому пул должен быть шире показа.
const signaturePoolSize = 10

type eventLineup struct {
	games     map[int]int                // accountID -> игры в событии
	heroes    map[int]map[int]int        // accountID -> heroID -> пики
	roleGames map[int]map[model.Role]int // accountID -> роль НА ЭТОМ событии -> игры
}

// eventRole — роль игрока на событии: argmax по сыгранным здесь ролям (tie — packRoleOrder).
// Для когорты рейтинга; в составе пака действует ограничение 1/1/1/2, поэтому там роль
// берётся из назначения (assignPackRoles), а не отсюда.
func eventRole(byRole map[model.Role]int) model.Role {
	best, bestN := packRoleOrder[0], -1
	for _, role := range packRoleOrder {
		if byRole[role] > bestN {
			best, bestN = role, byRole[role]
		}
	}
	return best
}

// BuildPacks строит Team Packs как реальные составы команд на событии: топ-5 игроков
// по числу игр в событии, с рейтингами (S3c) и ролями (S2). Placement не выводится из
// OpenDota (deferred). Пак включается только при полном составе (>=5 игроков) и только
// в те окна, где команда прошла гейт присутствия (packFormats).
func BuildPacks(matches []normalize.NormalizedMatch, events []model.EventInfo, eventRatings map[string]map[int]rating.PlayerRating, nickByAccount map[int]string, teams []opendota.Team) []model.Pack {
	teamInfo := make(map[int]opendota.Team, len(teams))
	for _, team := range teams {
		teamInfo[int(team.TeamID)] = team
	}
	lineups := buildLineups(matches, events)
	formatsByPack := packFormats(lineups, events)

	packs := make([]model.Pack, 0)
	for _, eventID := range sortedKeys(lineups) {
		teamIDs := make([]int, 0, len(lineups[eventID]))
		for teamID := range lineups[eventID] {
			teamIDs = append(teamIDs, teamID)
		}
		sort.Ints(teamIDs)
		for _, teamID := range teamIDs {
			windows := formatsByPack[eventID][teamID]
			if len(windows) == 0 {
				continue // команда не прошла гейт ни в одном окне события
			}
			pack, ok := buildPack(eventID, teamID, lineups[eventID][teamID], eventRatings[eventID], nickByAccount, teamInfo)
			if ok {
				pack.Formats = windows
				packs = append(packs, pack)
			}
		}
	}
	return packs
}

// minEventsInWindow — сколько событий ОКНА команда обязана отыграть полным составом, чтобы
// попасть в пул этого окна.
//
// Гейт присутствия чинит дефект, который не видит курируемый список имён (tier1.tier1Series):
// имя классифицирует СЕРИЮ, а качество является свойством конкретного розыгрыша. «Games of the
// Future 2025 Abu Dhabi» — настоящая серия с полем из приглашённых стаков; каждая её команда
// существует ровно в одном событии, поэтому гейт уносит розыгрыш целиком, не зная его имени.
//
// Порог 2 выбран замером на датасете 8b4815a (не спекуляция). По окнам, средний OVR пака:
// N=1 — 68.7/68.9/72.8/68.0 (1y/2y/5y/legacy), N=5+ — 75.9/75.3/74.8/75.5. Слабый хвост
// (пак <65 OVR) в last_1y падает 14.1% → 10.8%, сильный (>82) не двигается: гейт срезает
// снапшоты команд, о которых окно ничего не знает, а не «слабые команды».
//
// Порог считается ОТДЕЛЬНО на окно, а не на весь датасет: одна и та же команда бывает
// постоянной в last_5y и разовой в last_1y. Опасение, что в valve_legacy (только TI и мажоры)
// разовое участие законно, замером не подтвердилось — там N=1 самый слабый бакет из всех.
const minEventsInWindow = 2

// packFormats возвращает (eventID, teamID) -> окна, в которых пак доступен: форматы события
// минус те, где команда встречается реже minEventsInWindow. Пустой список = пак не эмитим.
//
// Считаются только события с ПОЛНЫМ составом: команда, засветившаяся четырьмя игроками, пака
// не даёт и присутствием считаться не должна.
func packFormats(lineups map[string]map[int]*eventLineup, events []model.EventInfo) map[string]map[int][]model.Format {
	windowsByEvent := make(map[string][]model.Format, len(events))
	for _, event := range events {
		windowsByEvent[event.ID] = event.Formats
	}

	seen := make(map[model.Format]map[int]int)
	for eventID, byTeam := range lineups {
		for teamID, lineup := range byTeam {
			if _, _, ok := selectRoster(lineup); !ok {
				continue
			}
			for _, window := range windowsByEvent[eventID] {
				if seen[window] == nil {
					seen[window] = make(map[int]int)
				}
				seen[window][teamID]++
			}
		}
	}

	out := make(map[string]map[int][]model.Format, len(lineups))
	for eventID, byTeam := range lineups {
		for teamID := range byTeam {
			// Порядок наследуется от event.Formats (formats.Assign) — детерминизм.
			kept := make([]model.Format, 0, len(windowsByEvent[eventID]))
			for _, window := range windowsByEvent[eventID] {
				if seen[window][teamID] >= minEventsInWindow {
					kept = append(kept, window)
				}
			}
			if len(kept) == 0 {
				continue
			}
			if out[eventID] == nil {
				out[eventID] = make(map[int][]model.Format)
			}
			out[eventID][teamID] = kept
		}
	}
	return out
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
		matchRoles := roles.InferMatch(match)
		for _, app := range match.Players {
			team := lineups[eventID][app.TeamID]
			if team == nil {
				team = &eventLineup{games: map[int]int{}, heroes: map[int]map[int]int{}, roleGames: map[int]map[model.Role]int{}}
				lineups[eventID][app.TeamID] = team
			}
			team.games[app.AccountID]++
			if team.heroes[app.AccountID] == nil {
				team.heroes[app.AccountID] = map[int]int{}
			}
			team.heroes[app.AccountID][app.HeroID]++
			if team.roleGames[app.AccountID] == nil {
				team.roleGames[app.AccountID] = map[model.Role]int{}
			}
			team.roleGames[app.AccountID][matchRoles[app.AccountID]]++
		}
	}
	return lineups
}

// packRoleOrder — слоты пака: ровно safelane/mid/offlane + 2 support (инвариант validate.Dataset).
var packRoleOrder = []model.Role{model.RoleSafelane, model.RoleMid, model.RoleOfflane, model.RoleSupport, model.RoleSupport}

// selectRoster — ростер пака: топ-5 игроков по числу игр НА СОБЫТИИ (стенд-ины отсекаются),
// затем роли раздаются назначением, максимизирующим сумму игр в роли (matching, не жадность —
// как для героев, CLAUDE.md). Роли берутся из roleGames — сыгранных на ЭТОМ турнире.
//
// Раньше роли брались из ГЛОБАЛЬНОГО primaryRole: если по всей выборке два игрока состава
// сходились в одну роль, у команды выходило два офлейна и ноль мидов, слот мида оставался
// пустым и пак выбрасывался целиком (13 команд на TI2021 из 18). Роли на событии дают
// валидный состав всегда, когда на турнире есть 5 игроков.
func selectRoster(lineup *eventLineup) ([]int, map[int]model.Role, bool) {
	candidates := make([]int, 0, len(lineup.games))
	for accountID := range lineup.games {
		candidates = append(candidates, accountID)
	}
	// Детерминизм: по играм убыв., tie — accountID.
	sort.Slice(candidates, func(i, j int) bool {
		if lineup.games[candidates[i]] != lineup.games[candidates[j]] {
			return lineup.games[candidates[i]] > lineup.games[candidates[j]]
		}
		return candidates[i] < candidates[j]
	})
	if len(candidates) < rosterSize {
		return nil, nil, false
	}
	roster := candidates[:rosterSize]
	return roster, assignPackRoles(roster, lineup.roleGames), true
}

// assignPackRoles раздаёт 5 слотов (safe/mid/off/sup/sup) пяти игрокам, максимизируя Σ игр в
// назначенной роли. Состав всегда ровно 5, поэтому перебор 120 перестановок дешевле и точнее
// венгерского алгоритма. Tie — лексикографически первая перестановка (детерминизм).
func assignPackRoles(roster []int, roleGames map[int]map[model.Role]int) map[int]model.Role {
	best, bestScore := []int(nil), -1
	permute([]int{0, 1, 2, 3, 4}, 0, func(perm []int) {
		score := 0
		for slot, playerIdx := range perm {
			score += roleGames[roster[playerIdx]][packRoleOrder[slot]]
		}
		if score > bestScore {
			bestScore = score
			best = append([]int(nil), perm...)
		}
	})
	out := make(map[int]model.Role, rosterSize)
	for slot, playerIdx := range best {
		out[roster[playerIdx]] = packRoleOrder[slot]
	}
	return out
}

// permute вызывает visit для каждой перестановки в лексикографическом порядке.
func permute(items []int, k int, visit func([]int)) {
	if k == len(items) {
		visit(items)
		return
	}
	for i := k; i < len(items); i++ {
		// Сдвиг вместо swap — сохраняет лексикографический порядок (детерминизм tie-break).
		rotated := append([]int(nil), items...)
		value := rotated[i]
		copy(rotated[k+1:i+1], rotated[k:i])
		rotated[k] = value
		permute(rotated, k+1, visit)
	}
}

// PackPlayerIDs — множество аккаунтов, реально попадающих в паки (топ-5 составов на событиях).
// Обогащать career/peers имеет смысл только для них: непаковые игроки (стенд-ины, неполные
// ростеры) в датасет не входят. Вычисляется из тех же входов, что и BuildPacks, но БЕЗ
// рейтингов/справочников — то есть доступно ДО дорогого сетевого обогащения.
//
// Гейт присутствия применяется здесь тем же packFormats: игроки паков, которые BuildPacks
// выбросит, в датасет не попадут, и сетевой бюджет на них тратить нельзя.
func PackPlayerIDs(matches []normalize.NormalizedMatch, events []model.EventInfo) map[int]struct{} {
	lineups := buildLineups(matches, events)
	formatsByPack := packFormats(lineups, events)
	ids := make(map[int]struct{})
	for eventID, byTeam := range lineups {
		for teamID, lineup := range byTeam {
			if len(formatsByPack[eventID][teamID]) == 0 {
				continue
			}
			roster, _, ok := selectRoster(lineup)
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

func buildPack(eventID string, teamID int, lineup *eventLineup, ratings map[int]rating.PlayerRating, nickByAccount map[int]string, teamInfo map[int]opendota.Team) (model.Pack, bool) {
	roster, assignment, ok := selectRoster(lineup)
	if !ok {
		return model.Pack{}, false
	}

	players := make([]model.PackPlayer, 0, rosterSize)
	for _, accountID := range roster {
		r := ratings[accountID]
		players = append(players, model.PackPlayer{
			AccountID: accountID, Nickname: nickByAccount[accountID], Role: assignment[accountID],
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
		TeamName: name, Tag: team.Tag, LogoURL: team.LogoURL, Players: players,
		SignatureHeroes: signatureHeroes(lineup, roster),
	}, true
}

// signatureHeroes — самые частые герои состава на событии (топ-N, tie по heroID).
//
// Хранится ВДВОЕ больше, чем показывается: клиент случайно берёт 5 из этого пула на каждый
// ролл (как 322-0: `shuffle(signatureHeroes).slice(0, 5)`). Раньше хранили ровно 5 и всегда
// показывали их же — пул героев был вдвое уже, и редкие герои почти не выпадали: Anti-Mage
// встречался в 13 паках из 1415 (0.9% на пак), 16 героев имели шанс <1%. У референса при
// том же среднем таких героев всего 2.
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
	if len(heroes) > signaturePoolSize {
		heroes = heroes[:signaturePoolSize]
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
