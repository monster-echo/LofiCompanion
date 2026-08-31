import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.APP_ID = 'test-biz-app';
process.env.AUTH_BASE_URL = 'https://auth.example.test';

const { TelemetryReporter } = await import('../src/telemetry/reporter.ts');

type CapturedRequest = { input: string; init: RequestInit };

function makeReporter(status = 202) {
  const requests: CapturedRequest[] = [];
  const reporter = new TelemetryReporter({
    autoStart: false,
    fetchImpl: (async (input: string, init: RequestInit) => {
      requests.push({ input, init });
      return new Response(JSON.stringify({ accepted: 1 }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch,
  });
  return { reporter, requests };
}

test('flush posts queued events to the infrastructure telemetry endpoint', async () => {
  const { reporter, requests } = makeReporter();
  reporter.log({ route: '/api/v1/ping', status: 200, durationMs: 12 });
  assert.equal(reporter.pending, 1);

  const accepted = await reporter.flush();
  assert.equal(accepted, 1);
  assert.equal(reporter.pending, 0);

  const { input, init } = requests[0]!;
  assert.equal(input, 'https://auth.example.test/api/v1/telemetry/events');
  assert.equal(init.method, 'POST');
  const headers = init.headers as Record<string, string>;
  assert.equal(headers['x-app-id'], 'test-biz-app');
  assert.equal(headers['x-platform'], 'web');

  const body = JSON.parse(String(init.body)) as {
    anonymousId: string;
    sessionId: string;
    events: Array<{
      eventId: string;
      name: string;
      configVersion: number;
      occurredAt: string;
      properties: Record<string, string | number | boolean>;
    }>;
  };
  assert.ok(body.anonymousId.length >= 8);
  assert.ok(body.sessionId.length >= 8);
  const [event] = body.events;
  assert.equal(event.name, 'biz_log');
  assert.equal(event.configVersion, 0);
  assert.ok(!Number.isNaN(Date.parse(event.occurredAt)));
  assert.equal(event.properties.route, '/api/v1/ping');
  assert.equal(event.properties.status, 200);
});

test('error events use biz_error name and forbidden property keys are dropped', async () => {
  const { reporter, requests } = makeReporter();
  reporter.enqueue({
    route: '/api/v1/ping',
    status: 500,
    durationMs: 3,
    level: 'error',
  });
  await reporter.flush();

  const body = JSON.parse(String(requests[0]!.init.body)) as {
    events: Array<{ name: string; properties: Record<string, unknown> }>;
  };
  assert.equal(body.events[0]!.name, 'biz_error');
  assert.equal(body.events[0]!.properties.level, 'error');

  // 长字符串截断 + 禁止词 key 丢弃（与基础设施 sanitize 规则对齐）。
  const { reporter: sanitizer, requests: sanitizeRequests } = makeReporter();
  sanitizer.enqueue({
    route: '/route',
    status: 200,
    durationMs: 1,
    level: 'warn',
    message: 'x'.repeat(500),
  });
  await sanitizer.flush();
  const props = JSON.parse(String(sanitizeRequests[0]!.init.body)).events[0].properties;
  assert.equal((props.detail as string).length, 200);
});

test('failed delivery drops the batch silently and never throws', async () => {
  const reporter = new TelemetryReporter({
    autoStart: false,
    fetchImpl: (async () => {
      throw new Error('network down');
    }) as typeof fetch,
  });
  reporter.log({ route: '/x', status: 200, durationMs: 1 });
  assert.equal(await reporter.flush(), 0);
});
