# MobileUI server Profile 扩展与 LofiCompanion 脚手架 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 扩展 MobileUI CLI 支持 `server` Profile，使 `create --profile react-native,server` 一次性生成带可追踪来源 manifest 的双端项目；随后完成 LofiCompanion 的 git 初始化、脚手架生成、doctor 验证、5 个业务域边界和双端测试基线。

**Architecture:** 在 `MobileStarter` 的 mobileui CLI 中新增 `profiles/server/profile.json`（复用既有 Profile 机制，`--profile` 本就支持逗号分隔多 Profile），补齐 `feature add` 与 `doctor` 的 server 分支。LofiCompanion 仓库根存放产品文档，生成的 `loficompanion/` 子目录持有 `react-native/` + `server/` + `.mobileui/template.json` 来源 manifest（记录模板 commit，满足 doc 06「不得手工复制 server/」红线）。

**Tech Stack:** Dart (mobileui CLI)、Expo React Native (vitest/tsc)、Next.js + PostgreSQL (node:test/eslint/tsc)。

**已确认决策（用户 2026-08-29）：**
1. Server 边界：LofiCompanion 拥有自己的 server，从 MobileStarter 模板复制 → 走「扩展 CLI」路线保证可追踪。
2. P0-A 资产：纯静态图先跑通（poster 降级路径验证全部逻辑），视频资产后置。

**关键事实（已侦察核实）：**
- 模板根：`/Volumes/MacMiniDisk/workspace/MobileStarter`（main @ `5617bd2`，含 5 个未推送的会话/JWT 修复）。
- CLI 入口：`tool/mobileui/bin/mobileui.dart`；Profile 机制：`profiles/{id}/profile.json` 声明 `source` 目录，create 复制 `templateRoot/{source}` → `target/{source}`，按目录名排除（任意深度）。
- `feature add` 边界四层（domain/application/data/presentation）按 profile 映射路径；`doctor` 按 profile 检查必需文件与 stale markers。
- **预存缺陷**：基线 smoke test 在 flutter profile 即失败——`flutter/lib/app/app_controller_navigation.dart` 已不存在（模板已重构为 go_router），Task 0 先修复。
- server 测试自包含（`tests/register.mjs` 只注册 `@/` 别名 loader，测试内自设 env，无外部 DB 依赖）。
- server 模板只有 `.env.example`，无真实密钥文件；`certs/` 内是 Apple 公根证书与测试 CA，随模板分发是既有策略。

---

### Task 0: 修复 MobileStarter 基线 smoke test 的过时 flutter 断言

基线必须先绿，否则后续所有「测试通过」的判断失去意义。此修复是独立提交，与 server profile 无关。

**Files:**
- Modify: `/Volumes/MacMiniDisk/workspace/MobileStarter/tool/mobileui/test/smoke_test.dart:67-72`

- [ ] **Step 1: 确认当前失败**

```bash
cd /Volumes/MacMiniDisk/workspace/MobileStarter/tool/mobileui && dart test/smoke_test.dart
```

Expected: `PathNotFoundException: Cannot open file ... app-flutter/flutter/lib/app/app_controller_navigation.dart`

- [ ] **Step 2: 替换过时断言**

当前代码：

```dart
  if (profiles.contains('flutter')) {
    _expectFileContains(
      project,
      'flutter/lib/app/app_controller_navigation.dart',
      '_pendingRoute ?? AppRoute.home',
      'Flutter ordinary login must land on home',
    );
  }
```

替换为（目标文件 `flutter/lib/navigation/app_router_config.dart:54` 存在 `return pathFor(AppRoute.home);`，已核实）：

```dart
  if (profiles.contains('flutter')) {
    _expectFileContains(
      project,
      'flutter/lib/navigation/app_router_config.dart',
      'pathFor(AppRoute.home)',
      'Flutter route guard fallback must land on home',
    );
  }
```

- [ ] **Step 3: 验证基线全绿**

```bash
cd /Volumes/MacMiniDisk/workspace/MobileStarter/tool/mobileui && dart test/smoke_test.dart
```

Expected: 末行输出 `MobileUI CLI smoke test passed.`，退出码 0。

- [ ] **Step 4: 提交（MobileStarter 仓库）**

