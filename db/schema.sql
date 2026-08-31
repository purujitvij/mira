-- Idempotent; applied automatically on first request (see src/lib/db.ts).
CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  safety_level TEXT,
  state JSONB,
  intervention_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_user_idx ON messages (user_id, created_at DESC);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id UUID;
-- Backfill: each user's pre-conversation messages become one legacy conversation. No-op once filled.
UPDATE messages m SET conversation_id = u.cid
  FROM (SELECT user_id, gen_random_uuid() AS cid FROM messages WHERE conversation_id IS NULL GROUP BY user_id) u
  WHERE m.conversation_id IS NULL AND m.user_id = u.user_id;
CREATE INDEX IF NOT EXISTS messages_conv_idx ON messages (user_id, conversation_id, created_at);

CREATE TABLE IF NOT EXISTS feedback (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  intervention_id TEXT NOT NULL,
  helpful BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_user_idx ON feedback (user_id);

-- Ground rule #5: a qualified human reviews every High/Critical call and every rule/LLM disagreement.
CREATE TABLE IF NOT EXISTS review_queue (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  message TEXT NOT NULL,
  rule_level TEXT NOT NULL,
  llm_level TEXT,
  final_level TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','confirmed','overridden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS traces (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  node TEXT NOT NULL,
  ms INTEGER NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS traces_req_idx ON traces (request_id);

-- On Supabase, tables in `public` are reachable through the REST API with the publishable key unless RLS is on.
-- No policies: the app connects as the table owner (bypasses RLS); anon/authenticated see nothing. Harmless locally.
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE traces ENABLE ROW LEVEL SECURITY;
