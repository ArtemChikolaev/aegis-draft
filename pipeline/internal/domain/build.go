package domain

import (
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/aegis-draft/pipeline/internal/aggregate"
	"github.com/aegis-draft/pipeline/internal/model"
	"github.com/aegis-draft/pipeline/internal/normalize"
	"github.com/aegis-draft/pipeline/internal/opendota"
	"github.com/aegis-draft/pipeline/internal/rating"
	"github.com/aegis-draft/pipeline/internal/roles"
)

// Input — всё, что нужно для сборки доменного датасета из OpenDota.
type Input struct {
	Snapshot           *normalize.OpenDotaSnapshot
	Aggregates         *aggregate.OpenDotaResult
	Teams              []opendota.Team
	Leagues            []opendota.League
	Heroes             []opendota.Hero
	AsOf               time.Time
	Config             rating.Config
	RatingModelVersion string
	MinEventMatches    int // порог: события с меньшим числом матчей в окне отбрасываются
	WindowStartUnix    int64
}

// FilterMatchesByWindow оставляет матчи с startTime >= windowStart (0 = без фильтра).
func FilterMatchesByWindow(matches []normalize.NormalizedMatch, windowStart int64) []normalize.NormalizedMatch {
	if windowStart <= 0 {
		out := make([]normalize.NormalizedMatch, len(matches))
		copy(out, matches)
		return out
	}
	out := make([]normalize.NormalizedMatch, 0, len(matches))
	for _, match := range matches {
		if match.StartTime >= windowStart {
			out = append(out, match)
		}
	}
	return out
}

// Build собирает полный model.Dataset из OpenDota-входов. Чистый и детерминированный.
// Liquipedia-зависимые поля (placements/prize/valve_legacy) остаются deferred.
func Build(in Input) (*model.Dataset, error) {
	matches := FilterMatchesByWindow(in.Snapshot.Matches, in.WindowStartUnix)
	rolesList := roles.Infer(matches)
	roleByAccount := make(map[int]model.Role, len(rolesList))
	for _, pr := range rolesList {
		roleByAccount[pr.AccountID] = pr.PrimaryRole
	}
	nickByAccount := make(map[int]string, len(in.Snapshot.Players))
	for _, player := range in.Snapshot.Players {
		nickByAccount[player.AccountID] = nicknameOf(player)
	}

	events := BuildEvents(matches, in.Leagues, in.AsOf, in.MinEventMatches)
	// Base = per-event (PRD §5.4.1): OVR игрока в паке = его форма на ЭТОМ турнире, не глобально.
	eventRatings, err := BuildEventRatings(matches, events, rolesList, in.Config)
	if err != nil {
		return nil, err
	}
	packs := BuildPacks(matches, events, eventRatings, roleByAccount, nickByAccount, in.Teams)
	players := BuildPlayers(in.Snapshot, rolesList, in.Teams, matches)
	teamSuccess := BuildTeamSuccess(matches, in.Leagues, in.AsOf, in.Config)
	heroes := convertHeroes(in.Heroes)
	eventHeroStats := buildEventHeroStats(matches, events)

	ds := &model.Dataset{
		Manifest: model.Manifest{
			SchemaVersion:      1,
			RatingModelVersion: in.RatingModelVersion,
			BuiltAt:            time.Now().UTC().Format(time.RFC3339),
			Source: &model.Source{
				OpenDota:   "OpenDota API — https://www.opendota.com",
				Liquipedia: "placements/призовые/ростеры — deferred (нет доступа Liquipedia)",
			},
			Formats: manifestFormats(events),
			Counts: map[string]int{
				"events": len(events), "heroes": len(heroes), "packs": len(packs), "players": len(players),
			},
		},
		Events:                events,
		Heroes:                heroes,
		Packs:                 packs,
		Players:               players,
		PlayerHeroStats:       in.Aggregates.PlayerHeroStats,
		CareerPlayerHeroStats: in.Aggregates.CareerPlayerHeroStats,
		Teammates:             in.Aggregates.Teammates,
		SquadSynergy:          in.Aggregates.SquadSynergy,
		EventHeroStats:        eventHeroStats,
		TeamSuccess:           teamSuccess,
	}
	return ds, nil
}

