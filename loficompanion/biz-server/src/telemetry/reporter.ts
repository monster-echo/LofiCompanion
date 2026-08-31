// 业务遥测：把 biz-server 的日志/错误以结构化事件上报到共享基础设施的
// 遥测管道（POST {AUTH_BASE_URL}/api/v1/telemetry/events），在现有 admin
// 控制台（/v1/admin/telemetry）里按 app_id 一并可见。
// 语义：fire-and-forget——队列满/网络失败直接丢弃，绝不阻塞业务响应。
import { randomUUID } from 'node:crypto';

import { APP_VERSION, AUTH_BASE_URL, getAppId } from '../env';

// 与基础设施 /v1/telemetry/events 的 sanitize 规则对齐：这些 key 会被
// 服务端丢弃，直接不发（message 等自由文本用 value 携带，不经 key）。
const FORBIDDEN_KEY = /password|token|secret|authorization|email|phone|content/i;

const FLUSH_INTERVAL_MS = 10_000;
const MAX_BATCH = 50; // 基础设施单批上限

const FLUSH_ENDPOINT = `${AUTH_BASE_URL}/api/v1/telemetry/events`;

export type BizLogLevel = 'info' | 'warn' | 'error';

export type BizEventInput = Readonly<{
  route: string;
  status: number;
  durationMs: number;
  level: BizLogLevel;
  message?: string;
}>;

type TelemetryEvent = Readonly<{
  eventId: string;
  name: 'biz_log' | 'biz_error';
  screenId: null;
  occurredAt: string;
  configVersion: 0;
  properties: Record<string, string | number | boolean>;
}>;

function sanitizeProperties(
  input: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([key]) => !FORBIDDEN_KEY.test(key))
      .map(([key, value]) => [
        key.slice(0, 40),
        typeof value === 'string' ? value.slice(0, 200) : value,
      ]),
  );
}

type FetchImpl = (input: string, init: RequestInit) => Promise<Response>;

export class TelemetryReporter {
  private queue: TelemetryEvent[] = [];
  private readonly anonymousId = `biz-server-${randomUUID()}`;
  private readonly sessionId = `instance-${randomUUID()}`;
  private readonly fetchImpl: FetchImpl;
  private readonly flushDelayMs: number;

  constructor(options: { fetchImpl?: FetchImpl; autoStart?: boolean; flushDelayMs?: number } = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.flushDelayMs = options.flushDelayMs ?? FLUSH_INTERVAL_MS;
    if (options.autoStart !== false) {
      // unref：遥测定时器绝不阻止进程退出。
      setInterval(() => void this.flush(), this.flushDelayMs).unref();
    }
  }

  log(input: Omit<BizEventInput, 'level'>): void {
    this.enqueue({ ...input, level: 'info' });
  }

  error(input: Omit<BizEventInput, 'level'>): void {
    this.enqueue({ ...input, level: 'error' });
  }

  enqueue(input: BizEventInput): void {
    if (this.queue.length >= MAX_BATCH * 4) {
      // 背压保护：积压过多说明基础设施不可达，丢弃最旧的事件。
      this.queue.splice(0, this.queue.length - MAX_BATCH * 2);
    }
    this.queue.push({
      eventId: randomUUID(),
      name: input.level === 'error' ? 'biz_error' : 'biz_log',
      screenId: null,
      occurredAt: new Date().toISOString(),
      configVersion: 0,
      properties: sanitizeProperties({
        level: input.level,
        route: input.route,
        status: input.status,
        durationMs: input.durationMs,
        ...(input.message !== undefined ? { detail: input.message } : {}),
      }),
    });
  }

  /** 当前积压事件数（测试与运维观测用）。 */
  get pending(): number {
    return this.queue.length;
  }

  /** 立即上报积压事件；返回成功送达条数。失败静默（丢批不抛错）。 */
  async flush(): Promise<number> {
    if (this.queue.length === 0) return 0;
    const batch = this.queue.splice(0, MAX_BATCH);
    try {
      const response = await this.fetchImpl(FLUSH_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-app-id': getAppId(),
          'x-platform': 'web',
          'x-app-version': APP_VERSION,
        },
        body: JSON.stringify({
          anonymousId: this.anonymousId,
          sessionId: this.sessionId,
          events: batch,
        }),
      });
      if (!response.ok) return 0;
      const body = (await response.json()) as { accepted?: number };
      return typeof body.accepted === 'number' ? body.accepted : batch.length;
    } catch {
      return 0;
    }
  }
}

export const telemetry = new TelemetryReporter();
