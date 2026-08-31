// EAS 构建钩子：确保 google-services.json 在 prebuild 前就位。
// 优先级：已存在的文件（真实配置）> EAS 文件环境变量 GOOGLE_SERVICES_JSON >
// 占位文件（Firebase 静默失效，应用功能不受影响）。与 CI
// react-native-publish.yml 的 Provide google-services.json 步骤同语义。
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const TARGET = 'google-services.json';
const PLACEHOLDER =
  '{"project_info":{"project_number":"000000000000","project_id":"placeholder"},"client":[{"client_info":{"mobilesdk_app_id":"1:000000000000:android:0000000000000000","android_client_info":{"package_name":"tech.zhongbei.loficompanion"}},"oauth_client":[],"api_key":[{"current_key":"placeholder"}],"services":{}}],"configuration_version":"1"}';

if (existsSync(TARGET)) {
  console.log('[google-services] 已存在，跳过');
  process.exit(0);
}

const envFile = process.env.GOOGLE_SERVICES_JSON;
if (envFile && existsSync(envFile)) {
  copyFileSync(envFile, TARGET);
  console.log('[google-services] 已从 EAS 文件环境变量复制真实配置');
  process.exit(0);
}

writeFileSync(TARGET, PLACEHOLDER);
console.log('[google-services] 已写入占位配置（Firebase 静默；真实配置请上传 EAS 文件环境变量 GOOGLE_SERVICES_JSON）');
