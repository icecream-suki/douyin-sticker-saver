import test from 'node:test';
import assert from 'node:assert/strict';
const storage = {}, downloads = new Map(), handlers = {};
let nextId = 0, failNext = false;
const event = name => ({addListener(fn) { handlers[name] = fn; }});
globalThis.chrome = {
  runtime:{id:'test-extension',onInstalled:event('installed'),onMessage:event('message')},
  storage:{local:{
    async get(key) { return key === null ? {...storage} : {[key]:storage[key]}; },
    async set(value) { Object.assign(storage,value); },
    async remove(keys) { for (const key of keys) delete storage[key]; }
  }},
  downloads:{
    onDeterminingFilename:event('filename'),
    async search({id}) { return downloads.has(id) ? [downloads.get(id)] : []; },
    async cancel(id) { downloads.get(id).state = 'interrupted'; },
    async download(options) {
      if (failNext) { failNext = false; throw new Error('NETWORK_FAILED'); }
      const id = ++nextId;
      const item = {id,url:options.url,finalUrl:options.url,mime:options.url.includes('html') ? 'text/html' : 'image/webp',filename:'server-name',state:'in_progress',exists:true,byExtensionId:'test-extension'};
      downloads.set(id,item);
      await new Promise(resolve => handlers.filename(item,result => { item.filename = result?.filename; resolve(); }));
      return id;
    }
  },
  contextMenus:{onClicked:event('context'),removeAll(cb){cb();},create(){}},
  action:{onClicked:event('action'),async setBadgeText(){}},
  tabs:{async sendMessage(){}}
};
await import('../background.js');
const sender = {id:'test-extension',tab:{id:1},url:'https://www.douyin.com/'};
const request = (message, from = sender) => new Promise(resolve => {
  const keep = handlers.message(message,from,resolve);
  if (!keep) resolve(undefined);
});
const start = (url,force = false) => request({type:'download',item:{url,name:'测试/表情'},force});
test('concurrent requests deduplicate; completed, missing and interrupted downloads reconcile', async () => {
  const url = 'https://cdn.example/1.webp?signature=private';
  const [a,b] = await Promise.all([start(url),start(url)]);
  assert.ok(a.ok); assert.equal(b.result.skipped,true);
  assert.equal(nextId,1);
  assert.match(downloads.get(1).filename,/测试_表情_[a-f0-9]{16}\.webp$/);
  assert.equal(downloads.get(1).url,url);
  downloads.get(1).state = 'complete';
  assert.equal((await start(url)).result.skipped,true);
  assert.equal((await start(url,true)).result.id,2);
  downloads.get(2).state = 'interrupted';
  assert.equal((await start(url)).result.id,3);
  downloads.get(3).state = 'complete'; downloads.get(3).exists = false;
  assert.equal((await start(url)).result.id,4);
  assert.ok(!JSON.stringify(storage).includes('signature'));
});
test('failed startup can retry, foreign senders rejected, HTML canceled', async () => {
  failNext = true;
  assert.equal((await start('https://cdn.example/retry')).ok,false);
  assert.equal((await start('https://cdn.example/retry')).ok,true);
  assert.equal(await request({type:'download'}, {...sender,url:'https://evil.test'}),undefined);
  assert.equal((await start('javascript:alert(1)')).ok,false);
  const html = await start('https://cdn.example/html');
  assert.equal(downloads.get(html.result.id).state,'interrupted');
  const status = await request({type:'status',keys:[html.result.key]});
  assert.equal(status.result[0].state,'interrupted');
});
test('clearing dedup history retains active downloads and never deletes files', async () => {
  const result = await request({type:'clear-history'});
  assert.ok(result.ok);
  assert.ok(result.result.removed >= 1);
  assert.ok(Object.values(storage).every(r => downloads.get(r.id)?.state === 'in_progress'));
  assert.ok(downloads.size > Object.keys(storage).length);
});
