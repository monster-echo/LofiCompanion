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

    -- P1-A 皮肤商品目录（docs/05 §4/§7）：skin ↔ 商店商品 ↔ 权益键 ↔ 上下架。
    -- 一套皮肤至多一个在售商品（skin_id UNIQUE）；真实商店接入前 store_product_ids
    -- 留空对象，价格/币种为目录展示数据（docs/05 §8：价格只来自服务端）。
    CREATE TABLE IF NOT EXISTS skin_products (
      id TEXT PRIMARY KEY,
      skin_id TEXT NOT NULL UNIQUE REFERENCES skins(id),
      entitlement_key TEXT NOT NULL,
      store_product_ids TEXT NOT NULL DEFAULT '{}',
      price_minor INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CNY',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
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

    -- ── P0-C 排行与小组（docs/06 P0-C、docs/04 §1/§2）─────────────────────────

    -- 好友邀请码：每人一个有效码（user_id UNIQUE）；8 位可读码全局唯一。
    CREATE TABLE IF NOT EXISTS friend_invitations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
      code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    -- 好友关系双向两行（A→B 与 B→A 同事务写入，docs/06 P0-C 决策），UNIQUE 兜底幂等。
    CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      friend_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      UNIQUE(user_id, friend_id)
    );
    CREATE INDEX IF NOT EXISTS idx_friendships_friend
      ON friendships(friend_id);

    -- 私密自习小组：加入码制，共同目标 = 周目标分钟。
    CREATE TABLE IF NOT EXISTS study_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_user_id TEXT NOT NULL REFERENCES users(id),
      join_code TEXT NOT NULL UNIQUE,
      weekly_goal_minutes INTEGER NOT NULL DEFAULT 600,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL REFERENCES study_groups(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
      joined_at TEXT NOT NULL,
      UNIQUE(group_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_group_members_user
      ON group_members(user_id);

    -- 榜单分账本：从 focus_sessions 派生（rule_version=2 含每日 180 分钟上限），
    -- 原子 upsert；friends 榜 scope_id=发起查询者的好友圈聚合键，group 榜=group_id。
    CREATE TABLE IF NOT EXISTS leaderboard_scores (
      user_id TEXT NOT NULL REFERENCES users(id),
      scope_type TEXT NOT NULL CHECK (scope_type IN ('friends', 'group')),
      scope_id TEXT NOT NULL,
      week_id TEXT NOT NULL,
      effective_seconds INTEGER NOT NULL DEFAULT 0,
      session_count INTEGER NOT NULL DEFAULT 0,
      rule_version INTEGER NOT NULL DEFAULT 2,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, scope_type, scope_id, week_id, rule_version)
    );

    -- 周快照不可变（周末后惰性结算写入；rankings JSON 只含昵称/头像/分钟/名次）。
    CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
      id TEXT PRIMARY KEY,
      scope_type TEXT NOT NULL CHECK (scope_type IN ('friends', 'group')),
      scope_id TEXT NOT NULL,
      week_id TEXT NOT NULL,
      rankings TEXT NOT NULL,
      settled_at TEXT NOT NULL,
      rule_version INTEGER NOT NULL DEFAULT 2,
      UNIQUE(scope_type, scope_id, week_id, rule_version)
    );

    -- 榜单隐私：public_display=0 隐藏昵称仍参与排名；opted_out=1 从榜单消失。
    CREATE TABLE IF NOT EXISTS leaderboard_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      public_display INTEGER NOT NULL DEFAULT 1,
      opted_out INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
}

const ROOM_ITEM_SEEDS = [
  { itemId: 'bookmark', name: '雨夜书签', sourceRuleKey: 'first_focus' },
  { itemId: 'lamp', name: '小台灯', sourceRuleKey: 'streak_7' },
  { itemId: 'plant', name: '绿植', sourceRuleKey: 'rainy_10h' },
  { itemId: 'group_photo', name: '自习伙伴合影', sourceRuleKey: 'sessions_100' },
  // P0-C Task 3：小组周目标达成收藏物（周结算发放，source 不走成就规则）
  { itemId: 'weekly_group_photo', name: '周目标合影', sourceRuleKey: 'weekly_settlement' },
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

  // P1-A 收费皮肤目录语义（docs/05 §4 权益键、计划 Task 1）：rainy 免费不建商品；
  // sunny 单买（¥12 = 1200 分，skin.official.{slug}）；midnight 属 Plus 目录
  // （catalog.premium.active）。审核态保持 pending_assets——收费语义只落在
  // access_type 与商品目录，不影响 P0-B 的发布/审核状态机。
  const ACCESS_SEEDS = [
    { slug: 'sunny-classroom', accessType: 'paid' },
    { slug: 'midnight-workstation', accessType: 'premium' },
  ] as const;
  for (const access of ACCESS_SEEDS) {
    await database.prepare(
      `UPDATE skins SET access_type = ? WHERE slug = ?`,
    ).run(access.accessType, access.slug);
  }

  const SKIN_PRODUCT_SEEDS = [
    {
      id: 'skin-product-sunny-classroom',
      slug: 'sunny-classroom',
      entitlementKey: 'skin.official.sunny-classroom',
      priceMinor: 1200,
    },
    {
      id: 'skin-product-midnight-workstation',
      slug: 'midnight-workstation',
      entitlementKey: 'catalog.premium.active',
      priceMinor: 1800,
    },
  ] as const;
  for (const product of SKIN_PRODUCT_SEEDS) {
    await database.prepare(
      `INSERT INTO skin_products(id, skin_id, entitlement_key, store_product_ids, price_minor, currency, status, created_at, updated_at)
       VALUES (?, (SELECT id FROM skins WHERE slug = ?), ?, '{}', ?, 'CNY', 'active', ?, ?)
       ON CONFLICT (id) DO NOTHING`,
    ).run(product.id, product.slug, product.entitlementKey, product.priceMinor, now, now);
  }
}
