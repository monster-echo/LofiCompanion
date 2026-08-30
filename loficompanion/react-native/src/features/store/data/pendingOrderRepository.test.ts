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
  it('save 后 load 命中；clear 后为 null', async () => {
    const driver = memoryDriver();
    const repo = createPendingOrderRepository(driver);
    expect(await repo.load('sunny-classroom')).toBeNull();
    await repo.save('sunny-classroom', 'order-1');
    expect(await repo.load('sunny-classroom')).toBe('order-1');
    await repo.clear('sunny-classroom');
    expect(await repo.load('sunny-classroom')).toBeNull();
  });

  it('多皮肤互不干扰；覆盖同 slug 旧记录', async () => {
    const repo = createPendingOrderRepository(memoryDriver());
    await repo.save('sunny-classroom', 'order-a');
    await repo.save('midnight-workstation', 'order-b');
    await repo.save('sunny-classroom', 'order-a2');
    expect(await repo.load('sunny-classroom')).toBe('order-a2');
    expect(await repo.load('midnight-workstation')).toBe('order-b');
  });

  it('损坏 JSON / 非法形态回退为空（不让渲染崩溃）', async () => {
    const driver = memoryDriver();
    await driver.set('lofi.store.pendingSkinOrders', '{broken');
    const repo = createPendingOrderRepository(driver);
    expect(await repo.load('sunny-classroom')).toBeNull();
    // 清除与写入在损坏数据上仍可用
    await repo.save('sunny-classroom', 'order-1');
    expect(await repo.load('sunny-classroom')).toBe('order-1');
  });

  it('clear 不存在的 slug 不产生写入', async () => {
    const driver = memoryDriver();
    const repo = createPendingOrderRepository(driver);
    await repo.clear('nope');
    expect(driver.dump().has('lofi.store.pendingSkinOrders')).toBe(false);
  });
});
