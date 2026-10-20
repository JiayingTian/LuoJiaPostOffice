import http from 'node:http';
import https from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);
const api = new URL(process.env.BACKEND_ORIGIN || 'http://127.0.0.1:8000');
const mode = process.env.FRONTEND_MODE || (process.argv.includes('--api') ? 'api' : 'demo');
if (!['demo','api'].includes(mode)) throw new Error('FRONTEND_MODE 必须为 demo 或 api');
const apiBase = process.env.FRONTEND_API_BASE || '/api/v1';
const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp' };

const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/v1/')) {
    // 本机同源代理；不改变 Cookie、CSRF、请求体或业务响应。
    const upstream = (api.protocol === 'https:' ? https : http).request(new URL(url.pathname + url.search, api), { method: req.method, headers: { ...req.headers, host: api.host } }, remote => {
      res.writeHead(remote.statusCode, remote.headers); remote.pipe(res);
    });
    upstream.setTimeout(15000, () => upstream.destroy(new Error('timeout')));
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type':'application/json; charset=utf-8' });
      if (!res.writableEnded) res.end(JSON.stringify({code:50201,message:'本地后端未连接',data:null,requestId:'local-dev-proxy'}));
    });
    req.pipe(upstream); return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  if (url.pathname === '/') url.pathname = '/index.html';
  if (url.pathname === '/frontend/config.js') {
    res.writeHead(200, { 'Content-Type':'text/javascript; charset=utf-8', 'Cache-Control':'no-store' });
    res.end(`export const config = Object.freeze(${JSON.stringify({mode,apiBase,pageSize:6})});`); return;
  }
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { res.writeHead(400); res.end(); return; }
  const allowed = path.startsWith('/frontend/') || path.startsWith('/pictures/') || ['/index.html','/styles.css','/script.js','/favicon.svg'].includes(path);
  if (!allowed || path.split('/').some(part => part.startsWith('.'))) { res.writeHead(404); res.end('Not found'); return; }
  let file = resolve(root, '.' + path);
  if (!file.startsWith(root + sep)) { res.writeHead(404); res.end(); return; }
  try {
    if ((await stat(file)).isDirectory()) file = resolve(file,'index.html');
    const data = await readFile(file);
    res.writeHead(200, {'Content-Type':mime[extname(file)] || 'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(port,'127.0.0.1',()=>console.log(`首页：http://127.0.0.1:${port}/　联调页面：http://127.0.0.1:${port}/frontend/`));