```bash
cd /Volumes/MacMiniDisk/workspace/MobileStarter
git add tool/mobileui/test/smoke_test.dart
git commit -m "test(mobileui): 修复 flutter 行为基线断言——模板已重构为 go_router 路由守卫

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 1: TDD——先扩展 smoke test 覆盖 server 与组合 Profile（预期失败）

**Files:**
- Modify: `/Volumes/MacMiniDisk/workspace/MobileStarter/tool/mobileui/test/smoke_test.dart`

- [ ] **Step 1: 在 main() 的 profile 循环中加入 server，并追加组合 Profile 验证**

当前：

```dart
    for (final profile in const ['flutter', 'react-native', 'arkts', 'all']) {
      await _verifyProfile(templateRoot, sandbox, profile);
    }
    await _verifyGitHubSource(templateRoot, sandbox);
```

改为：

```dart
    for (final profile in const [
      'flutter',
      'react-native',
      'arkts',
      'server',
      'all',
    ]) {
      await _verifyProfile(templateRoot, sandbox, profile);
    }
    await _verifyCombinedProfiles(templateRoot, sandbox);
    await _verifyGitHubSource(templateRoot, sandbox);
```

- [ ] **Step 2: 新增 `_verifyCombinedProfiles` 函数（放在 `_verifyProfile` 之后）**

```dart
Future<void> _verifyCombinedProfiles(
  Directory templateRoot,
  Directory sandbox,
) async {
  const name = 'app-combined';
  final exit = await CreateCommand(templateRoot).run([
    name,
    '--output',
    sandbox.path,
    '--profile',
    'react-native,server',
    '--display-name',
    'Example Combined',
    '--organization',
    'tech.zhongbei',
    '--app-id',
    'example-combined',
  ]);
  _expect(exit == 0, 'combined create must succeed');
  final project = Directory(_join(sandbox.path, name));
  _expect(
    Directory(_join(project.path, 'server', 'src', 'app')).existsSync(),
    'combined create must copy server source tree',
  );
  _expect(
    File(
      _join(project.path, '.github', 'workflows', 'server-ci.yml'),
    ).existsSync(),
    'combined create must copy server CI workflow',
  );
  _expect(
    Directory(_join(project.path, 'server', 'node_modules')).existsSync(),
    isFalse,
    'server node_modules must not be copied',
  );
  _expect(
    DoctorCommand().run(['--project', project.path]) == 0,
    'combined doctor must succeed',
  );
  _expect(
    FeatureCommand().run([
      'add',
      'achievements',
      '--project',
      project.path,
    ]) == 0,
    'combined feature add must cover every profile',
  );
  _expect(
    Directory(
      _join(project.path, 'react-native', 'src', 'features', 'achievements'),
    ).listSync().isNotEmpty,
    'combined feature must land in react-native',
  );
  _expect(
    Directory(
      _join(project.path, 'server', 'src', 'features', 'achievements'),
    ).listSync().isNotEmpty,
    'combined feature must land in server',
  );
  final manifest = _manifest(project);
  final profiles = (manifest['profiles'] as List<Object?>).whereType<String>();
  _expect(profiles.length == 2, 'combined manifest profile count');
  _expect(
    (manifest['templateSource'] as Map<String, Object?>)['commit'] != null,
    'combined manifest must record template commit',
  );
}
```

注意：文件顶部 import 区已有 `dart:convert`、`dart:io` 与四个 command import；`isFalse` 若不存在则同步在 `_expect` 所在辅助区补充：

```dart
void _expect(bool condition, String message) {
  if (!condition) throw Exception('smoke test failed: $message');
}
```

（若现有 `_expect` 已是此签名则不动；`isFalse` 用 `!existsSync()` 内联亦可，保持与现有风格一致。）

- [ ] **Step 3: 运行验证失败**

```bash
cd /Volumes/MacMiniDisk/workspace/MobileStarter/tool/mobileui && dart test/smoke_test.dart
```

Expected: FAIL，报 `profile "server" is not available`（来自 `ProfileConfig.read` 的 MobileUiUsageException）。

---

### Task 2: 实现 server Profile（profile.json + feature add + doctor）

**Files:**
- Create: `/Volumes/MacMiniDisk/workspace/MobileStarter/profiles/server/profile.json`
- Modify: `/Volumes/MacMiniDisk/workspace/MobileStarter/tool/mobileui/lib/feature_command.dart`（`_featurePath` switch）
- Modify: `/Volumes/MacMiniDisk/workspace/MobileStarter/tool/mobileui/lib/doctor_command.dart`（`_checkProfile` 的 required switch）

- [ ] **Step 1: 创建 `profiles/server/profile.json`**

```json
{
  "id": "server",
  "version": "0.2.0",
  "source": "server",
  "platforms": ["web"],
  "features": ["config", "console", "logs", "tenant"],
  "workflows": ["server-ci.yml", "server-publish.yml"],
  "excludedDirectories": [
    "node_modules",
    ".next",
    ".env",
    ".env.local",
    "tsconfig.tsbuildinfo"
  ]
}
```

说明：`excludedDirectories` 按目录/文件名在任意深度匹配（`_copyDirectory` 行为）。排除 `node_modules`（567M 大头）、`.next` 构建产物、`.env*`（防御性——当前模板只有 `.env.example`）、`tsconfig.tsbuildinfo`（生成物，未被 `_isGeneratedFile` 覆盖）。`certs/`（Apple 公根证书 + 测试 CA）随模板分发是既有策略，保留。

- [ ] **Step 2: `feature_command.dart` 的 `_featurePath` 增加 server 分支**

当前 switch 末尾是：

```dart
      _ => throw MobileUiUsageException('unsupported profile "$profile"'),
