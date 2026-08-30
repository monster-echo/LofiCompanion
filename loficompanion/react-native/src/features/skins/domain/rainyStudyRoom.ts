import type {
  CompanionState,
  SkinEventMapping,
  SkinManifest,
  SkinStateAsset,
} from './types';

/**
 * 海报资产加载。Metro 静态收集 require('<literal>') 完成资源注册；非 Metro
 * 环境（node/vitest）没有资源 require——PNG 解析失败交给 try/catch 回退为
 * 0（域逻辑只透传 module ref，从不加载它）。Metro 拒绝非字面量 require
 * （"Invalid call"），因此所有路径必须写成字面量，不能封装成函数传参。
 */
declare const require: (id: string) => number;

const POSTERS: Readonly<Record<CompanionState, number>> = (() => {
  try {
    return {
      ready: require('../../../../assets/skins/rainy-study-room/ready.png'),
      focusing: require('../../../../assets/skins/rainy-study-room/focusing.png'),
      paused: require('../../../../assets/skins/rainy-study-room/paused.png'),
      drinking: require('../../../../assets/skins/rainy-study-room/drinking.png'),
      resting: require('../../../../assets/skins/rainy-study-room/resting.png'),
      completed: require('../../../../assets/skins/rainy-study-room/completed.png'),
    };
  } catch {
    return { ready: 0, focusing: 0, paused: 0, drinking: 0, resting: 0, completed: 0 };
  }
})();

function poster(state: CompanionState): number {
  return POSTERS[state];
}

const FOCAL_X = 0.5;
const FOCAL_Y = 0.38;
const STATIC_DURATION_MS = 4000;


function stateAsset(state: CompanionState): SkinStateAsset {
  return {
    state,
    poster: poster(state),
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
  // doc-01 §5.2：rain.500 / night.850
  themeTokens: { accent: '#4F8FE8', surface: '#0D1B2B' },
};
