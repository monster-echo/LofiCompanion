# LofiCompanion Interface System

## Direction

夜间自习室：安静、私密、低干扰。用户的真实学习让同一房间逐渐变化。拒绝通用效率卡片、
高饱和游戏化、聊天中心和紫粉渐变。

## Signature

固定镜头的陪伴房间贯穿专注、事件、完成、成就和周结算。角色、桌面、水杯、灯光和窗户
保持一致；学习成就以真实物品进入房间。

## Depth

暗色表面层级 + 低透明 1px 边界。无明显投影。媒体叠层使用不透明度足够的深夜表面，
背景模糊仅作可选增强。

## Tokens

- Canvas `#091522`; deep `#06101C`; surface `#0D1B2B`; raised `#122338`.
- Action `#4F8FE8`; focus `#6EA6F2`; achievement `#D7A85F`; success `#63BF94`.
- Primary text `#F3EFE7`; secondary `#B4BECA`; muted `#7E8A99`.
- 4dp spacing unit. Common page inset 16; section gap 24.
- Radius: 8 small, 12 control, 16 card, 24 sheet.
- Primary button 52 high; secondary 48; compact/icon hit area 44 minimum.

## Typography

- Chinese UI: PingFang SC / Noto Sans CJK SC.
- Timer/large metrics: bundled Source Serif 4 Semibold, tabular numbers.
- Scale: 11, 12, 13, 15, 17, 20, 24, 36, 56.
- Hierarchy uses weight + color + space; not size alone.

## Focal Patterns

- Home: companion media + one Start CTA.
- Focus: media first, timer second, controls third; controls fade after 5s.
- Completion: real result first, new achievement second, next action third.
- Store: skin state preview first, price after content clarity.
- Generation: confirmed identity image remains stable through progress.

## Reusable Components

- ImmersiveMediaSurface — full screen, focal-point cover, top/bottom scrims, poster fallback.
- FocusTimerRing — 196dp on 390-wide reference, 4dp stroke, 56/64 serif tabular timer.
- PrimaryButton — 52h, 12 radius, 20 horizontal padding, 15/22 semibold.
- CompactActionButton — 44h, 12 radius, 14 horizontal padding, 24 icon.
- SkinPreviewCard — 358×128 reference, 16 radius, bottom name scrim, selected 2dp ring.
- LeaderboardRow — 76h, 12 padding, 44 avatar, right-aligned tabular minutes.
- ResultSheet — 24 top radius, surface on media, fixed CTA and scrollable results.

## Motion

UI motion under 300ms. Button 120ms scale 0.98. Event banner 180ms enter/140ms exit. Only transform
and opacity. Reduced motion removes movement and swaps video for poster.

## Source of Truth

Detailed values: `docs/07-VISUAL-DESIGN-SYSTEM.md`. Screen geometry and states:
`docs/08-SCREEN-SPECIFICATIONS.md`. Approval gate: `docs/09-VISUAL-ACCEPTANCE.md`.

