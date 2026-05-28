package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/yourorg/releaseradar/internal/domain"
)

var ErrNotFound = errors.New("not found")

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// ---------- Actors ----------

func (r *Repository) UpsertActor(ctx context.Context, a domain.Actor) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO actors (id, email, name, initials, hue, role, last_login_at)
		VALUES ($1,$2,$3,$4,$5,$6, now())
		ON CONFLICT (id) DO UPDATE
		   SET email = EXCLUDED.email,
		       name  = EXCLUDED.name,
		       role  = EXCLUDED.role,
		       last_login_at = now()
	`, a.ID, a.Email, a.Name, a.Initials, a.Hue, string(a.Role))
	return err
}

func (r *Repository) Actor(ctx context.Context, id string) (domain.Actor, error) {
	var a domain.Actor
	var role string
	err := r.pool.QueryRow(ctx, `
		SELECT id, email, name, initials, hue, role FROM actors WHERE id = $1
	`, id).Scan(&a.ID, &a.Email, &a.Name, &a.Initials, &a.Hue, &role)
	if errors.Is(err, pgx.ErrNoRows) {
		return a, ErrNotFound
	}
	a.Role = domain.Role(role)
	return a, err
}

// ---------- Products ----------

func (r *Repository) Products(ctx context.Context) ([]domain.Product, error) {
	rows, err := r.pool.Query(ctx, `SELECT id, name, COALESCE(owner,''), brokers FROM products ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Product
	for rows.Next() {
		var p domain.Product
		if err := rows.Scan(&p.ID, &p.Name, &p.Owner, &p.Brokers); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *Repository) UpsertProduct(ctx context.Context, p domain.Product) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO products (id, name, owner, brokers) VALUES ($1,$2,$3,$4)
		ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, owner=EXCLUDED.owner, brokers=EXCLUDED.brokers
	`, p.ID, p.Name, p.Owner, p.Brokers)
	return err
}

// ---------- Rollout types ----------

func (r *Repository) RolloutTypes(ctx context.Context) ([]domain.RolloutType, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, name, short, tone, delay_prod1, delay_prod2,
		       cascade_plan, COALESCE(announce,''), rules
		FROM rollout_types ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.RolloutType
	for rows.Next() {
		var t domain.RolloutType
		var tone string
		var cascadeJSON []byte
		var d1, d2 time.Duration
		if err := rows.Scan(&t.ID, &t.Name, &t.Short, &tone, &d1, &d2, &cascadeJSON, &t.Announce, &t.Rules); err != nil {
			return nil, err
		}
		t.Tone = domain.Tone(tone)
		t.DelayProd1 = d1
		t.DelayProd2 = d2
		if len(cascadeJSON) > 0 {
			if err := json.Unmarshal(cascadeJSON, &t.CascadePlan); err != nil {
				return nil, fmt.Errorf("decode cascade for %s: %w", t.ID, err)
			}
		}
		t.Tasks, err = r.rolloutTypeTasks(ctx, t.ID)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (r *Repository) RolloutType(ctx context.Context, id string) (domain.RolloutType, error) {
	var t domain.RolloutType
	var tone string
	var cascadeJSON []byte
	var d1, d2 time.Duration
	err := r.pool.QueryRow(ctx, `
		SELECT id, name, short, tone, delay_prod1, delay_prod2, cascade_plan, COALESCE(announce,''), rules
		FROM rollout_types WHERE id = $1
	`, id).Scan(&t.ID, &t.Name, &t.Short, &tone, &d1, &d2, &cascadeJSON, &t.Announce, &t.Rules)
	if errors.Is(err, pgx.ErrNoRows) {
		return t, ErrNotFound
	}
	if err != nil {
		return t, err
	}
	t.Tone = domain.Tone(tone)
	t.DelayProd1 = d1
	t.DelayProd2 = d2
	if len(cascadeJSON) > 0 {
		if err := json.Unmarshal(cascadeJSON, &t.CascadePlan); err != nil {
			return t, err
		}
	}
	t.Tasks, err = r.rolloutTypeTasks(ctx, t.ID)
	return t, err
}

func (r *Repository) UpsertRolloutType(ctx context.Context, t domain.RolloutType) error {
	cascade, _ := json.Marshal(t.CascadePlan)
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `
		INSERT INTO rollout_types (id, name, short, tone, delay_prod1, delay_prod2, cascade_plan, announce, rules)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		ON CONFLICT (id) DO UPDATE SET
		    name = EXCLUDED.name, short = EXCLUDED.short, tone = EXCLUDED.tone,
		    delay_prod1 = EXCLUDED.delay_prod1, delay_prod2 = EXCLUDED.delay_prod2,
		    cascade_plan = EXCLUDED.cascade_plan, announce = EXCLUDED.announce, rules = EXCLUDED.rules
	`, t.ID, t.Name, t.Short, string(t.Tone), t.DelayProd1, t.DelayProd2, cascade, t.Announce, t.Rules); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `DELETE FROM rollout_type_tasks WHERE type_id = $1`, t.ID); err != nil {
		return err
	}
	for i, desc := range t.Tasks {
		if _, err := tx.Exec(ctx, `INSERT INTO rollout_type_tasks (type_id, seq, description) VALUES ($1,$2,$3)`,
			t.ID, i, desc); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (r *Repository) rolloutTypeTasks(ctx context.Context, typeID string) ([]string, error) {
	rows, err := r.pool.Query(ctx, `SELECT description FROM rollout_type_tasks WHERE type_id = $1 ORDER BY seq`, typeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var d string
		if err := rows.Scan(&d); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// ---------- Rollouts ----------

func (r *Repository) Rollouts(ctx context.Context) ([]domain.Rollout, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, product_id, type_id, title, desc_ext, desc_int, risks, created_at, updated_at, COALESCE(created_by,'')
		FROM rollouts ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Rollout
	for rows.Next() {
		var r0 domain.Rollout
		if err := rows.Scan(&r0.ID, &r0.ProductID, &r0.TypeID, &r0.Title,
			&r0.DescExt, &r0.DescInt, &r0.Risks,
			&r0.CreatedAt, &r0.UpdatedAt, &r0.CreatedBy); err != nil {
			return nil, err
		}
		out = append(out, r0)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range out {
		if err := r.hydrate(ctx, &out[i]); err != nil {
			return nil, err
		}
	}
	return out, nil
}

func (r *Repository) Rollout(ctx context.Context, id string) (domain.Rollout, error) {
	var r0 domain.Rollout
	err := r.pool.QueryRow(ctx, `
		SELECT id, product_id, type_id, title, desc_ext, desc_int, risks, created_at, updated_at, COALESCE(created_by,'')
		FROM rollouts WHERE id = $1
	`, id).Scan(&r0.ID, &r0.ProductID, &r0.TypeID, &r0.Title, &r0.DescExt, &r0.DescInt, &r0.Risks,
		&r0.CreatedAt, &r0.UpdatedAt, &r0.CreatedBy)
	if errors.Is(err, pgx.ErrNoRows) {
		return r0, ErrNotFound
	}
	if err != nil {
		return r0, err
	}
	return r0, r.hydrate(ctx, &r0)
}

func (r *Repository) hydrate(ctx context.Context, ro *domain.Rollout) error {
	// stages
	rows, err := r.pool.Query(ctx, `
		SELECT env, start_at, duration, status FROM rollout_stages WHERE rollout_id = $1 ORDER BY seq
	`, ro.ID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var s domain.RolloutStage
		var status string
		if err := rows.Scan(&s.Env, &s.StartAt, &s.Duration, &status); err != nil {
			rows.Close()
			return err
		}
		s.Status = domain.StageStatus(status)
		ro.Stages = append(ro.Stages, s)
	}
	rows.Close()

	// actors
	rows, err = r.pool.Query(ctx, `SELECT actor_id FROM rollout_actors WHERE rollout_id = $1`, ro.ID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ro.Pair = append(ro.Pair, id)
	}
	rows.Close()

	// tasks
	rows, err = r.pool.Query(ctx, `
		SELECT seq, description, status, reason, COALESCE(completed_by,''), completed_at
		FROM rollout_tasks WHERE rollout_id = $1 ORDER BY seq
	`, ro.ID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var t domain.RolloutTask
		var at *time.Time
		if err := rows.Scan(&t.Index, &t.Description, &t.Status, &t.Reason, &t.By, &at); err != nil {
			rows.Close()
			return err
		}
		t.At = at
		ro.Tasks = append(ro.Tasks, t)
	}
	rows.Close()
	return nil
}

// CreateRollout creates a rollout and copies the parent RolloutType's tasks
// into rollout_tasks (one row per inherited task description).
func (r *Repository) CreateRollout(ctx context.Context, in domain.Rollout) (domain.Rollout, error) {
	rt, err := r.RolloutType(ctx, in.TypeID)
	if err != nil {
		return in, fmt.Errorf("lookup type %s: %w", in.TypeID, err)
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return in, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `
		INSERT INTO rollouts (id, product_id, type_id, title, desc_ext, desc_int, risks, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
	`, in.ID, in.ProductID, in.TypeID, in.Title, in.DescExt, in.DescInt, in.Risks, nullIfEmpty(in.CreatedBy)); err != nil {
		return in, err
	}

	for i, s := range in.Stages {
		if _, err := tx.Exec(ctx, `
			INSERT INTO rollout_stages (rollout_id, seq, env, start_at, duration, status)
			VALUES ($1,$2,$3,$4,$5,$6)
		`, in.ID, i, s.Env, s.StartAt, s.Duration, string(s.Status)); err != nil {
			return in, err
		}
	}
	for _, actorID := range in.Pair {
		if _, err := tx.Exec(ctx, `
			INSERT INTO rollout_actors (rollout_id, actor_id) VALUES ($1,$2)
			ON CONFLICT DO NOTHING
		`, in.ID, actorID); err != nil {
			return in, err
		}
	}
	// Inherit tasks from RolloutType.
	for i, desc := range rt.Tasks {
		if _, err := tx.Exec(ctx, `
			INSERT INTO rollout_tasks (rollout_id, seq, description) VALUES ($1,$2,$3)
		`, in.ID, i, desc); err != nil {
			return in, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return in, err
	}
	return r.Rollout(ctx, in.ID)
}

func (r *Repository) UpdateRolloutTask(ctx context.Context, rolloutID string, seq int, status, reason, by string) error {
	if _, err := r.pool.Exec(ctx, `
		UPDATE rollout_tasks SET status=$3, reason=$4, completed_by=$5, completed_at=now()
		WHERE rollout_id=$1 AND seq=$2
	`, rolloutID, seq, status, reason, nullIfEmpty(by)); err != nil {
		return err
	}
	return nil
}

// ---------- Locks ----------

func (r *Repository) Locks(ctx context.Context) ([]domain.Lock, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, title, description, contact, start_at, end_at, products, kind, COALESCE(created_by,''), created_at
		FROM locks ORDER BY start_at
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Lock
	for rows.Next() {
		var l domain.Lock
		if err := rows.Scan(&l.ID, &l.Title, &l.Description, &l.Contact, &l.StartAt, &l.EndAt,
			&l.Products, &l.Kind, &l.CreatedBy, &l.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (r *Repository) CreateLock(ctx context.Context, l domain.Lock) (domain.Lock, error) {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO locks (id, title, description, contact, start_at, end_at, products, kind, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
	`, l.ID, l.Title, l.Description, l.Contact, l.StartAt, l.EndAt, l.Products, l.Kind, nullIfEmpty(l.CreatedBy))
	return l, err
}

