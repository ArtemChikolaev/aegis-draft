package domain

import (
	"testing"
	"time"

	"github.com/aegis-draft/pipeline/internal/model"
	"github.com/aegis-draft/pipeline/internal/normalize"
	"github.com/aegis-draft/pipeline/internal/opendota"
	"github.com/aegis-draft/pipeline/internal/rating"
	"github.com/aegis-draft/pipeline/internal/roles"
)

type fplayer struct {
	acc, lane, hero, gpm int
	roaming              bool
}

func appearance(fp fplayer, teamID int) normalize.NormalizedAppearance {
	return normalize.NormalizedAppearance{
		AccountID: fp.acc, TeamID: teamID, HeroID: fp.hero, LaneRole: fp.lane, IsRoaming: fp.roaming,
		Kills: 3, Deaths: 3, Assists: 5, GoldPerMin: fp.gpm, XPPerMin: fp.gpm - 40,
		LastHits: fp.gpm / 5, HeroDamage: 12000,
	}
}

func packMatch(id int64, radiant, dire []fplayer, radiantTeam, direTeam int) normalize.NormalizedMatch {
	players := make([]normalize.NormalizedAppearance, 0, 10)
	for _, fp := range radiant {
		players = append(players, appearance(fp, radiantTeam))
	}
	for _, fp := range dire {
		players = append(players, appearance(fp, direTeam))
	}
	return normalize.NormalizedMatch{
		MatchID: id, LeagueID: 100, StartTime: time.Date(2025, 9, 10, 0, 0, 0, 0, time.UTC).Unix(),
		Duration: 2400, RadiantTeamID: radiantTeam, DireTeamID: direTeam, RadiantWin: id%2 == 0, Players: players,
	}
}

var (
	team10 = []fplayer{{1, 1, 44, 600, false}, {2, 2, 74, 550, false}, {3, 3, 114, 450, false}, {4, 1, 26, 250, false}, {5, 3, 5, 200, true}}
	team20 = []fplayer{{21, 1, 1, 610, false}, {22, 2, 11, 540, false}, {23, 3, 41, 440, false}, {24, 1, 87, 240, false}, {25, 3, 128, 190, true}}
	sub10  = []fplayer{{1, 1, 44, 600, false}, {2, 2, 74, 550, false}, {3, 3, 114, 450, false}, {4, 1, 26, 250, false}, {6, 3, 8, 300, true}}
)

func fixtureMatches() []normalize.NormalizedMatch {
	return []normalize.NormalizedMatch{
		packMatch(1, team10, team20, 10, 20),
		packMatch(2, team10, team20, 10, 20),
		packMatch(3, team10, team20, 10, 20),
		packMatch(4, sub10, team20, 10, 20), // acc6 подменяет acc5 в одном матче
	}
}

// alsoAt повторяет матчи на втором событии. Гейт присутствия (minEventsInWindow) требует от
// команды двух событий окна, поэтому односерийная фикстура выпала бы из пула целиком — а эти
// тесты про ростер и роли, не про гейт (для него — TestBuildPacksGatesOneOffTeams).
func alsoAt(matches []normalize.NormalizedMatch, leagueID int64) []normalize.NormalizedMatch {
	out := append([]normalize.NormalizedMatch(nil), matches...)
	for _, m := range matches {
		copied := m
		copied.MatchID += 10000
		copied.LeagueID = leagueID
		out = append(out, copied)
	}
	return out
}

func fixtureSnapshot() *normalize.OpenDotaSnapshot {
	return &normalize.OpenDotaSnapshot{Players: []normalize.NormalizedPlayer{
		{AccountID: 1, Name: "Ace", TeamIDs: []int{10}},
		{AccountID: 2, Name: "Mid2", TeamIDs: []int{10}},
		{AccountID: 5, Name: "Sup5", TeamIDs: []int{10}},
		{AccountID: 6, Name: "Sub6", TeamIDs: []int{10}},
	}}
}

var fixtureTeams = []opendota.Team{{TeamID: 10, Name: "Alpha", Tag: "AL"}, {TeamID: 20, Name: "Bravo", Tag: "BR"}}

