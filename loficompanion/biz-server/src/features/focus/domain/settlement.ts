// 结算域纯函数：与客户端 react-native/src/features/focus/domain/engine.ts 同语义。
// 客户端只上传可校验的会话事件（startedAt/pauses/completedAt，UTC ms），
// 服务端重算有效时长，绝不信任客户端累计分钟（docs/03 §5、docs/04 §3）。
// 自 loficompanion/server 原样搬迁（P3a），无依赖改动。

export interface SettleInput {
  plannedSeconds: number;
  startedAt: number; // UTC ms
  pauses: Array<{ start: number; end: number }>;
  completedAt: number; // UTC ms
}

export interface SettlementResult {
  effectiveSeconds: number;
}

export type SettlementError =
  | 'SESSION_INTERVAL_INVALID'
  | 'SESSION_CLOCK_SKEW';

const CLOCK_SKEW_LIMIT_MS = 24 * 60 * 60 * 1000; // docs/06 §1.1：跨度过大拒绝

export function validateSettleInput(input: SettleInput, now: number): SettlementError | null {
  if (!Number.isFinite(input.startedAt) || !Number.isFinite(input.completedAt)) {
    return 'SESSION_INTERVAL_INVALID';
  }
  if (input.completedAt <= input.startedAt) return 'SESSION_INTERVAL_INVALID';
  let previousEnd = input.startedAt;
  for (const pause of input.pauses) {
    if (!Number.isFinite(pause.start) || !Number.isFinite(pause.end)) {
      return 'SESSION_INTERVAL_INVALID';
    }
    if (pause.start < previousEnd || pause.end < pause.start) {
      return 'SESSION_INTERVAL_INVALID';
    }
    if (pause.end > input.completedAt) return 'SESSION_INTERVAL_INVALID';
    previousEnd = pause.end;
  }
  // 时钟偏差：会话开始不得晚于当前时间（留 5s 容差），且不得早于 24h 前。
  if (input.startedAt > now + 5000 || now - input.startedAt > CLOCK_SKEW_LIMIT_MS) {
    return 'SESSION_CLOCK_SKEW';
  }
  return null;
}

export function settleSession(input: SettleInput): SettlementResult {
  const wallMs = Math.max(0, input.completedAt - input.startedAt);
  let pausedMs = 0;
  for (const pause of input.pauses) {
    pausedMs += Math.max(0, pause.end - pause.start);
  }
  // 有效专注不超过计划：客户端在剩余归零后稍晚完成时（如网络延迟），
  // 超出部分属完成延迟而非多学，钳制到计划值。
  const effective = Math.max(0, Math.floor((wallMs - pausedMs) / 1000));
  return { effectiveSeconds: Math.min(effective, input.plannedSeconds) };
}
