// EAS 构建钩子：确保 Firebase 配置在 prebuild 前就位（Android/iOS 依次处理）。
// 优先级：已存在的文件（真实配置，本地/上一次钩子落下的）> EAS 文件环境变量
// GOOGLE_SERVICES_JSON / GOOGLE_SERVICES_INFO_PLIST > 占位（仅 Android——
// Firebase 静默失效不影响应用功能；iOS 不伪造占位，bundle id 不匹配会让
// RNFB 初始化失败，缺配置应让 prebuild 自然报错暴露问题）。
// 与 CI react-native-publish.yml 的 Provide google-services.json 步骤同语义。
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';

const ANDROID_TARGET = 'google-services.json';
const IOS_TARGET = 'GoogleService-Info.plist';
const ANDROID_PLACEHOLDER =
  '{"project_info":{"project_number":"000000000000","project_id":"placeholder"},"client":[{"client_info":{"mobilesdk_app_id":"1:000000000000:android:0000000000000000","android_client_info":{"package_name":"tech.zhongbei.loficompanion"}},"oauth_client":[],"api_key":[{"current_key":"placeholder"}],"services":{}}],"configuration_version":"1"}';

function provideAndroid() {
  if (existsSync(ANDROID_TARGET)) {
    console.log('[google-services] Android 配置已存在，跳过');
    return;
  }
  const envFile = process.env.GOOGLE_SERVICES_JSON;
  if (envFile && existsSync(envFile)) {
    copyFileSync(envFile, ANDROID_TARGET);
    console.log('[google-services] Android 已从 EAS 文件环境变量复制真实配置');
    return;
  }
  writeFileSync(ANDROID_TARGET, ANDROID_PLACEHOLDER);
  console.log('[google-services] Android 已写入占位配置（Firebase 静默；真实配置请上传 EAS 文件环境变量 GOOGLE_SERVICES_JSON）');
}

function provideIos() {
  if (existsSync(IOS_TARGET)) {
    console.log('[google-services] iOS 配置已存在，跳过');
    return;
  }
  const envFile = process.env.GOOGLE_SERVICES_INFO_PLIST;
  if (envFile && existsSync(envFile)) {
    copyFileSync(envFile, IOS_TARGET);
    console.log('[google-services] iOS 已从 EAS 文件环境变量复制真实配置');
    return;
  }
  console.log('[google-services] iOS 无配置（构建将缺 Firebase；请上传 GOOGLE_SERVICES_INFO_PLIST）');
}

provideAndroid();
provideIos();
