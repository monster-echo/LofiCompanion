import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { manifestEntitlementSatisfied } from '../src/features/store/data/entitlement-service';

// manifest 门禁键匹配（纯函数，无 DB）：试用键放行是本文件的核心回归——
// 2026-09-11 线上事故：试用发放 skin.trial.{slug}、门禁只比 skin.official.{slug}，
// 试用用户拉清单 403 → 详情页「下载资源包并使用」秒失败（gated 误报为下载失败）。

const OFFICIAL = 'skin.official.midnight-workstation';
const TRIAL = 'skin.trial.midnight-workstation';

describe('manifestEntitlementSatisfied', () => {
  it('paid：窗口内试用键放行（回归：此前 403 秒失败）', () => {
    assert.equal(
      manifestEntitlementSatisfied({ accessType: 'paid', slug: 'midnight-workstation', keys: [TRIAL] }),
      true,
    );
  });

  it('paid：正式键放行（购买路径不受影响）', () => {
    assert.equal(
      manifestEntitlementSatisfied({ accessType: 'paid', slug: 'midnight-workstation', keys: [OFFICIAL] }),
      true,
    );
  });

  it('paid：两键皆无 → 拒绝（未购未试用）', () => {
    assert.equal(
      manifestEntitlementSatisfied({ accessType: 'paid', slug: 'midnight-workstation', keys: [] }),
      false,
    );
    assert.equal(
      manifestEntitlementSatisfied({
        accessType: 'paid',
        slug: 'midnight-workstation',
        keys: ['skin.official.sunny-classroom', 'skin.trial.sunny-classroom'],
      }),
      false,
    );
  });

  it('paid：listUsableSkinEntitlementKeys 已滤过期试用——过期试用键在此不可达，此处不重复判窗', () => {
    // 门禁侧键集来自 listUsable（窗口过滤在那层）；本函数只做键匹配。
    // 若上游误传过期试用键，此处会放行——约定由调用方契约保证（doc 注释）。
    assert.equal(
      manifestEntitlementSatisfied({ accessType: 'paid', slug: 'midnight-workstation', keys: [TRIAL] }),
      true,
    );
  });

  it('premium：只认会员键，试用键不放行', () => {
    assert.equal(
      manifestEntitlementSatisfied({ accessType: 'premium', slug: 'midnight-workstation', keys: ['catalog.premium.active'] }),
      true,
    );
    assert.equal(
      manifestEntitlementSatisfied({ accessType: 'premium', slug: 'midnight-workstation', keys: [TRIAL, OFFICIAL] }),
      false,
    );
  });

  it('free：恒放行（调用方已对 free 短路，此处兜底语义）', () => {
    assert.equal(
      manifestEntitlementSatisfied({ accessType: 'free', slug: 'sunny-classroom', keys: [] }),
      true,
    );
  });
});
