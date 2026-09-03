import React, { ErrorInfo, ReactNode } from 'react';
import { Text, View } from 'react-native';
import { styles } from '../theme/styles';
import { i18n } from '../i18n/core';
import { telemetry } from './Telemetry';

type State = Readonly<{ failed: boolean }>;

export class AppErrorBoundary extends React.Component<
  Readonly<{ children: ReactNode }>,
  State
> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    telemetry.report(error, {
      component_stack: info.componentStack?.slice(0, 180) ?? 'unknown',
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    // class 组件拿不到 hook：i18n/core 同步初始化（index.js 先于 App 导入），t 恒可用
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>{i18n.t('errors:boundaryTitle')}</Text>
        <Text style={styles.secondary}>{i18n.t('errors:boundaryHint')}</Text>
      </View>
    );
  }
}

