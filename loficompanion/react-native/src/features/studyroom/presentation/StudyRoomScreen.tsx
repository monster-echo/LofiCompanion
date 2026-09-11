import React, { useEffect, useState, useSyncExternalStore } from "react";
import {
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useApp } from "../../../state/AppStore";
import { usePreferences } from "../../../preferences/PreferencesProvider";
import { PressableScale } from "../../../design-system/PressableScale";
import {
  mediaBorderSoft,
  mediaGlassControl,
  mediaGlassHeavy,
} from "../../../design-system/derivedTokens";
import { radii, space, type, type ThemeColors } from "../../../theme/tokens";
import { useThemeStyles } from "../../../theme/useThemeStyles";
import { useAsyncRefresh } from "../../leaderboards/application/useAsyncRefresh";
import { stateAsset } from "../../skins/domain/resolve";
import { skinPosterUrl } from "../../../data/apiClient";
import { findSkinManifestByIdOrSlug } from "../../skins/domain/registry";
import { useFocus } from "../../focus/application/FocusStore";
import { telemetry } from "../../../telemetry/Telemetry";
import { fetchRoomCounts } from "../data/roomsClient";
import { STUDY_ROOMS, roomName, type StudyRoomDef } from "../domain/rooms";
import { enterRoomPack } from "../application/roomPackGate";

/**
 * S-自习室 Tab 根页：公开自习室列表（先选房、后进入）。房间 = 皮肤主题，
 * 海报即皮肤 ready 态（从皮肤注册表解析：内置默认 + 已拉取缓存的云端皮肤，
 * 未拉取过的房间显示主题化占位）；在线人数来自 WS 服务的内存态（GET /rooms，
 * 聚焦刷新 + 15s 轮询兜底，无需建连）。点卡片经进房素材闸门（roomPackGate）
 * 进入 studyroom.active 全屏房间——包未落盘先下载（卡片内联进度），未购付费
 * /失败落海报兜底进房；视频与 lofi 声音只在房间内出现。
 */

const COUNTS_POLL_MS = 15_000;

