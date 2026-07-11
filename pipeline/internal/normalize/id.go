// Package normalize converts source identifiers into the canonical data contract.
package normalize

import (
	"fmt"
	"math"
)

const SteamID64Base uint64 = 76561197960265728

// AccountID resolves an OpenDota account_id, optionally cross-checking SteamID64.
func AccountID(accountID *int64, steamID64 *uint64) (int, error) {
	var fromSteam *uint64
	if steamID64 != nil {
		if *steamID64 < SteamID64Base {
			return 0, fmt.Errorf("invalid steamId64 %d", *steamID64)
		}
		value := *steamID64 - SteamID64Base
		fromSteam = &value
	}
	if accountID == nil && fromSteam == nil {
		return 0, fmt.Errorf("player has neither accountId nor steamId64")
	}
	var canonical uint64
	if accountID != nil {
		if *accountID <= 0 || uint64(*accountID) > math.MaxUint32 {
			return 0, fmt.Errorf("invalid accountId %d", *accountID)
		}
		canonical = uint64(*accountID)
	}
	if fromSteam != nil {
		if *fromSteam == 0 || *fromSteam > math.MaxUint32 {
			return 0, fmt.Errorf("steamId64 resolves outside accountId range: %d", *fromSteam)
		}
		if canonical != 0 && canonical != *fromSteam {
			return 0, fmt.Errorf("accountId %d conflicts with steamId64 (%d)", canonical, *fromSteam)
		}
		canonical = *fromSteam
	}
	return int(canonical), nil
}

// UniqueAccountIDs rejects duplicate canonical players before aggregation.
func UniqueAccountIDs(ids []int) error {
	seen := make(map[int]struct{}, len(ids))
	for _, id := range ids {
		if id <= 0 {
			return fmt.Errorf("invalid accountId %d", id)
		}
		if _, exists := seen[id]; exists {
			return fmt.Errorf("duplicate accountId %d", id)
		}
		seen[id] = struct{}{}
	}
	return nil
}
