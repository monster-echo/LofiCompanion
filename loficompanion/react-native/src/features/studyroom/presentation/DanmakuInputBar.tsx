import React, { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../state/AppStore';
import { radii, semantic, space, type } from '../../../theme/tokens';
import { useStudyRoom, useStudyRoomState } from '../application/StudyRoomStore';
import { DANMAKU_MAX_CHARS_CLIENT } from '../domain/validate';
import { STUDY_ROOM_STRINGS as STR } from './strings';

/**
 * 弹幕输入条：访客整条显示「登录后加入弹幕」（点击走 auth.signIn，
 * 登录回来自动还 位）；登录后为输入框 + 发送钮。冷却倒计时读本地乐观
 * sendCooldownUntil（发送即置位，服务端 reject 校正），不发轮询。
 * chromeOpacity：房间页沉浸弱化时随控制件一并隐去（点击屏幕恢复）。
 */

export function DanmakuInputBar({
  chromeOpacity,
}: Readonly<{ chromeOpacity?: Animated.Value }>) {
  const controller = useStudyRoom();
  const state = useStudyRoomState();
  const { signedIn, navigate } = useApp();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const cooldownUntil = state.sendCooldownUntil;
  useEffect(() => {
    if (cooldownUntil <= Date.now()) {
      setRemainingSeconds(0);
      return;
    }
    const tick = () =>
      setRemainingSeconds(Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)));
    tick();
    const timer = setInterval(() => {
      tick();
      if (Date.now() >= cooldownUntil) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  const send = () => {
    const content = draft.trim();
    if (content.length === 0) return;
    controller.actions.send(content);
    setDraft('');
  };

  return (
    <Animated.View
      style={[
        styles.bar,
        { bottom: Math.max(insets.bottom + space.x2, 92) },
        chromeOpacity ? { opacity: chromeOpacity } : null,
      ]}
      pointerEvents="box-none"
    >
      {signedIn ? (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={STR.inputPlaceholder}
            placeholderTextColor={semantic.textMuted}
            maxLength={DANMAKU_MAX_CHARS_CLIENT}
            returnKeyType="send"
            onSubmitEditing={send}
            accessibilityLabel={STR.inputPlaceholder}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={STR.send}
            onPress={send}
            disabled={remainingSeconds > 0 || draft.trim().length === 0}
            style={({ pressed }) => [
              styles.sendButton,
              (remainingSeconds > 0 || draft.trim().length === 0) && styles.sendDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.sendText}>
              {remainingSeconds > 0 ? `${remainingSeconds}s` : STR.send}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={STR.signInToChat}
          onPress={() => navigate('auth.signIn')}
          style={({ pressed }) => [styles.guestBar, pressed && styles.pressed]}
        >
          <Text style={styles.guestText}>{STR.signInToChat}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: space.x4,
    right: space.x4,
  },
  inputRow: {
    flexDirection: 'row',
    gap: space.x2,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.control,
    backgroundColor: 'rgba(12, 14, 20, 0.62)',
    borderWidth: 1,
    borderColor: semantic.borderSoft,
    paddingHorizontal: space.x4,
    ...type.body,
    color: semantic.textPrimary,
  },
  sendButton: {
    minHeight: 44,
    borderRadius: radii.control,
    backgroundColor: semantic.actionPrimary,
    paddingHorizontal: space.x4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.5,
  },
  sendText: {
    ...type.bodyStrong,
    color: semantic.canvasDeep,
    fontVariant: ['tabular-nums'],
  },
  guestBar: {
    minHeight: 44,
    borderRadius: radii.control,
    backgroundColor: 'rgba(12, 14, 20, 0.62)',
    borderWidth: 1,
    borderColor: semantic.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestText: {
    ...type.body,
    color: semantic.textSecondary,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
