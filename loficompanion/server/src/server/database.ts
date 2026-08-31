import { randomUUID } from 'node:crypto';
import { defaultConfig, type RuntimeConfig } from '@/domain/config';
import { initializeCoreSchema } from './database-schema-core';
import { initializeProductSchema } from './database-schema-product';
import { hashPassword } from './passwords';
import { PostgresDatabase } from './postgres-database';
import { DEFAULT_APP_ID } from './service-identity';

export const database = new PostgresDatabase();

// ── Per-app standard test account（test / Test1234）────────────────────────
// 约定与三端集成测试一致（testServer: Test1234）。每个 app 创建即 seed；
// 已存在则不覆盖（避免重置用户改过的密码）。不 seed 假手机号——无即 null。
// 注意：必须声明在文件底部的顶层 await ensureBootstrap() 之前（TDZ）。
const TEST_ACCOUNT_EMAIL = 'test@test.local';
const TEST_ACCOUNT_PASSWORD = 'Test1234';

// Node's test runner executes each test file in its own process, so multiple
// workers import this module concurrently and would race on the idempotent
// `CREATE TABLE IF NOT EXISTS` statements (Postgres still allocates the
// matching composite type before noticing the table exists, producing
// `duplicate key value violates pg_type_typname_nsp_index`). Serializing the
// whole bootstrap behind a transaction-scoped advisory lock guarantees only
// one worker mutates the schema at a time; the others wait, then re-run the
// now-no-op idempotent statements.
const BOOTSTRAP_ADVISORY_LOCK = 0x5a48_4f4e; // 'ZHON' sentinel
let bootstrapPromise: Promise<void> | undefined;

async function runBootstrap() {
  await database.transaction(async () => {
    await database.exec(
      `SELECT pg_advisory_xact_lock(${BOOTSTRAP_ADVISORY_LOCK.toString()})`,
    );
    await initializeCoreSchema(database);
    await initializeProductSchema(database);
    await applyIdempotentMigrations();
    await seedDefaultConfig();
    // 存量 app 补种标准测试账户（幂等；新 app 在 seedConfigScope 内即时种）。
    await backfillAppTestAccounts();
    await ensureBootstrapAdmin();
  });
}

function ensureBootstrap() {
  if (!bootstrapPromise) bootstrapPromise = runBootstrap();
  return bootstrapPromise;
}

if (
  process.env.AUTH_SKIP_DATABASE_INIT !== '1' &&
  process.env.MOBILEUI_SKIP_DATABASE_INIT !== '1'
) {
  await ensureBootstrap();
}

export function nowIso() {
  return new Date().toISOString();
}

async function applyIdempotentMigrations() {
  await database.exec(`
    ALTER TABLE admin_sessions
      ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '';
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_verified INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_version TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS consented_at TEXT;
    UPDATE users SET display_name = username
    WHERE display_name IS NULL OR trim(display_name) = '';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS tier_id TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_transaction_id TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_hash TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS expires_at TEXT;
    ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
  `);
  // 存量伪邮箱清为未绑定（issue #14）：手机/华为登录曾生成 xxx@phone.invalid。
  await database.exec(`
    UPDATE users SET email = NULL
    WHERE email IS NOT NULL AND (email LIKE '%@phone.invalid' OR email LIKE '%@invalid.local');
  `);
}

async function seedDefaultConfig() {
  const timestamp = nowIso();
  const document = JSON.stringify(defaultConfig);
  await database.prepare(`
    INSERT INTO runtime_config(app_id, version, document, updated_at)
    VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING
  `).run(DEFAULT_APP_ID, defaultConfig.version, document, timestamp);
  await database.prepare(`
    INSERT INTO runtime_configs(app_id, environment, version, document, updated_at)
    VALUES (?, 'development', ?, ?, ?) ON CONFLICT DO NOTHING
  `).run(DEFAULT_APP_ID, defaultConfig.version, document, timestamp);
  await database.prepare(`
    INSERT INTO config_revisions(
      id, app_id, environment, version, document, action, actor, created_at
    ) VALUES (?, ?, 'development', ?, ?, 'seed', 'system', ?)
    ON CONFLICT DO NOTHING
  `).run(randomUUID(), DEFAULT_APP_ID, defaultConfig.version, document, timestamp);
}

