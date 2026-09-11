import { describe, expect, it } from 'vitest';
import { createPendingOrderRepository } from './pendingOrderRepository';
import type { StorageDriver } from '../../focus/data/storageDriver';

function memoryDriver(): StorageDriver & { dump: () => Map<string, string> } {
  const store = new Map<string, string>();
  return {
    get: async (key) => store.get(key) ?? null,
    set: async (key, value) => void store.set(key, value),
    remove: async (key) => void store.delete(key),
    dump: () => store,
  };
}

describe('createPendingOrderRepository（docs/05 §5 中断恢复本地记录）', () => {
  it('save 后同账号 load 命中；clear 后为 null', async () => {
    const driver = memoryDriver();
    const repo = createPendingOrderRepository(driver);
    const userA = 'user-aaaa';
    expect(await repo.load('sunny-classroom', userA)).toBeNull();
    await repo.save('sunny-classroom', 'order-1', userA);
    expect(await repo.load('sunny-classroom', userA)).toBe('order-1');
    await repo.clear('sunny-classroom');
    expect(await repo.load('sunny-classroom', userA)).toBeNull();
  });

  it('多皮肤互不干扰；同 slug 覆盖旧记录', async () => {
    const repo = createPendingOrderRepository(memoryDriver());
    await repo.save('sunny-classroom', 'order-a', 'user-1');
    await repo.save('midnight-workstation', 'order-b', 'user-1');
    await repo.save('sunny-classroom', 'order-a2', 'user-1');
    expect(await repo.load('sunny-classroom', 'user-1')).toBe('order-a2');
    expect(await repo.load('midnight-workstation', 'user-1')).toBe('order-b');
  });

  it('跨账号隔离：换账号 load 为 null，且不销毁原账号记录', async () => {
    const repo = createPendingOrderRepository(memoryDriver());
    await repo.save('midnight-workstation', 'order-a', 'user-1');
    // 换账号后读不到（查单 404 死循环的根治）
    expect(await repo.load('midnight-workstation', 'user-2')).toBeNull();
    // 换回原账号仍可恢复
    expect(await repo.load('midnight-workstation', 'user-1')).toBe('order-a');
  });

  it('v1 无主残留（slug → orderId 字符串）读时清除自愈', async () => {
    const driver = memoryDriver();
    await driver.set(
      'lofi.store.pendingSkinOrders',
      JSON.stringify({ 'midnight-workstation': 'legacy-order-id' }),
    );
    const repo = createPendingOrderRepository(driver);
    // 任何账号都读不到，且残留被清除（不再无限轮询死单）
    expect(await repo.load('midnight-workstation', 'user-1')).toBeNull();
    expect(driver.dump().get('lofi.store.pendingSkinOrders')).not.toContain('legacy-order-id');
    // 清除后可正常写入新记录
    await repo.save('midnight-workstation', 'order-new', 'user-1');
    expect(await repo.load('midnight-workstation', 'user-1')).toBe('order-new');
  });

  it('损坏 JSON / 非法形态回退为空（不让渲染崩溃）', async () => {
    const driver = memoryDriver();
    await driver.set('lofi.store.pendingSkinOrders', '{broken');
    const repo = createPendingOrderRepository(driver);
    expect(await repo.load('sunny-classroom', 'user-1')).toBeNull();
    // 清除与写入在损坏数据上仍可用
    await repo.save('sunny-classroom', 'order-1', 'user-1');
    expect(await repo.load('sunny-classroom', 'user-1')).toBe('order-1');
  });

  it('clear 不存在的 slug 不产生写入', async () => {
    const driver = memoryDriver();
    const repo = createPendingOrderRepository(driver);
    await repo.clear('nope');
    expect(driver.dump().has('lofi.store.pendingSkinOrders')).toBe(false);
  });
});
