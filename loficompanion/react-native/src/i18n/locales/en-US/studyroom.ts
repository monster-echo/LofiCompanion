// 自习室域文案（en-US）。语气规范 doc-08 §22：温和具体、无负担性语言。
export const studyroom = {
  // 列表页
  roomTitle: "Study Room",
  listSubtitle: "Pick a room and settle in beside other learners",
  onlineNow: "{{n}} studying now",
  enterRoom: "Enter {{name}}",
  countsUnavailable: "Online counts unavailable — try again later",
  retry: "Retry",
  // 房间页
  exitRoom: "Leave study room",
  quickMenuLabel: "Quick settings",
  keepAwakeLabel: "Keep screen awake",
  muteLabel: "Mute",
  danmakuPositionLabel: "Danmaku position",
  danmakuBandTop: "Top",
  danmakuBandCenter: "Middle",
  danmakuBandBottom: "Bottom",
  onState: "On",
  offState: "Off",
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  closeLabel: "Close",
  // 输入条
  inputPlaceholder: "Say something to cheer each other on…",
  signInToChat: "Sign in to join the chat",
  send: "Send",
  // 发送反馈
  rejectedBlocked: "That message didn't send — try another kind word",
  rejectedTooLong: "Comments are limited to 42 characters",
  cooldownHint: "Easy now — try again in {{s}}s",
  sendFailed: "Couldn't send — try again in a moment",
  // Poster fallback for locked themes
  themeLockedHint: "Theme locked — tap to open the store",
  themeLockedCta: "Unlock this theme in the store",
} as const;
