import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { semantic } from '../../../theme/tokens';
import { allocateLane, estimateBulletChars } from '../domain/danmakuLanes';
import type { DanmakuMessage } from '../domain/protocol';
import { useStudyRoom } from '../application/StudyRoomStore';

/**
 * 弹幕层：叠在视频画面之上、控件之下的纯展示层（pointerEvents none）。
 * 弹幕是瞬态内容，不走 React 状态树——订阅 controller.onDanmaku 起 onAnimation
 * 滚动子弹；车道分配/并发上限在 ref 侧维护，避免高频 setState。
 * 减少动态：不横移，就位淡入淡出（doc-07 §10 精神）。
 * band：弹幕带纵向位置三档（顶部/中部/底部），由快捷设置切换。
 */

const LANE_COUNT = 5;
const LANE_HEIGHT = 30;
const SCROLL_MS = 9000;
const HISTORY_STAGGER_MS = 300;
const HISTORY_MAX = 10;
const CONCURRENT_LIMIT = 20;
const CHAR_PX = 14; // 全角字≈fontSize，估算宽已按 0.55 折算半角

export type DanmakuBand = 'top' | 'center' | 'bottom';

/** 三档位置占屏高比例：顶部避开左上房间名/状态 chip，中部是原默认 */
const BAND_TOP_RATIO: Record<DanmakuBand, number> = {
  top: 0.2,
  center: 0.36,
  bottom: 0.62,
};
/** 底档下缘净空：输入条（min 92 + 44 高）+ 间距，小屏把弹幕带往上收 */
const BAND_BOTTOM_CLEARANCE = 160;

interface Bullet {
  readonly key: number;
  readonly text: string;
  readonly lane: number;
  readonly widthPx: number;
  readonly anim: Animated.Value;
  readonly fade: Animated.Value;
}

export function DanmakuLayer({
  reducedMotion,
  band = 'center',
}: Readonly<{ reducedMotion: boolean; band?: DanmakuBand }>) {
  const controller = useStudyRoom();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [bullets, setBullets] = useState<readonly Bullet[]>([]);
  const laneSlots = useRef<Array<{ lastStartMs: number } | null>>(
    Array.from({ length: LANE_COUNT }, () => null),
  );
  const keyRef = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const bulletsRef = useRef<readonly Bullet[]>([]);
  bulletsRef.current = bullets;

  useEffect(() => {
    let cancelled = false;

    const removeBullet = (key: number) => {
      setBullets((prev) => prev.filter((bullet) => bullet.key !== key));
    };

    const spawn = (message: { content: string }) => {
      if (cancelled) return;
      // 并发上限：丢最旧（动画收尾直接移除，不等其自然完成）
      const overflow = bulletsRef.current.length - CONCURRENT_LIMIT + 1;
      if (overflow > 0) {
        for (const victim of bulletsRef.current.slice(0, overflow)) removeBullet(victim.key);
      }
      const widthPx = estimateBulletChars(message.content) * CHAR_PX;
      const { lane } = allocateLane(laneSlots.current, Date.now(), { laneClearMs: SCROLL_MS });
      laneSlots.current[lane] = { lastStartMs: Date.now() };
      keyRef.current += 1;
      const key = keyRef.current;
      const anim = new Animated.Value(0);
      const fade = new Animated.Value(0);
      const bullet: Bullet = {
        key,
        text: message.content,
        lane,
        widthPx,
        anim,
        fade,
      };
      setBullets((prev) => [...prev, bullet]);
      // 透明度独立于横移：进场 200ms 拉满、结尾 200ms 淡出，滚动全程文字不透明
      //（此前 opacity 复用横移进度，0→1 跑满 9s，弹幕大半行程都是半透明）
      Animated.sequence([
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(reducedMotion ? 3600 : SCROLL_MS - 400),
        Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => removeBullet(key));
      if (reducedMotion) return; // 就位淡入淡出，无横移
      Animated.timing(anim, {
        toValue: 1,
        duration: SCROLL_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start();
    };

    const pendingHistory: { current: DanmakuMessage[] } = { current: [] };
    const drainHistory = (): void => {
      const queue = pendingHistory.current;
      pendingHistory.current = [];
      const slice = queue.slice(-HISTORY_MAX);
      slice.forEach((message, index) => {
        const timer = setTimeout(() => spawn(message), index * HISTORY_STAGGER_MS);
        timers.current.push(timer);
      });
    };

    const unsubscribe = controller.onDanmaku((message, origin) => {
      if (origin === 'live') {
        spawn(message);
        return;
      }
      // 快照回放：只回放最近一段，按序错峰上屏
      pendingHistory.current.push(message);
      drainHistory();
    });

    return () => {
      cancelled = true;
      unsubscribe();
      timers.current.forEach(clearTimeout);
      timers.current = [];
      pendingHistory.current = [];
    };
    // controller 身份稳定；reducedMotion 切换仅影响新子弹
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, reducedMotion]);

  const bandHeight = LANE_COUNT * LANE_HEIGHT;
  const bandTop = Math.min(
    Math.round(screenHeight * BAND_TOP_RATIO[band]),
    screenHeight - bandHeight - BAND_BOTTOM_CLEARANCE,
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.band, { top: bandTop }]}>
        {bullets.map((bullet) => {
          const translateX = bullet.anim.interpolate({
            inputRange: [0, 1],
            outputRange: reducedMotion
              ? [screenWidth - bullet.widthPx - 24, screenWidth - bullet.widthPx - 24]
              : [screenWidth, -bullet.widthPx - 48],
          });
          return (
            <Animated.View
              key={bullet.key}
              style={[styles.bullet, { top: bullet.lane * LANE_HEIGHT, opacity: bullet.fade, transform: [{ translateX }] }]}
            >
              <Text style={styles.bulletText} numberOfLines={1}>
                {bullet.text}
              </Text>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: LANE_COUNT * LANE_HEIGHT,
  },
  bullet: {
    position: 'absolute',
    left: 0,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(12, 14, 20, 0.45)',
    alignSelf: 'flex-start',
  },
  bulletText: {
    color: semantic.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
});
