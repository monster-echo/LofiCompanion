import { describe, expect, it } from 'vitest';
import { createSkinTrialRepository } from './skinTrialRepository';
import type { StorageDriver } from '../../focus/data/storageDriver';

// 试用本地记录仓储测试（内存 driver，对齐 pendingOrderRepository.test.ts）。

function memoryDriver(): StorageDriver & { dump: () => string | null } {
  let backing: string | null = null;
  return {
    get: async (key) => (key === 'lofi.skin.trials' ? backing : null),
    set: async (key, value) => {
      if (key === 'lofi.skin.trials') backing = value;
    },
    remove: async (key) => {
      if (key === 'lofi.skin.trials') backing = null;
    },
    dump: () => backing,
  };
}

describe('createSkinTrialRepository', () => {
  it('saveTrial / markEnded 往返', async () => {
    const driver = memoryDriver();
    const repo = createSkinTrialRepository(driver);
    await repo.saveTrial('mw', { startedAtUtc: 1, expiresAtUtc: 2_000 });
    expect(await repo.load()).toEqual({ mw: { startedAtUtc: 1, expiresAtUtc: 2_000 } });

    await repo.markEnded('mw', 'expired', 3_000);
    expect((await repo.load()).mw).toMatchObject({ endedAtUtc: 3_000, endReason: 'expired' });
  });

  it('markEnded 幂等：已收尾不覆盖', async () => {
    const repo = createSkinTrialRepository(memoryDriver());
    await repo.saveTrial('mw', { startedAtUtc: 1, expiresAtUtc: 2_000 });
    await repo.markEnded('mw', 'purchased', 3_000);
    await repo.markEnded('mw', 'abandoned', 4_000);
    expect((await repo.load()).mw?.endReason).toBe('purchased');
  });

  it('损坏 JSON / 非法记录 → 空对象（不抛）', async () => {
    const driver = memoryDriver();
    await driver.set('lofi.skin.trials', '{broken');
    let repo = createSkinTrialRepository(driver);
    expect(await repo.load()).toEqual({});

    await driver.set('lofi.skin.trials', JSON.stringify({
      bad: { startedAtUtc: 'x' },
      good: { startedAtUtc: 1, expiresAtUtc: 2, endReason: 'nope' },
    }));
    repo = createSkinTrialRepository(driver);
    const loaded = await repo.load();
    expect(Object.keys(loaded)).toEqual(['good']);
    expect(loaded.good?.endReason).toBeUndefined();
  });
});
