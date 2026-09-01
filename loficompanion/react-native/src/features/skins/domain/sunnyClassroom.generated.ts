/**
 * 本文件由 scripts/generate-skin.mjs 从 assets/skins/sunny-classroom/skin.yaml 生成。
 * 请勿手改——编辑 YAML 后运行 `npm run skins:generate` 重新生成；
 * CI/测试用 `npm run skins:generate -- --check` 校验同步。
 */
import type {
  CompanionState,
  SkinEventMapping,
  SkinManifest,
} from './types';

declare const require: (id: string) => number;

const POSTERS: Readonly<Record<CompanionState, number>> = (() => {
  try {
    // Metro 静态收集 require('<literal>')——路径必须是字面量
    return {
      ready: require('../../../../assets/skins/sunny-classroom/ready.jpg'),
      focusing: require('../../../../assets/skins/sunny-classroom/focusing.jpg'),
      paused: require('../../../../assets/skins/sunny-classroom/paused.jpg'),
      drinking: require('../../../../assets/skins/sunny-classroom/drinking.jpg'),
      resting: require('../../../../assets/skins/sunny-classroom/resting.jpg'),
      completed: require('../../../../assets/skins/sunny-classroom/completed.jpg'),
    };
  } catch {
    // 非 Metro 环境（node/vitest）：资源 require 不可用，域逻辑只透传引用
    return {
      ready: 0,
      focusing: 0,
      paused: 0,
      drinking: 0,
      resting: 0,
      completed: 0,
    };
  }
})();

const VIDEOS: Readonly<Record<CompanionState, number | null>> = (() => {
  try {
    return {
      ready: require('../../../../assets/skins/sunny-classroom/videos/ready.mp4'),
      focusing: require('../../../../assets/skins/sunny-classroom/videos/focusing.mp4'),
      paused: require('../../../../assets/skins/sunny-classroom/videos/paused.mp4'),
      drinking: require('../../../../assets/skins/sunny-classroom/videos/drinking.mp4'),
      resting: require('../../../../assets/skins/sunny-classroom/videos/resting.mp4'),
      completed: require('../../../../assets/skins/sunny-classroom/videos/completed.mp4'),
    };
  } catch {
    // 非 Metro 环境：视频引用不可用，回退纯海报
    return {
      ready: null,
      focusing: null,
      paused: null,
      drinking: null,
      resting: null,
      completed: null,
    };
  }
})();

const VIDEO_LOOP: Record<CompanionState, boolean> = {
  ready: true,
  focusing: true,
  paused: true,
  drinking: false,
  resting: true,
  completed: false,
};

const FOCAL_X: Record<CompanionState, number> = {
  ready: 0.5,
  focusing: 0.5,
  paused: 0.5,
  drinking: 0.5,
  resting: 0.5,
  completed: 0.5,
};

const FOCAL_Y: Record<CompanionState, number> = {
  ready: 0.38,
  focusing: 0.38,
  paused: 0.38,
  drinking: 0.38,
  resting: 0.38,
  completed: 0.38,
};

const DURATION_MS: Record<CompanionState, number> = {
  ready: 4000,
  focusing: 4000,
  paused: 4000,
  drinking: 4000,
  resting: 4000,
  completed: 4000,
};

const ALL_STATES: readonly CompanionState[] = [
  "ready",
  "focusing",
  "paused",
  "drinking",
  "resting",
  "completed",
];

/** 内置皮肤「阳光教室」（清单源：assets/skins/sunny-classroom/skin.yaml） */
export const sunnyClassroomManifest: SkinManifest = {
  id: "sunny-classroom-v1",
  slug: "sunny-classroom",
  name: "阳光教室",
  nameEn: "Sunny Classroom",
  accessType: "free",
  manifestVersion: 1,
  defaultState: "ready",
  states: ALL_STATES.map((state) => ({
    state,
    poster: POSTERS[state],
    focalPointX: FOCAL_X[state],
    focalPointY: FOCAL_Y[state],
    durationMs: DURATION_MS[state],
    ...(VIDEOS[state] !== null
      ? { loopVideo: VIDEOS[state], videoLoop: VIDEO_LOOP[state] }
      : {}),
  })),
  eventMappings: [
    {
      eventType: "session.ready",
      priority: 60,
      interruptible: true,
      cooldownSeconds: 0,
      returnState: "ready",
    },
    {
      eventType: "focus.started",
      priority: 80,
      interruptible: false,
      cooldownSeconds: 0,
      returnState: "focusing",
    },
    {
      eventType: "focus.loop",
      priority: 10,
      interruptible: true,
      cooldownSeconds: 0,
      returnState: "focusing",
    },
    {
      eventType: "wellness.drink",
      priority: 70,
      interruptible: false,
      cooldownSeconds: 60,
      returnState: "focusing",
    },
    {
      eventType: "focus.paused",
      priority: 90,
      interruptible: true,
      cooldownSeconds: 0,
      returnState: "paused",
    },
    {
      eventType: "break.started",
      priority: 80,
      interruptible: false,
      cooldownSeconds: 0,
      returnState: "resting",
    },
    {
      eventType: "focus.resumed",
      priority: 90,
      interruptible: false,
      cooldownSeconds: 0,
      returnState: "focusing",
    },
    {
      eventType: "focus.completed",
      priority: 100,
      interruptible: false,
      cooldownSeconds: 0,
      returnState: "ready",
    },
  ],
  themeTokens: { accent: "#E8A24F", surface: "#F7F1E3" },
  animation: { crossfadeMs: 500, focalZoom: 1 },
  wellness: {
    autoDrink: {
      enabled: true,
      minIntervalMinutes: 18,
      maxIntervalMinutes: 30,
    },
  },
};
