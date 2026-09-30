import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const data=await mkdtemp(path.join(os.tmpdir(),'silver-nails-tests-'));
const port=4387,base=`http://127.0.0.1:${port}`;
let server;
async function start(){server=spawn(process.execPath,['server.mjs'],{cwd:ROOT,env:{...process.env,SILVER_PORT:String(port),SILVER_DATA_DIR:data},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(new Error('Server did not start: '+log)),10000);server.stdout.on('data',d=>{log+=d;if(log.includes('DEMO:')){clearTimeout(timer);resolve();}});server.stderr.on('data',d=>log+=d);server.on('exit',code=>{clearTimeout(timer);reject(new Error('Server exit '+code+' '+log));});});}
async function stop(){if(server&&!server.killed){const done=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await done;}}
async function post(endpoint,payload,headers={}){const r=await fetch(base+'/api/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Silver-Demo':'1',...headers},body:JSON.stringify(payload)});return {status:r.status,body:await r.json()};}
const cmd=(type,payload={},requestId=crypto.randomUUID())=>post('command',{type,payload,requestId,actor:'API test'});

test('local server transactional persistence, idempotency, live sync and API boundaries',async t=>{
  await start();
  try{
    await t.test('serves static app and runtime without exposing data or server source',async()=>{
      assert.equal((await fetch(base+'/')).status,200);assert.match(await(await fetch(base+'/runtime.js')).text(),/true/);
      assert.equal((await fetch(base+'/data/silver-demo.sqlite')).status,404);assert.equal((await fetch(base+'/server.mjs')).status,404);
    });
    await t.test('same request id commits once and returns the same result',async()=>{
      const id=crypto.randomUUID(),a=await cmd('giftSell',{recipient:'API test',amount:12345},id),b=await cmd('giftSell',{recipient:'API test',amount:12345},id);
      assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.body.result.id,b.body.result.id);assert.equal(a.body.state.revision,b.body.state.revision);
      assert.equal(b.body.state.giftCards.filter(g=>g.recipient==='API test').length,1);
    });
    await t.test('two simultaneous checkout requests can only commit one sale',async()=>{
      const results=await Promise.all([cmd('checkout',{appointmentId:'APT-DEMO-04',giftCode:'SN-DEMO-0100'}),cmd('checkout',{appointmentId:'APT-DEMO-04',giftCode:'SN-DEMO-0100'})]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
      const s=await(await fetch(base+'/api/state')).json();assert.equal(s.giftCards.find(g=>g.code==='SN-DEMO-0100').balance,4500);assert.equal(s.invoices.filter(i=>i.appointmentId==='APT-DEMO-04').length,1);
    });
    await t.test('SSE stream receives a revision after a command from another client',async()=>{
      const ctrl=new AbortController(),response=await fetch(base+'/api/events',{signal:ctrl.signal}),reader=response.body.getReader(),decoder=new TextDecoder();
      try{const first=decoder.decode((await reader.read()).value);assert.match(first,/data: /);const initial=JSON.parse(first.slice(6).trim());
        await cmd('inventoryAdjust',{id:'I1',delta:1,reason:'SSE test'});
        let accumulated='';while(!accumulated.includes('\n\n'))accumulated+=decoder.decode((await reader.read()).value);
        const next=JSON.parse(accumulated.slice(6).trim());assert.equal(next.revision,initial.revision+1);assert.equal(next.inventory[0].stock,initial.inventory[0].stock+1);
      }finally{ctrl.abort();}
    });
    await t.test('malformed imports and cross-origin changes are rejected',async()=>{
      assert.equal((await post('import',{state:{schema:1,revision:0}})).status,400);
      assert.equal((await post('reset',{confirm:true},{Origin:'https://untrusted.example'})).status,403);
      const r=await fetch(base+'/api/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"confirm":true}'});assert.equal(r.status,403);
    });
    await t.test('database survives server restart with exact revision and balances',async()=>{
      const before=await(await fetch(base+'/api/state')).json();await stop();await start();const after=await(await fetch(base+'/api/state')).json();assert.deepEqual(after,before);
    });
  }finally{await stop();await rm(data,{recursive:true,force:true});}
});
