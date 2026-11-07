import {isDouyin, validResource, safeName, urlKey, extension, filename} from './core.js';
const prefix = 'download:';
let serial = Promise.resolve();
function exclusive(fn) { const next = serial.then(fn, fn); serial = next.catch(() => {}); return next; }
async function read(key) { return (await chrome.storage.local.get(prefix + key))[prefix + key]; }
async function save(record) { await chrome.storage.local.set({[prefix + record.key]: record}); }
async function current(record) {
  if (!record) return null;
  if (record.id !== undefined) {
    const [item] = await chrome.downloads.search({id: record.id});
    return {...record, state: item ? (item.exists === false && item.state === 'complete' ? 'missing' : item.state) : 'missing', error: item?.error || ''};
  }
  return {...record, state: Date.now() - record.time < 60000 ? 'starting' : 'interrupted'};
}
async function start(item, page, force) {
  if (!item || !validResource(item.url, page)) throw new Error('仅支持页面中的 HTTPS 图片及同源 Blob 图片。');
  const key = await urlKey(item.url);
  const prior = await current(await read(key));
  if (prior && (['in_progress','starting'].includes(prior.state) || (!force && prior.state === 'complete'))) return {key, state: prior.state, skipped: true};
  const record = {key, name: safeName(item.name), day: new Date().toISOString().slice(0,10), time: Date.now(), state:'starting'};
  await save(record);
  try {
    const id = await chrome.downloads.download({url:item.url, conflictAction:'uniquify', saveAs:false});
    await save({...record, id, state:'in_progress'});
    return {key, state:'in_progress', id};
  } catch (error) {
    await save({...record, time:0, state:'interrupted'});
    throw new Error(error.message || '下载启动失败');
  }
}
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  if (item.byExtensionId !== chrome.runtime.id) { suggest(); return; }
  (async () => {
    const key = await urlKey(item.url);
    const record = await read(key);
    if (!record) { suggest(); return; }
    const ext = extension(item.mime, item.finalUrl || item.url, item.filename);
    if (!ext) {
      await chrome.downloads.cancel(item.id).catch(() => {});
      suggest({filename:filename(record, 'blocked'), conflictAction:'uniquify'});
      return;
    }
    suggest({filename:filename(record, ext), conflictAction:'uniquify'});
  })().catch(() => suggest());
  return true;
});
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({id:'sticker-save', title:'保存这张表情 / 图片', contexts:['image','page'], documentUrlPatterns:['https://douyin.com/*','https://*.douyin.com/*']});
  });
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'sticker-save' || !tab?.id || !isDouyin(info.frameUrl || info.pageUrl)) return;
  try {
    // The content script checks that this resource was actually targeted on the page.
    await chrome.tabs.sendMessage(tab.id, {type:'context-save', srcUrl:info.srcUrl}, {frameId:info.frameId || 0});
  } catch { await chrome.action.setBadgeText({tabId:tab.id,text:'刷新'}); }
});
chrome.action.onClicked.addListener(async tab => {
  if (!tab.id) return;
  try { await chrome.tabs.sendMessage(tab.id,{type:'toggle-panel'}); await chrome.action.setBadgeText({tabId:tab.id,text:''}); }
  catch { await chrome.action.setBadgeText({tabId:tab.id,text:'抖音'}); }
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.tab || !isDouyin(sender.url)) return;
  const task = async () => {
    if (message.type === 'download') return exclusive(() => start(message.item, sender.url, message.force === true));
    if (message.type === 'status') {
      if (!Array.isArray(message.keys) || message.keys.length > 500 || message.keys.some(k => !/^[a-f0-9]{64}$/.test(k))) throw new Error('无效的状态请求');
      return Promise.all(message.keys.map(async key => { const r = await current(await read(key)); return {key, state:r?.state || 'unknown', error:r?.error || ''}; }));
    }
    if (message.type === 'clear-history') return exclusive(async () => {
      const all = await chrome.storage.local.get(null);
      const keys = [];
      for (const [key,value] of Object.entries(all)) if (key.startsWith(prefix)) {
        const r = await current(value);
        if (!['starting','in_progress'].includes(r.state)) keys.push(key);
      }
      await chrome.storage.local.remove(keys); return {removed:keys.length};
    });
    throw new Error('未知请求');
  };
  task().then(result => respond({ok:true,result}), error => respond({ok:false,error:error.message}));
  return true;
});
