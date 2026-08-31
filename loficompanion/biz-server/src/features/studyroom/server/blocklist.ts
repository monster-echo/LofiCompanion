// 弹幕敏感词底线过滤（纯函数）：小写 + 去全部空白后做子串匹配，
// 挡住最粗鄙的色情/辱骂/广告导流。词库刻意保持最小——这里只是合规底线，
// 境内公开上线前必须在 danmaku.send 单点接入真实文本审核服务并补全词库
// （改本文件或在 src/ws/server.ts 调用点替换，勿在别处散落）。

const BLOCKLIST: readonly string[] = [
  // 色情/招嫖
  '约炮',
  '嫖娼',
  '援交',
  '一夜情',
  'horny',
  // 辱骂/人身攻击
  '傻逼',
  '煞笔',
  '妈逼',
  '滚蛋',
  '废物',
  '去死',
  // 广告/导流
  '加微信',
  '加vx',
  '刷单',
  '代刷',
  '兼职日结',
];

function normalize(content: string): string {
  return content.toLowerCase().replace(/\s+/g, '');
}

export function matchesBlocklist(content: string): boolean {
  const normalized = normalize(content);
  if (normalized.length === 0) return false;
  return BLOCKLIST.some((word) => normalized.includes(normalize(word)));
}
