// app.json 的动态薄壳（两者并存时 Expo 以 app.config.js 为准，这里原样透传
// app.json 并只覆写构建期动态字段）：
// - version：CNG 模式下 CI 没有 ios/、android/ 原生目录，release.sh 的
//   sync-version.mjs 会跳过原生版本位，prebuild 只能从 expo.version 取
//   （缺省误写 1.0.0，TestFlight 曾因此显示 1.0.0 (4)）。这里从 package.json
//   动态取，保持「package.json 是版本唯一真源」。
// - google-services.json / GoogleService-Info.plist 由 EAS 文件环境变量
//   GOOGLE_SERVICES_JSON / GOOGLE_SERVICES_INFO_PLIST 注入（值为 EAS 落盘
//   的临时文件路径）；本地开发/无 env 场景回落仓库内同名文件（均已 gitignore）。
const { expo } = require('./app.json');

module.exports = {
  ...expo,
  version: require('./package.json').version,
  android: {
    ...expo.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
  ios: {
    ...expo.ios,
    googleServicesFile: process.env.GOOGLE_SERVICES_INFO_PLIST ?? './GoogleService-Info.plist',
  },
};
