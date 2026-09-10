import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import { apiClient } from '../../../data/apiClient';
import { useApp } from '../../../state/AppStore';
import type { StorageDriver } from '../../focus/data/storageDriver';
import { createSkinTrialRepository } from '../data/skinTrialRepository';
import {
  createSkinTrialController,
  type SkinTrialController,
} from './skinTrialController';

/**
 * 皮肤试用全局单例（对齐 FocusProvider 模式）：本地水合 + 登录态就绪后服务端
 * 对账。context value 随版本号换新对象——订阅组件在试用状态变化时重渲染，
 * 而控制器方法恒读最新内存态。
 */

// 与 FocusStore 相同的 AsyncStorage 适配
const storageDriver: StorageDriver = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
};

const SkinTrialContext = createContext<{ controller: SkinTrialController; version: number } | null>(
  null,
);

export function SkinTrialProvider({ children }: Readonly<{ children: ReactNode }>): React.JSX.Element {
  const { signedIn } = useApp();
  const [controller] = useState<SkinTrialController>(() => {
    const repo = createSkinTrialRepository(storageDriver);
    return createSkinTrialController({
      loadTrials: () => repo.load(),
      saveTrial: (slug, record) => repo.saveTrial(slug, record),
      markEnded: (slug, reason, now) => repo.markEnded(slug, reason, now),
    });
  });

  // 启动水合：本地记录立即可判 used/active（离线也能执行到期回落）
  useEffect(() => {
    void controller.hydrateFromLocal();
  }, [controller]);

  // 服务端对账（「试过没有」的唯一真相）：登录态就绪时拉取；失败保持
  // unknown（不出试用入口，保守）。登出不清本地记录——限一次语义以服务端为准。
  useEffect(() => {
    if (!signedIn) return;
    void apiClient.skinTrials()
      .then(({ trials }) => controller.reconcileFromServer(trials))
      .catch(() => undefined);
  }, [controller, signedIn]);

  const version = useSyncExternalStore(controller.subscribe, controller.getVersion);
  const value = useMemo(() => ({ controller, version }), [controller, version]);
  return <SkinTrialContext.Provider value={value}>{children}</SkinTrialContext.Provider>;
}

export function useSkinTrials(): SkinTrialController {
  const value = useContext(SkinTrialContext);
  if (!value) throw new Error('useSkinTrials must be used inside SkinTrialProvider');
  return value.controller;
}
