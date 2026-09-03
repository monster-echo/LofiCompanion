#!/usr/bin/env node
/**
 * 把 Lofi Companion 三份法务文档（隐私政策 / 用户协议 / 订阅说明）推送为
 * auth.zhongbei.tech 的运行时配置（legal 走草稿 → 发布链路，可回滚可审计）。
 *
 * 只替换 config.legal 数组，其余配置键保持当前值不动：
 *   1. GET  /api/v1/admin/config          → 取 draft（优先）或 published 作为基底
 *   2. PUT  /api/v1/admin/config          → 合并 legal 后存为草稿
 *   3. POST /api/v1/admin/config/publish  → 发布
 *
 * 鉴权（二选一）：
 *   生产：AUTH_ADMIN_COOKIE='<管理端登录后的 cookie>' node scripts/push-legal.mjs
 *   非生产：AUTH_ADMIN_KEY=<x-admin-key> node scripts/push-legal.mjs
 *
 * 可选环境变量：
 *   AUTH_BASE_URL      默认 https://auth.zhongbei.tech
 *   AUTH_APP_ID        默认 zhongbei（仅 x-admin-key 路径需要）
 *   AUTH_APP_ENVIRONMENT 默认 production
 *   LEGAL_DRY_RUN=1    只做 GET 校验鉴权与基底，不写入
 */

const BASE = (process.env.AUTH_BASE_URL ?? 'https://auth.zhongbei.tech').replace(/\/+$/, '');
const APP_ID = process.env.AUTH_APP_ID ?? 'zhongbei';
const ENVIRONMENT = process.env.AUTH_APP_ENVIRONMENT ?? 'production';
const COOKIE = process.env.AUTH_ADMIN_COOKIE;
const KEY = process.env.AUTH_ADMIN_KEY;
const DRY_RUN = process.env.LEGAL_DRY_RUN === '1';

const EFFECTIVE_DATE = '2026 年 8 月 31 日';
const REVISION = '2026-08-31';

const LEGAL_DOCS = [
  {
    type: 'privacy',
    locale: 'zh-CN',
    revision: REVISION,
    title: 'Lofi Companion 隐私政策',
    requiresReconsent: true,
    content: `生效日期：${EFFECTIVE_DATE}

1. 适用范围与服务提供方
本政策适用于 Lofi Companion 应用及为其提供账号、数据同步、商店、通知与客服支持的线上服务（含 auth.zhongbei.tech）。服务提供方为苏州终北科技有限公司及其依法授权的运营主体。

2. 我们处理的数据
我们遵循最小必要原则，仅处理为提供服务所需的数据：
· 账号信息：用户名、邮箱或手机号、登录凭证（仅以加密形式保存），以及你选择使用的第三方登录（如 Apple、Google）返回的账号标识与基础资料。
· 个人资料：你自主设置的头像与昵称。
· 专注与学习数据：会话活动类型、计划与有效时长、开始/暂停/完成时间，以及由此获得的成就与收藏物。此类数据默认保存在你的设备上，仅在你登录后为同步与跨设备恢复而上传。
· 社交功能数据：你在排行榜中展示的昵称与汇总学习时长、好友关系、学习小组与周目标进度。
· 商店与订单：皮肤选择、购买订单与权益记录。
· 设备与通知：设备标识、推送通知 Token 及你的通知偏好。
· 客服与反馈：你提交的工单内容及附件截图。
· 诊断与分析：崩溃与错误日志；匿名使用统计（可在设置中关闭）。

3. 数据的使用目的
我们使用这些数据创建与验证账号、在本地优先的前提下同步你的专注记录、提供成就/排行/小组功能、发放皮肤与权益、发送你允许的通知、保障账号安全、排查故障并响应客服请求。

4. 本地优先
专注计时与历史记录在你的设备本地处理，离线可完整使用核心功能。未登录时，我们不收集专注数据；登录后同步的数据以恢复你的记录与提供社交功能为限。

5. 权限与设备能力
相册或文件权限仅在选择头像或上传反馈截图时请求；通知权限仅用于你允许的消息类型。你可随时在系统设置中撤回权限，撤回不影响应用的其他功能使用。

6. 数据共享与第三方
我们不会出售你的个人数据，也不会将其用于第三方定向广告。仅在身份验证（第三方登录提供方）、基础设施托管、消息推送、支付处理（应用商店）或故障分析所必需时，向受合同约束的服务商提供最少数据。

7. 保存期限
账号与资料数据保存至你注销账号；注销后同步的专注记录、成就与社交数据将被删除或匿名化。订单、安全与客服记录仅在解决争议或履行法定义务所需期限内保存。

8. 你的选择与权利
你可以不登录、以纯本地模式使用专注功能；可在设置中管理通知、分析与资料可见性；可注销账号。你也有权访问、更正、导出、限制处理、撤回同意或删除你的个人数据，可通过“设置 → 帮助与反馈 → 联系客服”行使。

9. 儿童隐私
本服务不面向未达到所在地最低数字同意年龄的儿童。若发现未经有效同意收集了儿童个人数据，我们将采取措施删除。

10. 更新与联系我们
重大变更会通过应用内通知等合理方式告知，并在需要时重新征得同意。隐私问题或权利请求请前往“设置 → 帮助与反馈 → 联系客服”，选择“隐私与数据”。`,
  },
  {
    type: 'terms',
    locale: 'zh-CN',
    revision: REVISION,
    title: 'Lofi Companion 用户协议',
    requiresReconsent: true,
    content: `生效日期：${EFFECTIVE_DATE}

1. 协议成立与适用
你首次登录或注册 Lofi Companion 账号，即表示你已阅读并同意本协议与隐私政策。若你代表组织使用，应确保已获得有效授权；未成年人应在监护人阅读并同意后使用。

2. 账号与安全
你应提供准确的用户名、邮箱或手机号，妥善保管登录凭证，并对账号下的活动负责。发现未经授权的访问时，请立即修改密码、移除异常设备会话并通过帮助与反馈联系我们。

3. 服务内容
本应用提供专注计时与陪伴、主题皮肤、成就与收藏、学习统计、排行榜、好友与学习小组等功能。专注计时遵循本地优先设计：离线可完整使用核心功能，登录后提供跨设备同步与社交能力。

4. 用户内容与行为规范
你保留合法上传内容（如头像、反馈截图）的权利，并授予我们仅为托管、同步与展示所必要的非独占许可。你承诺不上传违法、侵权、恶意或骚扰内容，不伪造学习数据进行排行，不干扰排行榜或学习小组的正常秩序，不以自动化方式滥用服务。

5. 商店、皮肤与会员
免费皮肤与应用核心功能可免费使用。付费皮肤与会员权益的价格、属性及是否自动续期以购买确认页为准；应用商店购买由相应商店账号确认和处理，取消后权益通常持续至已付费周期结束。删除账号不会自动取消应用商店订阅。自动续期详见《订阅与自动续期说明》。

6. 知识产权
除用户内容外，应用软件、界面、品牌、主题皮肤美术与相关资料归服务提供方或许可方所有。除法律允许或我们明确授权外，不得复制、反编译、出租、出售或制作衍生作品。

7. 服务变更、暂停与终止
我们可能为安全、合规或产品改进调整服务内容，并对重大不利变更给予合理通知。你违反本协议、危害其他用户或法律要求时，我们可限制或终止你的访问。

8. 免责声明与责任限制
服务按现状提供。我们会以合理技能和谨慎提供服务，但不保证永不中断或完全无误；学习统计与排行数据仅供激励参考。免责和责任限制仅在适用法律允许范围内生效。

9. 适用规则与争议
本协议受服务提供方所在地适用法律管辖，但不排除用户所在地强制性消费者保护。争议发生时请先通过“设置 → 帮助与反馈”联系我们协商解决。

10. 更新与联系
重大协议变更会以合理方式通知，并在需要时征得重新同意。问题请通过“设置 → 帮助与反馈 → 联系客服”提交。`,
  },
  {
    type: 'subscription',
    locale: 'zh-CN',
    revision: REVISION,
    title: 'Lofi Companion 订阅与自动续期说明',
    requiresReconsent: false,
    content: `生效日期：${EFFECTIVE_DATE}

1. 商品信息
具体订阅名称、权益、周期和含税价格以购买确认页为准。

2. 付款与续期
确认购买后，费用由所选支付渠道扣收。自动续期方案会在当前周期结束前按购买页所示规则续订，除非你提前关闭自动续期。

3. 管理与取消
通过应用商店购买的订阅，应在对应商店账号的“订阅”设置中管理或取消。卸载应用或注销 Lofi Companion 账号不会自动取消订阅。

4. 试用、恢复购买与退款
免费试用资格、恢复购买和退款受购买页面、支付渠道规则及适用法律约束。更换设备后可使用同一商店账号恢复符合条件的购买。

5. 价格与权益变更
价格或核心权益发生重大变化时，我们会按支付渠道规则提前通知；需要同意时，未经确认不会按新价格续订。

6. 联系方式
如遇重复扣费、权益未到账或恢复购买失败，请在“帮助与反馈”中选择“会员与支付”，并提供不含完整支付凭证的订单信息。`,
  },
];

