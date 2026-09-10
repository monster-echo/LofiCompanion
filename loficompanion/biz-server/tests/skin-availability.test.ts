import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiError } from '../src/lib/apiError';
import { validateAvailabilityWindow } from '../src/features/skins/data/repository';

// 限时窗口 + Plus 会员价发布纪律（纯函数，无 DB）。

const codeOf = (error: unknown): string =>
  (error as { code?: string }).code ?? '';

describe('validateAvailabilityWindow', () => {
  it('合法窗口（from < until）通过', () => {
    validateAvailabilityWindow({
      accessType: 'paid',
      priceMinor: 99,
      availableFrom: '2026-09-01T00:00:00.000Z',
      availableUntil: '2026-10-01T00:00:00.000Z',
    });
  });

  it('from ≥ until 拒绝', () => {
    assert.throws(
      () => validateAvailabilityWindow({
        accessType: 'paid',
        priceMinor: 99,
        availableFrom: '2026-10-01T00:00:00.000Z',
        availableUntil: '2026-09-01T00:00:00.000Z',
      }),
      (error: unknown) => error instanceof ApiError && codeOf(error) === 'INVALID_AVAILABILITY',
    );
  });

  it('坏 ISO 拒绝', () => {
    assert.throws(
      () => validateAvailabilityWindow({
        accessType: 'paid',
        priceMinor: 99,
        availableFrom: 'not-a-date',
      }),
      (error: unknown) => error instanceof ApiError && codeOf(error) === 'INVALID_AVAILABILITY',
    );
  });

  it('plusPriceMinor 仅 paid 有效（free 携带即拒）', () => {
    assert.throws(
      () => validateAvailabilityWindow({
        accessType: 'free',
        priceMinor: 0,
        plusPriceMinor: 49,
      }),
      (error: unknown) => error instanceof ApiError && codeOf(error) === 'INVALID_AVAILABILITY',
    );
  });

  it('plusPriceMinor 必须 < priceMinor（倒挂拒）', () => {
    assert.throws(
      () => validateAvailabilityWindow({
        accessType: 'paid',
        priceMinor: 99,
        plusPriceMinor: 99,
      }),
      (error: unknown) => error instanceof ApiError && codeOf(error) === 'INVALID_AVAILABILITY',
    );
    assert.throws(
      () => validateAvailabilityWindow({
        accessType: 'paid',
        priceMinor: 99,
        plusPriceMinor: -1,
      }),
      (error: unknown) => error instanceof ApiError && codeOf(error) === 'INVALID_AVAILABILITY',
    );
  });

  it('合法折扣价通过；全空输入通过（常态无窗口无折扣）', () => {
    validateAvailabilityWindow({
      accessType: 'paid',
      priceMinor: 99,
      plusPriceMinor: 49,
    });
    validateAvailabilityWindow({ accessType: 'free' });
  });
});
