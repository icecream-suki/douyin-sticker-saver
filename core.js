export function isDouyin(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && (u.hostname === 'douyin.com' || u.hostname.endsWith('.douyin.com')); } catch { return false; }
}
export function validResource(value, page) {
  if (typeof value !== 'string' || value.length > 16000) return false;
  try {
    const u = new URL(value);
    if (u.username || u.password) return false;
    if (u.protocol === 'https:') return true;
    return u.protocol === 'blob:' && u.origin === new URL(page).origin;
  } catch { return false; }
}
export function safeName(value) {
  const text = String(value || '表情').normalize('NFKC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*\u202a-\u202e\u2066-\u2069]/g, '_').replace(/[. ]+$/g, '').trim().slice(0, 48);
  return !text || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(text) ? '表情' : text;
}
export async function urlKey(url) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
}
export function extension(mime, url, suggested = '') {
  const types = {'image/gif':'gif','image/webp':'webp','image/png':'png','image/apng':'apng','image/jpeg':'jpg','image/avif':'avif','image/bmp':'bmp','image/x-icon':'ico'};
  const type = (mime || '').toLowerCase().split(';')[0].trim();
  if (types[type]) return types[type];
  // SVG and non-image responses are intentionally not accepted as sticker files.
  if (type && !['application/octet-stream','binary/octet-stream'].includes(type)) return null;
  let path = ''; try { path = new URL(url).pathname; } catch {}
  return /\.(gif|webp|png|apng|jpe?g|avif|bmp|ico)$/i.exec(suggested)?.[1]?.toLowerCase()
    || /\.(gif|webp|png|apng|jpe?g|avif|bmp|ico)$/i.exec(path)?.[1]?.toLowerCase() || 'img';
}
export function filename(record, ext) {
  return `Douyin-Stickers/${record.day}/${safeName(record.name)}_${record.key.slice(0,16)}.${ext}`;
}
