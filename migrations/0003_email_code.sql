-- Sign-in with an emailed 6-digit code instead of a password (as Quran Daily).

-- Better Auth's request limits per internet address, kept here because a Worker's
-- memory isn't shared between requests.
CREATE TABLE "rateLimit" (
  "id"          text    NOT NULL PRIMARY KEY,
  "key"         text    NOT NULL UNIQUE,
  "count"       integer NOT NULL,
  "lastRequest" bigint  NOT NULL
);

-- Our own per-email limit on sending codes (worker/limits.js). Holds a SHA-256 of the
-- email, not the email itself; rows older than an hour are removed.
CREATE TABLE email_sends (
  email_hash TEXT    NOT NULL,
  sent_at    INTEGER NOT NULL  -- milliseconds since 1970
);
CREATE INDEX email_sends_by_email ON email_sends (email_hash, sent_at);

-- Passwords are no longer used: remove the scrambled ones, and the old confirm/reset links.
DELETE FROM "account" WHERE "providerId" = 'credential';
DELETE FROM "verification";

-- Sessions no longer keep the internet address or browser details; clear the old ones.
UPDATE "session" SET "ipAddress" = NULL, "userAgent" = NULL;
