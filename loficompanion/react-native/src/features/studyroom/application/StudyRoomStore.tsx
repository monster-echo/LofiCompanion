import React, {
  createContext,
  ReactNode,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { Platform } from 'react-native';
import { readSessionToken } from '../../../data/storage';
import { createRnWebSocketTransport } from '../data/wsTransport';
import { resolveStudyRoomWsUrl } from '../domain/wsUrl';
import {
  createStudyRoomController,
  type StudyRoomController,
  type StudyRoomState,
} from './studyRoomController';

/**
 * 自习室应用层 React 接线（对齐 FocusStore 模式）：Provider 把 RN WebSocket
 * transport、env 地址解析、SecureStore token 注入 createStudyRoomController，
 * 经 useSyncExternalStore 把快照暴露给屏幕。屏幕生命周期由 useFocusEffect
 * 驱动 actions.enter/leave（原生 Tab 保活，切 Tab 即断开省电）。
 */

const StudyRoomContext = createContext<StudyRoomController | null>(null);

export function StudyRoomProvider({
  children,
}: Readonly<{ children: ReactNode }>): React.JSX.Element {
  const [controller] = useState<StudyRoomController>(() =>
    createStudyRoomController({
      transport: createRnWebSocketTransport(),
      resolveUrl: () =>
        resolveStudyRoomWsUrl({
          wsUrl: process.env.EXPO_PUBLIC_STUDYROOM_WS_URL,
          platformOS: Platform.OS,
          isDev: __DEV__,
        }),
      readToken: readSessionToken,
    }),
  );

  const value = useMemo(() => controller, [controller]);
  return <StudyRoomContext.Provider value={value}>{children}</StudyRoomContext.Provider>;
}

export function useStudyRoom(): StudyRoomController {
  const value = useContext(StudyRoomContext);
  if (!value) throw new Error('useStudyRoom must be used inside StudyRoomProvider');
  return value;
}

/** 订阅控制器状态快照（useSyncExternalStore 语义：变更间引用稳定）。 */
export function useStudyRoomState(): StudyRoomState {
  const controller = useStudyRoom();
  return useSyncExternalStore(controller.subscribe, controller.getState);
}