function fail(message) {
  console.error(`push-legal: ${message}`);
  process.exit(1);
}

if (!COOKIE && !KEY) {
  fail('缺少鉴权：生产传 AUTH_ADMIN_COOKIE（管理端登录后的 cookie），非生产传 AUTH_ADMIN_KEY');
}

const headers = {
  'content-type': 'application/json',
  'x-app-environment': ENVIRONMENT,
};
if (COOKIE) headers.cookie = COOKIE;
if (KEY) {
  headers['x-admin-key'] = KEY;
  headers['x-app-id'] = APP_ID;
}

async function api(path, init = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  } catch (error) {
    fail(`请求 ${BASE}${path} 失败：${error.message}`);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    fail(`${init.method ?? 'GET'} ${path} → HTTP ${res.status}：${JSON.stringify(body)?.slice(0, 400)}`);
  }
  return body?.data;
}

console.log(`→ GET ${BASE}/api/v1/admin/config（app=${APP_ID}，environment=${ENVIRONMENT}）`);
const current = await api('/api/v1/admin/config');
const base = current?.draft ?? current?.published;
if (!base) fail('服务端既无草稿也无已发布配置，无法作为合并基底');
if (current.draft) {
  console.warn('⚠ 服务端存在未发布草稿：legal 将合并进该草稿，发布会一并带上草稿里的其他改动');
}

if (DRY_RUN) {
  console.log('✓ 鉴权与基底校验通过（LEGAL_DRY_RUN=1，未写入）');
  console.log(`  基底 config version=${base.version ?? '?'}，现有 legal ${base.legal?.length ?? 0} 份`);
  process.exit(0);
}

await api('/api/v1/admin/config', {
  method: 'PUT',
  body: JSON.stringify({ ...base, legal: LEGAL_DOCS }),
});
console.log('→ 草稿已保存，发布中…');
const published = await api('/api/v1/admin/config/publish', {
  method: 'POST',
  headers: { 'x-admin-actor': 'push-legal' },
});

for (const doc of published?.legal ?? []) {
  console.log(`✓ 已发布：${doc.title}（${doc.type} @ ${doc.revision}）`);
}
console.log(`验证页：${BASE}/legal/privacy?app=${APP_ID}&locale=zh-CN`);
