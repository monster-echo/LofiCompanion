import { describe, expect, it } from 'vitest';
import { STUDY_ROOMS, defaultRoomId, isStudyRoomId, roomForId } from './rooms';

/**
 * 房间清单（rooms.generated.ts ← assets/study-rooms 下各 room.yaml）契约：
 * 目录数据、白名单函数语义、生成器 --check 同步校验。
 */

describe('自习室房间清单', () => {
  it('三间房间按 order 排序，首位为默认房间', () => {
    expect(STUDY_ROOMS.map((room) => room.id)).toEqual([
      'rainy-study-room',
      'sunny-classroom',
      'midnight-workstation',
    ]);
    expect(defaultRoomId()).toBe('rainy-study-room');
  });

  it('每间房间都声明 skin 引用（房间≠皮肤的未来解耦点）', () => {
    for (const room of STUDY_ROOMS) {
      expect(room.skin).toBe(room.id); // 当前口径：id 与皮肤 slug 一致
      expect(room.nameZh.length).toBeGreaterThan(0);
      expect(room.nameEn.length).toBeGreaterThan(0);
      // 房间画面固定基态：自习室是集体氛围场景，恒为伏案写字
      expect(room.displayState).toBe('focusing');
    }
  });

  it('白名单函数：合法 id 放行，未知 id 落回默认房间', () => {
    expect(isStudyRoomId('sunny-classroom')).toBe(true);
    expect(isStudyRoomId('no-such-room')).toBe(false);
    expect(roomForId('midnight-workstation').id).toBe('midnight-workstation');
    expect(roomForId('no-such-room').id).toBe(defaultRoomId());
  });

  it('清单源 room.yaml 与生成物同步（改 YAML 后必须重跑 rooms:generate）', async () => {
    // 直接执行生成器 --check：生成物与 YAML 派生输出逐字节一致
    const { execFile } = await import('node:child_process');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const scriptPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../scripts/generate-study-rooms.mjs',
    );
    await new Promise<void>((resolve, reject) => {
      execFile(process.execPath, [scriptPath, '--check'], (error, stdout, stderr) => {
        if (error) reject(new Error(String(stderr || stdout || error)));
        else resolve();
      });
    });
  });
});