// PackPlayerAccounts — аккаунты, попадающие в паки, прямо из снапшота: роли (roles.Infer)
// и события (BuildEvents) выводятся внутри, поэтому пул считается до сетевого career/peers.
// Позволяет обогащать только пак-игроков — полное окно (~1500 игроков) в дневной бюджет не
// влезает, а непаковые аккаунты в датасет всё равно не попадают.
func PackPlayerAccounts(snapshot *normalize.OpenDotaSnapshot, leagues []opendota.League, asOf time.Time, minEventMatches int) map[int]struct{} {
	matches := snapshot.Matches
	roleByAccount := make(map[int]model.Role)
	for _, pr := range roles.Infer(matches) {
		roleByAccount[pr.AccountID] = pr.PrimaryRole
	}
	events := BuildEvents(matches, leagues, asOf, minEventMatches)
	return PackPlayerIDs(matches, events, roleByAccount)
}

func convertHeroes(heroes []opendota.Hero) []model.Hero {
	out := make([]model.Hero, 0, len(heroes))
	for _, hero := range heroes {
		if hero.ID <= 0 {
			continue
		}
		name := hero.LocalizedName
		if name == "" {
			name = hero.Name
		}
		out = append(out, model.Hero{
			ID:      hero.ID,
			Name:    name,
			Picture: strings.TrimPrefix(hero.Name, "npc_dota_hero_"),
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// buildEventHeroStats — event → account → hero → {games, winrate} из appearances.
func buildEventHeroStats(matches []normalize.NormalizedMatch, events []model.EventInfo) map[string]map[string]map[string]model.Stat {
	leagueToEvent := make(map[int64]string, len(events))
	for _, event := range events {
		if leagueID, ok := parseLeagueID(event.ID); ok {
			leagueToEvent[leagueID] = event.ID
		}
	}
	type counter struct{ games, wins int }
	acc := make(map[string]map[int]map[int]*counter)
	for _, match := range matches {
		eventID, ok := leagueToEvent[match.LeagueID]
		if !ok {
			continue
		}
		if acc[eventID] == nil {
			acc[eventID] = make(map[int]map[int]*counter)
		}
		for _, app := range match.Players {
			if app.HeroID <= 0 {
				continue
			}
			if acc[eventID][app.AccountID] == nil {
				acc[eventID][app.AccountID] = make(map[int]*counter)
			}
			c := acc[eventID][app.AccountID][app.HeroID]
			if c == nil {
				c = &counter{}
				acc[eventID][app.AccountID][app.HeroID] = c
			}
			c.games++
			if teamWon(match, app.TeamID) {
				c.wins++
			}
		}
	}
	out := make(map[string]map[string]map[string]model.Stat, len(acc))
	for eventID, byAccount := range acc {
		out[eventID] = make(map[string]map[string]model.Stat, len(byAccount))
		for accountID, byHero := range byAccount {
			heroStats := make(map[string]model.Stat, len(byHero))
			for heroID, c := range byHero {
				heroStats[strconv.Itoa(heroID)] = model.Stat{Games: c.games, Winrate: round4(float64(c.wins) / float64(c.games))}
			}
			out[eventID][strconv.Itoa(accountID)] = heroStats
		}
	}
	return out
}

func teamWon(match normalize.NormalizedMatch, teamID int) bool {
	if teamID == match.RadiantTeamID {
		return match.RadiantWin
	}
	return !match.RadiantWin
}

func manifestFormats(events []model.EventInfo) []model.Format {
	seen := make(map[model.Format]struct{})
	for _, event := range events {
		for _, format := range event.Formats {
			seen[format] = struct{}{}
		}
	}
	order := []model.Format{model.Last1y, model.Last2y, model.Last5y, model.ValveLegacy}
	out := make([]model.Format, 0, len(seen))
	for _, format := range order {
		if _, ok := seen[format]; ok {
			out = append(out, format)
		}
	}
	return out
}
