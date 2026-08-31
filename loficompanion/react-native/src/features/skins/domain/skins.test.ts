import { describe, expect, it } from 'vitest';
import { midnightWorkstationManifest } from './midnightWorkstation.generated';
import { rainyStudyRoomManifest } from './rainyStudyRoom.generated';
import { sunnyClassroomManifest } from './sunnyClassroom.generated';
import { BUILT_IN_SKINS, DEFAULT_SKIN_MANIFEST, findSkinManifest } from './registry';
import { mappingFor, stateAsset } from './resolve';
import type {
  CompanionEventType,
  CompanionState,
  SkinManifest,
} from './types';

const ALL_STATES: readonly CompanionState[] = [
  'ready',
  'focusing',
  'paused',
  'drinking',
  'resting',
  'completed',
];

describe('雨夜书房清单', () => {
  it('六个状态资产齐全且参数正确', () => {
    expect(rainyStudyRoomManifest.states).toHaveLength(6);
    for (const state of ALL_STATES) {
      const asset = stateAsset(rainyStudyRoomManifest, state);
      expect(asset).not.toBeNull();
      expect(asset.state).toBe(state);
      expect(asset.focalPointX).toBe(0.5);
      expect(asset.focalPointY).toBe(0.38);
      expect(asset.durationMs).toBe(4000);
      expect(typeof asset.poster).toBe('number');
    }
    expect(rainyStudyRoomManifest.defaultState).toBe('ready');
    expect(rainyStudyRoomManifest.id).toBe('rainy-study-room-v1');
  });

  it('主题令牌：rain.500 强调色 / night.850 表面色（doc-01 §5.2）', () => {
    expect(rainyStudyRoomManifest.themeTokens).toEqual({
      accent: '#4F8FE8',
      surface: '#0D1B2B',
    });
  });

  it('事件表与 doc-01 §5.4 逐项一致（优先级/可打断/冷却/回归态）', () => {
    const table: readonly [
      CompanionEventType, number, boolean, number, CompanionState,
    ][] = [
      ['session.ready', 60, true, 0, 'ready'],
      ['focus.started', 80, false, 0, 'focusing'],
      ['focus.loop', 10, true, 0, 'focusing'],
      ['wellness.drink', 70, false, 60, 'focusing'],
      ['focus.paused', 90, true, 0, 'paused'],
      ['break.started', 80, false, 0, 'resting'],
      ['focus.resumed', 90, false, 0, 'focusing'],
      ['focus.completed', 100, false, 0, 'ready'],
    ];
    expect(rainyStudyRoomManifest.eventMappings).toHaveLength(table.length);
    for (const [eventType, priority, interruptible, cooldown, returnState] of table) {
      const m = mappingFor(rainyStudyRoomManifest, eventType);
      expect(m, eventType).toBeDefined();
      expect(m!.priority).toBe(priority);
      expect(m!.interruptible).toBe(interruptible);
      expect(m!.cooldownSeconds).toBe(cooldown);
      expect(m!.returnState).toBe(returnState);
    }
  });

  it('focus.completed 优先级最高（100），focus.loop 最低（10）', () => {
    expect(mappingFor(rainyStudyRoomManifest, 'focus.completed')!.priority).toBe(100);
    expect(mappingFor(rainyStudyRoomManifest, 'focus.loop')!.priority).toBe(10);
  });

  it('focus.loop 可打断，wellness.drink 不可打断', () => {
    expect(mappingFor(rainyStudyRoomManifest, 'focus.loop')!.interruptible).toBe(true);
    expect(mappingFor(rainyStudyRoomManifest, 'wellness.drink')!.interruptible).toBe(false);
  });

  it('wellness.drink 冷却 60 秒', () => {
    expect(mappingFor(rainyStudyRoomManifest, 'wellness.drink')!.cooldownSeconds).toBe(60);
  });

  it('清单未声明的事件返回 undefined', () => {
    const partial: SkinManifest = {
      ...rainyStudyRoomManifest,
      eventMappings: rainStudySubset(),
    };
    expect(mappingFor(partial, 'focus.completed')).toBeUndefined();
  });

  it('缺状态时回退 defaultState 资产（合成清单缺 drinking）', () => {
    const partial: SkinManifest = {
      ...rainyStudyRoomManifest,
      states: rainyStudyRoomManifest.states.filter((a) => a.state !== 'drinking'),
    };
    const fallback = stateAsset(partial, 'drinking');
    expect(fallback).not.toBeNull();
    expect(fallback.state).toBe('ready'); // defaultState 的资产
    expect(fallback).toBe(stateAsset(partial, 'ready'));
  });

  it('空 states 清单抛错（契约兜底，绝不返回 undefined）', () => {
    const empty: SkinManifest = { ...rainyStudyRoomManifest, states: [] };
    expect(() => stateAsset(empty, 'ready')).toThrow();
  });

  it('清单源 skin.yaml 与生成物同步（改 YAML 后必须重跑 skins:generate）', async () => {
    // 直接执行生成器 --check（无 slug = 全部皮肤）：生成物与 YAML 派生输出逐字节一致
    const { execFile } = await import('node:child_process');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const scriptPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../scripts/generate-skin.mjs',
    );
    await new Promise<void>((resolve, reject) => {
      execFile(process.execPath, [scriptPath, '--check'], (error, stdout, stderr) => {
        if (error) reject(new Error(String(stderr || stdout || error)));
        else resolve();
      });
    });
    expect(rainyStudyRoomManifest.animation).toEqual({ crossfadeMs: 500, focalZoom: 1 });
    expect(rainyStudyRoomManifest.wellness?.autoDrink).toEqual({
      enabled: true,
      minIntervalMinutes: 18,
      maxIntervalMinutes: 30,
    });
  });
});