func TestBuildPacksRealLineup(t *testing.T) {
	matches := alsoAt(fixtureMatches(), 200)
	events := BuildEvents(matches, testLeagues, asOf(), 0)
	eventRatings, err := BuildEventRatings(matches, events, rating.Default())
	if err != nil {
		t.Fatalf("BuildEventRatings: %v", err)
	}
	nickByAccount := map[int]string{}
	for _, p := range fixtureSnapshot().Players {
		nickByAccount[p.AccountID] = p.Name
	}
	packs := BuildPacks(matches, events, eventRatings, nickByAccount, fixtureTeams)

	if len(packs) != 4 {
		t.Fatalf("expected 4 packs (team10/team20 × 2 события), got %d", len(packs))
	}
	var alpha model.Pack
	for _, p := range packs {
		if p.TeamID == 10 && p.EventID == "league-100" {
			alpha = p
		}
	}
	if alpha.TeamName != "Alpha" || alpha.Tag != "AL" || alpha.EventID != "league-100" {
		t.Fatalf("alpha pack meta: %+v", alpha)
	}
	if len(alpha.Players) != rosterSize {
		t.Fatalf("alpha roster size %d, want 5", len(alpha.Players))
	}
	for _, pl := range alpha.Players {
		if pl.AccountID == 6 {
			t.Fatal("substitute acc6 should be excluded from core roster")
		}
		if pl.OVR < 0 || pl.OVR > 100 {
			t.Fatalf("player %d OVR out of range: %d", pl.AccountID, pl.OVR)
		}
	}
	if len(alpha.SignatureHeroes) == 0 {
		t.Fatal("expected signature heroes")
	}
}

func TestBuildEventRatingsPerEvent(t *testing.T) {
	// Один игрок (acc 1, carry) в двух событиях: на league-100 отыграл сильно (GPM 700),
	// на league-200 — слабо (GPM 300). Per-event ⇒ OVR на сильном событии выше слабого
	// (глобальный рейтинг дал бы одинаковый — это и есть суть фикса).
	strong := []fplayer{{1, 1, 44, 700, false}, {2, 2, 74, 650, false}, {3, 3, 114, 550, false}, {4, 1, 26, 350, false}, {5, 3, 5, 300, true}}
	weak := []fplayer{{1, 1, 44, 300, false}, {2, 2, 74, 280, false}, {3, 3, 114, 240, false}, {4, 1, 26, 180, false}, {5, 3, 5, 150, true}}
	var matches []normalize.NormalizedMatch
	for i := 0; i < 8; i++ {
		mA := packMatch(int64(100+i), strong, team20, 10, 20)
		mA.LeagueID = 100
		mB := packMatch(int64(300+i), weak, team20, 10, 20)
		mB.LeagueID = 200
		matches = append(matches, mA, mB)
	}
	events := BuildEvents(matches, testLeagues, asOf(), 0)
	er, err := BuildEventRatings(matches, events, rating.Default())
	if err != nil {
		t.Fatalf("BuildEventRatings: %v", err)
	}
	winOVR := er["league-100"][1].OVR
	loseOVR := er["league-200"][1].OVR
	if winOVR <= loseOVR {
		t.Fatalf("per-event: OVR на сильном событии (%d) должен быть выше слабого (%d)", winOVR, loseOVR)
	}
}

func TestPackPlayerIDs(t *testing.T) {
	matches := alsoAt(fixtureMatches(), 200)
	events := BuildEvents(matches, testLeagues, asOf(), 0)
	ids := PackPlayerIDs(matches, events)

	// Оба core-ростера (team10 1..5, team20 21..25) = 10 аккаунтов; стенд-ин acc6 исключён.
	if len(ids) != 10 {
		t.Fatalf("expected 10 pack players, got %d: %v", len(ids), ids)
	}
	if _, ok := ids[6]; ok {
		t.Fatal("substitute acc6 must not be a pack player")
	}
	for _, want := range []int{1, 2, 3, 4, 5, 21, 22, 23, 24, 25} {
		if _, ok := ids[want]; !ok {
			t.Fatalf("core roster account %d missing from pack players", want)
		}
	}
}

func TestBuildPlayersProfiles(t *testing.T) {
	matches := fixtureMatches()
	rolesList := roles.Infer(matches)
	players := BuildPlayers(fixtureSnapshot(), rolesList, fixtureTeams, matches)

	ace, ok := players["1"]
	if !ok {
		t.Fatal("player 1 missing")
	}
	if ace.Nickname != "Ace" || ace.PrimaryRole != model.RoleSafelane {
		t.Fatalf("player 1 profile: %+v", ace)
	}
	if len(ace.Teams) != 1 || ace.Teams[0].TeamID != 10 || ace.Teams[0].TeamName != "Alpha" || ace.Teams[0].Games != 4 {
		t.Fatalf("player 1 teams: %+v", ace.Teams)
	}
}

