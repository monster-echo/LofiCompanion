// 设置域文案（zh-CN 为权威源；en-US 键集须与这里 deep-equal，见 parity.test.ts）。
// 自 PreferencesProvider 旧 translations 字典原样迁入。
export const settings = {
  settings: '设置', accountServices: '账户与服务', accountSecurity: '账户与安全',
  devices: '登录设备管理', membership: '会员与订阅', appPreferences: '应用偏好',
  notifications: '通知设置', general: '通用设置', appearance: '外观主题',
  language: '语言', textSize: '字体大小', privacySupport: '隐私、存储与支持',
  privacy: '隐私设置', permissions: '权限管理', storage: '存储与缓存',
  help: '帮助与反馈', legal: '协议与政策', about: '关于与版本',
  deleteAccount: '注销账号', system: '跟随系统', light: '浅色', dark: '深色',
  chinese: '简体中文', english: 'English', selected: '已选择',
  save: '保存设置', saving: '保存中…', saved: '设置已同步到服务端',
  guest: '未登录用户', signInSync: '登录后同步跨设备设置',
} as const;
