import { S3Client, HeadBucketCommand, CreateBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ApiError } from '@/lib/http';

// 实现无关的 S3 适配器（搬迁自 loficompanion/server src/server/storage.ts，
// biz 采用单桶模式）：对象存储可为 MinIO/腾讯 COS/阿里 OSS/Cloudflare R2/AWS
// S3，全部经 env 配置。biz 侧租户 appId 来自 getAppId()（部署期固定）：
//   bucket = S3_BUCKET（共享桶），objectKey = `${appId}/${environment}/<path>`
//（appId 进 key 前缀做租户隔离，新 app 零开桶成本）。

// 接受 S3_*（标准）或 ALIYUN_OSS_*（既有基础设施命名）。
const ENDPOINT = (process.env.S3_ENDPOINT ?? process.env.ALIYUN_OSS_ENDPOINT ?? '').trim();
const ACCESS_KEY_ID = (process.env.S3_ACCESS_KEY_ID ?? process.env.ALIYUN_OSS_ACCESS_KEY ?? '').trim();
const SECRET_ACCESS_KEY = (process.env.S3_SECRET_ACCESS_KEY ?? process.env.ALIYUN_OSS_SECRET_KEY ?? '').trim();
// 单桶模式：S3_BUCKET 固定共享桶。
const FIXED_BUCKET = (process.env.S3_BUCKET ?? process.env.ALIYUN_OSS_BUCKET_NAME ?? '').trim();
// Region：OSS/COS SigV4 需要带前缀 region（oss-cn-beijing 而非 cn-beijing）。
// 能从 endpoint 推导则优先，回落 env。
const DERIVED_REGION = /((?:oss|cos)-[a-z]+-[a-z-]+)/.exec(ENDPOINT)?.[1];
const REGION = (DERIVED_REGION ?? process.env.S3_REGION ?? process.env.ALIYUN_OSS_REGION ?? 'us-east-1').trim();
// MinIO 与多数自建 S3 需 path-style；AWS S3 / 阿里 OSS 偏好 virtual-host。
// 默认 true 贴合自建 BaaS 场景。
const FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE !== 'false';
// 可选公网/CDN 基址（跳过 presigned 下载直连对象）。
const PUBLIC_BASE = process.env.S3_PUBLIC_BASE?.trim();

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

export function bucketForApp(): string {
  if (!FIXED_BUCKET) {
    throw new ApiError(
      503,
      'STORAGE_NOT_CONFIGURED',
      'S3 存储未配置：请设置 S3_BUCKET（biz 单桶模式）',
      true,
    );
  }
  return FIXED_BUCKET;
}

// 对象 key（单桶模式）：`${appId}/${env}/<path>`（appId 小写进 key 做租户隔离）。
export function objectKey(appId: string, environment: string, path: string): string {
  const cleanPath = path.replace(/^\/+/, '');
  return `${appId.toLowerCase()}/${environment}/${cleanPath}`;
}

const ensuredBuckets = new Set<string>();

// 首次使用时惰性建桶。MinIO/COS/OSS 支持 CreateBucket；R2 需手工建——若
// 409/403 视为桶已存在（管理员预建）。
export async function ensureBucket(bucket: string): Promise<void> {
  if (ensuredBuckets.has(bucket)) return;
  const s3 = client();
  // 保留 head 失败原因：若 create 也失败则两个码都上报，避免把坏凭据
  // （如 InvalidAccessKeyId——每次调用都同样失败）误读成建桶问题。
  let headCode = '';
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    ensuredBuckets.add(bucket);
    return;
  } catch (error) {
    // Not found（或无权限 head）——仍尝试创建：受限 RAM key 可能缺
    // ListBucket 但读写正常。
    headCode = (error as { name?: string }).name ?? '';
  }
  try {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (error) {
    // BucketAlreadyOwnedByYou / 409 → 无碍。其余 → 上抛，管理员在禁止建桶
    // 的云上手工预建。
    const code = (error as { name?: string }).name ?? '';
    if (!/BucketAlready|409|BucketAlreadyExists/i.test(code)) {
      const head = headCode && headCode !== code ? `（head: ${headCode}）` : '';
      throw new ApiError(503, 'BUCKET_CREATE_FAILED', `无法创建 bucket ${bucket}：${code}${head}`, true);
    }
  }
  ensuredBuckets.add(bucket);
}

export interface SignUploadResult {
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  objectKey: string;
  // 存储对象的访问 URL —— 配置 S3_PUBLIC_BASE 时是永久公网 URL，否则是
  // 客户端经 GET /urls?key= 解析的 `s3://` 不透明引用。
  url: string;
}

// 返回短时效 presigned PUT URL，客户端直传文件（服务端不过流）。objectKey
// 对客户端不透明；客户端存 url（或 objectKey）作为持久引用。
export async function signUpload(params: {
  appId: string;
  environment: string;
  path: string;
  contentType: string;
}): Promise<SignUploadResult> {
  const bucket = bucketForApp();
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

function urlFor(bucket: string, key: string): string {
  if (PUBLIC_BASE) return `${PUBLIC_BASE}/${bucket}/${key}`;
  // 无公网基址：不透明引用，客户端经 GET /urls?key= 解析。
  return `s3://${bucket}/${key}`;
}
