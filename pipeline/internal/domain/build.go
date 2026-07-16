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
	"github.com/aegis-draft/pipeline/internal/tier1"
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

// legacyStageGapDays — разрыв в днях, с которого матчи считаются другой стадией лиги.
// Квалы TI отделены от мейн-ивента неделями (TI2015: квалы май, мейн — конец июля, разрыв 55
// дней), а перерыв внутри мейна между группами и плей-офф — 2-3 дня. 14 дней разводит их с
// запасом: результат одинаков при 7, 14 и 30 (проверено на TI2014..TI2023).
const legacyStageGapDays = 14

// mainEventMatches — матчи ПОСЛЕДНЕГО непрерывного блока лиги, то есть основного турнира.
// Зачем: в OpenDota квалификации сидят ВНУТРИ того же leagueId, что и мейн-ивент, — у TI2015
// 59 команд вместо 16, у TI2017 — 70 вместо 18. Фильтр по имени (tier1.IsTier1) их не берёт,
// он отсекает лишь отдельные квал-турниры. Отделять по числу игр нельзя: в квалах тоже
// round-robin, 48 из 58 команд TI2015 имеют >=8 игр. А вот по датам блок отбивается чисто —
// TI2014 53→19, TI2018 55→18, TI2019 59→18, TI2021 88→18 (все в точку).
//
// ВНИМАНИЕ: правило не универсально. Если квалы шли без разрыва с мейном (ESL One Fall 2021:
// один блок, 121 команда), оно не поможет — для таких нужна стадия матча, которой OpenDota не
// отдаёт. Поэтому применяем только к legacy-лигам, где эффект замерен.
func mainEventMatches(matches []normalize.NormalizedMatch) []normalize.NormalizedMatch {
	if len(matches) < 2 {
		return matches
	}
	sorted := make([]normalize.NormalizedMatch, len(matches))
	copy(sorted, matches)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].StartTime < sorted[j].StartTime })
	gap := int64(legacyStageGapDays) * 24 * 60 * 60
	start := 0
	for i := 1; i < len(sorted); i++ {
		if sorted[i].StartTime-sorted[i-1].StartTime > gap {
			start = i
		}
	}
	return sorted[start:]
}

// FilterMatchesByWindow оставляет матчи с startTime >= windowStart (0 = без фильтра),
// НО пропускает valve_legacy-лиги (все TI + Valve Major) независимо от окна: формат
// valve_legacy обещает «все TI за всю историю», а rolling-окно (last_5y) резало их до
// 2021 года. Коллектор такие лиги специально тянет всей историей (WindowStartUnix: 0),
// и раньше этот фильтр их тут же выбрасывал — TI2011..TI2019 не доживали до BuildEvents.
// От legacy-лиги берём только мейн-ивент (mainEventMatches) — иначе вместе с TI приезжают
// его же квалы, сидящие под тем же leagueId.
func FilterMatchesByWindow(matches []normalize.NormalizedMatch, windowStart int64, leagues []opendota.League) []normalize.NormalizedMatch {
	if windowStart <= 0 {
		out := make([]normalize.NormalizedMatch, len(matches))
		copy(out, matches)
		return out
	}
	legacy := make(map[int64]struct{})
	for _, league := range leagues {
		if tier1.IsValveLegacy(league.LeagueID, league.Name) {
			legacy[league.LeagueID] = struct{}{}
		}
	}
	byLegacyLeague := make(map[int64][]normalize.NormalizedMatch)
	out := make([]normalize.NormalizedMatch, 0, len(matches))
	for _, match := range matches {
		if _, isLegacy := legacy[match.LeagueID]; isLegacy {
			byLegacyLeague[match.LeagueID] = append(byLegacyLeague[match.LeagueID], match)
			continue
		}
		if match.StartTime >= windowStart {
			out = append(out, match)
		}
	}
	leagueIDs := make([]int64, 0, len(byLegacyLeague))
	for id := range byLegacyLeague {
		leagueIDs = append(leagueIDs, id)
	}
	sort.Slice(leagueIDs, func(i, j int) bool { return leagueIDs[i] < leagueIDs[j] })
	for _, id := range leagueIDs {
		out = append(out, mainEventMatches(byLegacyLeague[id])...)
	}
	return out
}

// Build собирает полный model.Dataset из OpenDota-входов. Чистый и детерминированный.
// Liquipedia-зависимые поля (placements/prize/valve_legacy) остаются deferred.
func Build(in Input) (*model.Dataset, error) {
	matches := FilterMatchesByWindow(in.Snapshot.Matches, in.WindowStartUnix, in.Leagues)
	// Глобальные роли нужны ТОЛЬКО для players[].primaryRole/rolesPlayed (справочник игрока).
	// Паки и когорты рейтинга берут роли на событии — см. selectRoster/BuildEventRatings.
	rolesList := roles.Infer(matches)
	nickByAccount := make(map[int]string, len(in.Snapshot.Players))
	for _, player := range in.Snapshot.Players {
		nickByAccount[player.AccountID] = nicknameOf(player)
	}

	events := BuildEvents(matches, in.Leagues, in.AsOf, in.MinEventMatches)
	// Base = per-event (PRD §5.4.1): OVR игрока в паке = его форма на ЭТОМ турнире, не глобально.
	eventRatings, err := BuildEventRatings(matches, events, in.Config)
	if err != nil {
		return nil, err
	}
	packs := BuildPacks(matches, events, eventRatings, nickByAccount, in.Teams)
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

// PackPlayerAccounts — аккаунты, попадающие в паки, прямо из снапшота: роли и события
// (BuildEvents) выводятся внутри, поэтому пул считается до сетевого career/peers.
// Позволяет обогащать только пак-игроков — полное окно (~1500 игроков) в дневной бюджет не
// влезает, а непаковые аккаунты в датасет всё равно не попадают.
func PackPlayerAccounts(snapshot *normalize.OpenDotaSnapshot, leagues []opendota.League, asOf time.Time, minEventMatches int) map[int]struct{} {
	matches := snapshot.Matches
	events := BuildEvents(matches, leagues, asOf, minEventMatches)
	return PackPlayerIDs(matches, events)
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
