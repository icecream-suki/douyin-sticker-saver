(() => {
  'use strict';
  const MAX = 500;
  const records = new Map(), visible = new Set(), tracked = new Set();
  let mode = 'smart', opened = false, busy = false, stopped = false, hovered = null, contextTarget = null, renderTimer, scanTimer, route = location.href;
  const host = document.createElement('div');
  host.id = 'douyin-sticker-saver-root';
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;left:0;top:0;pointer-events:none';
  document.documentElement.append(host);
  const root = host.attachShadow({mode:'closed'});
  root.innerHTML = `<style>
    *{box-sizing:border-box}button,input,select{font:inherit}button,select{cursor:pointer}button{border:1px solid #d9dde6;background:white;color:#17213c;border-radius:8px;padding:7px 10px}button:hover{background:#edf0ff}button:disabled{opacity:.5;cursor:default}input{accent-color:#5554db}button:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #a3a1ff} .primary{background:#5554db;color:white;border:0}.primary:hover{background:#4241b8}
    #panel{position:fixed;right:18px;top:20px;width:390px;max-width:calc(100vw - 24px);height:calc(100vh - 40px);background:#f7f8fc;color:#17213c;border:1px solid #d9dde6;box-shadow:0 12px 50px #0004;border-radius:16px;font:14px/1.5 system-ui,sans-serif;pointer-events:auto;display:flex;flex-direction:column;overflow:hidden}
    [hidden]{display:none!important}header{padding:16px;border-bottom:1px solid #e0e3ed}h2{font-size:18px;margin:0 0 7px}.row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.muted{font-size:12px;color:#626b81}#items{overflow:auto;flex:1;padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px;align-content:start}.card{background:white;border:1px solid #dfe3ed;border-radius:10px;padding:8px;min-width:0}.card img{display:block;width:100%;height:100px;object-fit:contain;background:repeating-conic-gradient(#f4f4f6 0% 25%,white 0% 50%) 50%/16px 16px}.card label{display:flex;align-items:center;gap:5px;margin:5px 0}.name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}.state{font-size:11px;overflow-wrap:anywhere;min-height:18px;color:#626b81}footer{padding:12px;border-top:1px solid #dfe3ed}#message{font-size:12px;margin-top:7px;overflow-wrap:anywhere}#hover{position:fixed;pointer-events:auto;box-shadow:0 2px 12px #0005;font:13px system-ui}#toast{position:fixed;bottom:24px;left:24px;background:#17213c;color:white;border-radius:9px;padding:12px 18px;max-width:400px;font:14px system-ui;pointer-events:none}
  </style>
  <button id="hover" hidden title="下载原格式图片">↓ 保存</button>
  <section id="panel" hidden aria-label="表情下载面板"><header>
    <div class="row"><h2 style="flex:1">表情保存助手</h2><button id="close" aria-label="关闭面板">✕</button></div>
    <div class="muted">滚动评论、私信或收藏表情列表，收集已显示的图片。最多保留 500 张。</div>
    <div class="row" style="margin-top:10px"><select id="mode" aria-label="图片筛选"><option value="smart">疑似表情</option><option value="all">全部已显示图片</option></select><button id="scan">重新扫描</button><span id="count"></span></div>
    <div class="row" style="margin-top:8px"><button id="select">全选当前列表</button><button id="none">取消选择</button><button id="reset">清空列表</button></div>
  </header><div id="items"></div><footer>
    <div class="row"><button class="primary" id="download">下载勾选项</button><button id="stop" disabled>停止排队</button><label><input type="checkbox" id="force">允许重复下载</label></div>
    <div id="message" role="status" aria-live="polite">文件保存到浏览器下载目录的 Douyin-Stickers 文件夹。</div>
    <button id="history" style="margin-top:8px">清除本地去重记录</button>
  </footer></section><div id="toast" hidden role="status"></div>`;
  const $ = id => root.getElementById(id);
  const matches = r => mode === 'all' || r.smart;
  const list = () => [...records.values()].filter(matches);
  function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, 4500); }
  async function request(message) {
    try { const reply = await chrome.runtime.sendMessage(message); if (!reply?.ok) throw new Error(reply?.error || '扩展未响应'); return reply.result; }
    catch (e) { throw new Error(/context invalidated/i.test(e.message) ? '扩展已更新，请刷新抖音页面。' : e.message); }
  }
  function resource(el) {
    if (!(el instanceof Element) || host.contains(el)) return null;
    let url;
    if (el instanceof HTMLImageElement) { if (!el.complete || !el.naturalWidth) return null; url = el.currentSrc || el.src; }
    else {
      const bg = getComputedStyle(el).backgroundImage;
      // Only a single background image; sprites and multi-layer composites are not reconstructed.
      url = /^url\(["']?(.*?)["']?\)$/.exec(bg)?.[1];
    }
    if (!url || !/^(https:|blob:)/i.test(url)) return null;
    const rect = el.getBoundingClientRect();
    const own = `${el.getAttribute('alt') || ''} ${el.getAttribute('aria-label') || ''} ${el.className || ''} ${el.getAttribute('data-e2e') || ''}`;
    const parent = `${el.parentElement?.className || ''} ${el.parentElement?.getAttribute('data-e2e') || ''}`;
    const smart = !/avatar|头像|profile|logo/i.test(own + parent) && (/emoji|emoticon|sticker|表情/i.test(own + parent + url) || (rect.width >= 36 && rect.width <= 240 && rect.height >= 36 && rect.height <= 240 && rect.width / rect.height > .65 && rect.width / rect.height < 1.5));
    return {url, name:(el.getAttribute('alt') || el.getAttribute('aria-label') || '表情').slice(0,48), smart};
  }
  function displayed(el) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse' || Number(s.opacity) === 0) return false;
    }
    return true;
  }
  function remember(item) {
    if (!item) return null;
    const prior = records.get(item.url);
    if (prior) { if (!prior.smart && item.smart) { prior.smart = true; scheduleRender(); } return prior; }
    if (records.size >= MAX) return null;
    const record = {...item, selected:false, state:'未下载'}; records.set(item.url, record); scheduleRender(); return record;
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0) { visible.add(entry.target); if (displayed(entry.target)) remember(resource(entry.target)); }
      else visible.delete(entry.target);
    }
  });
  function scan() {
    scanTimer = null;
    if (location.href !== route) { route = location.href; stopped = true; records.clear(); scheduleRender(); }
    for (const el of tracked) if (!el.isConnected) { observer.unobserve(el); tracked.delete(el); visible.delete(el); }
    const elements = document.querySelectorAll('img,[style*="background"],[class*="emoji"],[class*="sticker"],[data-e2e*="emoji"]');
    for (const el of elements) {
      if (tracked.size >= 6000) break;
      if (!tracked.has(el)) { tracked.add(el); observer.observe(el); }
    }
    for (const el of visible) if (displayed(el)) remember(resource(el));
  }
  function scheduleScan() { if (!scanTimer) scanTimer = setTimeout(scan, 300); }
  new MutationObserver(scheduleScan).observe(document.documentElement, {subtree:true, childList:true, attributes:true, attributeFilter:['src','srcset','style','class','alt','aria-label']});
  document.addEventListener('load', scheduleScan, true);
  addEventListener('scroll', () => { $('hover').hidden = true; scheduleScan(); }, true);
  addEventListener('resize', scheduleScan);
  function targetAt(target) {
    let el = target;
    for (let depth = 0; el && depth < 4; depth++, el = el.parentElement) {
      if (displayed(el)) { const item = resource(el); if (item) return {el,item}; }
    }
    return null;
  }
  document.addEventListener('pointerover', event => {
    if (event.target === host) return;
    const target = targetAt(event.target);
    if (!target) { $('hover').hidden = true; return; }
    hovered = target.item; remember(hovered);
    const rect = target.el.getBoundingClientRect();
    $('hover').style.left = `${Math.max(0, Math.min(innerWidth - 90, rect.right - 60))}px`;
    $('hover').style.top = `${Math.max(0, Math.min(innerHeight - 36, rect.top))}px`;
    $('hover').hidden = false;
  }, true);
  document.addEventListener('contextmenu', event => { const found = targetAt(event.target); contextTarget = found ? {...found.item, at:Date.now()} : null; }, true);
  async function single(item) {
    if (!item) { toast('未识别到图片，请将鼠标移到表情上或使用面板。'); return; }
    try {
      const r = remember(item) || {...item};
      const result = await request({type:'download',item:{url:r.url,name:r.name},force:$('force').checked});
      r.key = result.key; r.state = result.skipped ? '已跳过重复项' : '已加入浏览器下载';
      toast(r.state); scheduleRender();
    } catch (e) { toast(e.message); }
  }
  function scheduleRender() { if (!renderTimer) renderTimer = setTimeout(() => { renderTimer = null; if (opened) render(); }, 180); }
  function render() {
    const shown = list(); $('count').textContent = `${shown.length} 张`;
    const fragment = document.createDocumentFragment();
    for (const record of shown) {
      const card = document.createElement('div'); card.className = 'card';
      const img = document.createElement('img'); img.src = record.url; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
      const label = document.createElement('label'), check = document.createElement('input'), name = document.createElement('span');
      check.type = 'checkbox'; check.checked = record.selected; check.addEventListener('change', () => record.selected = check.checked);
      name.textContent = record.name; name.className = 'name'; label.append(check,name);
      const state = document.createElement('div'); state.className = 'state'; state.textContent = record.state;
      const button = document.createElement('button'); button.textContent = '保存此图'; button.addEventListener('click', () => single(record));
      card.append(img,label,state,button); fragment.append(card);
    }
    if (!shown.length) { const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = '暂无图片。请滚动目标列表，或切换“全部已显示图片”。'; fragment.append(empty); }
    $('items').replaceChildren(fragment);
  }
  function toggle() { opened = !opened; $('panel').hidden = !opened; if (opened) { scan(); render(); } }
  $('close').onclick = toggle;
  $('hover').onclick = () => single(hovered);
  $('mode').onchange = () => { mode = $('mode').value; render(); };
  $('scan').onclick = () => { scan(); render(); };
  $('select').onclick = () => { list().forEach(r => r.selected = true); render(); };
  $('none').onclick = () => { records.forEach(r => r.selected = false); render(); };
  $('reset').onclick = () => { records.clear(); render(); };
  $('stop').onclick = () => { stopped = true; $('message').textContent = '已停止排队；已提交的下载可在浏览器下载页取消。'; };
  $('history').onclick = async () => { try { const r = await request({type:'clear-history'}); toast(`已清除 ${r.removed} 条去重记录，文件不会删除。`); } catch(e) { toast(e.message); } };
  $('download').onclick = async () => {
    if (busy) return;
    const selected = list().filter(r => r.selected);
    if (!selected.length) { toast('请先勾选图片。'); return; }
    busy = true; stopped = false; $('download').disabled = true; $('stop').disabled = false;
    const force = $('force').checked; let submitted = 0, skipped = 0, failed = 0;
    try {
      for (const r of selected) {
        if (stopped) break;
        try {
          const result = await request({type:'download',item:{url:r.url,name:r.name},force});
          r.key = result.key; r.state = result.skipped ? '已跳过重复项' : '已加入浏览器下载';
          if (result.skipped) skipped++; else submitted++;
        } catch(e) { failed++; r.state = `失败：${e.message}`; }
        $('message').textContent = `已提交 ${submitted}，跳过 ${skipped}，启动失败 ${failed}。实际结果见图片状态和浏览器下载页。`;
        scheduleRender(); await new Promise(resolve => setTimeout(resolve, 350));
      }
    } finally { busy = false; $('download').disabled = false; $('stop').disabled = true; }
  };
  chrome.runtime.onMessage.addListener(message => {
    if (message.type === 'toggle-panel') toggle();
    if (message.type === 'context-save') {
      const item = contextTarget && Date.now() - contextTarget.at < 60000 && (!message.srcUrl || message.srcUrl === contextTarget.url) ? contextTarget : null;
      single(item);
    }
  });
  setInterval(async () => {
    if (location.href !== route) scheduleScan();
    if (!opened || document.hidden) return;
    const items = [...records.values()].filter(r => r.key);
    if (!items.length) return;
    try {
      const statuses = await request({type:'status',keys:items.map(r => r.key)});
      const names = {complete:'下载完成',in_progress:'下载中',interrupted:'下载失败 / 已取消',missing:'文件或下载记录已移除',starting:'正在启动',unknown:'无去重记录'};
      let changed = false;
      const byKey = new Map(statuses.map(s => [s.key,s]));
      for (const r of items) { const s = byKey.get(r.key); const text = (names[s.state] || s.state) + (s.error ? `（${s.error}）` : ''); if (r.state !== text) { r.state = text; changed = true; } }
      if (changed) scheduleRender();
    } catch { /* Refreshing an updated extension restores its message channel. */ }
  }, 2500);
  scan();
})();
