#!/usr/bin/env bash
# 统一发布入口：package.json 的 version 是唯一真源，tag / TestFlight / Play 全一致。
#
# 用法:
#   tools/release.sh patch|minor|major
#
# 流程:
#   1. 校验工作区干净
#   2. bump package.json（npm version --no-git-tag-version）
#   3. 同步原生版本位（scripts/sync-version.mjs：Info.plist / pbxproj / build.gradle）
#   4. commit + 打 tag v<version> + push
#   5. tag 推送触发 GitHub Actions（react-native-publish.yml）：EAS 构建 + 自动提交双商店
#
# 注意: 构建号（iOS buildNumber / Android versionCode）由 EAS 远端 autoIncrement
# 管理，无需也不应手动 bump。手动重跑构建: Actions 页面 workflow_dispatch。
set -euo pipefail

BUMP="${1:?用法: tools/release.sh patch|minor|major}"
RN_DIR="$(cd "$(dirname "$0")/../loficompanion/react-native" && pwd)"

cd "$RN_DIR"

if [ -n "$(git status --porcelain)" ]; then
  echo "❌ 工作区不干净（含未提交/未跟踪文件），先提交或 stash 再发布" >&2
  git status --short >&2
  exit 1
fi

BRANCH="$(git branch --show-current)"

echo "==> bump package.json ($BUMP)"
npm version "$BUMP" --no-git-tag-version
node ./scripts/sync-version.mjs

VERSION="$(node -p "require('./package.json').version")"

echo "==> commit + tag v$VERSION"
git add -A
git commit -m "chore(release): v$VERSION"
git tag -a "v$VERSION" -m "v$VERSION"
git push origin "$BRANCH"
git push origin "v$VERSION"
echo "✅ v$VERSION 已推送：package.json = git tag = app 版本"
echo "🚀 GitHub Actions 构建中，跟踪进度: gh run watch（或仓库 Actions 页）"
