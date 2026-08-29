import type { PostgresDatabase } from './postgres-database';

export async function initializeCoreSchema(database: PostgresDatabase) {
  await database.exec(`
    CREATE TABLE IF NOT EXISTS runtime_config (
      app_id TEXT PRIMARY KEY, version INTEGER NOT NULL,
      document TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runtime_configs (
      app_id TEXT NOT NULL, environment TEXT NOT NULL,
      version INTEGER NOT NULL, document TEXT NOT NULL,
      updated_at TEXT NOT NULL, PRIMARY KEY(app_id, environment)
    );
    CREATE TABLE IF NOT EXISTS config_drafts (
      app_id TEXT NOT NULL, environment TEXT NOT NULL,
      document TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY(app_id, environment)
    );
    CREATE TABLE IF NOT EXISTS config_revisions (
      id TEXT PRIMARY KEY, app_id TEXT NOT NULL, environment TEXT NOT NULL,
      version INTEGER NOT NULL, document TEXT NOT NULL, action TEXT NOT NULL,
      actor TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(app_id, environment, version)
    );
    CREATE TABLE IF NOT EXISTS config_audit (
      id TEXT PRIMARY KEY, app_id TEXT NOT NULL, environment TEXT NOT NULL,
      action TEXT NOT NULL, actor TEXT NOT NULL, from_version INTEGER,
      to_version INTEGER, metadata TEXT NOT NULL, created_at TEXT NOT NULL
    );
    -- email 可空：手机号/华为登录账号无真实邮箱（issue #14），NULL 即未绑定。
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, app_id TEXT NOT NULL, email TEXT,
      password_hash TEXT NOT NULL, username TEXT NOT NULL, display_name TEXT,
      bio TEXT NOT NULL DEFAULT '', avatar_url TEXT,
      tier_id TEXT NOT NULL DEFAULT 'free', settings TEXT NOT NULL DEFAULT '{}',
      email_verified INTEGER NOT NULL DEFAULT 0,
      consent_version TEXT, consented_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(app_id, email)
    );
    CREATE TABLE IF NOT EXISTS external_identities (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL,
      provider_subject TEXT NOT NULL, email TEXT, created_at TEXT NOT NULL,
      UNIQUE(provider, provider_subject),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE, device_name TEXT NOT NULL,
      created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL, revoked_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS password_reset_challenges (
      id TEXT PRIMARY KEY, app_id TEXT NOT NULL, user_id TEXT NOT NULL,
      email TEXT NOT NULL, code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL,
      used_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY, app_id TEXT NOT NULL, user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL,
      used_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS phone_auth_challenges (
      id TEXT PRIMARY KEY, app_id TEXT NOT NULL, phone TEXT NOT NULL,
      code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS outbound_messages (
      id TEXT PRIMARY KEY, app_id TEXT NOT NULL, channel TEXT NOT NULL,
      recipient TEXT NOT NULL, template TEXT NOT NULL, payload TEXT NOT NULL,
      status TEXT NOT NULL, error_code TEXT, created_at TEXT NOT NULL, sent_at TEXT
    );
    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id TEXT PRIMARY KEY, admin_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
      app_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT,
      FOREIGN KEY(admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY, app_id TEXT NOT NULL, user_id TEXT NOT NULL,
      session_id TEXT NOT NULL, family_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL, revoked_at TEXT, replaced_by TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS email_verifications (
      id TEXT PRIMARY KEY, app_id TEXT NOT NULL, user_id TEXT NOT NULL, email TEXT NOT NULL,
      code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL,
      used_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sign_in_attempts (
      id TEXT PRIMARY KEY, app_id TEXT NOT NULL, identifier TEXT NOT NULL,
      failed_count INTEGER NOT NULL DEFAULT 0, locked_until TEXT, last_attempt_at TEXT NOT NULL,
      UNIQUE(app_id, identifier)
    );
    CREATE INDEX IF NOT EXISTS idx_reset_challenge_lookup
      ON password_reset_challenges(app_id, email, created_at);
    CREATE INDEX IF NOT EXISTS idx_phone_challenge_lookup
      ON phone_auth_challenges(app_id, phone, created_at);
    CREATE INDEX IF NOT EXISTS idx_refresh_family
      ON refresh_tokens(app_id, family_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_session
      ON refresh_tokens(session_id);
    CREATE INDEX IF NOT EXISTS idx_email_verify_lookup
      ON email_verifications(app_id, email, created_at);
  `);
}
