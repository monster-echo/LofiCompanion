import type {
  CompanionState,
  SkinEventMapping,
  SkinManifest,
  SkinStateAsset,
} from './types';

/**
 * Metro 静态收集 require('<literal>') 的海报资产；非 Metro 环境回退为 0
 * （域逻辑只透传 module ref，从不加载它）。
 *
 * 不能只判断 require：node/vitest 会注入 CJS require（createRequire），它
 * 会把 PNG 当 JavaScript 解析直接抛 SyntaxError。Metro bundle 的 prelude
 * 总是先定义 __DEV__，用它区分 Metro 与其它环境。
 */
declare const __DEV__: boolean | undefined;
declare const require: ((id: string) => number) | undefined;

function poster(id: string): number {
  return typeof __DEV__ !== 'undefined' && typeof require === 'function'
    ? require(id)
    : 0;
}

const FOCAL_X = 0.5;
const FOCAL_Y = 0.38;
const STATIC_DURATION_MS = 4000;

const ASSET_BASE = '../../../../assets/skins/rainy-study-room';

function stateAsset(state: CompanionState): SkinStateAsset {
  return {
    state,
    poster: poster(`${ASSET_BASE}/${state}.png`),
    focalPointX: FOCAL_X,
    focalPointY: FOCAL_Y,
    // loopUrl 缺省：P0-A 静态优先，Task 11 起接入视频
    durationMs: STATIC_DURATION_MS,
  };
}

const ALL_STATES: readonly CompanionState[] = [
  'ready',
  'focusing',
  'paused',
  'drinking',
  'resting',
  'completed',
];

// doc-01 §5.4 P0 事件表：优先级 / 是否可打断逐项一致。
// cooldownSeconds 仅健康类（wellness.drink=60s）非零；returnState 为动作
// 播完后的回归状态（如 focus.paused 播完回到停笔等待，直到恢复）。
function mapping(
  eventType: SkinEventMapping['eventType'],
  priority: number,
  interruptible: boolean,
  returnState: CompanionState,
  cooldownSeconds = 0,
): SkinEventMapping {
  return { eventType, priority, interruptible, cooldownSeconds, returnState };
}

const EVENT_MAPPINGS: readonly SkinEventMapping[] = [
  mapping('session.ready', 60, true, 'ready'),
  mapping('focus.started', 80, false, 'focusing'),
  mapping('focus.loop', 10, true, 'focusing'),
  mapping('wellness.drink', 70, false, 'focusing', 60),
  mapping('focus.paused', 90, true, 'paused'),
  mapping('break.started', 80, false, 'resting'),
  mapping('focus.resumed', 90, false, 'focusing'),
  mapping('focus.completed', 100, false, 'ready'),
];

/** 内置皮肤「雨夜书房」（P0-A 唯一皮肤，免费） */
export const rainyStudyRoomManifest: SkinManifest = {
  id: 'rainy-study-room-v1',
  slug: 'rainy-study-room',
  name: '雨夜书房',
  accessType: 'free',
  manifestVersion: 1,
  defaultState: 'ready',
  states: ALL_STATES.map(stateAsset),
  eventMappings: [...EVENT_MAPPINGS],
};