```

在 `_ =>` 之前插入：

```dart
      'server' => _join(project, 'server', 'src', 'features', featureId),
```

说明：server 模板已有 `src/features/{config,console,logs,tenant}` 布局，新边界目录与其并列，四层结构（domain/application/data/presentation）README 由既有 `_writeBoundary` 自动写入。

- [ ] **Step 3: `doctor_command.dart` 的 required switch 增加 server 分支**

在 `'arkts' => [...]` 分支之后、`_ => <String>[]` 之前插入：

```dart
      'server' => [
        'server/package.json',
        'server/next.config.ts',
        '.github/workflows/server-ci.yml',
      ],
```

说明：三者为 File 存在性检查（doctor 用 `File().existsSync()`，不能填目录）。markers 检查对 server 自然为空（`markers[profile] ?? const <String>[]`），因为 server 不做身份改写（IdentityRewriter 对未知 profile 返回空替换表，无需改动）。

- [ ] **Step 4: 运行 smoke test 验证通过**

```bash
cd /Volumes/MacMiniDisk/workspace/MobileStarter/tool/mobileui && dart test/smoke_test.dart
```

Expected: `MobileUI CLI smoke test passed.`（flutter/react-native/arkts/server/all/组合 全部通过）。

- [ ] **Step 5: 手工验证 template list 显示 server**

```bash
cd /Volumes/MacMiniDisk/workspace/MobileStarter && dart run tool/mobileui/bin/mobileui.dart template list
```

Expected: 表格含 `server	0.2.0	web` 行。

---

### Task 3: 提交 MobileStarter 的 CLI 扩展

- [ ] **Step 1: 提交**

```bash
cd /Volumes/MacMiniDisk/workspace/MobileStarter
git add profiles/server/profile.json tool/mobileui/lib/feature_command.dart tool/mobileui/lib/doctor_command.dart tool/mobileui/test/smoke_test.dart
git commit -m "feat(mobileui): server Profile——create 复制 server/ 与 server CI，feature add/doctor 支持 server

--profile react-native,server 一次生成双端项目；排除 node_modules/.next/.env*/tsconfig.tsbuildinfo；
manifest 记录模板 commit，满足来源可追踪要求。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: LofiCompanion 仓库初始化与文档基线

**Files:**
- Create: `/Volumes/MacMiniDisk/workspace/LofiCompanion/.gitignore`

- [ ] **Step 1: 创建根 `.gitignore`**

```gitignore
.DS_Store
```

说明：`loficompanion/` 生成时自带覆盖 react-native/server 构建产物的 `.gitignore`，根级只需系统文件。

- [ ] **Step 2: git init 并提交文档基线**

