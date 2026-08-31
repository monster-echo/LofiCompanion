import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * S04 右上快捷区开关（屏幕常亮 / 静音）的本地持久化。
 * AsyncStorage 直读直写：首帧用缺省值渲染，磁盘值到达后覆盖——
 * 两项都无布局影响（仅图标/描边与 wake lock），不做 ready 门控。
 * 静音为预置开关：音频功能已落地，muted 经 FocusApi.setMusicMuted 驱动音乐控制器。
 */

const KEYS = {
  muted: 'focus.prefs.soundMuted',
  keepAwake: 'focus.prefs.keepAwake',
} as const;

/** 缺省：有声、专注期间防息屏（写作业场景息屏即中断陪伴） */
const DEFAULTS = { muted: false, keepAwake: true } as const;

function usePersistedBool(key: string, fallback: boolean) {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (alive && raw !== null) setValue(raw === '1');
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key]);
  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      AsyncStorage.setItem(key, next ? '1' : '0').catch(() => undefined);
    },
    [key],
  );
  return [value, set] as const;
}

export function useFocusQuickPrefs(): Readonly<{
  muted: boolean;
  setMuted: (next: boolean) => void;
  keepAwake: boolean;
  setKeepAwake: (next: boolean) => void;
}> {
  const [muted, setMuted] = usePersistedBool(KEYS.muted, DEFAULTS.muted);
  const [keepAwake, setKeepAwake] = usePersistedBool(
    KEYS.keepAwake,
    DEFAULTS.keepAwake,
  );
  return { muted, setMuted, keepAwake, setKeepAwake };
}
