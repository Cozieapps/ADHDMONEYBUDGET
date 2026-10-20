-- Every synced record (transaction, bill, goal, ...) is one row. The app owns the
-- shape of `data`; the server only needs identity, ordering and last-write-wins.
CREATE TABLE records (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  source TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'claude')),
  server_seq INTEGER NOT NULL,
  PRIMARY KEY (kind, id)
);

CREATE INDEX records_by_seq ON records (server_seq);
