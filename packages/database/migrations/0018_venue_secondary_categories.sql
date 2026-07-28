ALTER TABLE venues ADD COLUMN IF NOT EXISTS secondary_categories text[] NOT NULL DEFAULT '{}'::text[];
