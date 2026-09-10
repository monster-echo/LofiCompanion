import { currentLanguage, i18n } from '../i18n/core';
import { ApiClientError } from './apiClient';

/**
 * 错误消息的「可展示化」统一出口（UI 渲染前必经）：
 * 1. 客户端合成的错误带 messageKey → 按当前语言取 errors 命名空间文案；
 * 2. 服务端高频业务码（登录/注册/验证码）→ 客户端码表翻译（服务端错误文案
 *    未本地化，码是稳定契约，文案在 errors 命名空间维护）；
 * 3. 其余服务端/下游 message 当前只有中文——非中文界面直接展示会串语言，
 *    凡检出 CJK 一律回落调用方给的本地化兜底文案。服务端日后按
 *    Accept-Language 下发英文时自然直通，无需改此层。
 * 调用方先把自己的兜底文案翻译好再传入（多数是各 feature 命名空间的键）。
 */
const CJK = /[一-龥]/;

/** 服务端稳定错误码 → errors 命名空间键（高频用户可见码；未登记码走 CJK 兜底） */
const ERROR_CODE_KEYS = {
  INVALID_CREDENTIALS: 'invalidCredentials',
  USERNAME_TAKEN: 'usernameTaken',
  USERNAME_EXISTS: 'usernameTaken',
  EMAIL_TAKEN: 'emailTaken',
  EMAIL_EXISTS: 'emailTaken',
  PASSWORD_POLICY: 'passwordPolicy',
  CURRENT_PASSWORD_INVALID: 'currentPasswordInvalid',
  PASSWORD_INVALID: 'currentPasswordInvalid',
  EMAIL_CODE_INVALID: 'codeInvalid',
  PHONE_CODE_INVALID: 'codeInvalid',
  RESET_CODE_INVALID: 'codeInvalid',
  EMAIL_CODE_EXPIRED: 'codeExpired',
  PHONE_CODE_EXPIRED: 'codeExpired',
  RESET_CODE_EXPIRED: 'codeExpired',
  EMAIL_CODE_LOCKED: 'codeLocked',
  PHONE_CODE_LOCKED: 'codeLocked',
  RESET_CODE_LOCKED: 'codeLocked',
} as const;

export function errorMessageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    if (error.messageKey) return i18n.t(`errors:${error.messageKey}`);
    const codeKey = ERROR_CODE_KEYS[error.code as keyof typeof ERROR_CODE_KEYS];
    if (codeKey) return i18n.t(`errors:${codeKey}`);
  }
  const raw = error instanceof Error && error.message ? error.message : null;
  if (raw && !(currentLanguage() !== 'zh-CN' && CJK.test(raw))) return raw;
  return fallback;
}
