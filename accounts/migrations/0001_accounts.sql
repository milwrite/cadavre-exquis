CREATE TABLE accounts (
  subject TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  reflection_enabled INTEGER NOT NULL DEFAULT 1 CHECK (reflection_enabled IN (0,1)),
  default_app TEXT NOT NULL DEFAULT 'cadavre' CHECK (default_app IN ('cadavre','jeopardy','cloze')),
  revision INTEGER NOT NULL DEFAULT 1,
  work_revision INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL REFERENCES accounts(subject) ON DELETE CASCADE,
  app TEXT NOT NULL CHECK (app IN ('cadavre','jeopardy','cloze')),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(subject,app,id)
);
CREATE INDEX entries_recent ON entries(subject, app, pinned, updated_at DESC, id DESC);
CREATE TABLE model_runs (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL REFERENCES accounts(subject) ON DELETE CASCADE,
  app TEXT NOT NULL CHECK (app IN ('cadavre','jeopardy','cloze')),
  entry_id TEXT,
  model TEXT NOT NULL,
  completed_at INTEGER NOT NULL
);
CREATE INDEX model_runs_recent ON model_runs(subject,completed_at DESC,id DESC);
CREATE TABLE reflections (
  subject TEXT PRIMARY KEY REFERENCES accounts(subject) ON DELETE CASCADE,
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
CREATE TABLE entry_events (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL REFERENCES accounts(subject) ON DELETE CASCADE,
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created','updated','pinned','unpinned')),
  at INTEGER NOT NULL
);
CREATE INDEX entry_events_owner ON entry_events(subject,entry_id,revision);