// 测试账号播种开关：所有环境默认播种（生产需保留审核人员测试账号），
// 可用 MOBILEUI_SEED_TEST_ACCOUNT=0 显式关闭。
export function shouldSeedTestAccount(flag: string | undefined): boolean {
  return flag !== '0';
}

async function ensureAppTestAccount(appId: string) {
  if (!shouldSeedTestAccount(process.env.MOBILEUI_SEED_TEST_ACCOUNT)) {
    return;
  }
  const timestamp = nowIso();
  const exists = await database.prepare(
    'SELECT id FROM users WHERE app_id = ? AND email = ?',
  ).get<{ id: string }>(appId, TEST_ACCOUNT_EMAIL);
  if (exists) return;
  const passwordHash = await hashPassword(TEST_ACCOUNT_PASSWORD);
  await database.prepare(`
    INSERT INTO users(
      id, app_id, email, password_hash, username, display_name,
      email_verified, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT (app_id, email) DO NOTHING
  `).run(
    randomUUID(), appId, TEST_ACCOUNT_EMAIL, passwordHash,
    'test', '测试账户', timestamp, timestamp,
  );
}

async function backfillAppTestAccounts() {
  const rows = await database.prepare(
    'SELECT DISTINCT app_id FROM runtime_configs',
  ).all<{ app_id: string }>();
  for (const row of rows) {
    await ensureAppTestAccount(row.app_id);
  }
  // 旧 runtime_config（单数表）里可能还有未迁移的 app。
  const legacy = await database.prepare(
    'SELECT DISTINCT app_id FROM runtime_config',
  ).all<{ app_id: string }>();
  for (const row of legacy) {
    await ensureAppTestAccount(row.app_id);
  }
}

async function ensureBootstrapAdmin() {
  const envUsername = process.env.MOBILEUI_BOOTSTRAP_ADMIN_USERNAME;
  if (envUsername) {
    const exists = await database.prepare(
      'SELECT 1 FROM admin_users WHERE username = ?',
    ).get(envUsername);
    if (!exists) {
      const password = process.env.MOBILEUI_BOOTSTRAP_ADMIN_PASSWORD;
      const email = process.env.MOBILEUI_BOOTSTRAP_ADMIN_EMAIL
        ?? `${envUsername}@zhongbei.local`;
      if (password) await seedAdmin(envUsername, email, password);
    }
    return;
  }
  if (process.env.NODE_ENV !== 'production') {
    const exists = await database.prepare(
      'SELECT 1 FROM admin_users WHERE username = ?',
    ).get('admin');
    if (!exists) await seedAdmin('admin', 'admin@zhongbei.local', 'admin123');
  }
}

