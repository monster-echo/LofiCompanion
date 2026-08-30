import type { PostgresDatabase } from './postgres-database';

// LofiCompanion 业务域 schema：focus（专注会话）/ skins（皮肤与版本化 manifest）/
// achievements（成就账本与房间收藏物）。对齐 docs/04-DATA-AND-API.md §1/§2 约束。
// 约定沿用模板：TEXT 主键（应用层 randomUUID 生成）、TEXT ISO 时间戳、JSON 以
// TEXT 存储（模板 runtime_config 等一致），幂等迁移只做 CREATE TABLE IF NOT EXISTS
// 与 ON CONFLICT DO NOTHING 种子。

export async function initializeLofiSchema(database: PostgresDatabase) {
  await database.exec(`
    CREATE TABLE IF NOT EXISTS focus_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      installation_id TEXT,
      activity TEXT NOT NULL,
      planned_seconds INTEGER NOT NULL CHECK (planned_seconds BETWEEN 300 AND 10800),
      status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'completed', 'abandoned')),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      effective_seconds INTEGER NOT NULL DEFAULT 0,
      pauses TEXT NOT NULL DEFAULT '[]',
      client_request_id TEXT NOT NULL,
      rule_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, client_request_id)
    );
    CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_started
      ON focus_sessions(user_id, started_at);

    -- 通用变更幂等层：完成/迁移等 mutation 以 (key, user_id, endpoint) 去重，
    -- 重放直接返回首次响应。
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT NOT NULL,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      response_body TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(key, user_id, endpoint)
    );

    CREATE TABLE IF NOT EXISTS skins (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      access_type TEXT NOT NULL DEFAULT 'free',
      manifest_version INTEGER NOT NULL DEFAULT 1,
      moderation_status TEXT NOT NULL DEFAULT 'approved',
      published_at TEXT,
      created_at TEXT NOT NULL
    );

    -- manifest 版本只增不改（docs/04 §2）：同一 (skin_id, version) 不可覆盖。
    CREATE TABLE IF NOT EXISTS skin_manifests (
      id TEXT PRIMARY KEY,
      skin_id TEXT NOT NULL REFERENCES skins(id),
      version INTEGER NOT NULL,
      manifest TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(skin_id, version)
    );

    CREATE TABLE IF NOT EXISTS user_skins (
      user_id TEXT NOT NULL REFERENCES users(id),
      skin_id TEXT NOT NULL REFERENCES skins(id),
      source TEXT NOT NULL DEFAULT 'free',
      unlocked_at TEXT NOT NULL,
      selected_at TEXT,
      UNIQUE(user_id, skin_id)
    );

    -- 成就账本：同一成就同一规则版本只发放一次（docs/01 §5.6）。
    CREATE TABLE IF NOT EXISTS achievement_grants (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      rule_key TEXT NOT NULL,
      rule_version INTEGER NOT NULL DEFAULT 1,
      source_session_id TEXT REFERENCES focus_sessions(id),
      granted_at TEXT NOT NULL,
      UNIQUE(user_id, rule_key, rule_version)
    );

    CREATE TABLE IF NOT EXISTS room_items (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      source_rule_key TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_room_items (
      user_id TEXT NOT NULL REFERENCES users(id),
      room_item_id TEXT NOT NULL REFERENCES room_items(id),
      source_grant_id TEXT REFERENCES achievement_grants(id),
      unlocked_at TEXT NOT NULL,
      UNIQUE(user_id, room_item_id)
    );
  `);
}

const ROOM_ITEM_SEEDS = [
  { itemId: 'bookmark', name: '雨夜书签', sourceRuleKey: 'first_focus' },
  { itemId: 'lamp', name: '小台灯', sourceRuleKey: 'streak_7' },
  { itemId: 'plant', name: '绿植', sourceRuleKey: 'rainy_10h' },
  { itemId: 'group_photo', name: '自习伙伴合影', sourceRuleKey: 'sessions_100' },
] as const;

const SKIN_SEEDS = [
  { slug: 'rainy-study-room', name: '雨夜书房', published: true },
  { slug: 'sunny-classroom', name: '阳光教室', published: false },
  { slug: 'midnight-workstation', name: '深夜工作台', published: false },
] as const;

// 与客户端 react-native/src/features/skins/domain/types.ts 的 SkinManifest 同构
//（poster 为 URL 占位字段，客户端 P0-B 仍用本地内置资产）。
function buildManifest(slug: string, name: string) {
  const states = ['ready', 'focusing', 'paused', 'drinking', 'resting', 'completed'];
  return {
    id: `${slug}-v1`,
    slug,
    name,
    accessType: 'free',
    manifestVersion: 1,
    defaultState: 'ready',
    themeTokens: { accent: '#4F8FE8', surface: '#0D1B2B' },
    states: states.map((state) => ({
      state,
      posterUrl: `/skins/${slug}/${state}.png`,
      focalPointX: 0.5,
      focalPointY: 0.38,
      durationMs: 4000,
    })),
    eventMappings: [
      { eventType: 'session.ready', priority: 60, interruptible: true, cooldownSeconds: 0, returnState: 'ready' },
      { eventType: 'focus.started', priority: 80, interruptible: false, cooldownSeconds: 0, returnState: 'focusing' },
      { eventType: 'focus.loop', priority: 10, interruptible: true, cooldownSeconds: 0, returnState: 'focusing' },
      { eventType: 'wellness.drink', priority: 70, interruptible: false, cooldownSeconds: 60, returnState: 'focusing' },
      { eventType: 'focus.paused', priority: 90, interruptible: true, cooldownSeconds: 0, returnState: 'paused' },
      { eventType: 'break.started', priority: 80, interruptible: false, cooldownSeconds: 0, returnState: 'resting' },
      { eventType: 'focus.resumed', priority: 90, interruptible: false, cooldownSeconds: 0, returnState: 'focusing' },
      { eventType: 'focus.completed', priority: 100, interruptible: false, cooldownSeconds: 0, returnState: 'ready' },
    ],
  };
}

export async function seedLofiDefaults(database: PostgresDatabase) {
  for (const item of ROOM_ITEM_SEEDS) {
    await database.prepare(
      `INSERT INTO room_items(id, item_id, name, source_rule_key)
       VALUES (?, ?, ?, ?) ON CONFLICT (item_id) DO NOTHING`,
    ).run(`room-item-${item.itemId}`, item.itemId, item.name, item.sourceRuleKey);
  }

  const now = new Date().toISOString();
  for (const skin of SKIN_SEEDS) {
    const skinId = `skin-${skin.slug}`;
    await database.prepare(
      `INSERT INTO skins(id, slug, name, access_type, manifest_version, moderation_status, published_at, created_at)
       VALUES (?, ?, ?, 'free', 1, ?, ?, ?)
       ON CONFLICT (slug) DO NOTHING`,
    ).run(
      skinId,
      skin.slug,
      skin.name,
      skin.published ? 'approved' : 'pending_assets',
      skin.published ? now : null,
      now,
    );
    await database.prepare(
      `INSERT INTO skin_manifests(id, skin_id, version, manifest, created_at)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT (skin_id, version) DO NOTHING`,
    ).run(`skin-manifest-${skin.slug}-1`, skinId, JSON.stringify(buildManifest(skin.slug, skin.name)), now);
  }
}
