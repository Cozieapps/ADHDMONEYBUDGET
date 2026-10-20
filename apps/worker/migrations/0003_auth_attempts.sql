-- Shared, atomic sign-in budget. Hashed IPs only; expired windows are pruned.
CREATE TABLE auth_attempts (
  subject TEXT NOT NULL,
  window INTEGER NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts BETWEEN 0 AND 10),
  PRIMARY KEY (subject, window)
);