export function StudyRoomScreen() {
  const { navigate, showToast } = useApp();
  const { locale, palette } = usePreferences();
  const styles = useThemeStyles(makeStyles);
  const { t } = useTranslation("studyroom");
  const focus = useFocus();
  const insets = useSafeAreaInsets();
  const { state, refreshing, refresh, poll } = useAsyncRefresh(
    () => fetchRoomCounts(),
    [],
  );
  // 进房素材闸门：房间包未落盘时先下载再进（免费/已购/试用中都能拉全）。
  // preparingRoom 驱动卡片内联进度（真源是 pack controller，与详情页同款订阅）；
  // gated（未购付费）/失败落海报兜底进房——房间始终可进。
  const [preparingRoom, setPreparingRoom] = useState<string | null>(null);
  const packStatus = useSyncExternalStore(
    focus.pack.subscribe,
    () => (preparingRoom ? focus.pack.statusFor(preparingRoom) : null),
  );
  const packPercent =
    packStatus && packStatus.phase === "downloading"
      ? Math.round(packStatus.ratio * 100)
      : 0;

  useEffect(() => {
    // 后台静默轮询：只更新在线人数数字（数据未变不重渲染），不亮下拉刷新
    // 指示器——此前误用 refresh（pull-to-refresh handler），每 15s 转一次菊花
    const timer = setInterval(() => {
      void poll();
    }, COUNTS_POLL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  const countsUnavailable = state.status === "error";
  const countFor = (room: StudyRoomDef): number | null => {
    if (state.status !== "ready") return null;
    return state.data.find((row) => row.roomId === room.id)?.onlineCount ?? 0;
  };

  const enterRoom = (room: StudyRoomDef) => {
    if (preparingRoom) return; // 下载中不另起进房（busy 互斥在闸门兜底）
    if (findSkinManifestByIdOrSlug(focus.skins, room.id) !== undefined) {
      navigate("studyroom.active", { roomId: room.id });
      return;
    }
    setPreparingRoom(room.id);
    telemetry.track("studyroom_pack_gate", { room_id: room.id });
    void enterRoomPack({
      slug: room.id,
      hasManifest: false,
      downloadPack: focus.actions.downloadSkinPack,
    }).then((outcome) => {
      setPreparingRoom((current) => (current === room.id ? null : current));
      if (outcome === "busy") {
        showToast(t("packBusy"), "info");
        return;
      }
      if (outcome === "error") showToast(t("packFailedEnter"), "error");
      // ready/gated 都进房：gated 的解锁引导交给房间页锁提示 pill
      navigate("studyroom.active", { roomId: room.id });
    });
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            // 顶部自行避让状态栏（全局垫充已移除，此前由 App 根 SafeAreaView 负责）
            paddingTop: insets.top + space.x5,
            paddingBottom: insets.bottom + 120,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={palette.textSecondary}
          />
        }
      >
        <Text style={styles.title}>{t("roomTitle")} </Text>
        <Text style={styles.subtitle}>{t("listSubtitle")}</Text>
        {countsUnavailable ? (
          <Text style={styles.countsHint}>{t("countsUnavailable")}</Text>
        ) : null}
        <View style={styles.cards}>
          {STUDY_ROOMS.map((room) => {
            const count = countFor(room);
            const name = roomName(room, locale);
            const roomManifest = findSkinManifestByIdOrSlug(focus.skins, room.id);
            // 云端皮肤未拉取（付费未购/清单未就位）时用 biz 公开海报兜底
            // （卡片走 thumb 变体），不再渲染空占位卡（被误读为 mock 数据
            // 的问题根因）。本地清单优先渲染落盘缩略图，回落全图。
            const readyAsset = roomManifest ? stateAsset(roomManifest, "ready") : null;
            const poster = readyAsset
              ? readyAsset.cardPoster ?? readyAsset.poster
              : { uri: skinPosterUrl(room.id, "thumb") };
            return (
              <PressableScale
                key={room.id}
                accessibilityRole="button"
                accessibilityState={{ busy: preparingRoom === room.id }}
                accessibilityLabel={`${t("enterRoom", { name })}，${
                  count === null ? "" : t("onlineNow", { n: count })
                }`}
                onPress={() => enterRoom(room)}
                reducedMotion={focus.reducedMotion}
                style={styles.card}
              >
                {poster ? (
                  <Image
                    source={poster}
                    // Fabric 下 Image 不吃「仅四边 inset」absolute（回退像素固有尺寸、
                    // 放大裁切），须显式宽高（对齐 ImmersiveMediaSurface/SkinPreviewCard 既有解法）
                    style={imageFill}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[imageFill, styles.cardPlaceholder]} />
                )}
                {preparingRoom === room.id ? (
                  <View style={styles.packOverlay} pointerEvents="none">
                    <View style={styles.packProgressTrack}>
                      <View
                        style={[
                          styles.packProgressFill,
                          { width: `${packPercent}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.packOverlayText}>
                      {t("packPreparing", { percent: packPercent })}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.cardBody}>
                  <View style={styles.nameChip}>
                    <Text style={styles.cardName}>{name}</Text>
                  </View>
                  <View style={styles.cardFooter}>
                    <View style={styles.onlineRow}>
                      <View style={styles.dot} />
                      <Text style={styles.onlineText}>
                        {count === null ? " " : t("onlineNow", { n: count })}
                      </Text>
                    </View>
                  </View>
                </View>
              </PressableScale>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

// RN 0.86 已移除 StyleSheet.absoluteFillObject，统一用显式填充（对齐 SheetOverlay）
const absoluteFill = {
  position: "absolute" as const,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

// Image 专用的全填充（Fabric 不吃仅四边 inset 的 absolute，须给宽高）
const imageFill = {
  position: "absolute" as const,
  left: 0,
  top: 0,
  width: "100%" as const,
  height: "100%" as const,
};

// 媒体层暗玻璃 chip：房名/在线人数共用的可读性底（固定暗玻璃 +
// 固定浅 hairline，均不随主题翻转）。海报本身不再整卡压暗，文字可读性
// 由各自 chip 底保证。
const glassChip = {
  borderRadius: radii.round,
  backgroundColor: mediaGlassControl,
  borderWidth: 1,
  borderColor: mediaBorderSoft,
  paddingHorizontal: space.x3,
  paddingVertical: space.x1,
} as const;

const makeStyles = (p: ThemeColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: p.canvasDeep,
    },
    content: {
      paddingHorizontal: space.x4,
      gap: space.x2,
    },
    title: {
      ...type.title1,
      color: p.textPrimary,
    },
    subtitle: {
      ...type.body,
      color: p.textSecondary,
      marginBottom: space.x3,
    },
    countsHint: {
      ...type.caption,
      color: p.textMuted,
      marginBottom: space.x2,
    },
    cards: {
      gap: space.x4,
    },
    card: {
      height: 184,
      borderRadius: radii.card,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: p.borderSoft,
    },
    cardPlaceholder: {
      backgroundColor: p.surfaceRaised,
    },
    // 进房素材下载中的卡片内联态（重纱压在海报上，进度条+文案）
    packOverlay: {
      ...absoluteFill,
      backgroundColor: mediaGlassHeavy,
      alignItems: "center",
      justifyContent: "center",
      gap: space.x2,
      paddingHorizontal: space.x5,
    },
    packProgressTrack: {
      alignSelf: "stretch",
      height: 4,
      borderRadius: radii.round,
      backgroundColor: mediaGlassControl,
      overflow: "hidden",
    },
    packProgressFill: {
      height: "100%",
      borderRadius: radii.round,
      backgroundColor: p.success,
    },
    packOverlayText: {
      ...type.label,
      color: p.onMedia,
      fontVariant: ["tabular-nums"],
    },
    cardBody: {
      ...absoluteFill,
      padding: space.x5,
      justifyContent: "space-between",
    },
    nameChip: {
      ...glassChip,
      alignSelf: "flex-start",
      maxWidth: "100%",
    },
    cardName: {
      ...type.title2,
      // 房间名压在暗玻璃 chip 上：onMedia 固定浅色
      // （原 textPrimary 亮色下变深字 → 暗底深字不可读，3.3 修复）
      color: p.onMedia,
    },
    cardFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    onlineRow: {
      ...glassChip,
      flexDirection: "row",
      alignItems: "center",
      gap: space.x1,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 999,
      backgroundColor: p.success,
    },
    onlineText: {
      ...type.caption,
      color: p.onMediaSecondary,
      fontVariant: ["tabular-nums"],
    },
  });
