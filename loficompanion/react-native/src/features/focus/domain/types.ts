/**
 * 专注计时域实体（doc-01 §5.3）。纯类型，零平台依赖，node 可直接测试。
 * 所有时间均为 UTC 毫秒；推导全部基于时间戳与暂停区间，不依赖前台秒数累加。
 */

export type ActivityType = 'homework' | 'reading' | 'coding' | 'vocab' | 'free';

export type SessionStatus = 'active' | 'paused' | 'completed' | 'abandoned';

/** 暂停区间。end 永不为 null：pause 先落 {start:now,end:now} 占位，resume 时闭合。 */
export interface PauseInterval {
  start: number;
  end: number;
}

/** 专注会话文档（本地持久化与离线同步的同一份不可变快照） */
export interface FocusSessionDoc {
  id: string;
  /** 幂等键：离线完成同步到服务端去重用 */
  clientRequestId: string;
  activity: ActivityType;
  plannedSeconds: number;
  status: SessionStatus;
  startedAtUtc: number;
  pauses: PauseInterval[];
  completedAtUtc?: number;
  abandonedAtUtc?: number;
  docVersion: 1;
}