// ---------- Notifications ----------

func (r *Repository) ScheduleNotification(ctx context.Context, rolloutID string, seq int, channel string, fireAt time.Time) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO notifications (rollout_id, stage_seq, channel, fire_at)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT DO NOTHING
	`, rolloutID, seq, channel, fireAt)
	return err
}

type PendingNotification struct {
	ID        int64
	RolloutID string
	StageSeq  int
	Channel   string
	FireAt    time.Time
}

func (r *Repository) PendingNotifications(ctx context.Context, now time.Time) ([]PendingNotification, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, rollout_id, stage_seq, channel, fire_at
		FROM notifications
		WHERE sent_at IS NULL AND fire_at <= $1
		ORDER BY fire_at
		LIMIT 100
	`, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PendingNotification
	for rows.Next() {
		var n PendingNotification
		if err := rows.Scan(&n.ID, &n.RolloutID, &n.StageSeq, &n.Channel, &n.FireAt); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func (r *Repository) MarkNotificationSent(ctx context.Context, id int64, errMsg string) error {
	if errMsg == "" {
		_, err := r.pool.Exec(ctx, `UPDATE notifications SET sent_at=now(), last_error=NULL WHERE id=$1`, id)
		return err
	}
	_, err := r.pool.Exec(ctx, `UPDATE notifications SET last_error=$2 WHERE id=$1`, id, errMsg)
	return err
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}
