import {
  AppUser,
  AuthSession,
  BootstrapPayload,
  CouponView,
  HelpArticle,
  NotificationItem,
  OrderView,
  ProductFeedback,
  ReferralView,
  SessionView,
  SupportConfig,
  SupportMessage,
  SupportTicket,
  SupportTicketDetail,
  UserSettings,
  UsageSummary,
} from '../domain/models';
import { parseOrderStatus, type CreateOrderResult, type MembershipCurrent } from '../payment/paymentModels';
import { getPlatformHeader } from './runtimePlatform';
import { currentLanguage } from '../i18n/core';
import type { errors as errorStrings } from '../i18n/locales/zh-CN/errors';

type Envelope<T> = Readonly<{ data: T }>;
type ErrorPayload = Readonly<{
  code: string;
  message: string;
  retryable: boolean;
  traceId: string;
  retryAfterSeconds?: number;
  fieldErrors?: Readonly<Record<string, readonly string[]>>;
}>;
type ErrorEnvelope = Readonly<{ error: ErrorPayload }>;

// 业务后端（biz-server）独立部署；未配置时回落 auth base（本地 dev 常用同机部署）。
// 自 3.4 起自习室 SSE/POST 也走 biz origin，SSE 传输层复用它。
export function getBizApiBase() {
  return process.env.EXPO_PUBLIC_BIZ_API_URL?.trim() || getApiBase();
}

function getApiBase() {
  return process.env.EXPO_PUBLIC_API_URL
    ?? (getPlatformHeader() === 'android' ? 'http://10.0.2.2:3210' : 'http://localhost:3210');
}

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly retryAfterSeconds?: number,
    readonly fieldErrors?: Readonly<Record<string, readonly string[]>>,
    /** 客户端合成消息的 i18n 键（errors 命名空间）；服务端原样消息不设此键 */
    readonly messageKey?: keyof typeof errorStrings,
  ) {
    super(message);
  }
}

// S3 storage upload (BaaS): presigned PUT 直传 OSS。url 为对象访问 URL，
// avatar 等场景存它（base64 退役）。
interface SignUploadResult {
  uploadUrl: string;
  url: string;
  objectKey: string;
}

async function uploadAvatarToStorage(jpegBase64: string, userId: string): Promise<string> {
  const sign = await request<SignUploadResult>('/api/v1/storage/uploads', jsonOptions(
    'POST',
    { path: `avatars/${userId}-${Date.now()}.jpg`, contentType: 'image/jpeg' },
  ));
  const binary = Uint8Array.from(atob(jpegBase64), c => c.charCodeAt(0));
  const put = await fetch(sign.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg' },
    body: binary,
  });
  if (!put.ok) throw new Error(`对象存储上传失败 ${put.status}`);
  return sign.url;
}

// objectKey → presigned GET URL（私有 bucket，24h）。通用资产显示前换取。
async function resolveObjectUrl(objectKey: string): Promise<string | null> {
  try {
    const result = await request<{ url: string }>(
      `/api/v1/storage/urls?key=${encodeURIComponent(objectKey)}`,
    );
    return result.url ?? null;
  } catch {
    return null;
  }
}

// 会话级缓存 + 并发合并（同一 objectKey 只请求一次；失败/过期 invalidate）。
const assetUrlCache = new Map<string, string>();

export async function resolveAssetUrl(objectKey: string): Promise<string | null> {
  if (objectKey.startsWith('http://') || objectKey.startsWith('https://') ||
      objectKey.startsWith('data:')) {
    return objectKey;
  }
  const cached = assetUrlCache.get(objectKey);
  if (cached) return cached;
  const url = await resolveObjectUrl(objectKey);
  if (url) assetUrlCache.set(objectKey, url);
  return url;
}

export function invalidateAssetUrl(objectKey: string): void {
  assetUrlCache.delete(objectKey);
}

// —— LofiCompanion 远端会话形态（snake_case 对齐服务端 focus_sessions 行）——
export interface FocusSessionRemote {
  id: string;
  user_id: string;
  activity: string;
  planned_seconds: number;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  started_at: string;
  ended_at: string | null;
  effective_seconds: number;
  pauses: string;
  client_request_id: string;
}

export interface FocusCompleteRemote {
  session: FocusSessionRemote;
  replayed: boolean;
}