// Регрессия v1.7.0: состав пака строился по ГЛОБАЛЬНОМУ primaryRole. Если по всей выборке
// два игрока команды сходятся в одну роль, у состава на событии выходило два офлейна и ноль
// мидов, и пак выбрасывался целиком (13 команд на TI2021 вместо 18).
//
// На league-100 team30 играет нормально (31 safe, 32 mid, 33 off). Но на league-200 acc32 и
// acc33 играют офлейн в РАЗНЫХ командах ⇒ глобально оба офлейнеры ⇒ у team30 нет мида.
func TestBuildPacksUsesEventRolesNotGlobalPrimaryRole(t *testing.T) {
	atEvent := []fplayer{{31, 1, 44, 600, false}, {32, 2, 74, 550, false}, {33, 3, 114, 450, false}, {34, 1, 26, 250, false}, {35, 3, 5, 200, true}}
	// Составы на league-200: acc32 и acc33 — офлейнеры в разных командах.
	off32 := []fplayer{{32, 3, 74, 450, false}, {41, 1, 44, 600, false}, {42, 2, 11, 550, false}, {43, 1, 26, 250, false}, {44, 3, 5, 200, true}}
	off33 := []fplayer{{33, 3, 114, 450, false}, {51, 1, 44, 600, false}, {52, 2, 11, 550, false}, {53, 1, 26, 250, false}, {54, 3, 5, 200, true}}

	var matches []normalize.NormalizedMatch
	for i := 0; i < 3; i++ {
		matches = append(matches, packMatch(int64(500+i), atEvent, team20, 30, 20))
	}
	// Гейт присутствия: без второго события окна пак team30 не эмитится вовсе, и тест
	// проверял бы не роли, а гейт. На глобальные роли acc32/acc33 это не влияет (проверка ниже).
	for i := 0; i < 2; i++ {
		second := packMatch(int64(550+i), atEvent, team20, 30, 20)
		second.LeagueID = 200
		matches = append(matches, second)
	}
	for i := 0; i < 9; i++ {
		a := packMatch(int64(600+i), off32, team20, 40, 20)
		a.LeagueID = 200
		b := packMatch(int64(700+i), off33, team20, 50, 20)
		b.LeagueID = 200
		matches = append(matches, a, b)
	}

	// Фикстура обязана воспроизводить баг: глобально оба — офлейн, мида у team30 нет.
	global := map[int]model.Role{}
	for _, pr := range roles.Infer(matches) {
		global[pr.AccountID] = pr.PrimaryRole
	}
	if global[32] != model.RoleOfflane || global[33] != model.RoleOfflane {
		t.Fatalf("фикстура не воспроизводит баг: глобальные роли acc32=%s acc33=%s, ожидались оба offlane", global[32], global[33])
	}

	events := BuildEvents(matches, testLeagues, asOf(), 0)
	eventRatings, err := BuildEventRatings(matches, events, rating.Default())
	if err != nil {
		t.Fatalf("BuildEventRatings: %v", err)
	}
	teams := append(fixtureTeams, opendota.Team{TeamID: 30, Name: "Charlie", Tag: "CH"})
	packs := BuildPacks(matches, events, eventRatings, map[int]string{}, teams)

	var pack model.Pack
	for _, p := range packs {
		if p.TeamID == 30 && p.EventID == "league-100" {
			pack = p
		}
	}
	if pack.ID == "" {
		t.Fatal("пак team30 на league-100 выброшен — роли на событии не применились")
	}
	byRole := map[model.Role]int{}
	for _, pl := range pack.Players {
		byRole[pl.Role]++
	}
	want := map[model.Role]int{model.RoleSafelane: 1, model.RoleMid: 1, model.RoleOfflane: 1, model.RoleSupport: 2}
	for role, n := range want {
		if byRole[role] != n {
			t.Errorf("роль %s: %d, ожидалось %d (состав: %v)", role, byRole[role], n, byRole)
		}
	}
	// Роль в паке — сыгранная НА СОБЫТИИ, а не глобальная.
	for _, pl := range pack.Players {
		if pl.AccountID == 32 && pl.Role != model.RoleMid {
			t.Errorf("acc32 на league-100 играл мид, в паке роль %s (глобальная — offlane)", pl.Role)
		}
	}
}

