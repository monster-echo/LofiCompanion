# Lofi 音乐许可存档

> App 内置与服务器曲库使用的全部音乐来源及许可证据。
> 存档日期：2026-08-31。用于 App Store / 应用市场审核举证。

## 许可

所有曲目来自 [Pixabay](https://pixabay.com/)，适用 **Pixabay Content License**：
可商用、免署名、允许作为应用内容分发（禁止单独转售音频本身）。

- 许可摘要：https://pixabay.com/service/license-summary/
- 许可全文：https://pixabay.com/service/terms/

## 曲目清单（9 首）

| id | 曲名 | 作者 | 时长 | 来源页 | 分发 |
|---|---|---|---|---|---|
| rainy-night | Lofi Study Rainy Night | alex-morgan | 2:23 | https://pixabay.com/music/lofi-lofi-study-rainy-night-568166/ | 内置 + 流式 |
| study-session | Lofi Study Session | alex-morgan | 2:11 | https://pixabay.com/music/lofi-lofi-study-session-568160/ | 内置 + 流式 |
| midnight | Lofi Midnight Club | alex-morgan | 2:17 | https://pixabay.com/music/lofi-lofi-midnight-club-568164/ | 流式 |
| restaurant | Lofi Restaurant | alex-morgan | 2:07 | https://pixabay.com/music/lofi-lofi-restaurant-568157/ | 流式 |
| night-marlowe | Night Lofi | MarloweMusic | 2:13 | https://pixabay.com/music/lofi-night-lofi-582887/ | 流式 |
| night-zephira | Night Lofi | ZephiraMusic | 2:34 | https://pixabay.com/music/lofi-night-lofi-587551/ | 流式 |
| good-night-fass | Good Night - Lofi Cozy Chill Music | FASSounds | 2:27 | https://pixabay.com/music/beats-good-night-lofi-cozy-chill-music-160166/ | 流式 |
| relax-kulakovka | LoFi Relax | Kulakovka | 2:20 | https://pixabay.com/music/lofi-lofi-relax-570489/ | 流式 |
| beats-mountain | Lofi Beats | The_Mountain | 2:23 | https://pixabay.com/music/lofi-lofi-beats-567433/ | 流式 |

## 存储位置

- 服务器曲库（256kbps MP3 母带 + manifest.json）：OSS `zhongbei-storage` 桶，
  key 前缀 `loficompanion/production/music/v1/`
- App 内置（AAC 128kbps m4a）：`loficompanion/react-native/assets/music/`
  （rainy-night.m4a、study-session.m4a）

## 曲库清单

线上权威版本：`loficompanion/production/music/v1/manifest.json`（经
`GET /api/v1/storage/urls?key=…` 换取访问地址）。修改曲库（增删曲目）时：
更新 manifest → 重新上传 → 更新本文件的曲目清单表。
