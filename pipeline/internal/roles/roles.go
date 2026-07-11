// Package roles выводит игровые роли (safelane/mid/offlane/support×2) из
// нормализованных матчей OpenDota. OpenDota отдаёт lane_role (1 safe / 2 mid /
// 3 off / 4 jungle) и is_roaming, но НЕ core/support-разделение — его выводим по
// приоритету фарма внутри команды. Ролей 4/5 не делим (решение CLAUDE.md).
//
// Детерминизм: все сортировки имеют финальный tie-break по accountID; выход
// отсортирован по accountID. Один и тот же snapshot ⇒ один и тот же результат.
package roles

import (
	"sort"

	"github.com/aegis-draft/pipeline/internal/model"
	"github.com/aegis-draft/pipeline/internal/normalize"
)

const (
	laneSafe   = 1
	laneMid    = 2
	laneOff    = 3
	laneJungle = 4
)

// roleOrder — канонический порядок для детерминированных tie-break и rolesPlayed.
var roleOrder = []model.Role{model.RoleSafelane, model.RoleMid, model.RoleOfflane, model.RoleSupport}

// PlayerRoles — итог по игроку: основная роль + все сыгранные (по частоте).
type PlayerRoles struct {
	AccountID   int          `json:"accountId"`
	PrimaryRole model.Role   `json:"primaryRole"`
	RolesPlayed []model.Role `json:"rolesPlayed"`
	Appearances int          `json:"appearances"`
}

// Infer агрегирует по-матчевые роли в per-account primaryRole/rolesPlayed.
func Infer(matches []normalize.NormalizedMatch) []PlayerRoles {
	counts := make(map[int]map[model.Role]int)
	appearances := make(map[int]int)
	for _, match := range matches {
		for accountID, role := range inferMatchRoles(match) {
			if counts[accountID] == nil {
				counts[accountID] = make(map[model.Role]int)
			}
			counts[accountID][role]++
			appearances[accountID]++
		}
	}
	accountIDs := make([]int, 0, len(counts))
	for accountID := range counts {
		accountIDs = append(accountIDs, accountID)
	}
	sort.Ints(accountIDs)
	result := make([]PlayerRoles, 0, len(accountIDs))
	for _, accountID := range accountIDs {
		result = append(result, PlayerRoles{
			AccountID:   accountID,
			PrimaryRole: argmaxRole(counts[accountID]),
			RolesPlayed: sortedRoles(counts[accountID]),
			Appearances: appearances[accountID],
		})
	}
	return result
}

// inferMatchRoles возвращает accountID→role для всех игроков матча (обе команды).
func inferMatchRoles(match normalize.NormalizedMatch) map[int]model.Role {
	byTeam := make(map[int][]normalize.NormalizedAppearance)
	for _, app := range match.Players {
		byTeam[app.TeamID] = append(byTeam[app.TeamID], app)
	}
	out := make(map[int]model.Role, len(match.Players))
	for _, team := range byTeam {
		for accountID, role := range inferTeamRoles(team) {
			out[accountID] = role
		}
	}
	return out
}

// inferTeamRoles присваивает роли одной команде в одном матче. При ровно 5 игроках —
// строгое 5-ролевое разбиение (3 кора + 2 саппорта); иначе — деградированный
// per-player маппинг по линии (без гарантии числа саппортов).
func inferTeamRoles(team []normalize.NormalizedAppearance) map[int]model.Role {
	out := make(map[int]model.Role, len(team))
	if len(team) != 5 {
		for _, app := range team {
			out[app.AccountID] = laneFallbackRole(app)
		}
		return out
	}

	// mid: приоритет lane_role==2 (по XPM), иначе — макс XPM в команде.
	midIdx := pickMid(team)
	out[team[midIdx].AccountID] = model.RoleMid

	rest := make([]int, 0, 4)
	for i := range team {
		if i != midIdx {
			rest = append(rest, i)
		}
	}
	// Саппорты: роумеры/джангл вперёд, затем самый низкий фарм. Берём двух.
	sort.Slice(rest, func(a, b int) bool { return supportLess(team[rest[a]], team[rest[b]]) })
	supports := rest[:2]
	cores := rest[2:]
	for _, i := range supports {
		out[team[i].AccountID] = model.RoleSupport
	}
	// Два оставшихся кора → safelane/offlane по линии, иначе по фарму.
	safeIdx, offIdx := splitCores(team[cores[0]], team[cores[1]], cores[0], cores[1])
	out[team[safeIdx].AccountID] = model.RoleSafelane
	out[team[offIdx].AccountID] = model.RoleOfflane
	return out
}

