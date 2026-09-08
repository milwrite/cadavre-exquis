-- Registration and exact-audience adapters enforce app scope in code.
-- Preserve records, pins, events, model history and reflection during expansion.
CREATE TABLE next_accounts (
  subject TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  reflection_enabled INTEGER NOT NULL DEFAULT 1 CHECK (reflection_enabled IN (0,1)),
  default_app TEXT NOT NULL DEFAULT 'all',
  revision INTEGER NOT NULL DEFAULT 1,
  work_revision INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE next_entries (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL REFERENCES next_accounts(subject) ON DELETE CASCADE,
  app TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(subject,app,id)
);

CREATE TABLE next_model_runs (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL REFERENCES next_accounts(subject) ON DELETE CASCADE,
  app TEXT NOT NULL,
  entry_id TEXT,
  model TEXT NOT NULL,
  completed_at INTEGER NOT NULL
);

CREATE TABLE next_reflections (
  subject TEXT PRIMARY KEY REFERENCES next_accounts(subject) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('pending','complete','failed')),
  attempt_id TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  model TEXT NOT NULL,
  source_revision INTEGER NOT NULL,
  source_json TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  generated_at INTEGER,
  failure_code TEXT
);
CREATE TABLE next_entry_events (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL REFERENCES next_accounts(subject) ON DELETE CASCADE,
  entry_id TEXT NOT NULL REFERENCES next_entries(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created','updated','pinned','unpinned')),
  at INTEGER NOT NULL
);


INSERT INTO next_accounts SELECT * FROM accounts;
INSERT INTO next_entries SELECT * FROM entries;
INSERT INTO next_model_runs SELECT * FROM model_runs;
INSERT INTO next_reflections SELECT * FROM reflections;
INSERT INTO next_entry_events SELECT * FROM entry_events;
DROP TABLE entry_events;
DROP TABLE reflections;
DROP TABLE model_runs;
DROP TABLE entries;
DROP TABLE accounts;
ALTER TABLE next_accounts RENAME TO accounts;
ALTER TABLE next_entries RENAME TO entries;
ALTER TABLE next_model_runs RENAME TO model_runs;
ALTER TABLE next_reflections RENAME TO reflections;
ALTER TABLE next_entry_events RENAME TO entry_events;
CREATE INDEX entries_recent ON entries(subject, app, pinned, updated_at DESC, id DESC);
CREATE INDEX model_runs_recent ON model_runs(subject,completed_at DESC,id DESC);
CREATE INDEX entry_events_owner ON entry_events(subject,entry_id,revision);
