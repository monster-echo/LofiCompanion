import { describe, expect, it } from 'vitest';
import { rainyStudyRoomManifest } from './rainyStudyRoom';
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
});

function rainStudySubset() {
  return rainyStudyRoomManifest.eventMappings.filter(
    (m) => m.eventType !== 'focus.completed',
  );
}
