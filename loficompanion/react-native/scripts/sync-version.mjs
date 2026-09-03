// 版本同步：package.json 的 version 是唯一真源，这里刷写 generic workflow
// 构建时真正生效的原生版本位（EAS 上传读取的是原生文件，app.json 不参与；
// expo config 缺省时自动回落 package.json version，两处自然一致）。
// 构建号（iOS buildNumber / Android versionCode）由 EAS 远端
// autoIncrement 管理（appVersionSource: remote），本脚本不碰。
// 调用方：tools/release.sh（发布前落库）、npm script eas-build-post-install（构建期自愈）。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const version = JSON.parse(readFileSync(`${ROOT}/package.json`, 'utf8')).version;

function replaceOrThrow(file, pattern, replacement, label) {
  const path = `${ROOT}/${file}`;
  const content = readFileSync(path, 'utf8');
  if (!pattern.test(content)) {
    throw new Error(`[sync-version] 未在 ${file} 中找到 ${label}，原生文件结构可能变了，请检查`);
  }
  writeFileSync(path, content.replace(pattern, replacement));
  console.log(`[sync-version] ${file} → ${version}`);
}

// iOS：Info.plist 是 EAS 上传的 CFBundleShortVersionString 真源；CFBundleVersion
// 由 EAS 远端覆盖，不动。pbxproj 的 MARKETING_VERSION 顺手对齐（Xcode 面板一致性）。
replaceOrThrow(
  'ios/LofiCompanion/Info.plist',
  /(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]*(<\/string>)/,
  `$1${version}$2`,
  'CFBundleShortVersionString'
);
replaceOrThrow(
  'ios/LofiCompanion.xcodeproj/project.pbxproj',
  /(MARKETING_VERSION = )[^;]+;/g,
  `$1${version};`,
  'MARKETING_VERSION'
);

// Android：build.gradle 的 versionName 是上传真源；versionCode 远端管理，不动。
replaceOrThrow(
  'android/app/build.gradle',
  /(versionName\s+")[^"]*(")/,
  `$1${version}$2`,
  'versionName'
);

console.log(`[sync-version] 完成：全平台营销版本 = ${version}`);
