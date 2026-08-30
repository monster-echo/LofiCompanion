import React from 'react';
import { Pressable, Text } from 'react-native';
import { semantic, type } from '../../../theme/tokens';
import { useSync } from '../application/SyncStore';

// 设置页「同步」状态行：点击手动补同步（幂等，安全重试）。
export function SyncStatusRow() {
  const { state, syncNow } = useSync();
  const label = state.status === 'syncing'
    ? '正在同步学习记录…'
    : state.status === 'synced'
      ? '学习记录已同步'
      : state.status === 'offline'
        ? '登录后同步学习记录到账号'
        : state.status === 'error'
          ? `同步失败，点击重试（${state.lastError ?? '未知错误'}）`
          : '学习记录保存在本机';
  const color = state.status === 'error' ? semantic.danger : semantic.textMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="同步学习记录"
      onPress={() => { void syncNow(); }}
      hitSlop={8}
      style={{ paddingVertical: 6 }}
    >
      <Text style={{ ...type.caption, color }}>{label}</Text>
    </Pressable>
  );
}