```bash
cd /Volumes/MacMiniDisk/workspace/LofiCompanion
git init -b main
git add .gitignore README.md docs assets .interface-design
git commit -m "docs: 产品定义与架构原型 0.1 基线（PRD/UX/架构/数据/收费/交付/设计系统/逐屏规格/视觉验收）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: 首次提交包含 9 份文档、4 张原型图、system.md、本计划文件。

---

### Task 5: 生成 LofiCompanion 双端项目

- [ ] **Step 1: 运行 create（doc 06 §1.1 命令，profile 扩展为 react-native,server）**

```bash
cd /Volumes/MacMiniDisk/workspace/MobileStarter
dart run tool/mobileui/bin/mobileui.dart create loficompanion \
  --output /Volumes/MacMiniDisk/workspace/LofiCompanion \
  --profile react-native,server \
  --display-name "Lofi Companion" \
  --organization tech.zhongbei \
  --app-id lofi-companion \
  --source local
```

Expected: 输出 `Created /Volumes/MacMiniDisk/workspace/LofiCompanion/loficompanion` 与 `Profiles: react-native, server`。

- [ ] **Step 2: 验证目录结构与来源 manifest**

```bash
ls /Volumes/MacMiniDisk/workspace/LofiCompanion/loficompanion/
ls /Volumes/MacMiniDisk/workspace/LofiCompanion/loficompanion/.github/workflows/
ls /Volumes/MacMiniDisk/workspace/LofiCompanion/loficompanion/server/ | grep -c node_modules
cat /Volumes/MacMiniDisk/workspace/LofiCompanion/loficompanion/.mobileui/template.json
```

Expected:
- 根目录含 `react-native/`、`server/`、`.mobileui/`、`.github/`、`README.md`、`.gitignore`
- workflows 含 `react-native-ci.yml`、`react-native-publish.yml`、`server-ci.yml`、`server-publish.yml`
- `grep -c node_modules` 输出 `0`（未复制）
- manifest 中 `profiles` 为 `["react-native", "server"]`，`templateSource.commit` 等于 MobileStarter 当前 HEAD

- [ ] **Step 3: 验证 RN 身份改写生效**

```bash
grep -c "com.mobileui.mobilestarter" /Volumes/MacMiniDisk/workspace/LofiCompanion/loficompanion/react-native/app.json || true
grep '"name"' /Volumes/MacMiniDisk/workspace/LofiCompanion/loficompanion/react-native/app.json
```

Expected: `name` 为 `"Lofi Companion"`；无 `com.mobileui.mobilestarter` 残留（doctor 也会查）。

---

### Task 6: doctor 验证与业务域边界

- [ ] **Step 1: doctor**

```bash
cd /Volumes/MacMiniDisk/workspace/MobileStarter
dart run tool/mobileui/bin/mobileui.dart doctor \
  --project /Volumes/MacMiniDisk/workspace/LofiCompanion/loficompanion
```

Expected: 退出码 0，输出含 `[OK] Profile structures: react-native, server`。

- [ ] **Step 2: 添加 5 个业务域边界（doc 06 §1.1）**

```bash
cd /Volumes/MacMiniDisk/workspace/MobileStarter
for f in focus skins achievements leaderboards generation; do
  dart run tool/mobileui/bin/mobileui.dart feature add "$f" \
    --project /Volumes/MacMiniDisk/workspace/LofiCompanion/loficompanion
done
```

Expected: 5 条 `Added feature "..."`；`loficompanion/react-native/src/features/{focus,skins,achievements,leaderboards,generation}/` 与 `loficompanion/server/src/features/{...}` 各含四层目录 + README。

- [ ] **Step 3: 提交脚手架（LofiCompanion 仓库）**

```bash
cd /Volumes/MacMiniDisk/workspace/LofiCompanion
git add loficompanion
git commit -m "chore: MobileUI 生成双端脚手架（react-native + server，模板 commit 已记录于 .mobileui/template.json）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: React Native 基线验证

- [ ] **Step 1: 安装依赖**

```bash
cd /Volumes/MacMiniDisk/workspace/LofiCompanion/loficompanion/react-native && npm ci
```

Expected: 安装成功无 high-severity 漏洞阻断。（耗时数分钟，属正常。）

- [ ] **Step 2: 类型检查**

```bash
npm run typecheck
```

