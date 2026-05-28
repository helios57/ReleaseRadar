package store

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/yourorg/releaseradar/internal/domain"
)

// SeedIfEmpty inserts a known-good demo dataset when the database has no
// products yet. Idempotent — re-running with data present is a no-op.
func SeedIfEmpty(ctx context.Context, repo *Repository) error {
	existing, err := repo.Products(ctx)
	if err != nil {
		return err
	}
	if len(existing) > 0 {
		return nil
	}

	// Products
	products := []domain.Product{
		{ID: "operator", Name: "operator", Owner: "Team Athena", Brokers: []string{"frankfurt-01", "frankfurt-02", "zeus-01", "zeus-02"}},
		{ID: "concentrator", Name: "concentrator", Owner: "Team Athena", Brokers: []string{"frankfurt-01", "frankfurt-02", "zeus-01", "zeus-02"}},
		{ID: "monalesy", Name: "monalesy", Owner: "Team Hermes", Brokers: []string{"mon-eu-1", "mon-eu-2"}},
		{ID: "microservices", Name: "micro services", Owner: "Platform Core", Brokers: []string{"frontend", "appluser", "monitoring"}},
	}
	for _, p := range products {
		if err := repo.UpsertProduct(ctx, p); err != nil {
			return fmt.Errorf("seed product %s: %w", p.ID, err)
		}
	}

	// Rollout types
	hour := time.Hour
	day := 24 * hour
	types := []domain.RolloutType{
		{
			ID: "tms-ssp-nc", Name: "tms-ssp non-critical", Short: "non-critical", Tone: domain.ToneNeutral,
			CascadePlan: []domain.CascadeStage{{Stage: "non-prod", DelayHours: 0}},
			Announce:    "Ankündigen in TMS_PROD min. 1h vorab",
			Rules:       []string{"Micro-Service Rollout — kein Einfluss auf Produktion möglich", "Manuelle Nachkontrolle der Applikation + Logs"},
			Tasks:       []string{"Announce in TMS_PROD (≥ 1h)", "Deploy to environment", "Manual log check", "Confirm green metrics"},
		},
		{
			ID: "tms-ssp-c", Name: "tms-ssp critical", Short: "critical", Tone: domain.ToneWarn,
			CascadePlan: []domain.CascadeStage{{Stage: "non-prod", DelayHours: 0}},
			Announce:    "Ankündigen in TMS_PROD min. 1d vorab",
			Rules:       []string{"Maintenance mode aktiv", "Rollout im Pair"},
			Tasks:       []string{"Announce in TMS_PROD (≥ 1d)", "Enable Maintenance Mode", "Deploy", "Lift Maintenance Mode"},
		},
		{
			ID: "operator-feature", Name: "operator feature", Short: "operator feature", Tone: domain.ToneInfo,
			DelayProd1: 7 * day, DelayProd2: 14 * day,
			CascadePlan: []domain.CascadeStage{
				{Stage: "non-prod", DelayHours: 0},
				{Stage: "prod1", DelayHours: 168},
				{Stage: "prod2", DelayHours: 336},
			},
			Announce: "TMS_NP 1h • TMS_PROD 1w (prod1) • TMS_PROD 2w (prod2)",
			Rules:    []string{"Maintenance mode aktiv", "Rollout im Pair"},
			Tasks:    []string{"Announce in TMS_NP (≥ 1h)", "Announce in TMS_PROD (≥ 1w)", "Enable Maintenance Mode", "Deploy operator", "Run broker diff", "Lift Maintenance Mode", "Manual log check"},
		},
		{
			ID: "concentrator-mod", Name: "concentrator modification", Short: "concentrator mod", Tone: domain.ToneWarn,
			DelayProd1: 7 * day, DelayProd2: 14 * day,
			CascadePlan: []domain.CascadeStage{
				{Stage: "non-prod", DelayHours: 0},
				{Stage: "prod1", DelayHours: 168},
				{Stage: "prod2", DelayHours: 336},
			},
			Announce: "TMS_NP 1d • TMS_PROD 1w (prod1) • TMS_PROD 2w (prod2)",
			Rules:    []string{"Individuelles Rollout-Drehbuch erforderlich", "Maintenance mode aktiv"},
			Tasks:    []string{"Announce in TMS_NP", "Announce in TMS_PROD", "Enable Maintenance Mode", "Apply mod", "Lift Maintenance Mode"},
		},
		{
			ID: "monalesy-patch", Name: "monalesy patch", Short: "monalesy patch", Tone: domain.ToneNeutral,
			CascadePlan: []domain.CascadeStage{{Stage: "non-prod", DelayHours: 0}},
			Announce:    "TMS_PROD 1h vorab",
			Rules:       []string{"SNOW change bei prod-Komponenten"},
			Tasks:       []string{"Open SNOW change (if prod)", "Announce in TMS_PROD (≥ 1h)", "Deploy patch", "Manual log check"},
		},
	}
	for _, t := range types {
		if err := repo.UpsertRolloutType(ctx, t); err != nil {
			return fmt.Errorf("seed type %s: %w", t.ID, err)
		}
	}

	// One demo rollout so the timeline isn't empty out of the box.
	now := time.Now().UTC()
	demo := domain.Rollout{
		ID:        "r-demo-1",
		ProductID: "operator",
		TypeID:    "operator-feature",
		Title:     "operator demo — broker auth refactor",
		DescExt:   "operator demo rollout. Customers may observe transient broker creation latency during the maintenance window.",
		DescInt:   "Includes demo oracle migration + solace exporter. Pair-reviewed.",
		Risks:     "Deployment + broker creation disabled for ~2h.",
		Stages: []domain.RolloutStage{
			{Env: "non-prod", StartAt: now.Add(24 * hour), Duration: 2 * hour, Status: domain.StatusScheduled},
			{Env: "prod1", StartAt: now.Add(7 * day), Duration: 2 * hour, Status: domain.StatusScheduled},
			{Env: "prod2", StartAt: now.Add(14 * day), Duration: 2 * hour, Status: domain.StatusScheduled},
		},
		Pair: []string{},
	}
	if _, err := repo.CreateRollout(ctx, demo); err != nil {
		return fmt.Errorf("seed demo rollout: %w", err)
	}
	return nil
}

// SeedFromJSONBytes lets tests inject a deterministic dataset.
func SeedFromJSONBytes(ctx context.Context, repo *Repository, payload []byte) error {
	var body struct {
		Products []domain.Product     `json:"products"`
		Types    []domain.RolloutType `json:"rolloutTypes"`
		Rollouts []domain.Rollout     `json:"rollouts"`
		Locks    []domain.Lock        `json:"locks"`
	}
	if err := json.Unmarshal(payload, &body); err != nil {
		return err
	}
	for _, p := range body.Products {
		if err := repo.UpsertProduct(ctx, p); err != nil {
			return err
		}
	}
	for _, t := range body.Types {
		if err := repo.UpsertRolloutType(ctx, t); err != nil {
			return err
		}
	}
	for _, r := range body.Rollouts {
		if _, err := repo.CreateRollout(ctx, r); err != nil && !strings.Contains(err.Error(), "duplicate") {
			return err
		}
	}
	for _, l := range body.Locks {
		if _, err := repo.CreateLock(ctx, l); err != nil && !strings.Contains(err.Error(), "duplicate") {
			return err
		}
	}
	return nil
}
