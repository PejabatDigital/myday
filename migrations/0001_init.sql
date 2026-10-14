-- MyDay schema v1: day documents, week notes, and a per-user change counter for sync.
-- Every row belongs to one user; the API only ever reads or writes the signed-in user's rows.

-- One row per user per day. body is the day document as JSON (see CLAUDE.md, Data model).
CREATE TABLE days (
  user_id    TEXT    NOT NULL,
  date       TEXT    NOT NULL,  -- YYYY-MM-DD
  body       TEXT    NOT NULL,  -- day document JSON
  updated_at TEXT    NOT NULL,  -- when the edit was made on the device (ISO, UTC)
  version    INTEGER NOT NULL,  -- the user's change number when this was stored
  PRIMARY KEY (user_id, date)
);
CREATE INDEX days_by_version ON days (user_id, version);

-- One row per user per week, keyed by the week's Monday.
CREATE TABLE weeks (
  user_id    TEXT    NOT NULL,
  week_start TEXT    NOT NULL,  -- YYYY-MM-DD, a Monday
  note       TEXT    NOT NULL,  -- week note HTML
  updated_at TEXT    NOT NULL,
  version    INTEGER NOT NULL,
  PRIMARY KEY (user_id, week_start)
);
CREATE INDEX weeks_by_version ON weeks (user_id, version);

-- Each stored change takes the user's next number, so GET /api/changes?since=N
-- returns everything changed after N in order, across days and weeks.
CREATE TABLE sync_seq (
  user_id TEXT    PRIMARY KEY,
  seq     INTEGER NOT NULL
);
