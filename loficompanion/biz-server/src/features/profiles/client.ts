import { ApiError } from '../../lib/http';
import { getAuthInternalBaseUrl, getInternalApiKey } from '../../env';

// 用户资料跨服务解析（替代 legacy 对 auth `users` 表的直接 JOIN）：biz 侧无
// users 表，昵称/头像统一走 auth 内部端点 GET /api/v1/internal/profiles?ids=…
// （x-internal-key 共享密钥鉴权）。nickname 归一口径在 auth 侧完成
// （COALESCE(NULLIF(display_name,''), username)），本层不做二次拼装。
// 60s 内存 TTL 缓存 + 并发去重；批量上限 200，超出自动分片；auth 成功响应里
// 缺席的 id 记 null（负缓存），调用方按各自语义兜底（'同学'/'已隐藏'/404）。

export interface ProfileBrief {
  nickname: string;
  avatarUrl: string | null;
}

const CACHE_TTL_MS = 60_000;
const BATCH_LIMIT = 200;

/** auth 响应缺席 id 的兜底昵称（legacy 线格式无此值；biz 跨服务容错新增）。 */
export const FALLBACK_NICKNAME = '同学';

export function profileWithFallback(profile: ProfileBrief | null): ProfileBrief {
  return profile ?? { nickname: FALLBACK_NICKNAME, avatarUrl: null };
}

interface CacheEntry {
  profile: ProfileBrief | null; // null = auth 侧确认不存在
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ProfileBrief | null>>();

function store(id: string, profile: ProfileBrief | null): void {
  cache.set(id, { profile, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function loadBatch(batch: ReadonlyArray<string>): Promise<void> {
  const url = `${getAuthInternalBaseUrl()}/api/v1/internal/profiles?ids=${encodeURIComponent(batch.join(','))}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'x-internal-key': getInternalApiKey() },
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(502, 'PROFILE_UNAVAILABLE', '用户资料服务暂不可用', true);
  }
  if (!response.ok) {
    throw new ApiError(502, 'PROFILE_UNAVAILABLE', '用户资料服务暂不可用', true);
  }
  const body = (await response.json()) as {
    data?: { profiles?: Array<{ id: string; nickname: string; avatarUrl: string | null }> };
  };
  const found = new Set<string>();
  for (const row of body.data?.profiles ?? []) {
    found.add(row.id);
    store(row.id, { nickname: row.nickname, avatarUrl: row.avatarUrl ?? null });
  }
  for (const id of batch) {
    if (!found.has(id)) store(id, null); // 负缓存：auth 侧无此用户
  }
}

/**
 * 批量解析用户资料：返回 Map 保证覆盖全部请求 id；auth 成功响应中缺席的 id
 * 值为 null（60s 负缓存）。auth 服务故障时抛 502 PROFILE_UNAVAILABLE（可重试），
 * 不静默降级——避免把兜底昵称固化进不可变周快照。
 */
export async function resolveProfiles(
  ids: ReadonlyArray<string>,
): Promise<Map<string, ProfileBrief | null>> {
  const result = new Map<string, ProfileBrief | null>();
  const pending = new Set<string>();
  const now = Date.now();
  for (const id of ids) {
    const hit = cache.get(id);
    if (hit && hit.expiresAt > now) result.set(id, hit.profile);
    else pending.add(id);
  }
  const unique = [...pending];
  const loads: Array<Promise<void>> = [];
  for (let start = 0; start < unique.length; start += BATCH_LIMIT) {
    const batch = unique.slice(start, start + BATCH_LIMIT);
    loads.push((async () => {
      // 并发去重：同批 id 只发一次内部请求
      const shared = batch.map((id) => {
        const existing = inflight.get(id);
        if (existing) return existing;
        const promise = (async () => {
          await loadBatch(batch);
          return cache.get(id)?.profile ?? null;
        })().finally(() => inflight.delete(id));
        inflight.set(id, promise);
        return promise;
      });
      const settled = await Promise.all(shared);
      batch.forEach((id, index) => result.set(id, settled[index] ?? null));
    })());
  }
  await Promise.all(loads);
  return result;
}
