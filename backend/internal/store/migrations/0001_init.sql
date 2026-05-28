-- ReleaseRadar — initial schema.
-- Postgres 15+. Run via the embedded migrator in store/migrate.go.

CREATE TABLE IF NOT EXISTS actors (
    id        TEXT PRIMARY KEY,
    email     TEXT NOT NULL UNIQUE,
    name      TEXT NOT NULL,
    initials  TEXT NOT NULL,
    hue       INT  NOT NULL DEFAULT 210,
    role      TEXT NOT NULL CHECK (role IN ('admin', 'readonly')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS products (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    owner    TEXT,
    brokers  TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS rollout_types (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    short        TEXT NOT NULL,
    tone         TEXT NOT NULL CHECK (tone IN ('neutral','info','warn','danger','ok')),
    delay_prod1  INTERVAL NOT NULL DEFAULT '0',
    delay_prod2  INTERVAL NOT NULL DEFAULT '0',
    cascade_plan JSONB NOT NULL DEFAULT '[]'::jsonb,
    announce     TEXT,
    rules        TEXT[] NOT NULL DEFAULT '{}'
);

-- Per spec: RolloutTypeTasks are a separate ordered list of task descriptions.
CREATE TABLE IF NOT EXISTS rollout_type_tasks (
    type_id     TEXT NOT NULL REFERENCES rollout_types(id) ON DELETE CASCADE,
    seq         INT  NOT NULL,
    description TEXT NOT NULL,
    PRIMARY KEY (type_id, seq)
);

CREATE TABLE IF NOT EXISTS rollouts (
    id           TEXT PRIMARY KEY,
    product_id   TEXT NOT NULL REFERENCES products(id),
    type_id      TEXT NOT NULL REFERENCES rollout_types(id),
    title        TEXT NOT NULL,
    desc_ext     TEXT NOT NULL DEFAULT '',
    desc_int     TEXT NOT NULL DEFAULT '',
    risks        TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   TEXT REFERENCES actors(id)
);
CREATE INDEX IF NOT EXISTS idx_rollouts_product ON rollouts(product_id);
CREATE INDEX IF NOT EXISTS idx_rollouts_type    ON rollouts(type_id);

CREATE TABLE IF NOT EXISTS rollout_stages (
    rollout_id  TEXT NOT NULL REFERENCES rollouts(id) ON DELETE CASCADE,
    seq         INT  NOT NULL,
    env         TEXT NOT NULL,
    start_at    TIMESTAMPTZ NOT NULL,
    duration    INTERVAL NOT NULL DEFAULT '1 hour',
    status      TEXT NOT NULL CHECK (status IN ('scheduled','active','blocked','done','failed'))
                                DEFAULT 'scheduled',
    PRIMARY KEY (rollout_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_stages_start ON rollout_stages(start_at);

CREATE TABLE IF NOT EXISTS rollout_actors (
    rollout_id TEXT NOT NULL REFERENCES rollouts(id) ON DELETE CASCADE,
    actor_id   TEXT NOT NULL REFERENCES actors(id)   ON DELETE CASCADE,
    PRIMARY KEY (rollout_id, actor_id)
);

-- Per spec: tasks/checklist with completion logs.
CREATE TABLE IF NOT EXISTS rollout_tasks (
    rollout_id  TEXT NOT NULL REFERENCES rollouts(id) ON DELETE CASCADE,
    seq         INT  NOT NULL,
    description TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT '' CHECK (status IN ('','done','failed')),
    reason      TEXT NOT NULL DEFAULT '',
    completed_by TEXT REFERENCES actors(id),
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (rollout_id, seq)
);

CREATE TABLE IF NOT EXISTS locks (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    contact     TEXT NOT NULL DEFAULT '',
    start_at    TIMESTAMPTZ NOT NULL,
    end_at      TIMESTAMPTZ NOT NULL,
    products    TEXT[] NOT NULL DEFAULT '{"all"}',
    kind        TEXT NOT NULL CHECK (kind IN ('manual','holiday')) DEFAULT 'manual',
    created_by  TEXT REFERENCES actors(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_locks_range ON locks(start_at, end_at);

-- Notification scheduling: rows are created when a stage is scheduled/changed,
-- consumed by the dispatcher.
CREATE TABLE IF NOT EXISTS notifications (
    id          BIGSERIAL PRIMARY KEY,
    rollout_id  TEXT NOT NULL REFERENCES rollouts(id) ON DELETE CASCADE,
    stage_seq   INT  NOT NULL,
    channel     TEXT NOT NULL CHECK (channel IN ('TMS_NP','TMS_PROD')),
    fire_at     TIMESTAMPTZ NOT NULL,
    sent_at     TIMESTAMPTZ,
    last_error  TEXT,
    UNIQUE (rollout_id, stage_seq, fire_at, channel)
);
CREATE INDEX IF NOT EXISTS idx_notifications_pending ON notifications(fire_at) WHERE sent_at IS NULL;

-- Tracks applied migrations (managed by store/migrate.go).
CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
