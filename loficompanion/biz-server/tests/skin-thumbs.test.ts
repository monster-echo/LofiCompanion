import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.APP_ID = 'test-biz-app';
process.env.AUTH_BASE_URL = 'https://auth.example.test';

const { deriveThumbKey, posterKeysOf } = await import('../src/features/skins/data/thumb-key.ts');

test('deriveThumbKey 按约定派生 .thumb.jpg key（双端同约，RN 侧 thumbKey.ts 同逻辑）', () => {
  assert.equal(
    deriveThumbKey('loficompanion/prod/skins/pilot-skin/ready.png'),
    'loficompanion/prod/skins/pilot-skin/ready.thumb.jpg',
  );
  assert.equal(
    deriveThumbKey('loficompanion/prod/skins/pilot-skin/videos/ready.mp4'),
    'loficompanion/prod/skins/pilot-skin/videos/ready.thumb.jpg',
  );
  // 无扩展名：整段当 stem
  assert.equal(deriveThumbKey('loficompanion/prod/skins/x/ready'), 'loficompanion/prod/skins/x/ready.thumb.jpg');
  // 无目录：直接改写文件名
  assert.equal(deriveThumbKey('ready.png'), 'ready.thumb.jpg');
  // 多个点：只去最后一段扩展名
  assert.equal(deriveThumbKey('a/b/ready.v2.png'), 'a/b/ready.v2.thumb.jpg');
});

test('deriveThumbKey 对无文件名段的 key 返回 null（调用方按 failed 回落原图）', () => {
  assert.equal(deriveThumbKey(''), null);
  assert.equal(deriveThumbKey('dir/'), null);
  assert.equal(deriveThumbKey('.hidden'), null);
});

test('posterKeysOf 收集 manifest 全部状态的非空 posterUrl', () => {
  assert.deepEqual(
    posterKeysOf({
      states: [
        { state: 'ready', posterUrl: 'loficompanion/prod/skins/x/ready.png' },
        { state: 'focusing', posterUrl: '', videoUrl: 'v.mp4' },
        { state: 'drinking' },
        { posterUrl: 'loficompanion/prod/skins/x/completed.png' },
      ],
    }),
    ['loficompanion/prod/skins/x/ready.png', 'loficompanion/prod/skins/x/completed.png'],
  );
  assert.deepEqual(posterKeysOf(null), []);
  assert.deepEqual(posterKeysOf({}), []);
});
