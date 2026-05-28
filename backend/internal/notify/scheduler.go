// Package notify polls the notifications table and dispatches Teams webhooks
// for due rows.
package notify

import (
	"context"
	"log/slog"
	"time"

	"github.com/yourorg/releaseradar/internal/store"
	"github.com/yourorg/releaseradar/internal/teams"
)

type Scheduler struct {
	repo   *store.Repository
	teams  *teams.Client
	logger *slog.Logger
	tick   time.Duration
}

func NewScheduler(repo *store.Repository, teams *teams.Client, logger *slog.Logger, tick time.Duration) *Scheduler {
	if tick <= 0 {
		tick = 30 * time.Second
	}
	return &Scheduler{repo: repo, teams: teams, logger: logger, tick: tick}
}

// Run blocks until ctx is canceled. Polling-based by design — Postgres NOTIFY
// would be lighter but keeps deployment to a single binary.
func (s *Scheduler) Run(ctx context.Context) {
	t := time.NewTicker(s.tick)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.dispatch(ctx)
		}
	}
}

func (s *Scheduler) dispatch(ctx context.Context) {
	pending, err := s.repo.PendingNotifications(ctx, time.Now())
	if err != nil {
		s.logger.Error("pending notifications", "err", err)
		return
	}
	for _, n := range pending {
		r, err := s.repo.Rollout(ctx, n.RolloutID)
		if err != nil {
			_ = s.repo.MarkNotificationSent(ctx, n.ID, err.Error())
			continue
		}
		if n.StageSeq >= len(r.Stages) {
			_ = s.repo.MarkNotificationSent(ctx, n.ID, "stage out of range")
			continue
		}
		stage := r.Stages[n.StageSeq]
		advance := stage.StartAt.Sub(time.Now())
		if err := s.teams.AnnounceStage(ctx, n.Channel, r, stage, advance); err != nil {
			s.logger.Warn("teams announce", "rollout", r.ID, "stage", n.StageSeq, "err", err)
			_ = s.repo.MarkNotificationSent(ctx, n.ID, err.Error())
			continue
		}
		_ = s.repo.MarkNotificationSent(ctx, n.ID, "")
	}
}