// —— LofiCompanion P0-C：好友/小组/榜单远端形态（snake_case 不进域层，由
// 服务端保证只含昵称/头像/分钟/名次——任务正文与活动字段永不出现，docs/01 §5.7）——
export interface LeaderboardRankingRemote {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  minutes: number;
  sessionCount: number;
  rank: number;
  /** 仅本人行且已退出榜单时出现（S10 当前用户卡提示「已退出榜单」） */
  youOptedOut?: true;
}

export interface LeaderboardViewRemote {
  weekId: string;
  isWeekOver: boolean;
  rankings: readonly LeaderboardRankingRemote[];
  snapshotUsed: boolean;
}

export interface GroupLeaderboardViewRemote extends LeaderboardViewRemote {
  weeklyGoalMinutes: number;
  goalMet: boolean;
  groupTotalSeconds: number;
}

export interface FriendSummaryRemote {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  weekMinutes: number;
}

export interface GroupSummaryRemote {
  id: string;
  name: string;
  ownerUserId: string;
  joinCode: string;
  weeklyGoalMinutes: number;
  createdAt: string;
}

export interface GroupMemberRemote {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  role: 'owner' | 'member';
  joinedAt: string;
}

export interface GroupDetailRemote {
  group: GroupSummaryRemote;
  members: readonly GroupMemberRemote[];
  weekId: string;
  thisWeekMinutes: number;
  goalMet: boolean;
  onlineCount: number;
}

export interface LeaderboardPrivacyRemote {
  publicDisplay: boolean;
  optedOut: boolean;
  updatedAt: string;
}

export interface AcceptInviteRemote {
  accepted: boolean;
  alreadyFriends: boolean;
  friend: { userId: string; nickname: string; avatarUrl: string | null };
}

// —— LofiCompanion P1-A：皮肤商店/订单远端形态（docs/04 §3 store 路由，
// 与 server product-repository/order-service 的 wire shape 逐字段对齐）——
export interface SkinProductRemote {
  id: string;
  skinId: string;
  slug: string;
  skinName: string;
  /** 'free' | 'paid' | 'premium'（服务端 skins.access_type） */
  accessType: string;
  entitlementKey: string;
  storeProductIds: Record<string, string>;
  /** 分为单位（docs/05 §8：价格只来自服务端，客户端不硬编码） */
  priceMinor: number;
  currency: string;
  /** 只有 active 商品会出现在目录里 */
  status: string;
}

// —— P0-B：服务器分发皮肤（GET /v1/skins 目录与 /v1/skins/{id}/manifest 门禁形态）——
export interface SkinSummaryRemote {
  id: string;
  slug: string;
  name: string;
  accessType: string;
  manifestVersion: number;
  moderationStatus: string;
  publishedAt: string | null;
  /** 裸 objectKey（loficompanion/... 前缀），客户端经 resolveAssetUrl 换签 */
  posterUrl: string | null;
}

export interface SkinManifestRemote {
  skinId: string;
  slug: string;
  manifestVersion: number;
  manifest: Record<string, unknown>;
}

export interface SkinOrderRemote {
  orderId: string;
  skinId: string;
  slug: string;
  entitlementKey: string;
  priceMinor: number;
  currency: string;
  status: string;
  /** 支付通道（mock/apple/...）：客户端据此选 mock/原生 IAP provider */
  provider: string;
  /** 本平台商店 SKU（mock 时为商品 id）；purchase 入参 */
  storeProductId: string;
  createdAt: string;
  completedAt: string | null;
  /** 皮肤权益是否已生效（中断恢复轮询的终态判据） */
  entitled: boolean;
}

// —— 公开法务（P5 起按需读取：bootstrap 只带元数据，正文走专用通道）——
export interface PublicLegalDocRemote {
  type: 'privacy' | 'terms' | 'subscription';
  locale: 'zh-CN' | 'en-US';
  revision: string;
  title: string;
  content: string;
  requiresReconsent: boolean;
}

