// 弹幕长度上限（客户端侧口径）：与服务端 validate.ts 的 DANMAKU_MAX_CHARS
// 同为 42 码点；TextInput.maxLength 按字符串长度计数，取同值即可（emoji
// 代理对会略微偏差，服务端码点校验兜底）。

export const DANMAKU_MAX_CHARS_CLIENT = 42;
