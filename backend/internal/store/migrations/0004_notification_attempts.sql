-- Track delivery attempts so a permanently-failing notification (e.g. a
-- misconfigured webhook returning 4xx) is dead-lettered after a cap instead of
-- being retried on every dispatcher tick forever (notification + log spam).
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
