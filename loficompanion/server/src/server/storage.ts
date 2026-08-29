import { S3Client, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ApiError } from './http';

// Implementation-agnostic S3 adapter. Talks the standard S3 protocol, so the
// backing store can be MinIO, Tencent COS, Alibaba OSS, Cloudflare R2, or AWS
// S3 — configured purely via env. One BaaS (auth.zhongbei.tech) serves many
// landing apps, each isolated into its own bucket: bucket = `${prefix}${appId}`.

// Accept either S3_* (standard) or ALIYUN_OSS_* (existing infra naming).
const ENDPOINT = (process.env.S3_ENDPOINT ?? process.env.ALIYUN_OSS_ENDPOINT ?? '').trim();
const ACCESS_KEY_ID = (process.env.S3_ACCESS_KEY_ID ?? process.env.ALIYUN_OSS_ACCESS_KEY ?? '').trim();
const SECRET_ACCESS_KEY = (process.env.S3_SECRET_ACCESS_KEY ?? process.env.ALIYUN_OSS_SECRET_KEY ?? '').trim();
// Two isolation modes (env-driven):
//  • S3_BUCKET set      → single shared bucket; appId goes into the key prefix.
//                         New landing apps need zero bucket provisioning.
//  • S3_BUCKET_PREFIX   → one bucket per app: `${prefix}${appId}`. Strongest
//                         isolation (per-bucket policy/quota/lifecycle) but each
//                         app must be provisioned on the S3 backend.
const FIXED_BUCKET = (process.env.S3_BUCKET ?? process.env.ALIYUN_OSS_BUCKET_NAME ?? '').trim();
const BUCKET_PREFIX = (process.env.S3_BUCKET_PREFIX ?? 'app-').trim();
// Region: OSS/COS SigV4 expects the prefixed region (oss-cn-beijing, not
// cn-beijing). Derive from the endpoint when possible; fall back to env.
const DERIVED_REGION = /((?:oss|cos)-[a-z]+-[a-z-]+)/.exec(ENDPOINT)?.[1];
const REGION = (DERIVED_REGION ?? process.env.S3_REGION ?? process.env.ALIYUN_OSS_REGION ?? 'us-east-1').trim();
// MinIO & most self-hosted S3 need path-style addressing; AWS S3 / Alibaba OSS
// prefer virtual-host. Default true fits the self-hosted BaaS orientation.
const FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE !== 'false';
// Optional public base for direct CDN/object URLs (skip presigned download).
// e.g. https://cdn.zhongbei.tech — object URLs become `${PUBLIC_BASE}/${bucket}/${key}`.
const PUBLIC_BASE = process.env.S3_PUBLIC_BASE?.trim();

function singleBucketMode(): boolean {
  return !!FIXED_BUCKET && FIXED_BUCKET.length > 0;
}

let cached: S3Client | null = null;

function isConfigured(): boolean {
  return !!(ENDPOINT && ACCESS_KEY_ID && SECRET_ACCESS_KEY);
}

function client(): S3Client {
  if (!isConfigured()) {
    throw new ApiError(
      503,
      'STORAGE_NOT_CONFIGURED',
      'S3 存储未配置：请设置 S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY',
      true,
    );
  }
  if (cached) return cached;
  cached = new S3Client({
    endpoint: ENDPOINT,
    region: REGION,
    credentials: { accessKeyId: ACCESS_KEY_ID!, secretAccessKey: SECRET_ACCESS_KEY! },
    forcePathStyle: FORCE_PATH_STYLE,
  });
  return cached;
}

// Bucket for a landing app:
//  • single-bucket mode → the shared S3_BUCKET (appId isolates via key prefix)
//  • per-app mode       → `${prefix}${appId}` (lower-cased; S3 naming rules)
export function bucketForApp(appId: string): string {
  if (singleBucketMode()) return FIXED_BUCKET!;
  const name = `${BUCKET_PREFIX}${appId.toLowerCase()}`;
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(name)) {
    throw new ApiError(400, 'INVALID_APP_ID', `app_id 衍生的 bucket 名不合法: ${name}`, false);
  }
  return name;
}

