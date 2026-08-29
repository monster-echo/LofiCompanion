import { database, nowIso } from './database';
import { createId } from './ids';
import { sendPush } from './push-providers';

type JobInput = Readonly<{
  appId: string;
  environment: string;
  type: string;
  title: string;
  body: string;
  route: string | null;
}>;

type DeliveryRow = {
  id: string;
  jobId: string;
  deviceId: string;
  appId: string;
  environment: string;
  provider: string;
  token: string;
  title: string;
  body: string;
  route: string | null;
  attempts: number;
};

export async function enqueueNotification(input: JobInput) {
  const jobId = createId();
  const now = nowIso();
  await database.transaction(async () => {
    await database.prepare(`
      INSERT INTO notification_jobs(
        id, app_id, environment, type, title, body, route, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      jobId, input.appId, input.environment, input.type,
      input.title, input.body, input.route, now,
    );
    await createInboxNotifications(jobId, input, now);
    await createDeliveries(jobId, input, now);
  });
  return await jobSummary(jobId);
}

export async function processNotificationJobs(limit = 100) {
  const deliveries = await pendingDeliveries(limit);
  for (const delivery of deliveries) await processDelivery(delivery);
  const jobIds = [...new Set(deliveries.map((delivery) => delivery.jobId))];
  await database.prepare(`
    UPDATE notification_jobs SET status = 'complete', completed_at = ?
    WHERE status != 'complete' AND NOT EXISTS (
      SELECT 1 FROM notification_deliveries
      WHERE job_id = notification_jobs.id AND status IN ('pending', 'retry')
    )
  `).run(nowIso());
  return { processed: deliveries.length, jobsTouched: jobIds.length };
}

async function createInboxNotifications(jobId: string, input: JobInput, now: string) {
  await database.prepare(`
    INSERT INTO notifications(id, user_id, type, title, body, route, created_at)
    SELECT gen_random_uuid()::text, id, ?, ?, ?, ?, ?
    FROM users WHERE app_id = ?
  `).run(input.type, input.title, input.body, input.route, now, input.appId);
  await database.prepare(`
    UPDATE notification_jobs SET started_at = ? WHERE id = ?
  `).run(now, jobId);
}

async function createDeliveries(jobId: string, input: JobInput, now: string) {
  await database.prepare(`
    INSERT INTO notification_deliveries(id, job_id, device_id, status, updated_at)
    SELECT gen_random_uuid()::text, ?, id, 'pending', ?
    FROM push_devices
    WHERE app_id = ? AND environment = ? AND enabled = 1
  `).run(jobId, now, input.appId, input.environment);
}

async function pendingDeliveries(limit: number) {
  return await database.prepare(`
    SELECT delivery.id, delivery.job_id AS jobId, delivery.device_id AS deviceId,
      job.app_id AS appId, job.environment, device.provider,
      device.push_token AS token, job.title, job.body, job.route,
      delivery.attempts
    FROM notification_deliveries delivery
    JOIN notification_jobs job ON job.id = delivery.job_id
    JOIN push_devices device ON device.id = delivery.device_id
    WHERE delivery.status IN ('pending', 'retry')
      AND (delivery.next_attempt_at IS NULL OR delivery.next_attempt_at <= ?)
    ORDER BY job.created_at, delivery.updated_at LIMIT ?
  `).all(nowIso(), limit) as DeliveryRow[];
}

async function processDelivery(delivery: DeliveryRow) {
  try {
    const result = await sendPush(
      delivery.appId,
      delivery.environment,
      delivery.provider,
      {
        token: delivery.token,
        title: delivery.title,
        body: delivery.body,
        route: delivery.route,
      },
    );
    await updateDelivery(delivery, result.delivered, result.permanent, result.messageId, result.errorCode);
  } catch (error) {
    await updateDelivery(
      delivery,
      false,
      false,
      undefined,
      error instanceof Error ? error.message : 'PROVIDER_ERROR',
    );
  }
}

async function updateDelivery(
  delivery: DeliveryRow,
  delivered: boolean,
  permanent: boolean,
  messageId?: string,
  errorCode?: string,
) {
  const attempts = delivery.attempts + 1;
  const exhausted = attempts >= 5;
  const status = delivered ? 'sent' : permanent || exhausted ? 'failed' : 'retry';
  const retryAt = status === 'retry'
    ? new Date(Date.now() + Math.min(300, 2 ** attempts * 5) * 1000).toISOString()
    : null;
  await database.prepare(`
    UPDATE notification_deliveries SET status = ?, attempts = ?,
      provider_message_id = ?, error_code = ?, next_attempt_at = ?, updated_at = ?
    WHERE id = ?
  `).run(status, attempts, messageId ?? null, errorCode ?? null, retryAt, nowIso(), delivery.id);
  if (permanent) {
    await database.prepare('UPDATE push_devices SET enabled = 0, updated_at = ? WHERE id = ?')
      .run(nowIso(), delivery.deviceId);
  }
}

async function jobSummary(id: string) {
  return await database.prepare(`
    SELECT job.id, job.status, job.created_at AS createdAt,
      COUNT(delivery.id) AS deliveries
    FROM notification_jobs job
    LEFT JOIN notification_deliveries delivery ON delivery.job_id = job.id
    WHERE job.id = ? GROUP BY job.id
  `).get(id);
}