// Гейт присутствия (TDATA3): команда попадает в пул окна только с minEventsInWindow событий.
//
// Дефект, который он чинит, курируемый список имён (tier1.tier1Series) не видит принципиально:
// имя классифицирует СЕРИЮ, а качество является свойством розыгрыша. «Games of the Future 2025»
// — настоящая серия с полем из приглашённых стаков, и каждая её команда живёт ровно в одном
// событии. Гейт уносит такой розыгрыш целиком, не зная его имени.
func TestBuildPacksGatesOneOffTeams(t *testing.T) {
	// team10 играет оба события, team20 — только league-100 (разовый стак).
	other := []fplayer{{61, 1, 1, 610, false}, {62, 2, 11, 540, false}, {63, 3, 41, 440, false}, {64, 1, 87, 240, false}, {65, 3, 128, 190, true}}
	var matches []normalize.NormalizedMatch
	for i := 0; i < 3; i++ {
		matches = append(matches, packMatch(int64(800+i), team10, team20, 10, 20))
	}
	for i := 0; i < 3; i++ {
		second := packMatch(int64(900+i), team10, other, 10, 60)
		second.LeagueID = 200
		matches = append(matches, second)
	}

	events := BuildEvents(matches, testLeagues, asOf(), 0)
	eventRatings, err := BuildEventRatings(matches, events, rating.Default())
	if err != nil {
		t.Fatalf("BuildEventRatings: %v", err)
	}
	packs := BuildPacks(matches, events, eventRatings, map[int]string{}, fixtureTeams)

	byTeam := map[int]int{}
	for _, p := range packs {
		byTeam[p.TeamID]++
	}
	if byTeam[10] != 2 {
		t.Errorf("team10 отыграла два события — ожидались 2 пака, получено %d", byTeam[10])
	}
	if byTeam[20] != 0 {
		t.Errorf("team20 существует в одном событии — пак должен быть выброшен, получено %d", byTeam[20])
	}
	if byTeam[60] != 0 {
		t.Errorf("team60 существует в одном событии — пак должен быть выброшен, получено %d", byTeam[60])
	}
}

// Порог считается ОТДЕЛЬНО на окно: одна и та же команда бывает постоянной в last_5y и
// разовой в last_1y, и в узком окне её снапшот — шум. Общий счётчик по датасету пропустил бы
// её всюду, где она попала хоть куда-то.
func TestPackFormatsNarrowPerWindow(t *testing.T) {
	recent := time.Date(2025, 9, 10, 0, 0, 0, 0, time.UTC) // league-100: last_1y/2y/5y
	old := time.Date(2023, 8, 20, 0, 0, 0, 0, time.UTC)    // league-200: только last_5y

	var matches []normalize.NormalizedMatch
	for i := 0; i < 3; i++ {
		m := packMatch(int64(1100+i), team10, team20, 10, 20)
		m.StartTime = recent.Unix()
		matches = append(matches, m)
	}
	for i := 0; i < 3; i++ {
		m := packMatch(int64(1200+i), team10, team20, 10, 20)
		m.LeagueID, m.StartTime = 200, old.Unix()
		matches = append(matches, m)
	}

	events := BuildEvents(matches, testLeagues, asOf(), 0)
	eventRatings, err := BuildEventRatings(matches, events, rating.Default())
	if err != nil {
		t.Fatalf("BuildEventRatings: %v", err)
	}
	packs := BuildPacks(matches, events, eventRatings, map[int]string{}, fixtureTeams)

	var recentPack model.Pack
	for _, p := range packs {
		if p.TeamID == 10 && p.EventID == "league-100" {
			recentPack = p
		}
	}
	if recentPack.ID == "" {
		t.Fatal("пак team10 на league-100 выброшен целиком: в last_5y команда прошла гейт")
	}
	// В last_5y событий два ⇒ окно остаётся. В last_1y/2y событие ровно одно ⇒ отваливаются,
	// хотя у САМОГО события эти окна есть.
	if !hasFormat(recentPack.Formats, model.Last5y) {
		t.Errorf("last_5y должен остаться: %v", recentPack.Formats)
	}
	if hasFormat(recentPack.Formats, model.Last1y) || hasFormat(recentPack.Formats, model.Last2y) {
		t.Errorf("в last_1y/2y команда разовая — окна должны отпасть: %v", recentPack.Formats)
	}
	if !hasFormat(eventFormatsOf(events, "league-100"), model.Last1y) {
		t.Fatal("фикстура не воспроизводит случай: у события league-100 нет last_1y")
	}
}

func eventFormatsOf(events []model.EventInfo, id string) []model.Format {
	for _, event := range events {
		if event.ID == id {
			return event.Formats
		}
	}
	return nil
}
