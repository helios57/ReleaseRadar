-- The execution pair is recorded as free-form actor identifiers/names entered
-- at rollout time; they need not be pre-registered actors. Drop the FK so a
-- pair can reference anyone without first provisioning an actor row.
ALTER TABLE rollout_actors DROP CONSTRAINT IF EXISTS rollout_actors_actor_id_fkey;
