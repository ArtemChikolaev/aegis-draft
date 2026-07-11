// Package validate checks cross-file invariants and invokes the project JSON Schema validator.
package validate

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strconv"

	"github.com/aegis-draft/pipeline/internal/model"
)

func Dataset(ds *model.Dataset) error {
	if ds == nil {
		return fmt.Errorf("dataset is nil")
	}
	if ds.Manifest.SchemaVersion != 1 || ds.Manifest.RatingModelVersion == "" || ds.Manifest.BuiltAt == "" {
		return fmt.Errorf("manifest versions/builtAt are incomplete")
	}
	seenPacks := make(map[string]struct{}, len(ds.Packs))
	for _, pack := range ds.Packs {
		if pack.ID == "" || pack.EventID == "" || pack.TeamID <= 0 || pack.TeamName == "" {
			return fmt.Errorf("invalid pack identity: %+v", pack)
		}
		if _, exists := seenPacks[pack.ID]; exists {
			return fmt.Errorf("duplicate pack id %q", pack.ID)
		}
		seenPacks[pack.ID] = struct{}{}
		if len(pack.Players) < 5 {
			return fmt.Errorf("pack %s has %d players, need at least 5", pack.ID, len(pack.Players))
		}
		seenPlayers := make(map[int]struct{}, len(pack.Players))
		roles := map[model.Role]int{}
		for _, player := range pack.Players {
			if player.AccountID <= 0 {
				return fmt.Errorf("pack %s contains invalid accountId %d", pack.ID, player.AccountID)
			}
			if _, exists := seenPlayers[player.AccountID]; exists {
				return fmt.Errorf("pack %s contains duplicate accountId %d", pack.ID, player.AccountID)
			}
			seenPlayers[player.AccountID] = struct{}{}
			roles[player.Role]++
		}
		if roles[model.RoleSafelane] < 1 || roles[model.RoleMid] < 1 || roles[model.RoleOfflane] < 1 || roles[model.RoleSupport] < 2 {
			return fmt.Errorf("pack %s lacks required role coverage: %v", pack.ID, roles)
		}
	}
	for key, player := range ds.Players {
		if strconv.Itoa(player.AccountID) != key {
			return fmt.Errorf("players key %q does not match accountId %d", key, player.AccountID)
		}
	}
	counts := ds.Manifest.Counts
	actual := map[string]int{"events": len(ds.Events), "heroes": len(ds.Heroes), "packs": len(ds.Packs), "players": len(ds.Players)}
	for key, value := range actual {
		if declared, ok := counts[key]; ok && declared != value {
			return fmt.Errorf("manifest count %s=%d, actual=%d", key, declared, value)
		}
	}
	return nil
}

func RunNode(ctx context.Context, nodeBinary, script, dataDir string) error {
	if nodeBinary == "" {
		nodeBinary = "node"
	}
	command := exec.CommandContext(ctx, nodeBinary, script, dataDir)
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	if err := command.Run(); err != nil {
		return fmt.Errorf("JSON Schema validation failed: %w", err)
	}
	return nil
}
