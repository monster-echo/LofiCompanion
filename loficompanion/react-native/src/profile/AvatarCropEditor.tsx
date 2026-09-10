import React, { useMemo, useRef, useState } from 'react';
import { Image, Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';
import { AppButton } from '../design-system/components';
import { errorMessageOf } from '../data/errorCopy';
import { useApp } from '../state/AppStore';
import { usePreferences } from '../preferences/PreferencesProvider';
import { radii, spacing } from '../theme/tokens';
import type { ThemeColors } from '../theme/tokens';
import { styles } from '../theme/styles';
import { useThemeStyles } from '../theme/useThemeStyles';
import { useTranslation } from 'react-i18next';

const cropSize = 280;
const initialZoom = 1.25;
const maxZoom = 3;

type Point = Readonly<{ x: number; y: number }>;

export function AvatarCropEditor({
  asset,
  onCancel,
  onConfirm,
}: Readonly<{
  asset: ImagePickerAsset;
  onCancel: () => void;
  onConfirm: (avatarUrl: string) => void;
}>) {
  const { palette } = usePreferences();
  const { user, showToast } = useApp();
  const { t } = useTranslation('profile');
  const editorStyles = useThemeStyles(makeStyles);
  const [zoom, setZoom] = useState(initialZoom);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);
  const dragStart = useRef<Point>({ x: 0, y: 0 });
  const offsetRef = useRef<Point>({ x: 0, y: 0 });
  const zoomRef = useRef(initialZoom);
  // 双指捏合基线：触摸数变化时重新标定，避免缩放/拖动切换时跳变
  const pinchStart = useRef({ distance: 0, zoom: initialZoom });
  const touchCount = useRef(0);
  const geometry = cropGeometry(asset, zoom);
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;

  const applyZoom = (next: number) => {
    const value = Math.min(maxZoom, Math.max(1, next));
    zoomRef.current = value;
    setZoom(value);
    const nextOffset = clampOffset(offsetRef.current, cropGeometry(asset, value));
    offsetRef.current = nextOffset;
    setOffset(nextOffset);
  };
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      touchCount.current = 1;
      pinchStart.current.distance = 0;
      dragStart.current = offsetRef.current;
    },
    onPanResponderMove: (event, gesture) => {
      const touches = event.nativeEvent.touches;
      if (touches.length >= 2) {
        const distance = Math.hypot(
          touches[0].pageX - touches[1].pageX,
          touches[0].pageY - touches[1].pageY,
        );
        if (pinchStart.current.distance === 0) {
          pinchStart.current = { distance, zoom: zoomRef.current };
        } else if (distance > 0) {
          applyZoom(pinchStart.current.zoom * (distance / pinchStart.current.distance));
        }
        return;
      }
      // 双指回落到单指：重新标定拖动起点
      if (touchCount.current !== 1) {
        touchCount.current = 1;
        pinchStart.current.distance = 0;
        dragStart.current = offsetRef.current;
      }
      const next = clampOffset({
        x: dragStart.current.x + gesture.dx,
        y: dragStart.current.y + gesture.dy,
      }, geometryRef.current);
      offsetRef.current = next;
      setOffset(next);
    },
    onPanResponderTerminationRequest: () => false,
  }), []);

  const confirm = async () => {
    setProcessing(true);
    try {
      const crop = sourceCrop(asset, zoomRef.current, offset);
      const result = await manipulateAsync(
        asset.uri,
        [{ crop }, { resize: { width: 512, height: 512 } }],
        { base64: true, compress: 0.78, format: SaveFormat.JPEG },
      );
      if (!result.base64) throw new Error(t('cropFailed'));
      // base64 → OSS：presigned PUT 直传，avatarUrl 存对象 URL（不再 data URL）。
      const { apiClient } = await import('../data/apiClient');
      const url = await apiClient.uploadAvatarToStorage(
        result.base64, user?.id ?? 'anon',
      );
      onConfirm(url);
    } catch (error) {
      showToast(errorMessageOf(error, t('avatarUploadFailed')), 'error');
    } finally {
      setProcessing(false);
    }
  };

  return (
    // 底部 2/3 弹层：点空白处关闭（无取消按钮），只保留一个主操作
    <Modal animationType="slide" transparent visible onRequestClose={onCancel}>
      <View style={editorStyles.backdrop}>
        <Pressable
          accessibilityLabel={t('cancel')}
          accessibilityRole="button"
          style={editorStyles.backdropTouch}
          onPress={onCancel}
        />
        <View style={[editorStyles.sheet, { backgroundColor: palette.surface }]}>
          <View style={[editorStyles.grabber, { backgroundColor: palette.border }]} />
          <Text style={styles.heading}>{t('cropTitle')}</Text>
          <Text style={styles.secondary}>{t('cropHint')}</Text>
          <View style={editorStyles.frameArea}>
            <View
              style={[editorStyles.cropFrame, { backgroundColor: palette.surfaceMuted }]}
              {...panResponder.panHandlers}
            >
              <View style={editorStyles.nonInteractive}>
                <Image
                  accessibilityLabel={t('cropImageAlt')}
                  source={{ uri: asset.uri }}
                  style={[
                    editorStyles.image,
                    {
                      width: geometry.width,
                      height: geometry.height,
                      transform: [{ translateX: offset.x }, { translateY: offset.y }],
                    },
                  ]}
                />
              </View>
            </View>
          </View>
          <AppButton
            disabled={processing}
            label={processing ? t('processing') : t('useCrop')}
            onPress={() => void confirm()}
          />
        </View>
      </View>
    </Modal>
  );
}

function cropGeometry(asset: ImagePickerAsset, zoom: number) {
  const scale = Math.max(cropSize / asset.width, cropSize / asset.height) * zoom;
  return { scale, width: asset.width * scale, height: asset.height * scale };
}

function clampOffset(point: Point, geometry: ReturnType<typeof cropGeometry>): Point {
  const maxX = Math.max(0, (geometry.width - cropSize) / 2);
  const maxY = Math.max(0, (geometry.height - cropSize) / 2);
  return {
    x: Math.max(-maxX, Math.min(maxX, point.x)),
    y: Math.max(-maxY, Math.min(maxY, point.y)),
  };
}

function sourceCrop(asset: ImagePickerAsset, zoom: number, offset: Point) {
  const { scale } = cropGeometry(asset, zoom);
  const size = cropSize / scale;
  return {
    originX: Math.round(Math.max(
      0,
      Math.min(asset.width - size, (asset.width - size) / 2 - offset.x / scale),
    )),
    originY: Math.round(Math.max(
      0,
      Math.min(asset.height - size, (asset.height - size) / 2 - offset.y / scale),
    )),
    width: Math.round(size),
    height: Math.round(size),
  };
}

const makeStyles = (p: ThemeColors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: p.scrim,
  },
  // 点遮罩关闭：绝对铺满，sheet 声明在后自然盖在其上
  backdropTouch: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    width: '100%',
    height: '66.67%',
    paddingTop: spacing.x3,
    paddingHorizontal: spacing.x5,
    paddingBottom: spacing.x5,
    gap: spacing.x3,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    backgroundColor: p.surface,
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: radii.round,
  },
  frameArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cropFrame: {
    width: cropSize,
    height: cropSize,
    overflow: 'hidden',
    borderRadius: radii.round,
    backgroundColor: p.surfaceMuted,
  },
  image: { alignSelf: 'center' },
  nonInteractive: { pointerEvents: 'none' },
});
