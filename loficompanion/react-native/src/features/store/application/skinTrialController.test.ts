import { describe, expect, it, vi } from 'vitest';
import {
  createSkinTrialController,
  type SkinTrialControllerDeps,
} from './skinTrialController';
import type { SkinTrialRecord } from '../data/skinTrialRepository';

// telemetry 顶层 import 拉进 react-native（node 测试不可加载）——与
// skinPackController.test.ts 同范式 mock 掉。
const trackMock = vi.hoisted(() => vi.fn());
vi.mock('../../../telemetry/Telemetry', () => ({ telemetry: { track: trackMock } }));

// 试用状态机测试（注入时钟）：start→active→expired、abandon、purchased、
// 服务端对账方向、unknown 保守语义。

function makeDeps(now: () => number) {
  const store = new Map<string, SkinTrialRecord>();
  const deps: SkinTrialControllerDeps = {
    loadTrials: async () => Object.fromEntries(store),
    saveTrial: async (slug, record) => {
      store.set(slug, record);
    },
    markEnded: async (slug, reason, at) => {
      const record = store.get(slug);
      if (record && record.endedAtUtc === undefined) {
        store.set(slug, { ...record, endedAtUtc: at, endReason: reason });
      }
    },
    now,
  };
  return { deps, store };
}

describe('createSkinTrialController', () => {
  it('初始（无记录、未对账）→ unknown：不出试用入口', () => {
    const { deps } = makeDeps(() => 1000);
    const controller = createSkinTrialController(deps);
    expect(controller.statusFor('midnight-workstation')).toBe('unknown');
  });

  it('服务端对账无记录 → none（可出试用入口）', async () => {
    const { deps } = makeDeps(() => 1000);
    const controller = createSkinTrialController(deps);
    await controller.reconcileFromServer([]);
    expect(controller.statusFor('midnight-workstation')).toBe('none');
  });

  it('markStarted → active；过期 → used', async () => {
    let now = 1_000_000;
    const { deps } = makeDeps(() => now);
    const controller = createSkinTrialController(deps);
    await controller.reconcileFromServer([]);
    await controller.markStarted({ slug: 'mw', expiresAtUtc: now + 86_400_000 });
    expect(controller.statusFor('mw')).toBe('active');
    expect(controller.isTrialActive('mw')).toBe(true);

    now += 86_400_001;
    expect(controller.statusFor('mw')).toBe('used');
    expect(controller.isTrialActive('mw')).toBe(false);
  });

  it('markEnded(abandoned) → used：不再出试用入口', async () => {
    let now = 1_000_000;
    const { deps } = makeDeps(() => now);
    const controller = createSkinTrialController(deps);
    await controller.reconcileFromServer([]);
    await controller.markStarted({ slug: 'mw', expiresAtUtc: now + 86_400_000 });
    now += 1000;
    await controller.markEnded('mw', 'abandoned');
    expect(controller.statusFor('mw')).toBe('used');
  });

  it('markEnded 幂等：重复收尾不覆盖首个原因', async () => {
    let now = 1_000_000;
    const { deps, store } = makeDeps(() => now);
    const controller = createSkinTrialController(deps);
    await controller.reconcileFromServer([]);
    await controller.markStarted({ slug: 'mw', expiresAtUtc: now + 86_400_000 });
    await controller.markEnded('mw', 'purchased');
    await controller.markEnded('mw', 'abandoned');
    expect(store.get('mw')?.endReason).toBe('purchased');
  });

  it('对账方向：本地缺失补为 used（含过期）；本地 active 不被服务端覆盖', async () => {
    let now = 1_000_000;
    const { deps } = makeDeps(() => now);
    const controller = createSkinTrialController(deps);

    // 服务端有记录（另一设备试用过）→ 补为 used
    await controller.reconcileFromServer([
      { slug: 'mw', expiresAt: new Date(now + 86_400_000).toISOString() },
    ]);
    expect(controller.statusFor('mw')).toBe('used');

    // 本地 active（本机试用中）→ 服务端没有也不降级为 none/used
    await controller.markStarted({ slug: 'sunny', expiresAtUtc: now + 1000 });
    await controller.reconcileFromServer([]);
    expect(controller.statusFor('sunny')).toBe('active');

    now += 2000;
    expect(controller.statusFor('sunny')).toBe('used');
  });

  it('本地水合：离线启动也能判 used（过期回落不依赖网络）', async () => {
    let now = 5_000_000;
    const { deps } = makeDeps(() => now);
    const controller = createSkinTrialController(deps);
    // 预置本地记录（模拟上次安装写入）
    await deps.saveTrial('mw', {
      startedAtUtc: 0,
      expiresAtUtc: 2_000_000, // 已过期
    });
    await controller.hydrateFromLocal();
    expect(controller.statusFor('mw')).toBe('used');
    // 未过期记录水合后为 active
    await deps.saveTrial('sunny', { startedAtUtc: 0, expiresAtUtc: now + 1000 });
    await controller.hydrateFromLocal();
    expect(controller.statusFor('sunny')).toBe('active');
  });

  it('unendedTrials 只列未收尾记录（含未到期）', async () => {
    let now = 1_000_000;
    const { deps } = makeDeps(() => now);
    const controller = createSkinTrialController(deps);
    await controller.markStarted({ slug: 'a', expiresAtUtc: now + 1000 });
    await controller.markStarted({ slug: 'b', expiresAtUtc: now + 2000 });
    await controller.markEnded('a', 'purchased');
    const unended = controller.unendedTrials().map((trial) => trial.slug);
    expect(unended).toEqual(['b']);
  });
});
