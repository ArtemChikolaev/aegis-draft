// Package model — доменные типы пайплайна. Зеркало schema/*.schema.json (скилл data-contract).
// Источник правды — schema/. При расхождении правь схему, потом эти типы.
package model

type Role string

const (
	RoleSafelane Role = "safelane"
	RoleMid      Role = "mid"
	RoleOfflane  Role = "offlane"
	RoleSupport  Role = "support"
)

type Format string

const (
	Last1y      Format = "last_1y"
	Last2y      Format = "last_2y"
	Last5y      Format = "last_5y"
	ValveLegacy Format = "valve_legacy"
)

type Hero struct {
	ID      int    `json:"id"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

type EventInfo struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Short     string   `json:"short,omitempty"`
	Type      string   `json:"type"`
	Year      int      `json:"year,omitempty"`
	StartDate string   `json:"startDate"`
	EndDate   string   `json:"endDate,omitempty"`
	Patch     string   `json:"patch,omitempty"`
	PrizePool int      `json:"prizePool,omitempty"`
	Formats   []Format `json:"formats"`
}

type PackPlayer struct {
	AccountID   int    `json:"accountId"` // канонический OpenDota account_id (единый во всех файлах)
	Nickname    string `json:"nickname"`
	Role        Role   `json:"role"`
	OVR         int    `json:"ovr"`
	Impact      int    `json:"impact"`
	Economy     int    `json:"economy"`
	Reliability int    `json:"reliability"`
	Games       int    `json:"games"`
}

type Pack struct {
	ID              string       `json:"id"`
	EventID         string       `json:"eventId"`
	TeamID          int          `json:"teamId"`
	TeamName        string       `json:"teamName"`
	Tag             string       `json:"tag,omitempty"`
	LogoID          string       `json:"logoId,omitempty"`
	Placement       int          `json:"placement,omitempty"`
	Players         []PackPlayer `json:"players"`
	SignatureHeroes []int        `json:"signatureHeroes"`
}

type Stat struct {
	Games   int     `json:"games"`
	Winrate float64 `json:"winrate"`
}

type PlayerTeam struct {
	TeamID   int    `json:"teamId"`
	TeamName string `json:"teamName,omitempty"`
	Games    int    `json:"games"`
	From     string `json:"from,omitempty"`
	To       string `json:"to,omitempty"`
}

type PlayerPeak struct {
	OVR         int    `json:"ovr"`
	WindowStart string `json:"windowStart,omitempty"`
	WindowEnd   string `json:"windowEnd,omitempty"`
	Games       int    `json:"games,omitempty"`
}

type PlayerProfile struct {
	AccountID   int                 `json:"accountId"`
	Nickname    string              `json:"nickname"`
	PrimaryRole Role                `json:"primaryRole"`
	RolesPlayed []Role              `json:"rolesPlayed,omitempty"`
	Teams       []PlayerTeam        `json:"teams,omitempty"`
	Peak        map[Role]PlayerPeak `json:"peak,omitempty"`
}

type SquadPair struct {
	IDs     [2]int  `json:"ids"`
	Games   int     `json:"games"`
	Winrate float64 `json:"winrate"`
}

type TeamWindowSuccess struct {
	SuccessScore float64 `json:"successScore"`
	Titles       int     `json:"titles,omitempty"`
	TopFinishes  int     `json:"topFinishes,omitempty"`
	PrizeUsd     int     `json:"prizeUsd,omitempty"`
	Winrate      float64 `json:"winrate,omitempty"`
	TIPlacement  int     `json:"tiPlacement,omitempty"`
}

type Source struct {
	OpenDota   string `json:"opendota,omitempty"`
	Liquipedia string `json:"liquipedia,omitempty"`
}

type Manifest struct {
	SchemaVersion      int            `json:"schemaVersion"`
	RatingModelVersion string         `json:"ratingModelVersion"`
	BuiltAt            string         `json:"builtAt"`
	Source             *Source        `json:"source,omitempty"`
	Formats            []Format       `json:"formats"`
	Counts             map[string]int `json:"counts,omitempty"`
}

// Dataset — полный набор игровых данных (то, что эмитит пайплайн в web/public/data).
type Dataset struct {
	Manifest        Manifest
	Events          []EventInfo
	Heroes          []Hero
	Packs           []Pack
	Players         map[string]PlayerProfile
	PlayerHeroStats map[string]map[string]Stat
	Teammates       map[string][]int
	SquadSynergy    []SquadPair
	EventHeroStats  map[string]map[string]map[string]Stat
	TeamSuccess     map[string]map[Format]TeamWindowSuccess
}
