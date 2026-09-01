// app.json 的动态薄壳（两者并存时 Expo 以 app.config.js 为准，这里原样透传
// app.json 并只覆写 Firebase 配置字段）：构建期 google-services.json /
// GoogleService-Info.plist 由 EAS 文件环境变量 GOOGLE_SERVICES_JSON /
// GOOGLE_SERVICES_INFO_PLIST 注入（值为 EAS 落盘的临时文件路径）；本地
// 开发/无 env 场景回落仓库内同名文件（均已 gitignore）。
const { expo } = require('./app.json');

module.exports = {
  ...expo,
  android: {
    ...expo.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
  ios: {
    ...expo.ios,
    googleServicesFile: process.env.GOOGLE_SERVICES_INFO_PLIST ?? './GoogleService-Info.plist',
  },
};
