/**
 * 皮肤域实体（doc-01 §5.4 事件驱动陪伴 / doc-02 皮肤规范）。
 * 纯类型，不依赖任何平台模块——node 可直接测试。
 */

/** 陪伴角色的六种展示状态 */
export type CompanionState =
  | 'ready'
  | 'focusing'
  | 'paused'
  | 'drinking'
  | 'resting'
  | 'completed';

/** 触发陪伴动作的事件（doc-01 §5.4 P0 事件表） */
export type CompanionEventType =
  | 'session.ready'
  | 'focus.started'
  | 'focus.loop'
  | 'wellness.drink'
  | 'focus.paused'
  | 'break.started'
  | 'focus.resumed'
  | 'focus.completed';

/** 单个状态的视觉资产。poster 为 require() 模块引用（Metro 静态收集）。 */
export interface SkinStateAsset {
  state: CompanionState;
  poster: number;
  /** 焦点归一化坐标（0..1），镜头取景用 */
  focalPointX: number;
  focalPointY: number;
  /** 循环视频地址；P0-A 静态优先，暂缺省 */
  loopUrl?: string;
  /** 静态模式下的展示时长 */
  durationMs: number;
}

/** 事件 → 动作映射。interruptible 指该动作播放中可否被更高优先级事件打断。 */
export interface SkinEventMapping {
  eventType: CompanionEventType;
  priority: number;
  interruptible: boolean;
  /** 同类事件冷却（秒），防止健康动作被连续触发 */
  cooldownSeconds: number;
  /** 动作播完后回归的状态 */
  returnState: CompanionState;
}

/** 皮肤清单（内置或远端下发） */
export interface SkinManifest {
  id: string;
  slug: string;
  name: string;
  accessType: 'free';
  manifestVersion: number;
  defaultState: CompanionState;
  states: SkinStateAsset[];
  eventMappings: SkinEventMapping[];
  /** 主题令牌（doc-01 §5.2）：皮肤自带的强调色/表面色，界面点缀随皮肤切换 */
  themeTokens: { accent: string; surface: string };
}
