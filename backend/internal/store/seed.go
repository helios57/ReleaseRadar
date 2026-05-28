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
		{ID: "microservices", Name: "micro services", Owner: "Platform Core", Brokers: []string{"frontend", "appluser", "monitoring", "eks-info", "solace-exporter", "ca", "message-duplication"}},
	}
	for _, p := range products {
		if err := repo.UpsertProduct(ctx, p); err != nil {
			return fmt.Errorf("seed product %s: %w", p.ID, err)
		}
	}

	// Rollout types — one per spec entry. DelayProd1/DelayProd2 capture the
	// minimum advance between cascade stages; CascadePlan drives the timeline.
	hour := time.Hour
	day := 24 * hour
	manualCheck := "Manuelle Nachkontrolle der Applikation + Logs"
	brokerDiff := "Run broker diff on all brokers (vor Aufheben des Maintenance Mode)"
	types := []domain.RolloutType{
		{
			ID: "tms-ssp-nc", Name: "tms-ssp non-critical", Short: "non-critical", Tone: domain.ToneNeutral,
			CascadePlan: []domain.CascadeStage{{Stage: "non-prod", DelayHours: 0}},
			Announce:    "Ankündigen in TMS_PROD min. 1h vorab",
			Rules:       []string{"Micro-Service Rollout — ein Bug kann keinen Einfluss auf die Produktion haben", manualCheck},
			Tasks:       []string{"Announce in TMS_PROD (≥ 1h)", "Deploy", manualCheck},
		},
		{
			ID: "tms-ssp-c", Name: "tms-ssp critical", Short: "critical", Tone: domain.ToneWarn,
			CascadePlan: []domain.CascadeStage{{Stage: "non-prod", DelayHours: 0}},
			Announce:    "Ankündigen in TMS_PROD min. 1d vorab",
			Rules:       []string{"Default risk: Deployment and broker creation will be disabled for <time_range_of_rollout>", "Maintenance mode aktiv", "Rollout im Pair", "Eventuell individuelles Rollout-Drehbuch"},
			Tasks:       []string{"Announce in TMS_PROD (≥ 1d)", "Enable Maintenance Mode", "Deploy", brokerDiff, "Lift Maintenance Mode", manualCheck},
		},
		{
			ID: "tms-ssp-c-hotfix", Name: "tms-ssp critical hotfix", Short: "critical hotfix", Tone: domain.ToneDanger,
			CascadePlan: []domain.CascadeStage{{Stage: "non-prod", DelayHours: 0}},
			Announce:    "Ankündigen in TMS_PROD min. 1h vorab",
			Rules:       []string{"via HotFix branch", "Vorab Pair-Review um Risiko abzuschätzen", "Maintenance mode aktiv", "Rollout im Pair", "Eventuell individuelles Rollout-Drehbuch"},
			Tasks:       []string{"Pair review (Risikoabschätzung)", "Announce in TMS_PROD (≥ 1h)", "Enable Maintenance Mode", "Deploy hotfix", brokerDiff, "Lift Maintenance Mode", manualCheck},
		},
		{
			ID: "concentrator-mod", Name: "concentrator modification", Short: "concentrator mod", Tone: domain.ToneWarn,
			DelayProd1: 7 * day, DelayProd2: 14 * day,
			CascadePlan: []domain.CascadeStage{
				{Stage: "non-prod", DelayHours: 0},
				{Stage: "prod1", DelayHours: 168},
				{Stage: "prod2", DelayHours: 336},
			},
			Announce: "TMS_NP 1d (non-prod) • TMS_PROD 1w (prod1) • TMS_PROD 2w (prod2)",
			Rules:    []string{"Individuelles Rollout-Drehbuch erforderlich", "Maintenance mode aktiv", "Rollout im Pair"},
			Tasks:    []string{"Announce in TMS_NP (≥ 1d)", "Announce in TMS_PROD (≥ 1w prod1 / ≥ 2w prod2)", "Enable Maintenance Mode", "Apply modification", brokerDiff, "Lift Maintenance Mode", manualCheck},
		},
		{
			ID: "operator-feature", Name: "operator feature (oracle & solace)", Short: "operator feature", Tone: domain.ToneInfo,
			DelayProd1: 7 * day, DelayProd2: 14 * day,
			CascadePlan: []domain.CascadeStage{
				{Stage: "non-prod", DelayHours: 0},
				{Stage: "prod1", DelayHours: 168},
				{Stage: "prod2", DelayHours: 336},
			},
			Announce: "TMS_NP 1h (non-prod) • TMS_PROD 1w (prod1) • TMS_PROD 2w (prod2)",
			Rules:    []string{"Maintenance mode aktiv", "Rollout im Pair"},
			Tasks:    []string{"Announce in TMS_NP (≥ 1h)", "Announce in TMS_PROD (≥ 1w prod1 / ≥ 2w prod2)", "Enable Maintenance Mode", "Deploy operator (oracle & solace)", brokerDiff, "Lift Maintenance Mode", manualCheck},
		},
		{
			ID: "operator-c-hotfix", Name: "operator critical hotfix (oracle & solace)", Short: "operator hotfix", Tone: domain.ToneDanger,
			DelayProd1: 1 * day, DelayProd2: 2 * day,
			CascadePlan: []domain.CascadeStage{
				{Stage: "non-prod", DelayHours: 0},
				{Stage: "prod1", DelayHours: 24},
				{Stage: "prod2", DelayHours: 48},
			},
			Announce: "TMS_NP 1h (non-prod) • TMS_PROD 1d (prod1) • TMS_PROD 2d (prod2)",
			Rules:    []string{"via HotFix branch", "Maintenance mode aktiv", "Rollout im Pair"},
			Tasks:    []string{"Announce in TMS_NP (≥ 1h)", "Announce in TMS_PROD (≥ 1d prod1 / ≥ 2d prod2)", "Enable Maintenance Mode", "Deploy hotfix (oracle & solace)", brokerDiff, "Lift Maintenance Mode", manualCheck},
		},
		{
			ID: "operator-monalesy", Name: "operator (monalesy)", Short: "operator monalesy", Tone: domain.ToneInfo,
			DelayProd1: 1 * day, DelayProd2: 2 * day,
			CascadePlan: []domain.CascadeStage{
				{Stage: "non-prod", DelayHours: 0},
				{Stage: "prod1", DelayHours: 24},
				{Stage: "prod2", DelayHours: 48},
			},
			Announce: "TMS_NP 1h (non-prod) • TMS_PROD 1d (prod1) • TMS_PROD 2d (prod2)",
			Rules:    []string{"Rollout im Pair"},
			Tasks:    []string{"Announce in TMS_NP (≥ 1h)", "Announce in TMS_PROD (≥ 1d prod1 / ≥ 2d prod2)", "Deploy operator (monalesy)", manualCheck},
		},
		{
			ID: "monalesy-feature", Name: "monalesy feature", Short: "monalesy feature", Tone: domain.ToneInfo,
			CascadePlan: []domain.CascadeStage{{Stage: "non-prod", DelayHours: 0}},
			Announce:    "Ankündigen in TMS_PROD min. 1d vorab",
			Rules:       []string{"SNOW change / Anmeldung beim Kunden nötig (sobald prod-Komponenten betroffen sind)", "Rollout im Pair (sobald prod-Komponenten betroffen sind)"},
			Tasks:       []string{"Open SNOW change / Kundenanmeldung (sobald prod-Komponenten betroffen)", "Announce in TMS_PROD (≥ 1d)", "Deploy monalesy feature", manualCheck},
		},
		{
			ID: "monalesy-patch", Name: "monalesy patch", Short: "monalesy patch", Tone: domain.ToneNeutral,
			CascadePlan: []domain.CascadeStage{{Stage: "non-prod", DelayHours: 0}},
			Announce:    "Ankündigen in TMS_PROD min. 1h vorab",
			Rules:       []string{"SNOW change / Anmeldung beim Kunden nötig (sobald prod-Komponenten betroffen sind)", "Rollout im Pair (sobald prod-Komponenten betroffen sind)"},
			Tasks:       []string{"Open SNOW change / Kundenanmeldung (sobald prod-Komponenten betroffen)", "Announce in TMS_PROD (≥ 1h)", "Deploy monalesy patch", manualCheck},
		},
	}
	for _, t := range types {
		if err := repo.UpsertRolloutType(ctx, t); err != nil {
			return fmt.Errorf("seed type %s: %w", t.ID, err)
		}
	}

	// One demo rollout so the timeline isn't empty out of the box. The cascade
	// honors the operator-feature minimums: prod1 ≥ 1w after non-prod, prod2 ≥
	// 1w after prod1.
	now := time.Now().UTC()
	nonProd := now.Add(24 * hour)
	demo := domain.Rollout{
		ID:        "r-demo-1",
		ProductID: "operator",
		TypeID:    "operator-feature",
		Title:     "operator demo — broker auth refactor",
		DescExt:   "operator demo rollout. Customers may observe transient broker creation latency during the maintenance window.",
		DescInt:   "Includes demo oracle migration + solace exporter. Pair-reviewed.",
		Risks:     "Deployment + broker creation disabled for ~2h.",
		Stages: []domain.RolloutStage{
			{Env: "non-prod", StartAt: nonProd, Duration: 2 * hour, Status: domain.StatusScheduled},
			{Env: "prod1", StartAt: nonProd.Add(168 * hour), Duration: 2 * hour, Status: domain.StatusScheduled},
			{Env: "prod2", StartAt: nonProd.Add(336 * hour), Duration: 2 * hour, Status: domain.StatusScheduled},
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