// Object key:
//  • single-bucket mode → `${appId}/${env}/<path>` (appId in the key, since the
//    bucket is shared)
//  • per-app mode       → `${env}/<path>` (appId is already the bucket)
export function objectKey(appId: string, environment: string, path: string): string {
  const cleanPath = path.replace(/^\/+/, '');
  return singleBucketMode()
    ? `${appId.toLowerCase()}/${environment}/${cleanPath}`
    : `${environment}/${cleanPath}`;
}

const ensuredBuckets = new Set<string>();

// Lazily create the app's bucket on first use. MinIO/COS/OSS support
// CreateBucket; R2 requires manual creation — if it 409s/403s we treat the
// bucket as pre-existing (admin-created).
export async function ensureBucket(bucket: string): Promise<void> {
  if (ensuredBuckets.has(bucket)) return;
  const s3 = client();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    ensuredBuckets.add(bucket);
    return;
  } catch {
    // Not found (or no permission to head) — attempt to create.
  }
  try {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (error) {
    // BucketAlreadyOwnedByYou / 409 → fine. Anything else → surface so admin
    // can pre-create the bucket manually on providers that forbid it.
    const code = (error as { name?: string }).name ?? '';
    if (!/BucketAlready|409|BucketAlreadyExists/i.test(code)) {
      throw new ApiError(503, 'BUCKET_CREATE_FAILED', `无法创建 bucket ${bucket}：${code}`, true);
    }
  }
  ensuredBuckets.add(bucket);
}

export interface SignUploadResult {
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  objectKey: string;
  // Access URL for the stored object — permanent public URL when S3_PUBLIC_BASE
  // is set, otherwise an opaque `s3://` reference the client resolves via
  // GET /urls?key=. The client uses this for <img>/<video>/preview/download.
  url: string;
}

// Returns a short-lived presigned PUT URL the client uploads the file to
// directly (server never streams the bytes). The object key is opaque to the
// client; it stores `url` (or objectKey) as the persisted reference.
export async function signUpload(params: {
  appId: string;
  environment: string;
  path: string;
  contentType: string;
}): Promise<SignUploadResult> {
  const bucket = bucketForApp(params.appId);
  await ensureBucket(bucket);
  const key = objectKey(params.appId, params.environment, params.path);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: params.contentType,
  });
  const uploadUrl = await getSignedUrl(client(), command, { expiresIn: 300 });
  return {
    uploadUrl,
    method: 'PUT',
    headers: { 'content-type': params.contentType },
    objectKey: key,
    url: urlFor(bucket, key),
  };
}

// Returns an access URL for the object: a direct public/CDN URL if
// S3_PUBLIC_BASE is set, otherwise a short-lived presigned GET URL. The client
// decides the use (download / preview / stream / embed).
export async function resolveObjectUrl(params: {
  appId: string;
  objectKey: string;
}): Promise<{ url: string }> {
  const bucket = bucketForApp(params.appId);
  if (PUBLIC_BASE) {
    return { url: `${PUBLIC_BASE}/${bucket}/${params.objectKey}` };
  }
  const command = new GetObjectCommand({ Bucket: bucket, Key: params.objectKey });
  // 24h：一次登录会话（含跨天）内无需刷新；业界 presigned 常见 1h–7d，
  // 24h 是安全与体验的平衡。过期后客户端重新调 /urls 换取。
  const url = await getSignedUrl(client(), command, { expiresIn: 86_400 });
  return { url };
}

function urlFor(bucket: string, key: string): string {
  if (PUBLIC_BASE) return `${PUBLIC_BASE}/${bucket}/${key}`;
  // No public base: opaque reference the client resolves via GET /urls?key=.
  return `s3://${bucket}/${key}`;
}