Expected: `tsc --noEmit` 无错误，退出码 0。

- [ ] **Step 3: 单元测试**

```bash
npm test
```

Expected: vitest 全部通过（模板自带 `src/__tests__` 基线）。若失败，先判断是模板预存问题还是生成问题，记录后再继续。

---

### Task 8: Server 基线验证

- [ ] **Step 1: 安装依赖**

```bash
cd /Volumes/MacMiniDisk/workspace/LofiCompanion/loficompanion/server && npm ci
```

- [ ] **Step 2: 环境文件**

```bash
cp .env.example .env
```

说明：模板 `.env.example` 无真实密钥；本地开发先以示例值运行，正式 JWT 密钥按模板 README 的环境变量说明生成。

- [ ] **Step 3: 类型检查与 lint**

```bash
npm run typecheck && npm run lint
```

Expected: 双双退出码 0。

- [ ] **Step 4: 测试**

```bash
npm test
```

Expected: node:test 四个测试文件（core/auth/payment/payment-apple）全部通过（已核实测试自包含，自设 env，无外部 DB 依赖）。

**应急分支**：若测试报数据库连接错误，执行 `docker compose -f compose.external-postgres.yml up -d` 后重试；仍失败则记录具体错误，属模板预存问题，不阻塞本计划收尾（脚手架本身的正确性由 doctor + typecheck 保证）。

---

### Task 9: 决策落文档并收尾提交

**Files:**
- Modify: `/Volumes/MacMiniDisk/workspace/LofiCompanion/docs/06-DELIVERY-AND-ACCEPTANCE.md`

- [ ] **Step 1: 更新 §1.1 记录已实现的 server Profile**

将「重要边界：CLI 0.2.0 的 react-native Profile 只复制客户端……必须二选一并形成独立任务」一段整体替换为：

```markdown
重要边界（已决策并实现，2026-08-29）：采用方案 1——MobileUI CLI 已新增 `server`
Profile（`profiles/server/profile.json`），`create --profile react-native,server`
一次生成客户端与服务端，`.mobileui/template.json` 记录模板 commit，来源可追踪、
可升级。`feature add` 与 `doctor` 均已支持 server 边界（`server/src/features/<id>`）。
不得再手工复制 `server/`。
```

同节 create 命令的 `--profile react-native` 改为 `--profile react-native,server`；「生成位置」树中在 `react-native/` 下增加 `server/` 与 `.github/workflows/server-*.yml`。

- [ ] **Step 2: 更新 P0-A 资产策略**

在 P0-A 小节「使用一套“雨夜书房”完整资产和静态降级图」后追加：

```markdown
资产策略（2026-08-29 决策）：P0-A 以六个状态的完整静态海报集（ready/focusing/
paused/drinking/resting/completed，同构图同焦点）先通过验收；播放器按 manifest
视频路径实现，静态图走 poster/降级路径，视频循环后置替换，不改业务代码。
```

- [ ] **Step 3: 提交**

```bash
cd /Volumes/MacMiniDisk/workspace/LofiCompanion
git add docs/06-DELIVERY-AND-ACCEPTANCE.md
git commit -m "docs: 记录 server Profile 决策与 P0-A 静态图先行资产策略

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: 最终状态核对**

```bash
cd /Volumes/MacMiniDisk/workspace/LofiCompanion && git log --oneline && git status --short
```

Expected: ≥3 个提交（docs 基线 / 脚手架 / docs 决策），工作区干净。

---

## Self-Review 记录

1. **Spec 覆盖**：doc 06 §1.1 的 create/doctor/feature 命令 → Task 5/6；「二选一」决策 → Task 2 + Task 9；「不得手工复制 server/」红线 → manifest 记录 commit（Task 5 Step 2 验证）；P0-B 之前的服务端就位 → Task 8 基线绿。P0-A 业务实现（播放器/计时/皮肤）不在本计划，属下一份计划。
2. **占位符扫描**：所有代码步骤含完整代码；无 TBD/「适当处理」。
3. **类型一致性**：`_verifyCombinedProfiles` 使用的 `_manifest`、`_expect`、`_join` 均为 smoke_test.dart 既有辅助函数（已读源文件核实）；Dart switch 插入位置均以现有代码原文标注。
