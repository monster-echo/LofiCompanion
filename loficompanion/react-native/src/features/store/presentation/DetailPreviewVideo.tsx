import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

/**
 * 详情页预览视频叠层（S15 四态预览的氛围升级）：海报永远垫底，本组件
 * 叠 expo-video；规范对齐 ImmersiveMediaSurface 的 SlotVideo——
 *  - 一律 muted（环境音由 lofi 系统独立播放，视频无声轨语义）；
 *  - 原生 loop 循环；
 *  - readyToPlay 才淡入：加载中/加载失败（如服务端该态无视频 404）停在
 *    透明态，海报兜底，无错误 UI 路径；
 *  - active=false 暂停省电（详情页离开前台/资源包下载中）。
 * reducedMotion 时调用方不挂载本组件（与沉浸面同纪律）。
 */
export function DetailPreviewVideo({
  source,
  active,
  width,
  height,
}: Readonly<{
  source: number | { uri: string };
  active: boolean;
  width: number;
  height: number;
}>) {
  const player = useVideoPlayer(source, (p) => {
    p.muted = true;
    p.loop = true;
  });
  const [ready, setReady] = useState(false);

  // 换源（四态切换）时重置就绪标记：新视频就绪前继续显示旧海报
  useEffect(() => {
    setReady(false);
    const subscription = player.addListener('statusChange', (event) => {
      setReady(event.status === 'readyToPlay');
    });
    return () => subscription.remove();
  }, [player]);

  useEffect(() => {
    if (!active) {
      player.pause();
      return;
    }
    player.play();
  }, [active, player]);

  return (
    <View pointerEvents="none" style={styles.fill}>
      <VideoView
        player={player}
        style={[styles.fill, { width, height, opacity: ready ? 1 : 0 }]}
        contentFit="cover"
        nativeControls={false}
      />
    </View>
  );
}

// Fabric 下绝对定位须显式宽高（ImmersiveMediaSurface 同纪律）
const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
