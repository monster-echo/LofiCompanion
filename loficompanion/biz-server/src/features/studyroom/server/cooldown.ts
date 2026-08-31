// 发送冷却闸（纯逻辑 + 注入时钟，node 测试覆盖）：同一 userId 在窗口期内
// 只允许发一条弹幕；内存态，单实例语义，进程重启即清零（可接受）。

export interface CooldownVerdict {
  ok: boolean;
  /** ok=false 时给出距可再次发送的秒数（向上取整，至少 1）。 */
  retryAfterSeconds?: number;
}

export class CooldownGate {
  private readonly lastByUser = new Map<string, number>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly windowMs = 3000,
  ) {}

  tryAcquire(key: string): CooldownVerdict {
    const nowMs = this.now();
    const last = this.lastByUser.get(key);
    if (last !== undefined) {
      const elapsed = nowMs - last;
      if (elapsed < this.windowMs) {
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((this.windowMs - elapsed) / 1000)) };
      }
    }
    this.lastByUser.set(key, nowMs);
    return { ok: true };
  }
}
