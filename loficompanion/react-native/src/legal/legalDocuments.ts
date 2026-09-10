export type LegalSection = Readonly<{
  title: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
}>;

export type LegalDocument = Readonly<{
  title: string;
  summary: string;
  effectiveDate: string;
  sections: readonly LegalSection[];
}>;

export type LegalLocale = 'zh-CN' | 'en-US';

export type LegalDocumentSet = Readonly<{
  privacy: LegalDocument;
  terms: LegalDocument;
  subscription: LegalDocument;
}>;

// 内置法务文书按语言成套维护：zh 为权威法律文本（服务提供方所在地语言），
// en 为对照译本——服务端法务通道当前只下发中文，英文界面以本文件兜底
// （LegalScreens 优先取服务端当前语言的文书，没有才回落此处的译本）。
// 两套语言的 section 结构须逐段对齐（见 i18n noHardcodedCopy / parity 守护思路）。
export const legalDocuments: Readonly<Record<LegalLocale, LegalDocumentSet>> = {
  'zh-CN': {
    privacy: {
      title: '隐私政策',
      summary: '了解 Lofi Companion 如何收集、使用、共享、保存和保护你的数据，以及你可以如何行使隐私权利。',
      effectiveDate: '2026 年 8 月 31 日',
      sections: [
        {
          title: '1. 适用范围与服务提供方',
          paragraphs: [
            '本政策适用于 Lofi Companion 应用及为其提供账号、数据同步、商店、通知与客服支持的线上服务（含 auth.zhongbei.tech）。服务提供方为苏州终北科技有限公司及其依法授权的运营主体。',
            '使用服务前请完整阅读本政策。若你不同意必要的数据处理，将无法使用依赖账号或云端同步的功能，但专注计时等核心功能仍可离线使用。',
          ],
        },
        {
          title: '2. 我们处理的数据',
          paragraphs: ['我们遵循最小必要原则，仅处理为提供服务所需的数据。'],
          bullets: [
            '账号与联系信息：用户名、邮箱或手机号、登录凭证（仅以加密形式保存），以及你选择使用的第三方登录（如 Apple、Google）返回的账号标识与基础资料。',
            '个人资料：你自主设置的头像与昵称。',
            '专注与学习数据：会话活动类型、计划与有效时长、开始/暂停/完成时间，以及由此获得的成就与收藏物。',
            '社交功能数据：排行榜中展示的昵称与汇总学习时长、好友关系、学习小组与周目标进度。',
            '商店与订单：皮肤选择、购买订单与权益记录。',
            '设备与通知：设备标识、推送通知 Token 及你的通知偏好。',
            '客服与反馈：你提交的工单内容及附件截图。',
            '诊断与分析：崩溃与错误日志；匿名使用统计（可在设置中关闭）。',
          ],
        },
        {
          title: '3. 数据的使用目的',
          paragraphs: [
            '我们使用这些数据创建与验证账号、在本地优先的前提下同步你的专注记录、提供成就/排行/小组功能、发放皮肤与权益、发送你允许的通知、保障账号安全、排查故障并响应客服请求。',
          ],
        },
        {
          title: '4. 本地优先',
          paragraphs: [
            '专注计时与历史记录在你的设备本地处理，离线可完整使用核心功能。未登录时，我们不收集专注数据；登录后同步的数据以恢复你的记录与提供社交功能为限。',
          ],
        },
        {
          title: '5. 权限与设备能力',
          paragraphs: [
            '相册或文件权限仅在选择头像或上传反馈截图时请求；通知权限仅用于你允许的消息类型。你可随时在系统设置中撤回权限，撤回不影响应用其他功能的使用。',
          ],
        },
        {
          title: '6. 数据共享与第三方',
          paragraphs: [
            '我们不会出售你的个人数据，也不会将其用于第三方定向广告。仅在身份验证（第三方登录提供方）、基础设施托管、消息推送、支付处理（应用商店）或故障分析所必需时，向受合同约束的服务商提供最少数据。',
          ],
        },
        {
          title: '7. 保存期限',
          paragraphs: [
            '账号与资料数据保存至你注销账号；注销后同步的专注记录、成就与社交数据将被删除或匿名化。订单、安全与客服记录仅在解决争议或履行法定义务所需期限内保存。',
          ],
        },
        {
          title: '8. 你的选择与权利',
          paragraphs: [
            '你可以不登录、以纯本地模式使用专注功能；可在设置中管理通知、分析与资料可见性；可注销账号。你也有权访问、更正、导出、限制处理、撤回同意或删除你的个人数据，可通过“设置 → 帮助与反馈 → 联系客服”行使。',
          ],
        },
        {
          title: '9. 儿童隐私',
          paragraphs: [
            '本服务不面向未达到所在地最低数字同意年龄的儿童。若发现未经有效同意收集了儿童个人数据，我们将采取措施删除。',
          ],
        },
        {
          title: '10. 更新与联系我们',
          paragraphs: [
            '重大变更会通过应用内通知等合理方式告知，并在需要时重新征得同意。隐私问题或权利请求请前往“设置 → 帮助与反馈 → 联系客服”，选择“隐私与数据”。',
          ],
        },
      ],
    },
    terms: {
      title: '用户协议',
      summary: '本协议说明账号、服务内容、用户行为、皮肤与会员购买、知识产权和责任边界。',
      effectiveDate: '2026 年 8 月 31 日',
      sections: [
        {
          title: '1. 协议成立与适用',
          paragraphs: [
            '你首次登录或注册 Lofi Companion 账号，即表示你已阅读并同意本协议与隐私政策。若你代表组织使用，应确保已获得有效授权；未成年人应在监护人阅读并同意后使用。',
          ],
        },
        {
          title: '2. 账号与安全',
          paragraphs: [
            '你应提供准确的用户名、邮箱或手机号，妥善保管登录凭证，并对账号下的活动负责。发现未经授权的访问时，请立即修改密码、移除异常设备会话并通过帮助与反馈联系我们。',
          ],
        },
        {
          title: '3. 服务内容',
          paragraphs: [
            '本应用提供专注计时与陪伴、主题皮肤、成就与收藏、学习统计、排行榜、好友与学习小组等功能。专注计时遵循本地优先设计：离线可完整使用核心功能，登录后提供跨设备同步与社交能力。',
          ],
        },
        {
          title: '4. 用户内容与行为规范',
          paragraphs: [
            '你保留合法上传内容（如头像、反馈截图）的权利，并授予我们仅为托管、同步与展示所必要的非独占许可。',
            '你承诺不上传违法、侵权、恶意或骚扰内容，不伪造学习数据进行排行，不干扰排行榜或学习小组的正常秩序，不以自动化方式滥用服务。',
          ],
        },
        {
          title: '5. 商店、皮肤与会员',
          paragraphs: [
            '免费皮肤与应用核心功能可免费使用。付费皮肤与会员权益的价格、属性及是否自动续期以购买确认页为准；应用商店购买由相应商店账号确认和处理，取消后权益通常持续至已付费周期结束。',
            '删除账号不会自动取消应用商店订阅。自动续期详见《订阅与自动续期说明》。',
          ],
        },
        {
          title: '6. 知识产权',
          paragraphs: [
            '除用户内容外，应用软件、界面、品牌、主题皮肤美术与相关资料归服务提供方或许可方所有。除法律允许或我们明确授权外，不得复制、反编译、出租、出售或制作衍生作品。',
          ],
        },
        {
          title: '7. 服务变更、暂停与终止',
          paragraphs: [
            '我们可能为安全、合规或产品改进调整服务内容，并对重大不利变更给予合理通知。你违反本协议、危害其他用户或法律要求时，我们可限制或终止你的访问。',
          ],
        },
        {
          title: '8. 免责声明与责任限制',
          paragraphs: [
            '服务按现状提供。我们会以合理技能和谨慎提供服务，但不保证永不中断或完全无误；学习统计与排行数据仅供激励参考。免责和责任限制仅在适用法律允许范围内生效。',
          ],
        },
        {
          title: '9. 适用规则与争议',
          paragraphs: [
            '本协议受服务提供方所在地适用法律管辖，但不排除用户所在地强制性消费者保护。争议发生时请先通过“设置 → 帮助与反馈”联系我们协商解决。',
          ],
        },
        {
          title: '10. 更新与联系',
          paragraphs: [
            '重大协议变更会以合理方式通知，并在需要时征得重新同意。问题请通过“设置 → 帮助与反馈 → 联系客服”提交。',
          ],
        },
      ],
    },
    subscription: {
      title: '订阅与自动续期说明',
      summary: '说明订阅商品、付款、续期、取消、恢复购买和退款规则。',
      effectiveDate: '2026 年 8 月 31 日',
      sections: [
        {
          title: '1. 商品信息',
          paragraphs: ['具体订阅名称、权益、周期和含税价格以购买确认页为准。'],
        },
        {
          title: '2. 付款与续期',
          paragraphs: [
            '确认购买后，费用由所选支付渠道扣收。自动续期方案会在当前周期结束前按购买页所示规则续订，除非你提前关闭自动续期。',
          ],
        },
        {
          title: '3. 管理与取消',
          paragraphs: [
            '应用商店订阅应在对应商店账号的“订阅”设置中管理或取消。卸载应用或注销 Lofi Companion 账号不会自动取消订阅。',
          ],
        },
        {
          title: '4. 试用、恢复购买与退款',
          paragraphs: [
            '免费试用资格、恢复购买和退款受购买页面、支付渠道规则及适用法律约束。更换设备后可使用同一商店账号恢复符合条件的购买。',
          ],
        },
        {
          title: '5. 价格与权益变更',
          paragraphs: [
            '价格或核心权益发生重大变化时，我们会按支付渠道规则提前通知；需要同意时，未经确认不会按新价格续订。',
          ],
        },
        {
          title: '6. 联系方式',
          paragraphs: [
            '如遇重复扣费、权益未到账或恢复购买失败，请在“帮助与反馈”中选择“会员与支付”，并提供不含完整支付凭证的订单信息。',
          ],
        },
      ],
    },
  },
  'en-US': {
    privacy: {
      title: 'Privacy Policy',
      summary: 'Learn how Lofi Companion collects, uses, shares, stores, and protects your data, and how you can exercise your privacy rights.',
      effectiveDate: 'August 31, 2026',
      sections: [
        {
          title: '1. Scope and Service Provider',
          paragraphs: [
            'This policy applies to the Lofi Companion app and the online services that provide accounts, data sync, the store, notifications, and customer support for it (including auth.zhongbei.tech). The service provider is Suzhou Zhongbei Technology Co., Ltd. and its duly authorized operating entities.',
            'Please read this policy in full before using the service. If you do not consent to the necessary data processing described here, features that rely on an account or cloud sync will be unavailable, but core features such as focus timing remain fully usable offline.',
          ],
        },
        {
          title: '2. Data We Process',
          paragraphs: ['We follow the principle of data minimization and process only the data required to provide the service.'],
          bullets: [
            'Account and contact information: username, email or phone number, sign-in credentials (stored in encrypted form only), and the account identifiers and basic profile returned by third-party sign-in you choose to use (such as Apple or Google).',
            'Profile: the avatar and nickname you choose to set.',
            'Focus and study data: session activity type, plan and effective duration, start/pause/completion times, and the achievements and collectibles earned from them.',
            'Social data: the nickname and aggregated study time shown on leaderboards, friend relationships, study groups, and weekly goal progress.',
            'Store and orders: skin choices, purchase orders, and entitlement records.',
            'Device and notifications: device identifiers, push notification tokens, and your notification preferences.',
            'Support and feedback: the ticket content and attached screenshots you submit.',
            'Diagnostics and analytics: crash and error logs; anonymous usage statistics (can be turned off in Settings).',
          ],
        },
        {
          title: '3. How We Use Data',
          paragraphs: [
            'We use this data to create and verify accounts, sync your focus history on a local-first basis, provide achievements/leaderboards/groups, grant skins and entitlements, send notifications you allow, keep accounts secure, troubleshoot failures, and respond to support requests.',
          ],
        },
        {
          title: '4. Local First',
          paragraphs: [
            'Focus timing and history are processed on your device, and core features work fully offline. When you are signed out, we do not collect focus data; after sign-in, synced data is used only to restore your history and provide social features.',
          ],
        },
        {
          title: '5. Permissions and Device Capabilities',
          paragraphs: [
            'Photo library or file access is requested only when you pick an avatar or attach feedback screenshots; notification access is used only for message types you allow. You can revoke permissions anytime in system settings without affecting other features of the app.',
          ],
        },
        {
          title: '6. Sharing and Third Parties',
          paragraphs: [
            'We do not sell your personal data and do not use it for third-party targeted advertising. Only where necessary for authentication (third-party sign-in providers), infrastructure hosting, message delivery, payment processing (app stores), or failure analysis do we share the minimum data required with providers bound by contract.',
          ],
        },
        {
          title: '7. Retention',
          paragraphs: [
            'Account and profile data are kept until you delete your account; after deletion, synced focus history, achievements, and social data are removed or anonymized. Orders, security, and support records are kept only as long as needed to resolve disputes or meet legal obligations.',
          ],
        },
        {
          title: '8. Your Choices and Rights',
          paragraphs: [
            'You may use focus features in local-only mode without signing in; manage notifications, analytics, and profile visibility in Settings; and delete your account. You also have the right to access, correct, export, restrict processing of, withdraw consent for, or delete your personal data via “Settings → Help & feedback → Contact support”.',
          ],
        },
        {
          title: '9. Children’s Privacy',
          paragraphs: [
            'The service is not directed to children below the minimum digital consent age where you live. If we learn that a child’s personal data has been collected without valid consent, we will take steps to delete it.',
          ],
        },
        {
          title: '10. Updates and Contacting Us',
          paragraphs: [
            'Material changes will be communicated through reasonable means such as in-app notices, with re-consent obtained where required. For privacy questions or rights requests, go to “Settings → Help & feedback → Contact support” and choose “Privacy & data”.',
          ],
        },
      ],
    },
    terms: {
      title: 'Terms of Service',
      summary: 'These terms cover accounts, the service, user conduct, skin and membership purchases, intellectual property, and limits of liability.',
      effectiveDate: 'August 31, 2026',
      sections: [
        {
          title: '1. Formation and Scope',
          paragraphs: [
            'By signing in to or registering a Lofi Companion account for the first time, you confirm that you have read and agree to these terms and the Privacy Policy. If you use the service on behalf of an organization, you must have valid authorization; minors should use the service after their guardian has read and agreed to these terms.',
          ],
        },
        {
          title: '2. Accounts and Security',
          paragraphs: [
            'You must provide an accurate username, email, or phone number, keep your credentials safe, and are responsible for activity under your account. If you notice unauthorized access, change your password immediately, remove the unknown device session, and contact us via Help & feedback.',
          ],
        },
        {
          title: '3. The Service',
          paragraphs: [
            'The app provides focus timing with a companion, theme skins, achievements and collectibles, study statistics, leaderboards, friends, and study groups. Focus timing is local-first: core features work fully offline, and cross-device sync and social features are available after sign-in.',
          ],
        },
        {
          title: '4. User Content and Conduct',
          paragraphs: [
            'You retain rights to content you lawfully upload (such as avatars and feedback screenshots) and grant us a non-exclusive license only as needed to host, sync, and display it.',
            'You agree not to upload unlawful, infringing, malicious, or harassing content, not to fabricate study data for rankings, not to disrupt leaderboards or study groups, and not to abuse the service through automation.',
          ],
        },
        {
          title: '5. Store, Skins, and Membership',
          paragraphs: [
            'Free skins and the app’s core features are free to use. The price, attributes, and auto-renewal terms of paid skins and membership benefits are as shown on the purchase confirmation page; store purchases are confirmed and processed by the corresponding store account, and after cancellation benefits generally continue until the end of the paid period.',
            'Deleting your account does not automatically cancel app store subscriptions. See “Subscription & auto-renewal terms” for details.',
          ],
        },
        {
          title: '6. Intellectual Property',
          paragraphs: [
            'Except for user content, the app software, interface, branding, theme skin artwork, and related materials belong to the service provider or its licensors. You may not copy, decompile, rent, sell, or create derivative works except as permitted by law or expressly authorized by us.',
          ],
        },
        {
          title: '7. Changes, Suspension, and Termination',
          paragraphs: [
            'We may adjust the service for security, compliance, or product improvement, with reasonable notice of material adverse changes. We may restrict or terminate your access if you breach these terms, harm other users, or where required by law.',
          ],
        },
        {
          title: '8. Disclaimers and Limitation of Liability',
          paragraphs: [
            'The service is provided on an “as is” basis. We will provide it with reasonable skill and care, but do not guarantee uninterrupted or error-free operation; study statistics and rankings are for motivation only. Disclaimers and liability limits apply only to the extent permitted by applicable law.',
          ],
        },
        {
          title: '9. Governing Rules and Disputes',
          paragraphs: [
            'These terms are governed by the laws applicable where the service provider is located, without excluding mandatory consumer protections where you live. For disputes, please first contact us via “Settings → Help & feedback” to seek an amicable resolution.',
          ],
        },
        {
          title: '10. Updates and Contact',
          paragraphs: [
            'Material changes to these terms will be communicated reasonably, with renewed consent obtained where required. Please submit issues via “Settings → Help & feedback → Contact support”.',
          ],
        },
      ],
    },
    subscription: {
      title: 'Subscription & Auto-Renewal Terms',
      summary: 'Covers subscription products, payment, renewal, cancellation, restoring purchases, and refunds.',
      effectiveDate: 'August 31, 2026',
      sections: [
        {
          title: '1. Product Information',
          paragraphs: ['The subscription name, benefits, period, and tax-inclusive price are as shown on the purchase confirmation page.'],
        },
        {
          title: '2. Payment and Renewal',
          paragraphs: [
            'After you confirm a purchase, the charge is collected by the chosen payment channel. Auto-renewing plans renew at the end of each period under the rules shown on the purchase page unless you turn off auto-renewal beforehand.',
          ],
        },
        {
          title: '3. Managing and Cancelling',
          paragraphs: [
            'App store subscriptions are managed or cancelled in the “Subscriptions” settings of the corresponding store account. Uninstalling the app or deleting your Lofi Companion account does not cancel a subscription automatically.',
          ],
        },
        {
          title: '4. Trials, Restoring Purchases, and Refunds',
          paragraphs: [
            'Free-trial eligibility, restoring purchases, and refunds are subject to the purchase page, payment channel rules, and applicable law. After switching devices, you can restore eligible purchases with the same store account.',
          ],
        },
        {
          title: '5. Price and Benefit Changes',
          paragraphs: [
            'For material changes to prices or core benefits, we give advance notice under payment channel rules; where consent is required, plans will not renew at the new price without your confirmation.',
          ],
        },
        {
          title: '6. Contact',
          paragraphs: [
            'For duplicate charges, missing benefits, or failed purchase restoration, choose “Membership & payments” in Help & feedback and include order details without full payment credentials.',
          ],
        },
      ],
    },
  },
} as const;

/** 当前语言的整套内置文书（zh 为权威源；en 为服务端未下发英文时的对照译本）。 */
export function bundledLegal(locale: LegalLocale): LegalDocumentSet {
  return legalDocuments[locale] ?? legalDocuments['zh-CN'];
}
