import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {networkInterfaces} from 'node:os';
import {seed,command,validateBackup} from './domain.js';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const HOST=process.argv.includes('--lan')?'0.0.0.0':'127.0.0.1';
const PORT=Number(process.env.SILVER_PORT||4173);
const DATA=process.env.SILVER_DATA_DIR||path.join(ROOT,'data');
await mkdir(DATA,{recursive:true});
const db=new DatabaseSync(path.join(DATA,'silver-demo.sqlite'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK (id=1), json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, result TEXT NOT NULL)');
const read=()=>JSON.parse(db.prepare('SELECT json FROM app_state WHERE id=1').get().json);
const write=s=>db.prepare('INSERT INTO app_state(id,json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(JSON.stringify(s));
if(!db.prepare('SELECT id FROM app_state WHERE id=1').get())write(seed());
const clients=new Set();
function broadcast(s){const chunk='data: '+JSON.stringify(s)+'\n\n';for(const res of clients)res.write(chunk);}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.md':'text/plain; charset=utf-8'};
const allowed=new Set(['index.html','app.js','domain.js','store.js','styles.css','manifest.webmanifest','icon.svg','sw.js','vendor/qrcode.js']);
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
async function body(req){let content='',size=0;for await(const chunk of req){size+=chunk.length;if(size>5_000_000)throw new Error('Dữ liệu vượt quá 5 MB.');content+=chunk;}return JSON.parse(content||'{}');}
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');
  try {
    const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname);
    if(pathname==='/runtime.js'){res.writeHead(200,{'Content-Type':mime['.js'],'Cache-Control':'no-store'});return res.end('window.SILVER_LOCAL_SERVER = true;');}
    if(pathname.startsWith('/api/')){
      if(req.method==='GET'&&pathname==='/api/state')return json(res,200,read());
      if(req.method==='GET'&&pathname==='/api/events'){
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write('data: '+JSON.stringify(read())+'\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;
      }
      if(req.method!=='POST')return json(res,404,{error:'Không tìm thấy API.'});
      if(req.headers['x-silver-demo']!=='1'||!req.headers['content-type']?.startsWith('application/json'))return json(res,403,{error:'Yêu cầu không hợp lệ.'});
      if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'Chỉ chấp nhận cùng origin.'});
      const input=await body(req);let output;
      db.exec('BEGIN IMMEDIATE');
      try {
        if(pathname==='/api/command'){
          if(typeof input.requestId!=='string'||input.requestId.length>100)throw new Error('Thiếu request ID.');
          const previous=db.prepare('SELECT result FROM requests WHERE id=?').get(input.requestId);
          if(previous)output={state:read(),result:JSON.parse(previous.result)};
          else{output=command(read(),input.type,input.payload,input.actor);write(output.state);db.prepare('INSERT INTO requests(id,result) VALUES(?,?)').run(input.requestId,JSON.stringify(output.result));}
        }else if(pathname==='/api/import'||pathname==='/api/reset'){
          if(pathname==='/api/reset'&&input.confirm!==true)throw new Error('Chưa xác nhận reset.');
          const old=read(),s=pathname==='/api/reset'?seed():validateBackup(input.state);s.revision=old.revision+1;s.updatedAt=Date.now();write(s);db.exec('DELETE FROM requests');output=s;
        }else throw new Error('Không tìm thấy API.');
        db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e;}
      broadcast(output.state||output);return json(res,200,output);
    }
    if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed'});
    const filename=pathname==='/'?'index.html':pathname.slice(1);
    if(!allowed.has(filename))return json(res,404,{error:'Not found'});
    const content=await readFile(path.join(ROOT,filename));res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'text/plain','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:content);
  }catch(e){json(res,400,{error:e.message||'Không thể xử lý yêu cầu.'});}
});
const heartbeat=setInterval(()=>{for(const res of clients)res.write(': keepalive\n\n');},20000);heartbeat.unref();
server.listen(PORT,HOST,()=>{
  console.log(`Silver Nails DEMO: http://localhost:${PORT}`);
  console.log('Demo uses fictional data; roles are previews, not authentication. No real payment/SMS/hardware integration.');
  if(HOST==='0.0.0.0'){for(const values of Object.values(networkInterfaces()))for(const net of values||[])if(net.family==='IPv4'&&!net.internal)console.log(`LAN demo (trusted Wi-Fi only): http://${net.address}:${PORT}`);}
});
function close(){clearInterval(heartbeat);for(const res of clients)res.end();server.close(()=>{db.close();process.exit(0);});}
process.on('SIGTERM',close);process.on('SIGINT',close);
