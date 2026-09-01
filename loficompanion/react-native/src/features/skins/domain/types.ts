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

/**
 * 单个状态的视觉资产。poster 二选一：
 *  - number：require() 模块引用（内置皮肤，Metro 静态收集）
 *  - { uri }：本地缓存文件地址（远端皮肤，remoteSkinsRepository 落盘后构造；
 *    引用必须稳定——ImmersiveMediaSurface 的双缓冲按 === 去重，渲染期不可内联新建）
 */
export interface SkinStateAsset {
  state: CompanionState;
  poster: number | { readonly uri: string };
  /** 焦点归一化坐标（0..1），镜头取景用 */
  focalPointX: number;
  focalPointY: number;
  /**
   * 循环/动作视频（doc-07 §9.2）。二选一：
   *  - number：require() 模块引用（内置皮肤，Metro 静态收集）
   *  - { uri }：本地缓存文件地址（远端皮肤，remoteSkinsRepository 落盘后构造）
   * 缺省 = 纯海报状态。视频一律无音轨（环境音由 lofi 系统独立连续播放）。
   */
  loopVideo?: number | { readonly uri: string };
  /**
   * 视频循环语义：true=背景循环（循环态硬切无缝，播放器原生循环、不叠化）；
   * false=单次动作，播完定格，由控制器按 returnState 回归基态。
   */
  videoLoop?: boolean;
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

/**
 * 动画参数（skin.yaml `animation` 段）：沉浸面的取景与过渡。
 * focalZoom=1 表示按容器 cover 取景、不做额外放大裁切。
 */
export interface SkinAnimationConfig {
  crossfadeMs: number;
  focalZoom: number;
}

/** 健康事件自动排程（skin.yaml `wellness` 段）：喝水随主题配置区间随机触发 */
export interface SkinWellnessConfig {
  autoDrink: {
    enabled: boolean;
    minIntervalMinutes: number;
    maxIntervalMinutes: number;
  };
}

/**
 * 皮肤访问语义（与服务端 skins.access_type 对齐）：free 免费、paid 单买、
 * premium Plus 目录。内置清单声明包内分发皮肤的语义；解锁判定仍以服务端
 * 权益键为准（store/domain/storeCatalog.ts）。
 */
export type SkinAccessType = 'free' | 'paid' | 'premium';

/** 皮肤清单（内置或远端下发） */
export interface SkinManifest {
  id: string;
  slug: string;
  name: string;
  /** 英文展示名（skin.yaml name_en；缺省回落 name——服务端目录同理） */
  nameEn?: string;
  accessType: SkinAccessType;
  manifestVersion: number;
  defaultState: CompanionState;
  states: SkinStateAsset[];
  eventMappings: SkinEventMapping[];
  /** 主题令牌（doc-01 §5.2）：皮肤自带的强调色/表面色，界面点缀随皮肤切换 */
  themeTokens: { accent: string; surface: string };
  animation?: SkinAnimationConfig;
  wellness?: SkinWellnessConfig;
}
