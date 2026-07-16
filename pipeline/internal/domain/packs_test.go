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
	matches := fixtureMatches()
	rolesList := roles.Infer(matches)
	events := BuildEvents(matches, testLeagues, asOf(), 0)
	eventRatings, err := BuildEventRatings(matches, events, rolesList, rating.Default())
	if err != nil {
		t.Fatalf("BuildEventRatings: %v", err)
	}
	roleByAccount := map[int]model.Role{}
	nickByAccount := map[int]string{}
	for _, pr := range rolesList {
		roleByAccount[pr.AccountID] = pr.PrimaryRole
	}
	for _, p := range fixtureSnapshot().Players {
		nickByAccount[p.AccountID] = p.Name
	}
	packs := BuildPacks(matches, events, eventRatings, roleByAccount, nickByAccount, fixtureTeams)

	if len(packs) != 2 {
		t.Fatalf("expected 2 packs (team10, team20), got %d", len(packs))
	}
	var alpha model.Pack
	for _, p := range packs {
		if p.TeamID == 10 {
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
	rolesList := roles.Infer(matches)
	events := BuildEvents(matches, testLeagues, asOf(), 0)
	er, err := BuildEventRatings(matches, events, rolesList, rating.Default())
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
	matches := fixtureMatches()
	roleByAccount := map[int]model.Role{}
	for _, pr := range roles.Infer(matches) {
		roleByAccount[pr.AccountID] = pr.PrimaryRole
	}
	events := BuildEvents(matches, testLeagues, asOf(), 0)
	ids := PackPlayerIDs(matches, events, roleByAccount)

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
