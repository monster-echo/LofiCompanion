import { describe, expect, it } from 'vitest';
import { rainyStudyRoomManifest as manifest } from '../../skins/domain/rainyStudyRoom.generated';
import type { SkinManifest } from '../../skins/domain/types';
import type { CompanionRuntimeState } from './stateMachine';
import { advance, dispatch, initialState } from './stateMachine';

const T0 = 1_700_000_000_000; // 固定起点（UTC ms），全程无 Date.now()
const CTX = { now: T0, manifest, reducedMotion: false };

function at(ms: number) {
  return { ...CTX, now: T0 + ms };
}

/** 喝水动作播放中的运行态（基态 focusing） */
function drinkingNow(offsetMs = 0): CompanionRuntimeState {
  return dispatch(initialState('focusing'), 'wellness.drink', at(offsetMs)).next;
}

/** 合成清单：仅把 wellness.drink 的回归态改成 resting，验证 returnState 真的生效 */
const restReturnManifest: SkinManifest = {
  ...manifest,
  eventMappings: manifest.eventMappings.map((m) =>
    m.eventType === 'wellness.drink' ? { ...m, returnState: 'resting' } : m,
  ),
};

describe('陪伴状态机', () => {
  it('初始运行态：无播放动作、空队列、无冷却记录', () => {
    expect(initialState('focusing')).toEqual({
      state: 'focusing',
      playing: null,
      lastFiredAt: {},
      queue: [],
    });
  });

  it('空闲时喝水：开始播放 drinking 动作，基态不变，产出换海报/自动回归两个效果', () => {
    const { next, effects } = dispatch(initialState('focusing'), 'wellness.drink', CTX);
    expect(next.state).toBe('focusing');
    expect(next.playing).toEqual({
      eventType: 'wellness.drink',
      state: 'drinking',
      baseAtStart: 'focusing',
      startedAt: T0,
      durationMs: 4000,
    });
    expect(next.lastFiredAt['wellness.drink']).toBe(T0);
    expect(effects).toEqual([
      { kind: 'swapPoster', state: 'drinking' },
      { kind: 'autoReturn', afterMs: 4000 },
    ]);
  });

  it('advance 未到时长为空操作；到时且队列空则按清单 returnState 回归', () => {
    const drinking = drinkingNow();
    const early = advance(drinking, T0 + 3999, manifest);
    expect(early.next).toEqual(drinking);
    expect(early.effects).toEqual([]);

    const done = advance(drinking, T0 + 4000, manifest);
    expect(done.next.playing).toBeNull();
    expect(done.next.state).toBe('focusing'); // 内置清单 drink.returnState = focusing
    expect(done.effects).toEqual([{ kind: 'swapPoster', state: 'focusing' }]);
  });

  it('advance 回归清单声明的 returnState，而非开播基态（合成清单 drink→resting）', () => {
    const drinking = dispatch(initialState('focusing'), 'wellness.drink', {
      now: T0,
      manifest: restReturnManifest,
      reducedMotion: false,
    }).next;
    const done = advance(drinking, T0 + 4000, restReturnManifest);
    expect(done.next.state).toBe('resting');
    expect(done.effects).toEqual([{ kind: 'swapPoster', state: 'resting' }]);
  });

  it('播放期间基态被改写时，advance 回当前基态（returnState 让位）', () => {
    const manual: CompanionRuntimeState = {
      state: 'paused', // 播放中被 focus.paused 改写
      playing: {
        eventType: 'wellness.drink',
        state: 'drinking',
        baseAtStart: 'focusing',
        startedAt: T0,
        durationMs: 4000,
      },
      lastFiredAt: { 'wellness.drink': T0 },
      queue: [],
    };
    const after = advance(manual, T0 + 4000, manifest);
    expect(after.next.state).toBe('paused');
    expect(after.next.playing).toBeNull();
    expect(after.effects).toEqual([{ kind: 'swapPoster', state: 'paused' }]);
  });

  it('60s 冷却内重复喝水：状态完全不变，只给 cooldownNotice 剩余秒数', () => {
    const first = drinkingNow();
    const again = dispatch(first, 'wellness.drink', at(10_000));
    expect(again.next).toEqual(first);
    expect(again.effects).toEqual([
      { kind: 'cooldownNotice', eventType: 'wellness.drink', remainingSeconds: 50 },
    ]);
    // 冷却被忽略时不记录 lastFiredAt（first 里的时间戳保持不变）
    expect(again.next.lastFiredAt['wellness.drink']).toBe(T0);
  });

  it('focus.completed 是终态事件：无视 drinking 不可打断，总是打断并转入 completed 基态', () => {
    const drinking = drinkingNow();
    const done = dispatch(drinking, 'focus.completed', at(500));
    expect(done.next.state).toBe('completed'); // doc-03 §6：focusing --> completed
    expect(done.next.playing).toEqual({
      eventType: 'focus.completed',
      state: 'completed',
      baseAtStart: 'completed',
      startedAt: T0 + 500,
      durationMs: 4000,
    });
    expect(done.next.queue).toEqual([]);
  });

  it('completed 基态在动作播完后保持，直到 session.ready 才回 ready（doc-03 §6）', () => {
    const done = dispatch(drinkingNow(), 'focus.completed', at(500)).next;
    const settled = advance(done, T0 + 4500, manifest); // completed 动作播完（4000ms）
    expect(settled.next.playing).toBeNull();
    expect(settled.next.state).toBe('completed'); // 不按 returnState('ready') 自动离开
    expect(settled.effects).toEqual([{ kind: 'swapPoster', state: 'completed' }]);

    const renewed = dispatch(settled.next, 'session.ready', at(6000));
    expect(renewed.next.state).toBe('ready'); // completed --> ready: new.session
  });

  it('playing 不可打断时高优先级系统事件入队，但基态转移立即生效', () => {
    const drinking = drinkingNow();
    const started = dispatch(drinking, 'focus.started', at(1000));
    expect(started.next.state).toBe('focusing'); // 基态立即变化
    expect(started.next.playing?.eventType).toBe('wellness.drink'); // 喝水继续播
    expect(started.next.queue).toEqual([{ eventType: 'focus.started', queuedAt: T0 + 1000 }]);
    expect(started.next.lastFiredAt['focus.started']).toBeUndefined(); // 入队不记录冷却
  });

  it('用户意图事件无条件打断：喝水（不可打断）播放中点暂停立即切 paused 动作', () => {
    const drinking = drinkingNow();
    const paused = dispatch(drinking, 'focus.paused', at(1000));
    expect(paused.next.state).toBe('paused');
    expect(paused.next.playing).toEqual({
      eventType: 'focus.paused',
      state: 'paused',
      baseAtStart: 'paused',
      startedAt: T0 + 1000,
      durationMs: 4000,
    });
    expect(paused.next.queue).toEqual([]); // 被打断的动作直接让位，不入队
    expect(paused.next.lastFiredAt['focus.paused']).toBe(T0 + 1000);
    expect(paused.effects).toEqual([
      { kind: 'swapPoster', state: 'paused' },
      { kind: 'autoReturn', afterMs: 4000 },
    ]);
  });

  it('用户意图事件无条件打断：paused 动作播放中点恢复立即切回 focusing', () => {
    const drinking = drinkingNow();
    const paused = dispatch(drinking, 'focus.paused', at(1000)).next;
    const resumed = dispatch(paused, 'focus.resumed', at(1500));
    expect(resumed.next.state).toBe('focusing');
    expect(resumed.next.playing?.eventType).toBe('focus.resumed');
    expect(resumed.next.playing?.startedAt).toBe(T0 + 1500); // 立即开播，非入队
  });

  it('播放结束后 advance 弹出队首（最高优先级）事件开始播放', () => {
    const queued = dispatch(drinkingNow(), 'focus.started', at(1000)).next;
    const after = advance(queued, T0 + 5000, manifest); // 喝水 4000ms 已播完
    expect(after.next.playing).toEqual({
      eventType: 'focus.started',
      state: 'focusing',
      baseAtStart: 'focusing',
      startedAt: T0 + 5000,
      durationMs: 4000,
    });
    expect(after.next.queue).toEqual([]);
    expect(after.next.state).toBe('focusing');
    expect(after.next.lastFiredAt['focus.started']).toBe(T0 + 5000);
    expect(after.effects).toEqual([
      { kind: 'swapPoster', state: 'focusing' },
      { kind: 'autoReturn', afterMs: 4000 },
    ]);
  });

  it('队列满（3 条）时挤掉最低优先级，更低优先级的到来直接丢弃', () => {
    let s = drinkingNow();
    s = dispatch(s, 'focus.started', at(100)).next; // 80
    s = dispatch(s, 'break.started', at(200)).next; // 80
    s = dispatch(s, 'focus.loop', at(300)).next; // 10 → 队列满
    expect(s.queue.map((q) => q.eventType)).toEqual([
      'focus.started',
      'break.started',
      'focus.loop',
    ]);

    // focus.loop(10) 不高于队内最低(10) → 丢弃
    const dropped = dispatch(s, 'focus.loop', at(400));
    expect(dropped.next.queue).toHaveLength(3);

    // break.started(80) 高于队内最低(10) → 挤掉 focus.loop
    const evicted = dispatch(s, 'break.started', at(500));
    expect(evicted.next.queue.map((q) => q.eventType)).toEqual([
      'focus.started',
      'break.started',
      'break.started',
    ]);
  });

  it('弹队首按优先级取最高，而非入队先后', () => {
    let s = drinkingNow();
    s = dispatch(s, 'focus.loop', at(100)).next; // 10，先入队
    s = dispatch(s, 'focus.started', at(200)).next; // 80，后入队
    const after = advance(s, T0 + 4000, manifest);
    expect(after.next.playing?.eventType).toBe('focus.started');
    expect(after.next.queue.map((q) => q.eventType)).toEqual(['focus.loop']);
  });

  it('advance 丢弃超过 10s 的过期队列事件；恰好 10s 仍保鲜', () => {
    const queued = dispatch(drinkingNow(), 'focus.started', at(1000)).next;
    const boundary = advance(queued, T0 + 11_000, manifest); // 队龄恰好 10000ms
    expect(boundary.next.playing?.eventType).toBe('focus.started');

    const expired = advance(dispatch(drinkingNow(), 'focus.started', at(1000)).next, T0 + 11_001, manifest); // 10001ms → 过期
    expect(expired.next.playing).toBeNull();
    expect(expired.next.queue).toEqual([]);
    expect(expired.next.state).toBe('focusing'); // 基态未变 → 回清单 returnState
    expect(expired.effects).toEqual([{ kind: 'swapPoster', state: 'focusing' }]);
  });

  it('reduce motion：动作时长降为 1000ms', () => {
    const { next, effects } = dispatch(initialState('focusing'), 'wellness.drink', {
      ...CTX,
      reducedMotion: true,
    });
    expect(next.playing?.durationMs).toBe(1000);
    expect(effects).toContainEqual({ kind: 'autoReturn', afterMs: 1000 });
  });

  it('暂停后恢复：用户即时不排队——开场动作被打断，paused 播完回基态，resume 立即开播', () => {
    let s = initialState('focusing');
    s = dispatch(s, 'focus.started', CTX).next; // 播 focusing 开场（不可打断的旧语义已废除）
    s = dispatch(s, 'focus.paused', at(1000)).next; // 用户意图 → 立即打断开场
    expect(s.playing?.eventType).toBe('focus.paused');
    s = advance(s, T0 + 5000, manifest).next; // paused 动作播完（1000..5000），回基态
    expect(s.playing).toBeNull();
    expect(s.state).toBe('paused');

    const resumed = dispatch(s, 'focus.resumed', at(9500));
    expect(resumed.next.state).toBe('focusing');
    expect(resumed.next.playing).toEqual({
      eventType: 'focus.resumed',
      state: 'focusing',
      baseAtStart: 'focusing',
      startedAt: T0 + 9500,
      durationMs: 4000,
    });
  });

  it('用户动作打断后，队列中的系统事件在其动作播完时照常弹出', () => {
    let s = drinkingNow(); // 喝水播放中
    s = dispatch(s, 'focus.started', at(100)).next; // 系统事件 → 入队
    s = dispatch(s, 'focus.paused', at(200)).next; // 用户意图 → 打断喝水立即播 paused
    expect(s.playing?.eventType).toBe('focus.paused');
    expect(s.queue.map((q) => q.eventType)).toEqual(['focus.started']); // 队列保留
    const after = advance(s, T0 + 4200, manifest); // paused 动作播完（200+4000）
    expect(after.next.playing?.eventType).toBe('focus.started');
    expect(after.next.queue).toEqual([]);
  });

  it('可打断的播放动作被更高优先级事件替换', () => {
    let s = initialState('ready');
    s = dispatch(s, 'session.ready', CTX).next; // 60，interruptible=true
    expect(s.playing?.eventType).toBe('session.ready');
    const interrupted = dispatch(s, 'focus.started', at(500)); // 80 > 60
    expect(interrupted.next.playing?.eventType).toBe('focus.started');
    expect(interrupted.next.state).toBe('focusing');
  });
});
