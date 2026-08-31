import { describe, expect, it } from 'vitest';

import { encodeClientEvent, parseServerEvent } from './protocol';

// 线协议解析守护：与服务端 parseClientEvent 对偶——任何垃圾输入返回 null，
// 合法帧逐字段还原（与服务端 encodeServerEvent 的输出互为镜像）。

const SNAPSHOT = JSON.stringify({
  type: 'snapshot',
  roomId: 'rainy-study-room',
  onlineCount: 3,
  authed: true,
  messages: [
    {
      id: 7,
      roomId: 'rainy-study-room',
      userId: 'u1',
      nickname: '同学',
      content: '加油',
      createdAt: '2026-08-31T00:00:00.000Z',
    },
  ],
  rooms: [
    { roomId: 'rainy-study-room', onlineCount: 3 },
    { roomId: 'sunny-classroom', onlineCount: 0 },
  ],
});

describe('parseServerEvent', () => {
  it('returns null on garbage input without throwing', () => {
    expect(parseServerEvent('not json')).toBeNull();
    expect(parseServerEvent('[]')).toBeNull();
    expect(parseServerEvent('null')).toBeNull();
    expect(parseServerEvent('{"type":"mystery"}')).toBeNull();
    expect(parseServerEvent('{"type":"snapshot"}')).toBeNull(); // 缺字段
    expect(parseServerEvent('{"type":"snapshot","roomId":"nope"}')).toBeNull(); // 坏房间
    expect(parseServerEvent('{"type":"danmaku.new","message":42}')).toBeNull();
    expect(parseServerEvent('{"type":"danmaku.rejected","reason":"wat"}')).toBeNull();
  });

  it('parses a full snapshot with nested message/room arrays', () => {
    const event = parseServerEvent(SNAPSHOT);
    expect(event).not.toBeNull();
    if (event?.type !== 'snapshot') return expect.unreachable();
    expect(event.roomId).toBe('rainy-study-room');
    expect(event.onlineCount).toBe(3);
    expect(event.authed).toBe(true);
    expect(event.messages).toHaveLength(1);
    expect(event.messages[0]?.nickname).toBe('同学');
    expect(event.rooms).toHaveLength(2);
  });

  it('parses rejects with and without retryAfterSeconds', () => {
    expect(parseServerEvent('{"type":"danmaku.rejected","reason":"cooldown","retryAfterSeconds":2}')).toEqual({
      type: 'danmaku.rejected',
      reason: 'cooldown',
      retryAfterSeconds: 2,
    });
    expect(parseServerEvent('{"type":"danmaku.rejected","reason":"blocked"}')).toEqual({
      type: 'danmaku.rejected',
      reason: 'blocked',
    });
  });

  it('filters invalid rows out of snapshot arrays instead of dropping the frame', () => {
    const noisy = JSON.stringify({
      type: 'presence.rooms',
      rooms: [{ roomId: 'rainy-study-room', onlineCount: 1 }, { roomId: 'bad', onlineCount: 2 }, null],
    });
    expect(parseServerEvent(noisy)).toEqual({
      type: 'presence.rooms',
      rooms: [{ roomId: 'rainy-study-room', onlineCount: 1 }],
    });
  });
});

describe('encodeClientEvent', () => {
  it('produces frames the server whitelist accepts (mirror shapes)', () => {
    expect(JSON.parse(encodeClientEvent({ type: 'heartbeat' }))).toEqual({ type: 'heartbeat' });
    expect(JSON.parse(encodeClientEvent({ type: 'danmaku.send', content: 'hi' }))).toEqual({
      type: 'danmaku.send',
      content: 'hi',
    });
    expect(
      JSON.parse(encodeClientEvent({ type: 'room.switch', roomId: 'sunny-classroom' })),
    ).toEqual({ type: 'room.switch', roomId: 'sunny-classroom' });
  });
});
