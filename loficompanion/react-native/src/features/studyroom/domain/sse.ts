/**
 * SSE 增量帧解析器（纯逻辑，node 可测，零 RN 依赖）。
 * 服务端把 ServerEvent JSON 以 `data: <json>\n\n` 下推；传输层拿到的是
 * 跨 chunk 边界的文本流。本解析器按 `\n\n` 切块、只取 data: 行、注释行
 * （: ping 探活）直接忽略，返回 payload 串——由调用方再过 parseServerEvent。
 */

export interface SseParser {
  /** 追加一段文本，返回其中完整到期的 data 负载数组（无则空数组）。 */
  push(chunk: string): string[];
  /** 收尾：漏掉末尾未以空行结束的残留帧（实际服务端总会发空行，兜底用）。 */
  flush(): string[];
}

export function createSseParser(): SseParser {
  let buffer = '';

  function splitBlocks(): string[] {
    const out: string[] = [];
    let idx = buffer.indexOf('\n\n');
    while (idx !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const payload = blockPayload(block);
      if (payload !== null) out.push(payload);
      idx = buffer.indexOf('\n\n');
    }
    return out;
  }

  return {
    push(chunk) {
      // 统一行尾：服务端发 \n，兼容 \r\n 实现（罕见；拆在换行对之间的 \r
      // 才可能残留，本服务端不产生该情形，不做逐字节流式处理）
      buffer += chunk.replace(/\r\n/g, '\n');
      return splitBlocks();
    },
    flush() {
      const rest = buffer;
      buffer = '';
      if (rest.trim() === '') return [];
      const payload = blockPayload(rest.replace(/\r\n/g, '\n'));
      return payload === null ? [] : [payload];
    },
  };
}

/** 取事件块中的 data 负载；无 data: 行（纯注释/空事件）返回 null。 */
function blockPayload(block: string): string | null {
  const dataLines: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue; // 注释帧
    if (!line.startsWith('data:')) continue; // event:/id:/retry: 本协议不用
    const value = line.slice('data:'.length);
    dataLines.push(value.startsWith(' ') ? value.slice(1) : value);
  }
  if (dataLines.length === 0) return null;
  return dataLines.join('\n');
}