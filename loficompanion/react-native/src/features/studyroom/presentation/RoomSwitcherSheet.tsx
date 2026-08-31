import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetOverlay } from '../../focus/presentation/SheetOverlay';
import { AppIcon } from '../../../design-system/AppIcon';
import { radii, semantic, space, type } from '../../../theme/tokens';
import { useStudyRoom, useStudyRoomState } from '../application/StudyRoomStore';
import { STUDY_ROOMS, type StudyRoomId } from '../domain/rooms';
import { STUDY_ROOM_STRINGS as STR } from './strings';

/**
 * 换房 sheet：本地 RN Modal + SheetOverlay 壳（不开新路由，WS 连接不动，
 * 换房走协议层 room.switch）。在线数来自周期 presence.rooms 广播——
 * 纯内存态，REST 反而看不到，这里零额外端点。
 */

export function RoomSwitcherSheet({
  visible,
  onClose,
}: Readonly<{ visible: boolean; onClose: () => void }>) {
  const controller = useStudyRoom();
  const state = useStudyRoomState();
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  const countFor = (roomId: StudyRoomId): number =>
    state.roomCounts.find((count) => count.roomId === roomId)?.onlineCount ?? 0;

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} visible>
      <SheetOverlay onClose={onClose} closeLabel={STR.closeLabel} bottomInset={insets.bottom}>
        <View style={styles.header}>
          <Text style={styles.title}>{STR.switchRoom}</Text>
        </View>
        <View style={styles.list}>
          {STUDY_ROOMS.map((room) => {
            const selected = room.id === state.roomId;
            return (
              <Pressable
                key={room.id}
                accessibilityRole="button"
                accessibilityLabel={`${room.name}，${STR.onlineNow(countFor(room.id))}`}
                onPress={() => {
                  controller.actions.switchRoom(room.id);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.row,
                  selected && styles.rowSelected,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.roomName}>{room.name}</Text>
                  <View style={styles.onlineRow}>
                    <View style={styles.dot} />
                    <Text style={styles.onlineText}>{STR.onlineNow(countFor(room.id))}</Text>
                  </View>
                </View>
                {selected ? (
                  <AppIcon name="check" color={semantic.actionPrimary} size={20} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </SheetOverlay>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: space.x2,
  },
  title: {
    ...type.title3,
    color: semantic.textPrimary,
  },
  list: {
    gap: space.x2,
    paddingBottom: space.x2,
  },
  row: {
    minHeight: 64,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: semantic.borderStandard,
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowSelected: {
    borderColor: semantic.actionPrimary,
  },
  rowMain: {
    gap: space.x1,
  },
  roomName: {
    ...type.bodyStrong,
    color: semantic.textPrimary,
  },
  onlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: semantic.success,
  },
  onlineText: {
    ...type.caption,
    color: semantic.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
