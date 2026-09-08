-- Deployment-owned Worker registrations, no seed or planned application list.
CREATE TABLE registered_workers (
  id TEXT PRIMARY KEY,
  worker TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  manifest TEXT NOT NULL CHECK(json_valid(manifest))
);
