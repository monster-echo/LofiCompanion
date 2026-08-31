// 弹幕内容校验（纯函数，node 测试覆盖）：trim 后按 Unicode 码点计数，
// 1..42 字——emoji/扩展平面字符按 1 计，与客户端 maxLength 口径一致。

export const DANMAKU_MAX_CHARS = 42;

export type DanmakuVerdict =
  | { ok: true; content: string }
  | { ok: false; reason: 'too_long' | 'empty' | 'invalid' };

export function validateDanmakuContent(raw: unknown): DanmakuVerdict {
  if (typeof raw !== 'string') return { ok: false, reason: 'invalid' };
  const content = raw.trim();
  const length = [...content].length;
  if (length === 0) return { ok: false, reason: 'empty' };
  if (length > DANMAKU_MAX_CHARS) return { ok: false, reason: 'too_long' };
  return { ok: true, content };
}
