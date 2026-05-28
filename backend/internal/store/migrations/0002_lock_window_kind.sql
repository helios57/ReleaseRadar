-- Allow a third lock kind ("window") for custom blocked time ranges, in
-- addition to manual master-bug locks and holiday locks.
ALTER TABLE locks DROP CONSTRAINT IF EXISTS locks_kind_check;
ALTER TABLE locks ADD CONSTRAINT locks_kind_check CHECK (kind IN ('manual', 'holiday', 'window'));
