import http from 'node:http';import {readFile} from 'node:fs/promises';import {extname,join,normalize} from 'node:path';import {createPrintData} from './quick-start.mjs';import {ReportsWebEngine} from '@pao-at-office/reports-web';
const port=Number(process.env.PORT||8080),engine=new ReportsWebEngine({url:process.env.REPORTS_ENGINE_URL||'http://engine:3107'});
const html=await readFile(new URL('./index.html',import.meta.url),'utf8');
http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://local');
 if(u.pathname==='/'||u.pathname==='/index.html'){res.setHeader('content-type','text/html; charset=utf-8');return res.end(html)}
 if(u.pathname==='/print-data'){res.setHeader('content-type','application/json; charset=utf-8');return res.end(JSON.stringify(await createPrintData()))}
 const assetPrefix=u.pathname.startsWith('/demo/reports.web/')?'/demo/reports.web/':u.pathname.startsWith('/reports.web/')?'/reports.web/':null;
 if(assetPrefix){const rel=normalize(u.pathname.slice(assetPrefix.length)).replace(/^(\.\.(\/|\\|$))+/,'');let file=join('/app/reports.web',rel);if(u.pathname.endsWith('/'))file=join(file,'index.html');const body=await readFile(file);res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');return res.end(body)}
 if(u.pathname==='/pdf'&&req.method==='POST'){const chunks=[];for await(const c of req)chunks.push(c);const pdf=await engine.renderPdf(Buffer.concat(chunks).toString('utf8'));res.setHeader('content-type','application/pdf');return res.end(pdf)}
 res.statusCode=404;res.end('not found')}catch(e){res.statusCode=500;res.end(String(e))}}).listen(port,'0.0.0.0');
