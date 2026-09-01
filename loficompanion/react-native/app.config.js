// app.json 的动态薄壳（两者并存时 Expo 以 app.config.js 为准，这里原样透传
// app.json 并只覆写一个字段）：构建期 google-services.json 由 EAS 文件环境
// 变量 GOOGLE_SERVICES_JSON 注入（值为 EAS 落盘的临时文件路径，见 eas.json
// 对应环境）；本地开发/无 env 场景回落仓库内同名文件（已 gitignore）。
const { expo } = require('./app.json');

module.exports = {
  ...expo,
  android: {
    ...expo.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
};