func pickMid(team []normalize.NormalizedAppearance) int {
	best := -1
	for i, app := range team {
		if app.LaneRole != laneMid {
			continue
		}
		if best == -1 || xpmLess(team[best], app) {
			best = i
		}
	}
	if best != -1 {
		return best
	}
	// Нет явного мида по lane_role — берём макс XPM (tie: GPM, accountID).
	best = 0
	for i := 1; i < len(team); i++ {
		if xpmLess(team[best], team[i]) {
			best = i
		}
	}
	return best
}

// splitCores решает, кто из двух коров safelane, кто offlane: по явной линии,
// иначе — больший фарм на safelane (позиция 1).
func splitCores(a, b normalize.NormalizedAppearance, ia, ib int) (safeIdx, offIdx int) {
	switch {
	case a.LaneRole == laneSafe && b.LaneRole != laneSafe:
		return ia, ib
	case b.LaneRole == laneSafe && a.LaneRole != laneSafe:
		return ib, ia
	case a.LaneRole == laneOff && b.LaneRole != laneOff:
		return ib, ia
	case b.LaneRole == laneOff && a.LaneRole != laneOff:
		return ia, ib
	default:
		if farmLess(a, b) {
			return ib, ia
		}
		return ia, ib
	}
}

func laneFallbackRole(app normalize.NormalizedAppearance) model.Role {
	if app.IsRoaming || app.LaneRole == laneJungle {
		return model.RoleSupport
	}
	switch app.LaneRole {
	case laneMid:
		return model.RoleMid
	case laneOff:
		return model.RoleOfflane
	case laneSafe:
		return model.RoleSafelane
	default:
		return model.RoleSupport
	}
}

// supportLess: «более саппортный» игрок идёт раньше (роумер/джангл, затем низкий фарм).
func supportLess(a, b normalize.NormalizedAppearance) bool {
	aSup := a.IsRoaming || a.LaneRole == laneJungle
	bSup := b.IsRoaming || b.LaneRole == laneJungle
	if aSup != bSup {
		return aSup
	}
	if a.GoldPerMin != b.GoldPerMin {
		return a.GoldPerMin < b.GoldPerMin
	}
	if a.LastHits != b.LastHits {
		return a.LastHits < b.LastHits
	}
	return a.AccountID < b.AccountID
}

func farmLess(a, b normalize.NormalizedAppearance) bool {
	if a.GoldPerMin != b.GoldPerMin {
		return a.GoldPerMin < b.GoldPerMin
	}
	if a.LastHits != b.LastHits {
		return a.LastHits < b.LastHits
	}
	return a.AccountID < b.AccountID
}

func xpmLess(a, b normalize.NormalizedAppearance) bool {
	if a.XPPerMin != b.XPPerMin {
		return a.XPPerMin < b.XPPerMin
	}
	if a.GoldPerMin != b.GoldPerMin {
		return a.GoldPerMin < b.GoldPerMin
	}
	return a.AccountID < b.AccountID
}

func argmaxRole(counts map[model.Role]int) model.Role {
	best := roleOrder[0]
	bestN := -1
	for _, role := range roleOrder {
		if counts[role] > bestN {
			best, bestN = role, counts[role]
		}
	}
	return best
}

func sortedRoles(counts map[model.Role]int) []model.Role {
	present := make([]model.Role, 0, len(counts))
	for _, role := range roleOrder {
		if counts[role] > 0 {
			present = append(present, role)
		}
	}
	// Стабильно: по убыванию частоты, tie — по roleOrder.
	sort.SliceStable(present, func(i, j int) bool { return counts[present[i]] > counts[present[j]] })
	return present
}
