import { RuntimeConfig } from '@/domain/config';
import { createId } from './ids';
import {
  database,
  getConfigDraft,
  getRuntimeConfig,
  nowIso,
  saveRuntimeConfig,
} from './database';
import { ApiError } from './http';

export type ConfigScope = Readonly<{ appId: string; environment: string }>;

export async function publishDraft(scope: ConfigScope, actor: string) {
  const draft = await getConfigDraft(scope.appId, scope.environment);
  if (!draft) throw new ApiError(409, 'DRAFT_REQUIRED', '请先保存配置草稿');
  const current = await getRuntimeConfig(scope.appId, scope.environment);
  const published = { ...draft, version: current.version + 1 };
  await commitRevision(scope, current.version, published, 'publish', actor, {});
  await database.prepare(
    'DELETE FROM config_drafts WHERE app_id = ? AND environment = ?',
  ).run(scope.appId, scope.environment);
  return published;
}

export async function rollbackConfig(scope: ConfigScope, version: number, actor: string) {
  const row = await database.prepare(`
    SELECT document FROM config_revisions
    WHERE app_id = ? AND environment = ? AND version = ?
  `).get(scope.appId, scope.environment, version) as { document: string } | undefined;
  if (!row) throw new ApiError(404, 'REVISION_NOT_FOUND', '配置版本不存在');
  const current = await getRuntimeConfig(scope.appId, scope.environment);
  const restored = {
    ...JSON.parse(row.document) as RuntimeConfig,
    version: current.version + 1,
  };
  await commitRevision(scope, current.version, restored, 'rollback', actor, {
    restoredFromVersion: version,
  });
  return restored;
}

export async function listConfigRevisions(scope: ConfigScope) {
  const rows = await database.prepare(`
    SELECT version, action, actor, created_at AS createdAt
    FROM config_revisions WHERE app_id = ? AND environment = ?
    ORDER BY version DESC LIMIT 100
  `).all(scope.appId, scope.environment);
  return rows;
}

export async function listConfigAudit(scope: ConfigScope) {
  const rows = await database.prepare(`
    SELECT id, action, actor, from_version AS fromVersion,
      to_version AS toVersion, metadata, created_at AS createdAt
    FROM config_audit WHERE app_id = ? AND environment = ?
    ORDER BY created_at DESC LIMIT 100
  `).all(scope.appId, scope.environment);
  return rows.map((row) => {
    const item = row as Record<string, unknown>;
    return { ...item, metadata: JSON.parse(item.metadata as string) };
  });
}

async function commitRevision(
  scope: ConfigScope,
  fromVersion: number,
  config: RuntimeConfig,
  action: 'publish' | 'rollback',
  actor: string,
  metadata: Record<string, unknown>,
) {
  await database.transaction(async () => {
    await saveRuntimeConfig(config, scope.appId, scope.environment);
    await database.prepare(`
      INSERT INTO config_revisions(
        id, app_id, environment, version, document, action, actor, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      createId(), scope.appId, scope.environment, config.version,
      JSON.stringify(config), action, actor, nowIso(),
    );
    await database.prepare(`
      INSERT INTO config_audit(
        id, app_id, environment, action, actor, from_version,
        to_version, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      createId(), scope.appId, scope.environment, action, actor,
      fromVersion, config.version, JSON.stringify(metadata), nowIso(),
    );
  });
}
