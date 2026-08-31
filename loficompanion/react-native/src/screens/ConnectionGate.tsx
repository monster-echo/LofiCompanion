import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../design-system/components';
import { useApp } from '../state/AppStore';
import { semantic, space, type } from '../theme/tokens';

/**
 * 启动联机门禁：颜色系统等运行时配置必须来自服务端（auth.zhongbei.tech），
 * bootstrap 成功前不放行进入 App——离线不静默回退内置配置。门禁自身使用
 * 内置夜色 tokens（此时服务端色板尚不可用），成功后整个 App 切服务端色板。
 */
export function ConnectionGate() {
  const { online, refreshBootstrap } = useApp();
  const [retrying, setRetrying] = React.useState(false);
  const retry = React.useCallback(async () => {
    setRetrying(true);
    try {
      await refreshBootstrap();
    } finally {
      setRetrying(false);
    }
  }, [refreshBootstrap]);
  return (
    <View style={styles.screen}>
      {online ? (
        <>
          <ActivityIndicator color={semantic.actionFocus} size="large" />
          <Text style={styles.title}>正在连接服务…</Text>
          <Text style={styles.hint}>正在从服务端获取最新配置</Text>
        </>
      ) : (
        <>
          <Text style={styles.title}>无法连接服务器</Text>
          <Text style={styles.hint}>请检查网络后重试；离线状态无法进入 App。</Text>
          <View style={styles.action}>
            <AppButton
              label={retrying ? '重试中…' : '重试'}
              disabled={retrying}
              onPress={() => void retry()}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.canvasDeep,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x3,
    padding: space.x6,
  },
  title: {
    ...type.title2,
    color: semantic.textPrimary,
    textAlign: 'center',
  },
  hint: {
    ...type.body,
    color: semantic.textSecondary,
    textAlign: 'center',
  },
  action: {
    marginTop: space.x3,
    minWidth: 160,
  },
});
