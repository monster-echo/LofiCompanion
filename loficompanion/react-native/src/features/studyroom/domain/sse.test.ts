import { describe, expect, it } from 'vitest';

import { createSseParser } from './sse';

// SSE 增量解析守护：跨 chunk 边界、\r\n 兼容、多行 data、注释行忽略、flush 收尾。

describe('createSseParser', () => {
  it('splits full frames on blank line, extracting data payloads', () => {
    const parser = createSseParser();
    expect(parser.push(': ok\n\ndata: {"type":"ping"}\n\ndata: {"type":"pong"}\n\n')).toEqual([
      '{"type":"ping"}',
      '{"type":"pong"}',
    ]);
  });

  it('buffers partial frames across chunks (data payload split mid-way)', () => {
    const parser = createSseParser();
    expect(parser.push('data: {"typ')).toEqual([]);
    expect(parser.push('e":"pong"}\n\n')).toEqual(['{"type":"pong"}']);
  });

  it('tolerates CRLF line endings', () => {
    const parser = createSseParser();
    expect(parser.push('data: a\r\n\r\ndata: b\r\n\r\n')).toEqual(['a', 'b']);
  });

  it('joins multi-line data frames with a newline and ignores event/id/retry fields', () => {
    const parser = createSseParser();
    const block = [
      'event: chat',
      'data: first',
      'data: second',
      'id: 7',
      'retry: 1000',
      '',
      '',
    ].join('\n');
    expect(parser.push(block)).toEqual(['first\nsecond']);
  });

  it('ignores pure comment frames', () => {
    const parser = createSseParser();
    expect(parser.push(': ping\n\n: keepalive\n\n')).toEqual([]);
  });

  it('flush returns a trailing partial frame without blank-line terminator', () => {
    const parser = createSseParser();
    expect(parser.push('data: {"type":"tail"}')).toEqual([]);
    expect(parser.flush()).toEqual(['{"type":"tail"}']);
  });

  it('flush on empty buffer returns nothing', () => {
    const parser = createSseParser();
    expect(parser.flush()).toEqual([]);
  });
});