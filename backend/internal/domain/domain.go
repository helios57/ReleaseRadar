// Package domain defines core business entities. Stage durations use
// time.Duration; SQL columns store them as `INTERVAL` (Postgres) and are
// converted in the store layer.
package domain

import (
	"time"
)

type Role string

const (
	RoleAdmin    Role = "admin"
	RoleReadOnly Role = "readonly"
)

type Tone string

const (
	ToneNeutral Tone = "neutral"
	ToneInfo    Tone = "info"
	ToneWarn    Tone = "warn"
	ToneDanger  Tone = "danger"
	ToneOK      Tone = "ok"
)

type StageStatus string

const (
	StatusScheduled StageStatus = "scheduled"
	StatusActive    StageStatus = "active"
	StatusBlocked   StageStatus = "blocked"
	StatusDone      StageStatus = "done"
	StatusFailed    StageStatus = "failed"
)

// Actor — a user known to the system. Populated lazily from LDAP/SSO claims.
type Actor struct {
	ID       string `json:"id"`
	Email    string `json:"email"`
	Name     string `json:"name"`
	Initials string `json:"initials"`
	Hue      int    `json:"hue"`
	Role     Role   `json:"role"`
}

// Product is the deployable thing (operator, concentrator, monalesy, …).
type Product struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Owner   string   `json:"owner,omitempty"`
	Brokers []string `json:"brokers,omitempty"`
}

// RolloutType captures the cascade plan plus reusable rules + checklist tasks.
//
// Per spec: a RolloutType has DelayProd1 / DelayProd2 durations and inherits
// task descriptions to every Rollout that uses it.
type RolloutType struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Short       string         `json:"short"`
	Tone        Tone           `json:"tone"`
	DelayProd1  time.Duration  `json:"delayProd1Ns"`
	DelayProd2  time.Duration  `json:"delayProd2Ns"`
	CascadePlan []CascadeStage `json:"cascadePlan"`
	Announce    string         `json:"announce,omitempty"`
	Rules       []string       `json:"rules"`
	Tasks       []string       `json:"tasks"`
}

// CascadeStage is one entry in a rollout type's cascade plan.
type CascadeStage struct {
	Stage      string `json:"stage"`
	DelayHours int    `json:"delayHours"`
}

// Rollout — concrete scheduled deployment of a Product, derived from a RolloutType.
type Rollout struct {
	ID          string         `json:"id"`
	ProductID   string         `json:"product"`
	TypeID      string         `json:"typeId"`
	Title       string         `json:"title"`
	DescExt     string         `json:"descExt"`
	DescInt     string         `json:"descInt"`
	Risks       string         `json:"risks"`
	Stages      []RolloutStage `json:"stages"`
	Pair        []string       `json:"pair"`
	Tasks       []RolloutTask  `json:"tasks"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
	CreatedBy   string         `json:"createdBy"`
}

// RolloutStage — concrete dated entry (one per env in the cascade).
//
// Duration is wire-encoded as nanoseconds (Go's default time.Duration JSON
// representation). Consumers should divide by 3.6e12 to get hours.
type RolloutStage struct {
	Env      string        `json:"env"`
	StartAt  time.Time     `json:"startAt"`
	Duration time.Duration `json:"durationNs"`
	Status   StageStatus   `json:"status"`
}

// RolloutTask — inherited from RolloutType.Tasks plus a completion log entry.
type RolloutTask struct {
	Index       int        `json:"index"`
	Description string     `json:"description"`
	Status      string     `json:"status"`           // "", "done", "failed"
	Reason      string     `json:"reason,omitempty"`
	By          string     `json:"by,omitempty"`
	At          *time.Time `json:"at,omitempty"`
}

// Lock (Sperre) — blocks rollouts on a date range for a list of products.
type Lock struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Contact     string    `json:"contact"`
	StartAt     time.Time `json:"startAt"`
	EndAt       time.Time `json:"endAt"`
	Products    []string  `json:"products"`
	Kind        string    `json:"kind"` // "manual" | "holiday"
	CreatedBy   string    `json:"createdBy"`
	CreatedAt   time.Time `json:"createdAt"`
}
