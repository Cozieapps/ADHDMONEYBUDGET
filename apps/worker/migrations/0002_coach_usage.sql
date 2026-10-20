-- One shared daily budget for all devices. D1's atomic write prevents concurrent
-- requests from exceeding the cap (KV's eventual consistency cannot do that).
CREATE TABLE coach_usage (
  day TEXT PRIMARY KEY,
  calls INTEGER NOT NULL CHECK (calls BETWEEN 0 AND 10)
);
