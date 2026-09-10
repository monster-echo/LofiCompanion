import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isUsableTrial } from '../src/features/store/data/entitlement-service';
import { trialTtlHours } from '../src/features/store/data/trial-service';

// 试用窗口判定（纯函数，无 DB）：isUsableTrial 边界 + TTL env 旋钮。
// 「限一次」的行存在性语义与门禁分叉由 Prisma UNIQUE + 集成验证兜底。

const NOW = '2026-09-09T12:00:00.000Z';

describe('isUsableTrial', () => {
  it('未过期 → true（窗口内可用）', () => {
    assert.equal(isUsableTrial('2026-09-10T12:00:00.000Z', NOW), true);
  });

  it('已过期 → false', () => {
    assert.equal(isUsableTrial('2026-09-09T11:59:59.000Z', NOW), false);
  });

  it('边界：expiresAt == now → false（到点即失效）', () => {
    assert.equal(isUsableTrial(NOW, NOW), false);
  });

  it('null expires_at → false（试用键缺窗口一律不可用）', () => {
    assert.equal(isUsableTrial(null, NOW), false);
  });

  it('坏 ISO → false（数据异常不放大权限）', () => {
    assert.equal(isUsableTrial('not-a-date', NOW), false);
  });
});

describe('trialTtlHours', () => {
  it('缺省 24h', () => {
    delete process.env.SKIN_TRIAL_TTL_HOURS;
    assert.equal(trialTtlHours(), 24);
  });

  it('env 可调（E2E 短 TTL 旋钮）；非法值回落缺省', () => {
    process.env.SKIN_TRIAL_TTL_HOURS = '1';
    assert.equal(trialTtlHours(), 1);
    process.env.SKIN_TRIAL_TTL_HOURS = 'not-a-number';
    assert.equal(trialTtlHours(), 24);
    process.env.SKIN_TRIAL_TTL_HOURS = '0';
    assert.equal(trialTtlHours(), 24);
    delete process.env.SKIN_TRIAL_TTL_HOURS;
  });
});