async function seedAdmin(username: string, email: string, password: string) {
  const id = randomUUID();
  const createdAt = nowIso();
  const passwordHash = await hashPassword(password);
  await database.prepare(`
    INSERT INTO admin_users(id, username, email, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, username, email, passwordHash, createdAt, createdAt);
}

export async function runTransaction<T>(action: () => Promise<T>) {
  return database.transaction(action);
}

export async function getRuntimeConfig(
  appId = DEFAULT_APP_ID,
  environment = 'development',
): Promise<RuntimeConfig> {
  const current = await database.prepare(`
    SELECT document FROM runtime_configs WHERE app_id = ? AND environment = ?
  `).get<{ document: string }>(appId, environment);
  if (current) return await upgradeConfig(current.document, appId, environment);
  const row = appId === DEFAULT_APP_ID && environment === 'development'
    ? await database.prepare(
      'SELECT document FROM runtime_config WHERE app_id = ?',
    ).get<{ document: string }>(appId)
    : undefined;
  if (!row) {
    await seedConfigScope(appId, environment);
    return defaultConfig;
  }
  return await upgradeConfig(row.document, appId, environment);
}

async function seedConfigScope(appId: string, environment: string) {
  await saveRuntimeConfig(defaultConfig, appId, environment);
  await database.prepare(`
    INSERT INTO config_revisions(
      id, app_id, environment, version, document, action, actor, created_at
    ) VALUES (?, ?, ?, ?, ?, 'seed', 'system', ?) ON CONFLICT DO NOTHING
  `).run(
    randomUUID(), appId, environment, defaultConfig.version,
    JSON.stringify(defaultConfig), nowIso(),
  );
  // 每个 app 首次创建即 seed 标准测试账户（test / Test1234）。
  await ensureAppTestAccount(appId);
}

async function upgradeConfig(
  document: string,
  appId: string,
  environment: string,
) {
  const parsed = JSON.parse(document) as Partial<RuntimeConfig>;
  if (!parsed.schemaVersion) {
    await saveRuntimeConfig(defaultConfig, appId, environment);
    return defaultConfig;
  }
  const upgraded = mergeRuntimeConfig(parsed);
  if ((parsed.version ?? 0) < defaultConfig.version) {
    const versionUpgraded = mergeRuntimeConfig({
      ...parsed,
      version: defaultConfig.version,
      legal: defaultConfig.legal,
    });
    await saveRuntimeConfig(versionUpgraded, appId, environment);
    return versionUpgraded;
  }
  if (JSON.stringify(upgraded) !== JSON.stringify(parsed)) {
    await saveRuntimeConfig(upgraded, appId, environment);
  }
  return upgraded;
}

function mergeRuntimeConfig(parsed: Partial<RuntimeConfig>): RuntimeConfig {
  const auth = parsed.auth as Partial<RuntimeConfig['auth']> | undefined;
  return {
    ...defaultConfig,
    ...parsed,
    brand: { ...defaultConfig.brand, ...parsed.brand },
    splash: parsed.splash === undefined ? defaultConfig.splash : parsed.splash,
    telemetry: { ...defaultConfig.telemetry, ...parsed.telemetry },
    support: parsed.support ?? defaultConfig.support,
    auth: {
      ...defaultConfig.auth,
      ...auth,
      providers: auth?.providers ?? defaultConfig.auth.providers,
      passwordPolicy: {
        ...defaultConfig.auth.passwordPolicy,
        ...auth?.passwordPolicy,
      },
    },
    legal: parsed.legal ?? defaultConfig.legal,
    settingsPolicy: {
      ...defaultConfig.settingsPolicy,
      ...parsed.settingsPolicy,
    },
    features: {
      ...defaultConfig.features,
      ...parsed.features,
    },
    entitlements: parsed.entitlements ?? defaultConfig.entitlements,
    tiers: parsed.tiers ?? defaultConfig.tiers,
    plans: parsed.plans ?? defaultConfig.plans,
  };
}

export async function saveRuntimeConfig(
  config: RuntimeConfig,
  appId = DEFAULT_APP_ID,
  environment = 'development',
) {
  await database.prepare(`
    INSERT INTO runtime_configs(app_id, environment, version, document, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(app_id, environment) DO UPDATE SET
      version = excluded.version, document = excluded.document,
      updated_at = excluded.updated_at
  `).run(appId, environment, config.version, JSON.stringify(config), nowIso());
  if (appId === DEFAULT_APP_ID && environment === 'development') {
    await database.prepare(`
      INSERT INTO runtime_config(app_id, version, document, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(app_id) DO UPDATE SET
        version = excluded.version, document = excluded.document,
        updated_at = excluded.updated_at
    `).run(appId, config.version, JSON.stringify(config), nowIso());
  }
}

export async function getConfigDraft(appId: string, environment: string) {
  const row = await database.prepare(`
    SELECT document FROM config_drafts WHERE app_id = ? AND environment = ?
  `).get<{ document: string }>(appId, environment);
  return row ? JSON.parse(row.document) as RuntimeConfig : null;
}

export async function saveConfigDraft(
  config: RuntimeConfig,
  appId: string,
  environment: string,
) {
  await database.prepare(`
    INSERT INTO config_drafts(app_id, environment, document, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(app_id, environment) DO UPDATE SET
      document = excluded.document, updated_at = excluded.updated_at
  `).run(appId, environment, JSON.stringify(config), nowIso());
}