/** doc-01 §5.4 P0 事件表：全部内置皮肤逐项一致 */
const P0_EVENT_TABLE: readonly [
  CompanionEventType, number, boolean, number, CompanionState,
][] = [
  ['session.ready', 60, true, 0, 'ready'],
  ['focus.started', 80, false, 0, 'focusing'],
  ['focus.loop', 10, true, 0, 'focusing'],
  ['wellness.drink', 70, false, 60, 'focusing'],
  ['focus.paused', 90, true, 0, 'paused'],
  ['break.started', 80, false, 0, 'resting'],
  ['focus.resumed', 90, false, 0, 'focusing'],
  ['focus.completed', 100, false, 0, 'ready'],
];

describe('内置皮肤注册表（阳光教室 / 深夜工作台）', () => {
  it('三套皮肤按序注册，首位为默认雨夜书房', () => {
    expect(BUILT_IN_SKINS.map((skin) => skin.slug)).toEqual([
      'rainy-study-room',
      'sunny-classroom',
      'midnight-workstation',
    ]);
    expect(DEFAULT_SKIN_MANIFEST.slug).toBe('rainy-study-room');
  });

  it('findSkinManifest：id 与 slug 双口径命中，未命中 undefined', () => {
    expect(findSkinManifest('sunny-classroom-v1')?.slug).toBe('sunny-classroom');
    expect(findSkinManifest('midnight-workstation')?.id).toBe('midnight-workstation-v1');
    expect(findSkinManifest('nonexistent')).toBeUndefined();
  });

  it('accessType 全免费（doc-01 PRD：三套内置皮肤全免费）', () => {
    for (const skin of BUILT_IN_SKINS) {
      expect(skin.accessType).toBe('free');
    }
  });

  it('新皮肤：六状态齐全、事件表与 P0 表逐项一致、动画与交叉淡化就位', () => {
    for (const skin of [sunnyClassroomManifest, midnightWorkstationManifest]) {
      expect(skin.states).toHaveLength(6);
      expect(skin.defaultState).toBe('ready');
      expect(skin.manifestVersion).toBe(1);
      expect(skin.animation).toEqual({ crossfadeMs: 500, focalZoom: 1 });
      expect(skin.eventMappings).toHaveLength(P0_EVENT_TABLE.length);
      for (const [eventType, priority, interruptible, cooldown, returnState] of P0_EVENT_TABLE) {
        const m = mappingFor(skin, eventType);
        expect(m, `${skin.slug}:${eventType}`).toBeDefined();
        expect(m!.priority).toBe(priority);
        expect(m!.interruptible).toBe(interruptible);
        expect(m!.cooldownSeconds).toBe(cooldown);
        expect(m!.returnState).toBe(returnState);
      }
    }
  });

  it('健康排程：阳光教室 18–30 分钟、深夜工作台 20–32 分钟', () => {
    expect(sunnyClassroomManifest.wellness?.autoDrink).toEqual({
      enabled: true,
      minIntervalMinutes: 18,
      maxIntervalMinutes: 30,
    });
    expect(midnightWorkstationManifest.wellness?.autoDrink).toEqual({
      enabled: true,
      minIntervalMinutes: 20,
      maxIntervalMinutes: 32,
    });
  });

  it('themeTokens 各主题独立（doc-01 §5.2 界面点缀随皮肤切换）', () => {
    expect(sunnyClassroomManifest.themeTokens).toEqual({
      accent: '#E8A24F',
      surface: '#F7F1E3',
    });
    expect(midnightWorkstationManifest.themeTokens).toEqual({
      accent: '#8B7FE8',
      surface: '#12141F',
    });
  });
});

function rainStudySubset() {
  return rainyStudyRoomManifest.eventMappings.filter(
    (m) => m.eventType !== 'focus.completed',
  );
}
