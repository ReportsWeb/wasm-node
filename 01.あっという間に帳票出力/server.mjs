import {ReportsWebEngine} from '@pao-at-office/reports-web';
import http from 'node:http';import {readFile} from 'node:fs/promises';import {extname,join,normalize} from 'node:path';import {createPrintData} from './quick-start.mjs';
import {spawn} from 'node:child_process';import {existsSync} from 'node:fs';import {dirname,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),inDocker=existsSync('/app/reports.web/design/index.html');
// Docker の中では 8080 番で待ち受ける。外（npm start）では 127.0.0.1 の 19220 番（compose と同じ番号）。
const port=Number(process.env.PORT||(inDocker?8080:19220)),host=inDocker?'0.0.0.0':'127.0.0.1';
const reportsWeb=findReportsWeb();
if(!reportsWeb)console.log('Runtime/reports.web が見つかりません。ZIP を展開したフォルダーの並びのまま動かしてください。');
const enginePromise=prepareEngine(reportsWeb);
const html=await readFile(new URL('./index.html',import.meta.url),'utf8');
http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://local');
 if(u.pathname==='/'||u.pathname==='/index.html'){res.setHeader('content-type','text/html; charset=utf-8');return res.end(html)}
 if(u.pathname==='/print-data'){res.setHeader('content-type','application/json; charset=utf-8');return res.end(JSON.stringify(await createPrintData()))}
 const assetPrefix=u.pathname.startsWith('/demo/reports.web/')?'/demo/reports.web/':u.pathname.startsWith('/reports.web/')?'/reports.web/':null;
 if(assetPrefix){if(!reportsWeb){res.statusCode=404;return res.end('not found')}
 const rel=normalize(u.pathname.slice(assetPrefix.length)).replace(/^(\.\.(\/|\\|$))+/,'');let file=join(reportsWeb,rel);if(u.pathname.endsWith('/'))file=join(file,'index.html');
 // A missing file (e.g. the optional reports-web.license in trial mode) is 404; answering 500 made the previewer show the license error dialog (B7).
 const body=await readFile(file).catch(e=>e?.code==='ENOENT'||e?.code==='EISDIR'||e?.code==='ENOTDIR'?null:Promise.reject(e));if(!body){res.statusCode=404;return res.end('not found')}res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');return res.end(body)}
 if(u.pathname==='/pdf'&&req.method==='POST'){const chunks=[];for await(const c of req)chunks.push(c);
  // エンジンが止まっていれば502、90秒以内に応答しなければ504。内部の例外文字列は応答へ出さない。
  const engine=await enginePromise;
  let r,pdf;try{pdf=await new ReportsWebEngine({url:engine,maxBytes:64*1024*1024}).renderPdf(Buffer.concat(chunks).toString('utf8'));r={status:200,headers:new Headers({'content-type':'application/pdf'})}}
  catch(e){const timeout=e?.name==='TimeoutError';console.error(timeout?'PDF engine timeout':'PDF engine unavailable');res.statusCode=timeout?504:502;res.setHeader('content-type','application/json; charset=utf-8');return res.end(JSON.stringify({error:timeout?'PDF作成エンジンが時間内に応答しませんでした。':'PDF作成エンジンに接続できませんでした。'}))}
  res.statusCode=r.status;res.setHeader('content-type',r.headers.get('content-type')||'application/octet-stream');const diagnostics=r.headers.get('x-reports-image-diagnostics');if(diagnostics)res.setHeader('X-Reports-Image-Diagnostics',diagnostics);return res.end(pdf)}
 res.statusCode=404;res.end('not found')}catch(e){console.error(e);res.statusCode=500;res.end('internal server error')}}).listen(port,host,async()=>{
 if(inDocker)return;
 await enginePromise;
 const url=`http://127.0.0.1:${port}/`;
 console.log(`見本の帳票：${url}（止めるときは Ctrl+C）`);
 openBrowser(url);
});

// Docker を使わずに `npm start` だけで動かすための準備（Docker の中では何もしない）。
// - 製品（Runtime/reports.web）は、ZIP の並びのまま ../../../Runtime/reports.web にある。
// - PDF を作るエンジンは、REPORTS_ENGINE_URL が無ければ 127.0.0.1:3107。居なければ同じ Node で子として起動する。
// （here と inDocker は先頭で決める）

function findReportsWeb() {
  if (process.env.REPORTS_WEB_ROOT) return resolve(process.env.REPORTS_WEB_ROOT);
  if (inDocker) return '/app/reports.web';
  // ZIP の並び（WebAssembly/Samples/<言語>/01.*/ → WebAssembly/Runtime/reports.web）。上へたどって探す。
  for (let dir = here; ; dir = dirname(dir)) {
    const candidate = join(dir, 'Runtime', 'reports.web');
    if (existsSync(join(candidate, 'design', 'index.html'))) return candidate;
    if (dirname(dir) === dir) return null;
  }
}

async function alive(url) {
  try { return (await fetch(url + '/health', {signal: AbortSignal.timeout(1500)})).ok; } catch { return false; }
}

// エンジンの宛先を返す。外で動かすときは、居なければ起動して待つ（最大 30 秒）。
async function prepareEngine(reportsWeb) {
  if (process.env.REPORTS_ENGINE_URL) return process.env.REPORTS_ENGINE_URL.replace(/\/$/, '');
  if (inDocker) return 'http://engine:3107';
  const url = 'http://127.0.0.1:3107';
  if (await alive(url)) return url;
  const server = reportsWeb && join(reportsWeb, 'server', 'server.mjs');
  if (!server || !existsSync(server)) { console.log('PDF 用のエンジン（Runtime/reports.web/server）が見つかりません。プレビューだけ使えます。'); return url; }
  const child = spawn(process.execPath, ['--max-old-space-size=1024', server], {
    env: {...process.env, REPORTS_ENGINE_ROOT: dirname(server), REPORTS_ENGINE_PORT: '3107', REPORTS_ENGINE_HOST: '127.0.0.1'},
    stdio: 'ignore', windowsHide: true,
  });
  const stop = () => { if (child.exitCode === null) child.kill(); };
  process.on('exit', stop);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { stop(); process.exit(0); });
  for (let i = 0; i < 60 && child.exitCode === null; i++) {
    if (await alive(url)) return url;
    await new Promise(r => setTimeout(r, 500));
  }
  console.log('PDF 用のエンジンを起動できませんでした（3107 番が使用中かもしれません）。プレビューだけ使えます。');
  return url;
}

// 端末から起動したときだけ、ブラウザーで開く（REPORTS_NO_BROWSER=1 で止められる）。
function openBrowser(url) {
  if (inDocker || !process.stdout.isTTY || process.env.REPORTS_NO_BROWSER) return;
  const [command, args] = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(command, args, {stdio: 'ignore', detached: true}).on('error', () => {}).unref(); } catch {}
}
