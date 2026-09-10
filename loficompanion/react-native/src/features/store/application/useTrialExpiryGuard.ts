import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { i18n } from '../../../i18n/core';
import { telemetry } from '../../../telemetry/Telemetry';
import { useApp } from '../../../state/AppStore';
import { useFocus } from '../../focus/application/FocusStore';
import { useSkinTrials } from './SkinTrialProvider';

/**
 * 试用到期回落守卫（挂载在首页——同时拿得到 FocusStore 与试用状态机）。
 * 无定时器：一切由时间戳推导，靠「挂载 / 前台恢复 / 会话与选肤状态变化 /
 * 试用版本号变化」重评驱动（对齐 FocusStore 的时间戳纪律）。
 *
 *  - 到期且非当前皮肤 → 仅收尾记录；
 *  - 到期且已购买 → 收尾为 purchased（皮肤保留，无需回落）；
 *  - 到期且是当前皮肤且未拥有 → 会话中/结算未确认时延后（下轮重评），
 *    否则回落 fallbackSkinId（缺失落首个非付费皮肤）+ toast；
 *  - 手动从试用皮肤切走 → 记录收尾为 abandoned（试用是商店域概念，
 *    不侵入 orchestrate.selectSkin）。
 */
export function useTrialExpiryGuard(options: {
  /** 该 slug 是否已正式拥有（首页的商品目录 + 权益键同源闭包） */
  isOwnedSlug: (slug: string) => boolean;
}): void {
  const focus = useFocus();
  const trials = useSkinTrials();
  const { showToast } = useApp();
  const { isOwnedSlug } = options;
  // 前台恢复的重评驱动：AppState active 时 +1 触发主 effect 重跑
  const [foregroundTick, setForegroundTick] = useState(0);

  useEffect(() => {
    const currentSlug = focus.skin.slug;
    for (const trial of trials.unendedTrials()) {
      if (trial.expiresAtUtc > Date.now()) continue;
      if (trial.slug !== currentSlug) {
        void trials.markEnded(trial.slug, 'expired');
        continue;
      }
      if (isOwnedSlug(trial.slug)) {
        void trials.markEnded(trial.slug, 'purchased');
        continue;
      }
      // 会话中/结算覆盖层未确认：不打断，靠状态变化触发下轮重评
      if (focus.activeSession !== null || focus.completions !== null) continue;

      // 回落：优先回到开启试用前的皮肤；不在注册表（LRU 清盘）则落首个非付费
      const fallback = (trial.fallbackSkinId
        ? focus.skins.find((skin) => skin.id === trial.fallbackSkinId)
        : undefined)
        ?? focus.skins.find((skin) => skin.accessType !== 'paid')
        ?? focus.skins[0];
      // 先收尾再 selectSkin：换肤监视器看到记录已 ended，不会误判 abandoned
      void trials.markEnded(trial.slug, 'expired');
      if (fallback && fallback.id !== focus.selectedSkinId) {
        focus.actions.selectSkin(fallback.id);
        telemetry.track('skin_trial_expired_fallback', {
          slug: trial.slug,
          fallback_skin_id: fallback.id,
        });
        showToast(i18n.t('store:trialEndedToast'), 'info');
      }
    }
  }, [
    focus,
    trials,
    isOwnedSlug,
    foregroundTick,
    focus.activeSession,
    focus.completions,
    focus.selectedSkinId,
    focus.skin,
    focus.skins,
  ]);

  // 手动换肤终止试用：从试用中皮肤切走（画廊应用/首页快切/商店免费卡）
  const lastSelectedRef = useRef(focus.selectedSkinId);
  useEffect(() => {
    const previousId = lastSelectedRef.current;
    if (previousId === focus.selectedSkinId) return;
    lastSelectedRef.current = focus.selectedSkinId;
    const previousSkin = focus.skins.find((skin) => skin.id === previousId);
    if (!previousSkin) return;
    // 记录已收尾（到期回落路径先行 markEnded）→ 此处为 no-op
    const unended = trials.unendedTrials().find((trial) => trial.slug === previousSkin.slug);
    if (unended) void trials.markEnded(previousSkin.slug, 'abandoned');
  }, [focus.selectedSkinId, focus.skins, trials]);

  // 后台→前台（含冷启动 active）：后台期间跨过到期点，回首页即刻回落
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') setForegroundTick((tick) => tick + 1);
    });
    return () => subscription.remove();
  }, []);
}
