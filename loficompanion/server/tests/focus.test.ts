import assert from 'node:assert/strict';
import test, { after } from 'node:test';
const { database, nowIso } = await import('../src/server/database.ts');
const {
  createSession, getActiveSession, settleAndFinishSession,
  listHistory, weeklySummary, withIdempotency,
} = await import('../src/features/focus/data/focus-repository.ts');
const { settleSession, validateSettleInput } = await import('../src/features/focus/domain/settlement.ts');

after(async () => database.close());

const uid = () => `fu-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

async function makeUser(): Promise<string> {
  const id = uid();
  const ts = new Date().toISOString();
  await database.prepare(
    `INSERT INTO users(id, app_id, email, password_hash, username, created_at, updated_at)
     VALUES (?, 'zhongbei', ?, 'hash', ?, ?, ?)`,
  ).run(id, `${id}@test.local`, id, ts, ts);
  return id;
}

test('结算纯函数：区间数学与客户端同语义；倒序/越界/未来时间拒绝', () => {
  const start = Date.UTC(2026, 7, 30, 2, 0, 0);
  const now = start + 1500_000 + 60_000; // 计划结束后一分钟才发起结算（网络延迟）
  // 25 分钟计划：暂停 2 分钟 → 有效 23 分钟
  assert.deepEqual(
    settleSession({ plannedSeconds: 1500, startedAt: start, completedAt: start + 1500_000, pauses: [{ start: start + 600_000, end: start + 720_000 }] }),
    { effectiveSeconds: 1380 },
  );
  // 提前完成合法（按实际有效秒计）；晚于计划完成钳制到计划值
  assert.deepEqual(
    settleSession({ plannedSeconds: 1500, startedAt: start, completedAt: start + 1400_000, pauses: [] }),
    { effectiveSeconds: 1400 },
  );
  assert.deepEqual(
    settleSession({ plannedSeconds: 1500, startedAt: start, completedAt: now, pauses: [] }),
    { effectiveSeconds: 1500 },
  );
  // 非法：结束早于开始；暂停区间溢出到结束后；开始时间在未来
  assert.equal(validateSettleInput({ plannedSeconds: 1500, startedAt: start, completedAt: start - 1, pauses: [] }, now), 'SESSION_INTERVAL_INVALID');
  assert.equal(validateSettleInput({ plannedSeconds: 1500, startedAt: start, completedAt: start + 1450_000, pauses: [{ start: start + 1400_000, end: start + 1500_000 }] }, now), 'SESSION_INTERVAL_INVALID');
  assert.equal(validateSettleInput({ plannedSeconds: 1500, startedAt: start, completedAt: start + 1500_000, pauses: [{ start: start + 100, end: start + 50 }] }, now), 'SESSION_INTERVAL_INVALID');
  assert.equal(validateSettleInput({ plannedSeconds: 1500, startedAt: now + 10_000, completedAt: now + 20_000, pauses: [] }, now), 'SESSION_CLOCK_SKEW');
});

test('创建会话：clientRequestId 幂等；双活跃会话拒绝', async () => {
  const userId = await makeUser();
  const reqId = `cr-${uid()}`;
  const first = await createSession({ userId, activity: 'homework', plannedSeconds: 1500, clientRequestId: reqId, startedAt: Date.now() });
  const replay = await createSession({ userId, activity: 'homework', plannedSeconds: 1500, clientRequestId: reqId, startedAt: Date.now() });
  assert.equal(replay.id, first.id);
  await assert.rejects(
    () => createSession({ userId, activity: 'reading', plannedSeconds: 900, clientRequestId: uid(), startedAt: Date.now() }),
    (error: { code?: string }) => error.code === 'ACTIVE_SESSION_EXISTS',
  );
  const active = await getActiveSession(userId);
  assert.equal(active?.id, first.id);
});

test('P0-B 核心验收：同一完成请求重放十次只结算一次', async () => {
  const userId = await makeUser();
  const session = await createSession({ userId, activity: 'homework', plannedSeconds: 1500, clientRequestId: uid(), startedAt: Date.now() - 1500_000 });
  const completedAt = Date.parse(session.started_at) + 1500_000;
  let lastReplayed = false;
  for (let i = 0; i < 10; i++) {
    const { session: done, replayed } = await settleAndFinishSession(
      session.id, userId,
      { pauses: [], completedAt, outcome: 'completed' },
      `idem-${session.id}`,
    );
    assert.equal(done.status, 'completed');
    assert.equal(done.effective_seconds, 1500);
    lastReplayed = i === 0 ? false : replayed;
  }
  assert.equal(lastReplayed, true);
  const rows = await database.prepare(
    'SELECT count(*) AS n FROM focus_sessions WHERE id = ? AND status = ? AND effective_seconds = ?',
  ).get(session.id, 'completed', 1500) as { n: number };
  assert.equal(rows.n, 1); // 只有一行、只结算一次
  const keys = await database.prepare(
    'SELECT count(*) AS n FROM idempotency_keys WHERE endpoint = ?',
  ).get(`focus.complete:${session.id}`) as { n: number };
  assert.equal(keys.n, 1);
});

test('历史与周汇总：abandoned 不计入分钟，今日/本周口径正确', async () => {
  const userId = await makeUser();
  const now = Date.now();
  const mk = async (clientId: string, seconds: number) => {
    const startedAt = now - 3600_000;
    const s = await createSession({ userId, activity: 'reading', plannedSeconds: 3000, clientRequestId: clientId, startedAt });
    await settleAndFinishSession(s.id, userId, { pauses: [], completedAt: startedAt + seconds * 1000, outcome: 'completed' }, null);
  };
  await mk(uid(), 600);
  await mk(uid(), 900);
  const abandoned = await createSession({ userId, activity: 'coding', plannedSeconds: 3000, clientRequestId: uid(), startedAt: now - 3600_000 });
  await settleAndFinishSession(abandoned.id, userId, { pauses: [], completedAt: now, outcome: 'abandoned' }, null);
  const history = await listHistory(userId);
  assert.equal(history.length, 3); // abandoned 也留档
  const summary = await weeklySummary(userId, now);
  assert.equal(summary.todaySessions, 2);
  assert.equal(summary.todayMinutes, 25); // 10 + 15
  assert.ok(summary.weekMinutes >= 25);
  assert.equal(summary.byActivity[0]?.activity, 'reading');
});

test('withIdempotency：同 key 重放返回首次响应体', async () => {
  const userId = await makeUser();
  const key = uid();
  const first = await withIdempotency(key, userId, 'test.endpoint', async () => ({ body: { n: 1 }, status: 200 }));
  const second = await withIdempotency(key, userId, 'test.endpoint', async () => ({ body: { n: 2 }, status: 201 }));
  assert.equal(first.body.n, 1);
  assert.equal(second.body.n, 1); // 重放取首次
  assert.equal(second.replayed, true);
});
