import { telemetry } from '../../../telemetry/Telemetry';
import type { SkinTrialRecord } from '../data/skinTrialRepository';

/**
 * 皮肤试用状态机（可观察、node 可测，对齐 skinPackController 风格）：
 *  - 'active'：本地记录未结束且未过期（可用皮肤/放行快切）；
 *  - 'used'：有过试用记录（已结束或已过期）——不再出试用入口；
 *  - 'none'：服务端已确认无记录（可出「免费试 24 小时」）；
 *  - 'unknown'：服务端未同步成功（离线/未登录）——保守不出入口。
 *
 * 服务端（skin_entitlements trial 行）是「试过没有」的唯一真相：reconcile
 * 只把缺失补为 used，从不删改本地 active 记录（防服务端波动导致重复试用 UI）。
 * 「每皮肤限一次」的服务端兜底是 409 SKIN_TRIAL_ALREADY_USED。
 */

export type SkinTrialStatus = 'none' | 'unknown' | 'active' | 'used';

export interface SkinTrialControllerDeps {
  loadTrials(): Promise<Record<string, SkinTrialRecord>>;
  saveTrial(slug: string, record: SkinTrialRecord): Promise<void>;
  markEnded(slug: string, reason: 'expired' | 'abandoned' | 'purchased', now: number): Promise<void>;
  /** 测试注入时钟 */
  now?: () => number;
}

export interface UnendedTrial {
  slug: string;
  expiresAtUtc: number;
  fallbackSkinId?: string;
}

export interface SkinTrialController {
  statusFor(slug: string): SkinTrialStatus;
  /** 同步快路径（isLocked/画廊判锁用；等价 statusFor === 'active'） */
  isTrialActive(slug: string): boolean;
  /** 全部未收尾试用（含未到期；到期回落守卫遍历用） */
  unendedTrials(): readonly UnendedTrial[];
  /** useSyncExternalStore 快照：版本号（记录/可知态变化即递增） */
  getVersion(): number;
  subscribe(listener: () => void): () => void;
  /** 启动水合：读本地记录（serverKnown 不变——本地有记录即可判 used/active） */
  hydrateFromLocal(): Promise<void>;
  /** 服务端对账（登录/进详情页时）：补缺失为 used，并置 serverKnown */
  reconcileFromServer(trials: ReadonlyArray<{ slug: string; expiresAt: string }>): Promise<void>;
  markStarted(input: { slug: string; expiresAtUtc: number; fallbackSkinId?: string }): Promise<void>;
  markEnded(slug: string, reason: 'expired' | 'abandoned' | 'purchased'): Promise<void>;
}

export function createSkinTrialController(deps: SkinTrialControllerDeps): SkinTrialController {
  const now = deps.now ?? Date.now;
  let records: Record<string, SkinTrialRecord> = {};
  /** 服务端至少成功对账过一次（在此之前无记录按 unknown 处理——保守不出入口） */
  let serverKnown = false;
  let version = 0;
  const listeners = new Set<() => void>();

  function bump(): void {
    version += 1;
    for (const listener of listeners) listener();
  }

  function statusFor(slug: string): SkinTrialStatus {
    const record = records[slug];
    if (!record) return serverKnown ? 'none' : 'unknown';
    if (record.endedAtUtc !== undefined) return 'used';
    return record.expiresAtUtc > now() ? 'active' : 'used';
  }

  return {
    statusFor,
    isTrialActive(slug) {
      return statusFor(slug) === 'active';
    },
    unendedTrials() {
      return Object.entries(records)
        .filter(([, record]) => record.endedAtUtc === undefined)
        .map(([slug, record]) => ({
          slug,
          expiresAtUtc: record.expiresAtUtc,
          ...(record.fallbackSkinId !== undefined ? { fallbackSkinId: record.fallbackSkinId } : {}),
        }));
    },
    getVersion() {
      return version;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async hydrateFromLocal() {
      const stored = await deps.loadTrials();
      if (Object.keys(stored).length === 0) return;
      records = { ...records, ...stored };
      bump();
    },
    async reconcileFromServer(trials) {
      let changed = false;
      for (const trial of trials) {
        if (records[trial.slug]) continue; // 本地已有记录：以本地为准
        const expiresAtMs = Date.parse(trial.expiresAt);
        if (Number.isNaN(expiresAtMs)) continue;
        records = {
          ...records,
          [trial.slug]: {
            // 服务端不下发 startedAt（不可考）；0 = 占位，语义上已 used
            startedAtUtc: 0,
            expiresAtUtc: expiresAtMs,
            endedAtUtc: now(),
            endReason: 'expired',
          },
        };
        changed = true;
      }
      serverKnown = true;
      // serverKnown 翻转也影响 statusFor（unknown → none），统一 bump 重渲染
      bump();
      void changed;
    },
    async markStarted({ slug, expiresAtUtc, fallbackSkinId }) {
      const record: SkinTrialRecord = {
        startedAtUtc: now(),
        expiresAtUtc,
        ...(fallbackSkinId !== undefined ? { fallbackSkinId } : {}),
      };
      records = { ...records, [slug]: record };
      await deps.saveTrial(slug, record);
      bump();
      telemetry.track('skin_trial_started', {
        slug,
        ...(fallbackSkinId !== undefined ? { fallback_skin_id: fallbackSkinId } : {}),
      });
    },
    async markEnded(slug, reason) {
      const record = records[slug];
      if (!record || record.endedAtUtc !== undefined) return;
      records = {
        ...records,
        [slug]: { ...record, endedAtUtc: now(), endReason: reason },
      };
      await deps.markEnded(slug, reason, now());
      bump();
      if (reason === 'abandoned') telemetry.track('skin_trial_abandoned', { slug });
      if (reason === 'purchased') telemetry.track('skin_trial_purchased', { slug });
    },
  };
}
