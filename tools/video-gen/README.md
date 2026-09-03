# video-gen — 皮肤海报 → MiniMax H3 可循环氛围视频

把 `loficompanion/react-native/assets/skins/` 三套皮肤 × 6 状态的海报，
用 **MiniMax H3 图生视频** 转成 2K 无音轨竖版视频。

## 快速开始

```bash
cd tools/video-gen
npm install
cp .env.example .env        # 填入 MINIMAX_API_KEY；国内站 key 保持
                            # MINIMAX_BASE_URL=https://api.minimaxi.com
                            # （key 与站点必须匹配，否则 401 invalid api key）

node generate.js --dry-run                                   # 预览全部 18 条提示词
node generate.js --skins rainy-study-room --states focusing \
                 --resolution 768P                           # 单条低成本试跑
node generate.js                                             # 全量 18 条 @2K
```

产物：`generated/<slug>/<state>.mp4`（`ffmpeg -an -c:v copy` 去音轨，零画质损失；
宽高比自适应海报 1290×2796）。中断/失败直接重跑，按 `generated/state.json` 自动续传。

常用参数：

| 参数 | 说明 |
|---|---|
| `--skins a,b` / `--states a,b` | 过滤皮肤/状态 |
| `--resolution 768P\|2K` | H3 支持 768P 与 2K（默认 2K） |
| `--dry-run` | 只打印提示词，不花线 |
| `--force` | 忽略已完成记录强制重生成 |
| `--open-loop` | 循环态只锁首帧（调试对比用） |
| `--keep-audio` / `--keep-raw` | 保留音轨 / 原始片（调试） |

## 防抽卡设计（为什么一条过）

依据 MiniMax 官方《H3 Video Prompt Writing Guide》与 API 约束：

1. **图生视频（I2V），绝不用文生视频**——海报直接作为 `first_frame`，
   构图、角色、风格、调色 100% 锁定。提示词只负责"动起来"，不负责"画出来"。
2. **循环态首尾帧同图（FL2VA）**——`ready/focusing/paused/resting` 把同一张海报
   同时作为首帧与尾帧，模型被结构性地约束在"所有运动回到起点"，产出天然无缝循环，
   与 `skin.yaml` 的 150ms 循环衔接策略（doc-07 §9.2）匹配。
   `drinking/completed` 是单次动作态，仅首帧出发。
3. **官方三段式提示词**——首行对齐指令 + `integrated_multimodal_description`
   （风格锚 + 逐项点名保留细节 + 微运动时间线 + 显式负面清单）+
   `overall_soundscape`（环境声驱动画面微运动的物理一致性）+
   `non_diegetic_music: N/A`（应用自带 Lofi 音乐系统，绝不内嵌音乐；音轨成片后去除）。

负面清单是防抽卡关键（官方指南：H3 对具体负面指令响应异常有效）：
无镜头运动/切换、无新增元素、无文字水印、无风格漂移、无面部手部形变、唇部不动。

## 提示词体系结构（prompts.js）

```
皮肤风格锁 SKINS[slug]      → anchor（风格+构图+保留清单）/ ambientLoop / soundscape
状态运动 STATE_MOTION[state] → 微动作设计（lofi 壁纸式"静止中的微动"）
STATE_SPECS[state]           → loop 标记 + 默认时长
```

新增皮肤：在 `prompts.js` 的 `SKINS` 加一条风格锁即可，`generate.js` 会自动
扫描 `assets/skins/*/skin.yaml` 匹配。

## 时长与循环设计（最终配置）

| 状态 | 时长 | 模式 | 说明 |
|---|---|---|---|
| focusing | 15s | 叙事循环 | 写满一页 → 中途翻页 → 新页写满 → 硬切回开头；接缝被读作"翻页"。深夜工作台变体：代码写满 → 编译清屏 → 再写满。喝水不进循环，由 app 的 wellness.drink 事件单独插播 |
| ready | 8s | 循环 | 待机可能长驻留，加长减少重复感 |
| resting | 10s | 循环 | 休息倒计时可能长驻留 |
| paused | 6s | 循环 | 望窗微动 |
| drinking | 5s | 单次 | 拿杯→喝→放回，紧凑插播 |
| completed | 6s | 单次 | 抬头微笑点头，播完切完成页 |

防抽卡实测数据（768P 灰度帧差 MAD，0-255）：相邻帧运动噪声基线 ≈ 0.2；
提示词压不住环境纹理的首尾回归（生成随机性主导），故循环采用
**叙事接缝掩蔽 + 环境近静止 + 人物收尾定格** 三重手段，实测有效。

## 用户与场景对齐

视频是"陪伴感"载体（doc-01：用户要的是低阻力开始、安静完成）：
镜头恒定（Static Shot）、动作幅度小、节奏催眠——是可循环的 living wallpaper，
不是短片。环境声与画面物理一致（雨夜=雨点敲窗、工作台=键盘声），音轨去除前
也用于牵引微运动，避免"声画不符的安静"。

## 成本参考

计费按输出秒数（2K 每秒单价见 platform.minimax.io 定价页）。全量 18 条
= 150s 视频（3×15s focusing + 9 条循环 92s + 6 条动作 31s）。试跑先用 `--resolution 768P`。
