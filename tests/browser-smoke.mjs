import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await fs.mkdir('work', {recursive:true});
const scratch = await fs.mkdtemp(path.resolve('work/browser-smoke-'));
const port = 20000 + Math.floor(Math.random()*20000);
const profile = path.join(scratch,'profile');
const browser = spawn(process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,`--disable-extensions-except=${project}`,`--load-extension=${project}`,'about:blank'], {windowsHide:true,stdio:'ignore'});
browser.on('error', error => { console.error('Browser launch failed:',error.message); });
let socket;
try {
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await new Promise(r => setTimeout(r,500)); } }
  assert.ok(targets, 'Edge debugging endpoint started');
  const target = targets.find(t => t.type === 'page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => socket.addEventListener('open',r,{once:true}));
  let sequence = 0; const pending = new Map();
  const send = (method,params = {}) => new Promise((resolve,reject) => { const id = ++sequence; pending.set(id,{resolve,reject}); socket.send(JSON.stringify({id,method,params})); });
  const errors = [];
  socket.onmessage = async event => {
    const msg = JSON.parse(event.data);
    if (msg.id) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(msg.error) : p.resolve(msg.result); }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text);
    if (msg.method === 'Fetch.requestPaused') {
      const {requestId,request} = msg.params;
      const image = request.url.includes('/fixture.gif');
      const gif = Buffer.from('47494638396101000100800000ff00000000ff21ff0b4e45545343415045322e30030100000021f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b','hex');
      const body = image ? gif : Buffer.from(`<html><body style="margin:20px"><h1>表情测试页</h1><section id="comment"><img alt="开心表情" class="emoji" width="80" height="80" src="https://www.douyin.com/fixture.gif"></section><img alt="头像" class="avatar" width="80" height="80" src="https://www.douyin.com/fixture.gif?avatar"><div style="height:1400px"></div><img id="lazy" alt="懒加载表情" width="80" height="80" src="https://www.douyin.com/fixture.gif?lazy"></body></html>`);
      await send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:image?'image/gif':'text/html'}],body:body.toString('base64')});
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Fetch.enable',{patterns:[{urlPattern:'https://www.douyin.com/*'}]});
  await send('Page.navigate',{url:'https://www.douyin.com/fixture'});
  await new Promise(r => setTimeout(r,2500));
  const evalJS = async expression => (await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value;
  const exists = await evalJS(`!!document.getElementById('douyin-sticker-saver-root')`);
  assert.ok(exists,'extension content script is loaded by Edge');
  const tree = () => send('DOM.getDocument',{depth:-1,pierce:true});
  function walk(node,id) { if (node.attributes?.some((a,i) => a === 'id' && node.attributes[i+1] === id)) return node; for (const c of [...(node.children || []),...(node.shadowRoots || [])]) { const found = walk(c,id); if(found) return found; } }
  async function inNode(id,fn) { const node = walk((await tree()).root,id); assert.ok(node,`node ${id} exists`); const {object} = await send('DOM.resolveNode',{nodeId:node.nodeId}); return (await send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:fn,returnByValue:true,awaitPromise:true})).result.value; }
  // Action APIs are tested separately; show the panel via the real extension worker.
  const all = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const worker = all.find(t => t.type === 'service_worker' && t.url.endsWith('/background.js')); assert.ok(worker,'Manifest V3 worker loaded');
  const ws = new WebSocket(worker.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  await new Promise((resolve,reject) => { ws.onmessage=e=>{const v=JSON.parse(e.data); if(v.id===1){v.error?reject(v.error):resolve(v);}}; ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:`chrome.tabs.query({}).then(tabs => Promise.all(tabs.map(tab => chrome.tabs.sendMessage(tab.id,{type:'toggle-panel'}).catch(()=>{}))))`,awaitPromise:true}})); }); ws.close();
  await new Promise(r=>setTimeout(r,500));
  assert.equal(await inNode('count','function(){return this.textContent}'),'1 张');
  await inNode('mode',`function(){this.value='all';this.dispatchEvent(new Event('change'))}`);
  assert.equal(await inNode('count','function(){return this.textContent}'),'2 张');
  await inNode('select','function(){this.click()}');
  assert.equal(await inNode('items',`function(){return [...this.querySelectorAll('input')].filter(i=>i.checked).length}`),2);
  await evalJS(`document.getElementById('lazy').scrollIntoView()`);
  await new Promise(r=>setTimeout(r,800));
  assert.equal(await inNode('count','function(){return this.textContent}'),'3 张');
  await evalJS(`document.getElementById('lazy').src='https://www.douyin.com/fixture.gif?changed'`);
  await new Promise(r=>setTimeout(r,800));
  assert.equal(await inNode('count','function(){return this.textContent}'),'4 张');
  await evalJS(`history.pushState({},'', '/fixture2')`);
  await new Promise(r=>setTimeout(r,3200));
  assert.equal(await inNode('count','function(){return this.textContent}'),'1 张');
  assert.deepEqual(errors,[]);
  const downloadDir = path.join(scratch,'downloads');
  await fs.mkdir(downloadDir,{recursive:true});
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir});
  const gifHex = '47494638396101000100800000ff00000000ff21ff0b4e45545343415045322e30030100000021f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b';
  await evalJS(`(async()=>{const bytes=Uint8Array.from('${gifHex}'.match(/../g),x=>parseInt(x,16));const img=document.createElement('img');img.id='blob-test';img.alt='动态图测试';img.style='position:fixed;top:80px;left:30px;width:80px;height:80px';img.src=URL.createObjectURL(new Blob([bytes],{type:'image/gif'}));document.body.append(img);await img.decode();img.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));})()`);
  await inNode('hover','function(){this.click()}');
  let saved;
  for(let i=0;i<40;i++) {
    const files = await fs.readdir(downloadDir,{recursive:true});
    const name = files.find(f=>f.endsWith('.gif'));
    if(name){saved=await fs.readFile(path.join(downloadDir,name));break;}
    await new Promise(r=>setTimeout(r,250));
  }
  assert.ok(saved,'actual browser download saved GIF');
  assert.deepEqual(saved,Buffer.from(gifHex,'hex'),'two-frame GIF bytes remain identical');
  const screenshot = await send('Page.captureScreenshot',{format:'png'});
  await fs.writeFile(path.join(scratch,'screenshot.png'),Buffer.from(screenshot.data,'base64'));
  console.log('PASS: Edge MV3 load, service worker, smart/all filter, select, viewport lazy collection, src mutation, SPA reset, no page exceptions, hover save and byte-identical two-frame GIF download.');
} finally {
  socket?.close(); browser.kill();
}


