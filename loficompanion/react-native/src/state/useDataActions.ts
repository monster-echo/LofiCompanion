import { Dispatch, SetStateAction, useMemo } from 'react';
import { apiClient, ApiClientError } from '../data/apiClient';
import { saveSessionToken } from '../data/storage';
import {
  AppUser,
  CouponView,
  NotificationItem,
  OrderView,
  ReferralView,
  SessionView,
  UsageSummary,
  UserSettings,
} from '../domain/models';
import { createPaymentProvider } from '../payment/paymentFactory';
import { IapError } from '../payment/iapPaymentProvider';
import { i18n } from '../i18n/core';
import { Platform } from 'react-native';
import type { PurchaseState } from './AppStore';

type Run = <T>(operation: () => Promise<T>) => Promise<T>;

export type DataActions = Readonly<{
  updateProfile: (patch: {
    displayName?: string;
    bio?: string;
    avatarUrl?: string | null;
  }) => Promise<boolean>;
  saveSettings: (patch: UserSettings) => Promise<boolean>;
  changePassword: (current: string, next: string) => Promise<boolean>;
  deleteAccount: (password: string) => Promise<boolean>;
  purchase: (planId: string) => Promise<boolean>;
  /** 恢复购买：商店已购 → 服务端按票据重验 → 权益合并（IAP 沙盒/换机场景） */
  restorePurchases: () => Promise<boolean>;
  loadSessions: () => Promise<readonly SessionView[]>;
  revokeSession: (id: string) => Promise<boolean>;
  loadNotifications: () => Promise<readonly NotificationItem[]>;
  markNotificationsRead: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<boolean>;
  deleteNotification: (id: string) => Promise<boolean>;
  loadOrders: () => Promise<readonly OrderView[]>;
  loadUsage: () => Promise<UsageSummary>;
  loadCoupons: () => Promise<readonly CouponView[]>;
  loadReferral: () => Promise<ReferralView>;
}>;

export function useDataActions(
  run: Run,
  setUser: Dispatch<SetStateAction<AppUser | null>>,
  user: AppUser | null,
  setPurchaseState: Dispatch<SetStateAction<PurchaseState>>,
): DataActions {
  return useMemo(() => ({
    updateProfile: async (patch: {
      displayName?: string;
      bio?: string;
      avatarUrl?: string | null;
    }) => {
      try { setUser(await run(() => apiClient.updateProfile(patch))); return true; }
      catch { return false; }
    },
    saveSettings: async (patch: UserSettings) => {
      try {
        const settings = await run(() => apiClient.saveSettings(patch));
        if (user) setUser({ ...user, settings });
        return true;
      } catch { return false; }
    },
    changePassword: async (current: string, next: string) => {
      try {
        await run(() => apiClient.changePassword(current, next));
        await saveSessionToken(null);
        setUser(null);
        return true;
      } catch { return false; }
    },
    deleteAccount: async (password: string) => {
      try {
        await run(() => apiClient.deleteAccount(password));
        await saveSessionToken(null);
        setUser(null);
        return true;
      } catch { return false; }
    },
    purchase: async (planId: string) => {
      setPurchaseState({ kind: 'loading' });
      try {
        const idempotencyKey = `rn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const order = await run(() => apiClient.createOrder(planId, idempotencyKey));
        const provider = createPaymentProvider(order);
        let result;
        try {
          result = await run(() => provider.purchase(order.storeProductId));
        } catch (error) {
          // 用户取消购买：静默回 idle，不报错误
          if (error instanceof IapError && error.kind === 'cancelled') {
            setPurchaseState({ kind: 'idle' });
            return false;
          }
          throw error;
        }
        const verified = await run(() => apiClient.verifyPurchase(order.orderId, result.receipt));
        if (verified.status === 'success') {
          // 权益已入账后才 finish 交易（未 finish 的交易可自愈重试）
          await provider.finish?.(result).catch(() => undefined);
        }
        setPurchaseState(verified.status === 'success'
          ? { kind: 'success', order: verified }
          : { kind: 'failed', order: verified });
        if (verified.status === 'success') {
          try { setUser((await run(apiClient.bootstrap)).user); } catch { /* best-effort */ }
        }
        return verified.status === 'success';
      } catch (error) {
        if (error instanceof ApiClientError) {
          setPurchaseState(error.status === 0
            ? { kind: 'offline' }
            : { kind: 'error', message: error.message });
        } else {
          setPurchaseState({
            kind: 'error',
            message: error instanceof Error ? error.message : i18n.t('errors:purchaseFailed'),
          });
        }
        return false;
      }
    },
    restorePurchases: async () => {
      const provider = createPaymentProvider({ provider: Platform.OS === 'ios' ? 'apple' : 'google' });
      const receipts = (await run(() => provider.restore())).map((item) => item.receipt);
      if (receipts.length === 0) return false;
      const { entitlements } = await run(() => apiClient.restore(receipts));
      if (entitlements.length > 0) {
        try { setUser((await run(apiClient.bootstrap)).user); } catch { /* best-effort */ }
        return true;
      }
      return false;
    },
    loadSessions: () => run(apiClient.sessions),
    revokeSession: async (id: string) => {
      try { return (await run(() => apiClient.revokeSession(id))).revoked; }
      catch { return false; }
    },
    loadNotifications: () => run(apiClient.notifications),
    markNotificationsRead: async () => { await run(apiClient.readAllNotifications); },
    markNotificationRead: async (id: string) => {
      try { return (await run(() => apiClient.readNotification(id))).read; }
      catch { return false; }
    },
    deleteNotification: async (id: string) => {
      try { return (await run(() => apiClient.deleteNotification(id))).deleted; }
      catch { return false; }
    },
    loadOrders: () => run(apiClient.orders),
    loadUsage: () => run(apiClient.usage),
    loadCoupons: () => run(apiClient.coupons),
    loadReferral: () => run(apiClient.referral),
  }), [run, setPurchaseState, setUser, user]);
}
