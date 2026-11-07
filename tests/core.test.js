import test from 'node:test';
import assert from 'node:assert/strict';
import {isDouyin,validResource,safeName,urlKey,extension,filename} from '../core.js';
test('only HTTPS Douyin pages are accepted', () => {
  assert.ok(isDouyin('https://www.douyin.com/video/1'));
  for (const url of ['https://douyin.com.evil.test','http://douyin.com','https://evil.test/douyin.com','invalid']) assert.equal(isDouyin(url),false);
});
test('resource validation rejects credentials, executable schemes and foreign blobs', () => {
  const page = 'https://www.douyin.com/';
  assert.ok(validResource('https://cdn.example/emoji?token=123',page));
  assert.ok(validResource('blob:https://www.douyin.com/uuid',page));
  for (const url of ['javascript:alert(1)','data:text/html,hi','file:///c:/a','http://example.com/a','https://user:pass@example.com/a','blob:https://evil.test/uuid']) assert.equal(validResource(url,page),false);
});
test('Windows names cannot traverse paths or contain forbidden names', () => {
  assert.equal(safeName('CON'),'表情');
  assert.equal(safeName('nul.txt'),'表情');
  assert.equal(safeName('..'),'表情');
  assert.ok(!/[\\/:*?"<>|]/.test(safeName('../../a:*?')));
  assert.equal(safeName('开心😂'),'开心😂');
  const path = filename({name:'../猫',key:'1234567890abcdef111',day:'2026-11-07'},'webp');
  assert.equal(path,'Douyin-Stickers/2026-11-07/.._猫_1234567890abcdef.webp');
});
test('MIME determines original format, signed URLs stay untouched', () => {
  assert.equal(extension('image/webp','https://example/a.jpg'),'webp');
  assert.equal(extension('image/gif','https://example/opaque'),'gif');
  assert.equal(extension('image/png','https://example/a.webp'),'png');
  assert.equal(extension('application/octet-stream','https://example/a.gif?token=1'),'gif');
  assert.equal(extension('','https://example/opaque'),'img');
  assert.equal(extension('text/html','https://example/a.gif'),null);
  assert.equal(extension('image/svg+xml','https://example/a.svg'),null);
});
test('dedup key is stable and preserves query identity', async () => {
  const a = await urlKey('https://example/a?token=1');
  assert.equal(a.length,64);
  assert.equal(a,await urlKey('https://example/a?token=1'));
  assert.notEqual(a,await urlKey('https://example/a?token=2'));
});
