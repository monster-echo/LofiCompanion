import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { RuntimeConfig } from '../domain/models';

const tokenKey = 'mobileui.session';
const refreshTokenKey = 'mobileui.session.refresh';
const configKey = 'mobileui.config.lastKnownGood';
const anonymousKey = 'mobileui.telemetry.anonymousId';
const telemetryQueueKey = 'mobileui.telemetry.queue';
const localeOverrideKey = 'mobileui.preferences.localeOverride';
const themeOverrideKey = 'mobileui.preferences.themeOverride';
let anonymousIdPromise: Promise<string> | null = null;

// 访客语言覆盖（登录用户走服务端 user.settings.language，优先级更高）。
export async function readLocaleOverride(): Promise<'zh-CN' | 'en-US' | null> {
  const raw = await AsyncStorage.getItem(localeOverrideKey);
  return raw === 'zh-CN' || raw === 'en-US' ? raw : null;
}

export async function saveLocaleOverride(locale: 'zh-CN' | 'en-US' | null) {
  if (locale) await AsyncStorage.setItem(localeOverrideKey, locale);
  else await AsyncStorage.removeItem(localeOverrideKey);
}

// 访客主题覆盖（登录用户走服务端 user.settings.theme，优先级更高）。
// 登录页必然 user=null：没有这层覆盖，登录后选的 dark 在登出/冷启动时
// 塌缩回 system，登录页会跟随系统亮暗（issue：dark 模式登录页是 light）。
export type ThemeOverride = 'system' | 'light' | 'dark';

export async function readThemeOverride(): Promise<ThemeOverride | null> {
  const raw = await AsyncStorage.getItem(themeOverrideKey);
  return raw === 'system' || raw === 'light' || raw === 'dark' ? raw : null;
}

export async function saveThemeOverride(mode: ThemeOverride | null) {
  if (mode) await AsyncStorage.setItem(themeOverrideKey, mode);
  else await AsyncStorage.removeItem(themeOverrideKey);
}

export async function readSessionToken() {
  if (Platform.OS === 'web') return window.localStorage.getItem(tokenKey);
  return SecureStore.getItemAsync(tokenKey);
}

export async function saveSessionToken(token: string | null) {
  if (Platform.OS === 'web') {
    if (token) window.localStorage.setItem(tokenKey, token);
    else window.localStorage.removeItem(tokenKey);
    return;
  }
  if (token) await SecureStore.setItemAsync(tokenKey, token);
  else await SecureStore.deleteItemAsync(tokenKey);
}

export async function readRefreshToken() {
  if (Platform.OS === 'web') return window.localStorage.getItem(refreshTokenKey);
  return SecureStore.getItemAsync(refreshTokenKey);
}

export async function saveRefreshToken(token: string | null) {
  if (Platform.OS === 'web') {
    if (token) window.localStorage.setItem(refreshTokenKey, token);
    else window.localStorage.removeItem(refreshTokenKey);
    return;
  }
  if (token) await SecureStore.setItemAsync(refreshTokenKey, token);
  else await SecureStore.deleteItemAsync(refreshTokenKey);
}

export async function clearAuthStorage() {
  await saveSessionToken(null);
  await saveRefreshToken(null);
}

export async function readCachedConfig(): Promise<RuntimeConfig | null> {
  const value = await AsyncStorage.getItem(configKey);
  if (!value) return null;
  try {
    const config = JSON.parse(value) as RuntimeConfig;
    return config.schemaVersion === 1 ? config : null;
  } catch {
    return null;
  }
}

export async function saveCachedConfig(config: RuntimeConfig) {
  await AsyncStorage.setItem(configKey, JSON.stringify(config));
}

async function loadAnonymousId() {
  const existing = await AsyncStorage.getItem(anonymousKey);
  if (existing) return existing;
  const created = `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await AsyncStorage.setItem(anonymousKey, created);
  return created;
}

export function readAnonymousId() {
  anonymousIdPromise ??= loadAnonymousId();
  return anonymousIdPromise;
}

export async function readTelemetryQueue<T>() {
  const value = await AsyncStorage.getItem(telemetryQueueKey);
  if (!value) return [] as T[];
  try {
    const items = JSON.parse(value) as T[];
    return Array.isArray(items) ? items : [];
  } catch {
    return [] as T[];
  }
}

export async function saveTelemetryQueue<T>(items: readonly T[]) {
  if (items.length) {
    await AsyncStorage.setItem(telemetryQueueKey, JSON.stringify(items));
  } else {
    await AsyncStorage.removeItem(telemetryQueueKey);
  }
}

export async function measureLocalStorage() {
  const keys = await AsyncStorage.getAllKeys();
  const entries = await AsyncStorage.multiGet(keys);
  const bytes = entries.reduce(
    (total, [key, value]) => total + key.length * 2 + (value?.length ?? 0) * 2,
    0,
  );
  return { keys: keys.length, bytes };
}

export async function clearNonEssentialStorage() {
  await AsyncStorage.multiRemove([telemetryQueueKey]);
  return measureLocalStorage();
}

// —— P0-C：我的小组本地引用 ——
// 服务端无「我所在小组」查询端点（docs/04 §3 只有小组成员视角的组详情），
// 客户端在建组/入组成功时记录 {groupId, groupName}；组已不可见（403/404）时清除。
const myGroupKey = 'loficompanion.leaderboard.myGroup';

export interface MyGroupRef {
  groupId: string;
  groupName: string;
}

export async function readMyGroup(): Promise<MyGroupRef | null> {
  const raw = await AsyncStorage.getItem(myGroupKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MyGroupRef;
    return typeof parsed.groupId === 'string' && parsed.groupId ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveMyGroup(group: MyGroupRef | null): Promise<void> {
  if (group) await AsyncStorage.setItem(myGroupKey, JSON.stringify(group));
  else await AsyncStorage.removeItem(myGroupKey);
}