export const apiClient = {
  uploadAvatarToStorage,
  resolveObjectUrl,
  bootstrap: () => request<BootstrapPayload>('/api/v1/bootstrap'),
  signIn: (identifier: string, password: string) => requestAuth('/api/v1/auth/sign-in', {
    identifier,
    password,
    deviceName: `${getPlatformHeader()} · MobileUI`,
  }),
  signUp: (email: string, password: string, username: string, consentVersion: string) =>
    requestAuth('/api/v1/auth/sign-up', {
      email,
      password,
      username,
      consentVersion,
      deviceName: `${getPlatformHeader()} · MobileUI`,
    }),
  verifyEmail: (email: string, code: string) => request<{ verified: boolean }>(
    '/api/v1/auth/verify-email', jsonOptions('POST', { email, code }),
  ),
  resendEmailVerification: (email: string) => request<{
    accepted: boolean;
    resendAfterSeconds: number;
  }>('/api/v1/auth/verify-email/resend', jsonOptions('POST', { email })),
  socialSignIn: (input: {
    provider: 'apple' | 'google' | 'github';
    idToken?: string;
    authorizationCode?: string;
    redirectUri?: string;
    codeVerifier?: string;
    nonce?: string;
  }) => requestAuth('/api/v1/auth/social', {
    ...input,
    deviceName: `${getPlatformHeader()} · MobileUI`,
  }),
  signOut: () => request<{ signedOut: boolean }>('/api/v1/auth/sign-out', { method: 'POST' }),
  signOutAll: () => request<{ signedOut: boolean }>('/api/v1/auth/sign-out-all', { method: 'POST' }),
  requestPhoneCode: (phone: string) => request<{
    accepted: boolean;
    resendAfterSeconds: number;
  }>('/api/v1/auth/phone/request', jsonOptions('POST', { phone })),
  verifyPhoneCode: (phone: string, code: string) => requestAuth('/api/v1/auth/phone/verify', {
    phone,
    code,
    deviceName: `${getPlatformHeader()} · MobileUI`,
  }),
  requestPasswordReset: (email: string) => request<{
    accepted: boolean;
    resendAfterSeconds: number;
  }>('/api/v1/auth/password/forgot', jsonOptions('POST', { email })),
  verifyPasswordReset: (email: string, code: string) => request<{
    resetToken: string;
    expiresInSeconds: number;
  }>('/api/v1/auth/password/verify', jsonOptions('POST', { email, code })),
  resetPassword: (resetToken: string, newPassword: string) => request<{
    changed: boolean;
    requiresSignIn: boolean;
  }>('/api/v1/auth/password/reset', jsonOptions('POST', { resetToken, newPassword })),
  updateProfile: (patch: { displayName?: string; bio?: string; avatarUrl?: string | null }) =>
    request<AppUser>('/api/v1/me/profile', jsonOptions('PATCH', patch)),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ changed: boolean; requiresSignIn: boolean }>(
      '/api/v1/me/change-password',
      jsonOptions('POST', { currentPassword, newPassword }),
    ),
  saveSettings: (patch: UserSettings) =>
    request<UserSettings>('/api/v1/me/settings', jsonOptions('PUT', patch)),
  sessions: () => request<readonly SessionView[]>('/api/v1/me/sessions'),
  revokeSession: (id: string) =>
    request<{ revoked: boolean }>(`/api/v1/me/sessions/${id}`, { method: 'DELETE' }),
  notifications: () => request<readonly NotificationItem[]>('/api/v1/notifications'),
  readAllNotifications: () =>
    request<{ allRead: boolean }>('/api/v1/notifications', { method: 'PATCH' }),
  readNotification: (id: string) =>
    request<{ read: boolean }>(`/api/v1/notifications/${id}`, { method: 'PATCH' }),
  deleteNotification: (id: string) =>
    request<{ deleted: boolean }>(`/api/v1/notifications/${id}`, { method: 'DELETE' }),
  orders: () => request<readonly OrderView[]>('/api/v1/orders')
    .then((rows) => rows.map(toOrderView)),
  usage: () => request<UsageSummary>('/api/v1/me/usage'),
  coupons: () => request<readonly CouponView[]>('/api/v1/me/coupons'),
  referral: () => request<ReferralView>('/api/v1/me/referral'),
  createOrder: (planId: string, idempotencyKey: string) => request<CreateOrderResult>(
    '/api/v1/orders',
    {
      ...jsonOptions('POST', { planId }),
      headers: {
        ...clientHeaders(),
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
    },
  ),
  verifyPurchase: (orderId: string | undefined, receipt: unknown) => request<OrderView>(
    '/api/v1/purchases/verify',
    jsonOptions('POST', { ...(orderId ? { orderId } : {}), receipt }),
  ).then(toOrderView),
  restore: (receipts: unknown[]) => request<{ entitlements: readonly string[] }>(
    '/api/v1/purchases/restore',
    jsonOptions('POST', { receipts }),
  ),
  membershipCurrent: () => request<MembershipCurrent>('/api/v1/membership/current'),
  /** 公开法务文档（按需）：type/locale 可选，缺省返回全部；正文仅在此通道下发。 */
  publicLegal: (params: { type?: string; locale?: string } = {}) => {
    const query = new URLSearchParams({
      app: APP_ID,
      env: APP_ENVIRONMENT || 'production',
      ...(params.type ? { type: params.type } : {}),
      ...(params.locale ? { locale: params.locale } : {}),
    });
    return request<{ docs: readonly PublicLegalDocRemote[] }>(
      `/api/v1/public/legal?${query.toString()}`,
    );
  },

  entitlements: () => request<{ keys: readonly string[] }>('/api/v1/membership/entitlements'),
  // 聚合「已拥有」权益键：会员 Plus 键（auth）∪ 皮肤键（biz）。单侧失败降级
  // 为空集（不阻塞另一侧——商店/画廊判拥有可用的最宽集合）。
  ownedEntitlementKeys: async (): Promise<readonly string[]> => {
    const [membership, skins] = await Promise.allSettled([
      apiClient.entitlements(),
      apiClient.skinEntitlements(),
    ]);
    const set = new Set<string>();
    if (membership.status === 'fulfilled') {
      for (const key of membership.value.keys) set.add(key);
    }
    if (skins.status === 'fulfilled') {
      for (const key of skins.value.entitlements) set.add(key);
    }
    return [...set];
  },
  deleteAccount: (password: string) => request<{ deleted: boolean }>(
    '/api/v1/me/deletion',
    jsonOptions('DELETE', { password, confirmation: 'DELETE' }),
  ),
  // —— LofiCompanion P0-B：专注同步端点（完成幂等键 = clientRequestId）——
  createFocusSession: (input: {
    activity: string;
    plannedSeconds: number;
    clientRequestId: string;
    startedAt: number;
    installationId?: string;
  }) => requestBiz<FocusSessionRemote>('/api/v1/focus/sessions', {
    ...jsonOptions('POST', input),
    headers: { ...clientHeaders(), 'Content-Type': 'application/json' },
  }),
  completeFocusSession: (
    id: string,
    body: {
      pauses: ReadonlyArray<{ start: number; end: number }>;
      completedAt: number;
      outcome: 'completed' | 'abandoned';
    },
    idempotencyKey: string,
  ) => requestBiz<FocusCompleteRemote>(
    `/api/v1/focus/sessions/${id}/complete`,
    {
      ...jsonOptions('POST', body),
      headers: {
        ...clientHeaders(),
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
    },
  ),
  migrateGuestSessions: (sessions: ReadonlyArray<Record<string, unknown>>) =>
    requestBiz<{ migrated: number; skipped: number; grants: readonly string[] }>(
      '/api/v1/sync/migrate',
      jsonOptions('POST', { sessions }),
    ),
  // —— LofiCompanion P1-A：皮肤商店（docs/04 §3；P4 起商店域全部走 biz-server）。
  // 目录公开可浏览（S14 未登录可看价格）；下单幂等键 = 客户端 uuid；验证走
  // biz 的 /purchases/verify（skin-only，会员 verify 仍在 auth）；查单用于中断
  // 恢复轮询。——
  skinProducts: () => requestBiz<{ products: readonly SkinProductRemote[] }>(
    '/api/v1/store/skin-products',
  ),
  // —— P0-B：服务器分发皮肤（走 biz-server）。目录公开可浏览；manifest 免费
  // 公开、付费按权益门禁（401 匿名 / 403 SKIN_NOT_ENTITLED），由
  // remoteSkinsRepository 消费。
  skins: () => requestBiz<{ skins: readonly SkinSummaryRemote[] }>('/api/v1/skins'),
  skinManifest: (skinIdOrSlug: string) =>
    requestBiz<SkinManifestRemote>(
      `/api/v1/skins/${encodeURIComponent(skinIdOrSlug)}/manifest`,
    ),
  createSkinOrder: (skinId: string, idempotencyKey: string) => requestBiz<SkinOrderRemote>(
    '/api/v1/store/skin-orders',
    {
      ...jsonOptions('POST', { skinId }),
      headers: {
        ...clientHeaders(),
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
    },
  ),
  getSkinOrder: (orderId: string) =>
    requestBiz<SkinOrderRemote>(`/api/v1/store/skin-orders/${orderId}`),
  // 皮肤订单验证（biz；与下方会员 verifyPurchase 分流——皮肤所有权归 biz）。
  verifySkinOrder: (orderId: string, receipt: unknown) => requestBiz<SkinOrderRemote>(
    '/api/v1/purchases/verify',
    jsonOptions('POST', { orderId, receipt }),
  ),
  // 皮肤恢复购买（biz）：原生 restore 收据补发皮肤权益，返回已拥有皮肤权益键。
  restoreSkinPurchases: (receipts: unknown[]) => requestBiz<{ entitlements: readonly string[] }>(
    '/api/v1/purchases/restore',
    jsonOptions('POST', { receipts }),
  ),
  // 已拥有皮肤权益键（skin.official.*）。会员 Plus 键走 auth 的 entitlements()；
  // 商店/画廊判拥有时聚合两侧。
  skinEntitlements: () => requestBiz<{ entitlements: readonly string[] }>(
    '/api/v1/store/skin-entitlements',
  ),
  // —— LofiCompanion P0-C：好友邀请码/小组/榜单/隐私（docs/04 §3，走 biz-server）——
  // 我的邀请码（幂等，无则生成——服务端为 POST）。
  myInviteCode: () => requestBiz<{ code: string }>('/api/v1/friends/invitations', { method: 'POST' }),
  acceptInvite: (code: string) => requestBiz<AcceptInviteRemote>(
    '/api/v1/friends/invitations/accept',
    jsonOptions('POST', { code }),
  ),
  listFriends: () => requestBiz<{ friends: readonly FriendSummaryRemote[] }>('/api/v1/friends'),
  createGroup: (name: string, weeklyGoalMinutes?: number) => requestBiz<{ group: GroupSummaryRemote }>(
    '/api/v1/study-groups',
    jsonOptions('POST', {
      name,
      ...(weeklyGoalMinutes !== undefined ? { weeklyGoalMinutes } : {}),
    }),
  ),
  joinGroup: (code: string) => requestBiz<{ group: GroupSummaryRemote; alreadyMember: boolean }>(
    '/api/v1/study-groups/join',
    jsonOptions('POST', { code }),
  ),
  getGroupDetail: (id: string) => requestBiz<GroupDetailRemote>(`/api/v1/study-groups/${id}`),
  friendsLeaderboard: (week?: string) => requestBiz<LeaderboardViewRemote>(
    `/api/v1/leaderboards/friends${week ? `?week=${encodeURIComponent(week)}` : ''}`,
  ),
  groupLeaderboard: (id: string, week?: string) => requestBiz<GroupLeaderboardViewRemote>(
    `/api/v1/leaderboards/groups/${id}${week ? `?week=${encodeURIComponent(week)}` : ''}`,
  ),
  getLeaderboardPrivacy: () =>
    requestBiz<LeaderboardPrivacyRemote>('/api/v1/me/leaderboard-privacy'),
  updateLeaderboardPrivacy: (patch: { publicDisplay?: boolean; optedOut?: boolean }) =>
    requestBiz<LeaderboardPrivacyRemote>(
      '/api/v1/me/leaderboard-privacy',
      jsonOptions('PATCH', patch),
    ),
  serverAchievements: () =>
    requestBiz<{ achievements: readonly unknown[] }>('/api/v1/me/achievements'),
  serverRoom: () => requestBiz<{ items: readonly unknown[] }>('/api/v1/me/room'),
  /** 自习室房间在线数（biz SSE 同源 /api/studyroom/rooms；SSE 单向下列表计数走轮询）。 */
  studyRoomCounts: () =>
    requestBiz<{ rooms: ReadonlyArray<{ roomId?: unknown; onlineCount?: unknown }> }>(
      '/api/studyroom/rooms',
    ),
  /** 发送弹幕（SSE 架构下客户端→服务端走 POST；错误 envelope 的 code/retryAfterSeconds 经 ApiClientError 抛出）。 */
  danmakuSend: (roomId: string, content: string) =>
    requestBiz<{ message: unknown }>(
      `/api/studyroom/danmaku?room=${encodeURIComponent(roomId)}`,
      jsonOptions('POST', { content }),
    ),
  telemetry: (batch: {
    anonymousId: string;
    sessionId: string;
    events: readonly Record<string, unknown>[];
  }, signal?: AbortSignal) => request<{ accepted: number; duplicates: number }>(
    '/api/v1/telemetry/events',
    { ...jsonOptions('POST', batch), signal },
  ),
  supportConfig: () => request<Pick<
    SupportConfig,
    'enabled' | 'market' | 'dataRegion' | 'categories'
  >>('/api/v1/support/config'),
  helpArticles: () => request<readonly HelpArticle[]>('/api/v1/support/help'),
  supportTickets: () => request<readonly SupportTicket[]>('/api/v1/support/tickets'),
  supportTicket: (id: string) =>
    request<SupportTicketDetail>(`/api/v1/support/tickets/${id}`),
  createSupportTicket: (input: {
    category: string;
    severity: 'normal' | 'high' | 'urgent';
    subject: string;
    message: string;
  }) => request<SupportTicket>('/api/v1/support/tickets', jsonOptions('POST', input)),
  replySupportTicket: (id: string, message: string) =>
    request<SupportMessage>(
      `/api/v1/support/tickets/${id}/messages`,
      jsonOptions('POST', { message }),
    ),
  submitFeedback: (input: {
    category: 'suggestion' | 'experience' | 'feature_request' | 'other';
    title: string;
    body: string;
    rating?: number;
    screenshots: readonly Readonly<{
      fileName: string;
      mimeType: 'image/jpeg';
      data: string;
    }>[];
  }) => request<ProductFeedback>('/api/v1/support/feedback', jsonOptions('POST', input)),
};

// Token/anonymous sources are injectable so the HTTP layer is node-testable
// (RN storage imports react-native/expo modules that don't load in node).
// Defaults lazily load the RN implementation only when actually used.
type Reader = () => Promise<string | null>;
let sessionTokenReader: Reader = () => import('./storage').then((m) => m.readSessionToken());
let refreshTokenReader: Reader = () => import('./storage').then((m) => m.readRefreshToken());
let anonymousIdReader: Reader = () => import('./storage').then((m) => m.readAnonymousId());
let sessionTokenWriter: (token: string | null) => Promise<void> =
  (token) => import('./storage').then((m) => m.saveSessionToken(token));
let refreshTokenWriter: (token: string | null) => Promise<void> =
  (token) => import('./storage').then((m) => m.saveRefreshToken(token));

export function setSessionTokenReader(reader: Reader) { sessionTokenReader = reader; }
export function setRefreshTokenReader(reader: Reader) { refreshTokenReader = reader; }
export function setAnonymousIdReader(reader: Reader) { anonymousIdReader = reader; }
export function setSessionTokenWriter(writer: (token: string | null) => Promise<void>) { sessionTokenWriter = writer; }
export function setRefreshTokenWriter(writer: (token: string | null) => Promise<void>) { refreshTokenWriter = writer; }

// Platform header injection is re-exported so callers configure the whole HTTP
// layer through apiClient alone (tests set it to 'ios'; App sets Platform.OS).
export { setPlatformHeader } from './runtimePlatform';

async function requestAuth(
  path: string,
  body: Readonly<Record<string, string | undefined>>,
) {
  return request<AuthSession>(path, jsonOptions('POST', body));
}

let refreshInFlight: Promise<boolean> | null = null;
let sessionExpiredHandler: (() => void) | null = null;

// AppStore registers this so that an unrecoverable session expiry clears the
// user and bounces to the sign-in guard, instead of looping on failing calls.
export function registerSessionExpiredHandler(handler: (() => void) | null) {
  sessionExpiredHandler = handler;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  return sendRequest<T>(path, options, false);
}

// 业务域请求：走 biz-server（鉴权/信封/刷新流程与 auth 完全同构）
async function requestBiz<T>(path: string, options: RequestInit = {}): Promise<T> {
  return sendRequest<T>(path, options, false, getBizApiBase());
}

async function sendRequest<T>(
  path: string,
  options: RequestInit,
  retried: boolean,
  base: string = getApiBase(),
): Promise<T> {
  const [token, installationId] = await Promise.all([
    sessionTokenReader(),
    anonymousIdReader(),
  ]);
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        ...clientHeaders(),
        ...(installationId ? { 'X-Installation-Id': installationId } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw serviceUnavailableError();
  }
  if (response.status === 401 && !retried && await refreshSession()) {
    // 401 重试必须携带原 base：biz 请求刷新 token 后仍要打回 biz，
    // 否则分离部署时（BIZ_API_URL ≠ API_URL）重试会错打到 auth 基址
    return sendRequest<T>(path, options, true, base);
  }
  const body = await parseResponse<T>(response);
  if (!response.ok || 'error' in body) {
    // 非 error 信封（裸 HTTP 错误）时客户端合成消息，带 messageKey 供 UI 本地化
    const error: ErrorPayload & { messageKey?: keyof typeof errorStrings } = 'error' in body ? body.error : {
      code: 'HTTP_ERROR',
      message: response.status >= 500 ? '服务暂时不可用，请稍后重试' : '服务请求失败',
      retryable: response.status >= 500,
      traceId: 'local',
      messageKey: response.status >= 500 ? 'serverUnavailable' : 'requestFailed',
    };
    // 401 仅在「已登录会话失效」时触发过期回调；auth 端点（登录/注册/验证码
    // 等）的 401 是凭证错误，走表单内联错误展示，不能切页/清输入。
    if (response.status === 401 && !retried && !path.startsWith('/api/v1/auth/')) {
      sessionExpiredHandler?.();
    }
    throw new ApiClientError(
      error.code,
      specificErrorMessage(error.message, error.fieldErrors),
      response.status,
      error.retryable,
      error.retryAfterSeconds,
      error.fieldErrors,
      'messageKey' in error ? error.messageKey : undefined,
    );
  }
  return body.data;
}

export function specificErrorMessage(
  fallback: string,
  fieldErrors?: Readonly<Record<string, readonly string[]>>,
) {
  if (!fieldErrors) return fallback;
  const messages = [...new Set(Object.values(fieldErrors).flat().filter(Boolean))];
  return messages.length ? messages.join('；') : fallback;
}

async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) refreshInFlight = performRefresh();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function performRefresh(): Promise<boolean> {
  const refreshToken = await refreshTokenReader();
  if (!refreshToken) return false;
  try {
    const response = await fetch(`${getApiBase()}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { ...clientHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) return false;
    const body = await response.json() as Envelope<AuthSession>;
    const data = body?.data;
    if (!data?.token || !data?.refreshToken) return false;
    await sessionTokenWriter(data.token);
    await refreshTokenWriter(data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

async function parseResponse<T>(response: Response): Promise<Envelope<T> | ErrorEnvelope> {
  const text = await response.text();
  try {
    return JSON.parse(text) as Envelope<T> | ErrorEnvelope;
  } catch {
    if (response.status >= 500) throw serviceUnavailableError(response.status);
    throw new ApiClientError('INVALID_RESPONSE', '服务返回了无法识别的数据', response.status, false, undefined, undefined, 'badResponse');
  }
}

function serviceUnavailableError(status = 0) {
  return new ApiClientError(
    'SERVICE_UNAVAILABLE',
    '无法连接服务器，请检查网络后重试',
    status,
    true,
    undefined,
    undefined,
    'networkUnreachable',
  );
}

// Normalize OrderView.status at the boundary: the wire returns raw strings,
// but OrderView.status is the typed OrderStatus union.
function toOrderView(raw: OrderView): OrderView {
  return { ...raw, status: parseOrderStatus(raw.status) };
}

function jsonOptions(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// 每个 App 必须通过 EXPO_PUBLIC_APP_ID 声明自己的 app_id（租户）。
// 未配置时启动即抛错，避免混入不可预测的 app_id。
const APP_ID = process.env.EXPO_PUBLIC_APP_ID?.trim();
if (!APP_ID) {
  throw new Error('EXPO_PUBLIC_APP_ID 未配置：请在 .env 中设置该 App 的 app_id 后再启动。');
}

// environment（development/staging/production 等）也必须显式配置，未配置即启动报错。
const APP_ENVIRONMENT = process.env.EXPO_PUBLIC_APP_ENVIRONMENT?.trim();
if (!APP_ENVIRONMENT) {
  throw new Error('EXPO_PUBLIC_APP_ENVIRONMENT 未配置：请在 .env 中设置该 App 的 environment 后再启动。');
}

function clientHeaders() {
  return {
    'X-App-Id': APP_ID,
    'X-App-Environment': APP_ENVIRONMENT,
    'X-Platform': getPlatformHeader(),
    'X-App-Version': '1.0.0',
    // 跟随 i18n 当前语言（服务端据此本地化下发内容）；core.ts 零原生依赖，
    // node 测试可安全导入
    'Accept-Language': currentLanguage(),
  };
}
