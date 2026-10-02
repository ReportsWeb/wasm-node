import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {once} from 'node:events';
import {createApplication,config,BASE} from '../server.js';
import {SampleCatalog} from '../SampleCatalog.js';

test('PDF enforces a single request slot and recovers after completion',async()=>{
  let release!:()=>void,started!:()=>void;
  const rendered=new Promise<void>(r=>started=r),gate=new Promise<void>(r=>release=r);
  const engine=createServer(async(req,res)=>{for await(const _ of req){}started();await gate;res.end('%PDF-1.7\n test')});
  engine.listen(0,'127.0.0.1');await once(engine,'listening');
  const app=createApplication({...config,engineUrl:`http://127.0.0.1:${(engine.address()as any).port}`},new SampleCatalog(config.resourceRoot,async()=>[]));
  app.listen(0,'127.0.0.1');await once(app,'listening');
  const url=`http://127.0.0.1:${(app.address()as any).port}${BASE}/api?action=server-pdf`,body=JSON.stringify({Format:'Reports.net PrintData',Pages:[{Values:[]}]});
  try{const first=fetch(url,{method:'POST',body});await rendered;assert.equal((await fetch(url,{method:'POST',body})).status,429);release();assert.equal((await first).status,200);assert.equal((await fetch(url,{method:'POST',body})).status,200)}finally{release();app.closeAllConnections();engine.closeAllConnections();await Promise.all([new Promise<void>(r=>app.close(()=>r())),new Promise<void>(r=>engine.close(()=>r()))])}
});

test('declared oversized request is rejected before reading or contacting engine',async()=>{
  const app=createApplication(config,new SampleCatalog(config.resourceRoot,async()=>[]));app.listen(0,'127.0.0.1');await once(app,'listening');
  try{const code=await new Promise<number>((resolve,reject)=>{const req=request({host:'127.0.0.1',port:(app.address()as any).port,path:BASE+'/api?action=server-pdf',method:'POST',headers:{'Content-Length':32*1024*1024+1}},res=>{res.resume();resolve(res.statusCode!);req.destroy()});req.on('error',e=>{if((e as any).code!=='ECONNRESET')reject(e)});req.flushHeaders()});assert.equal(code,413)}finally{app.closeAllConnections();await new Promise<void>(r=>app.close(()=>r()))}
});

test('prototype names and unregistered endpoints cannot access filesystem resources',async()=>{
  const app=createApplication(config,new SampleCatalog(config.resourceRoot,async()=>[]));app.listen(0,'127.0.0.1');await once(app,'listening');const root=`http://127.0.0.1:${(app.address()as any).port}`;
  try{for(const sample of ['__proto__','constructor','toString'])assert.equal((await fetch(root+BASE+'/api?sample='+sample)).status,400);for(const path of ['/demo/reports.web/src/server.ts','/demo/reports.web/assets/%2e%2e%2f%2e%2e%2fpackage.json','/demo/reports.web/fonts/../../samples/php/.env'])assert.equal((await fetch(root+path)).status,404)}finally{app.closeAllConnections();await new Promise<void>(r=>app.close(()=>r()))}
});
