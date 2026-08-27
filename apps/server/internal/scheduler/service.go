// Package scheduler owns the bounded timer loop around persisted plans. It
// has no tenant-selection logic; the plan service already fixes that boundary.
package scheduler

import (
	"context"
	"time"

	"cloud.lazycat.app.backup/apps/server/internal/plans"
)

type Service struct {
	plans    *plans.Service
	interval time.Duration
}

func New(planService *plans.Service, interval time.Duration) *Service {
	if interval <= 0 {
		interval = 15 * time.Second
	}
	return &Service{plans: planService, interval: interval}
}

func (s *Service) Start(ctx context.Context) {
	go func() {
		_ = s.plans.RunDue(context.Background(), time.Now().UTC())
		ticker := time.NewTicker(s.interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case now := <-ticker.C:
				_ = s.plans.RunDue(context.Background(), now.UTC())
			}
		}
	}()
}

func (s *Service) RunNow(ctx context.Context, now time.Time) error {
	return s.plans.RunDue(ctx, now.UTC())
}
