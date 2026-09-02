package platform

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
)

// FixtureCatalog is restricted to explicit local development configuration.
// It mirrors the production all-installed-app catalog and never receives a
// browser-provided path.
type FixtureCatalog struct{ Path string }

func (f FixtureCatalog) List(_ context.Context, tenantUID, backupAppID string) ([]Application, error) {
	data, err := os.ReadFile(f.Path)
	if err != nil {
		return nil, fmt.Errorf("read fixture catalog: %w", err)
	}
	var wrapped struct {
		Applications []Application `json:"applications"`
	}
	if err := json.Unmarshal(data, &wrapped); err != nil {
		if err := json.Unmarshal(data, &wrapped.Applications); err != nil {
			return nil, fmt.Errorf("decode fixture catalog: %w", err)
		}
	}
	result := make([]Application, 0, len(wrapped.Applications))
	for _, app := range wrapped.Applications {
		if app.OwnerUID != "" && app.AppID != backupAppID {
			result = append(result, app)
		}
	}
	return result, nil
}
