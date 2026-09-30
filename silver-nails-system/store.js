import {seed, command, validateBackup} from './domain.js';
export class Store extends EventTarget {
  state=null; mode=window.SILVER_LOCAL_SERVER?'server':'browser'; connected=true;
  async init() {
    if(this.mode==='server') {
      this.state=await this.request('state');
      this.events=new EventSource('./api/events');
      this.events.onmessage=e=>{this.connected=true;this.accept(JSON.parse(e.data));};
      this.events.onerror=()=>{this.connected=false;this.dispatchEvent(new Event('change'));};
      this.events.onopen=()=>{this.connected=true;this.dispatchEvent(new Event('change'));};
    } else {
      this.db=await new Promise((resolve,reject)=>{const r=indexedDB.open('silver-nails-system-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      this.state=await this.transaction(old=>({state:old||seed(),result:{}}));
      if('BroadcastChannel' in window){this.channel=new BroadcastChannel('silver-nails-system-v1');this.channel.onmessage=()=>this.refresh();}
      window.addEventListener('storage',e=>{if(e.key==='silver-nails-refresh')this.refresh();});
      window.addEventListener('focus',()=>this.refresh());
    }
    return this.state;
  }
  accept(s) {if(!this.state||s.revision>=this.state.revision){this.state=s;this.dispatchEvent(new Event('change'));}}
  async refresh() {
    if(this.mode!=='browser')return;
    const s=await new Promise((resolve,reject)=>{const r=this.db.transaction('state').objectStore('state').get('main');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});if(s)this.accept(s);
  }
  transaction(fn) {
    return new Promise((resolve,reject)=>{
      const tx=this.db.transaction('state','readwrite'),os=tx.objectStore('state');let next,reason;
      const read=os.get('main');read.onsuccess=()=>{try{next=fn(read.result);os.put(next.state,'main');}catch(e){reason=e;tx.abort();}};
      tx.oncomplete=()=>{this.lastResult=next.result;resolve(next.state);};tx.onerror=()=>reject(reason||tx.error||new Error('Không lưu được dữ liệu.'));tx.onabort=()=>reject(reason||new Error('Không lưu được dữ liệu.'));
    });
  }
  notify() {this.channel?.postMessage({revision:this.state.revision});try{localStorage.setItem('silver-nails-refresh',String(Date.now()));}catch{}this.dispatchEvent(new Event('change'));}
  async request(path,body) {
    let response;
    try{response=await fetch('./api/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-Silver-Demo':'1'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000),cache:'no-store'});}catch{throw new Error('Không liên lạc được máy chủ local. Hãy kiểm tra máy chủ và tải lại; dữ liệu chưa được xác nhận.');}
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Máy chủ từ chối thao tác.');return data;
  }
  async run(type,payload={},actor) {
    let result;
    if(this.mode==='server') {
      const body={type,payload,actor,requestId:crypto.randomUUID()};let r;
      try{r=await this.request('command',body);}catch(e){if(e.message.includes('chưa được xác nhận'))r=await this.request('command',body);else throw e;}
      this.accept(r.state);result=r.result;
    }else{this.state=await this.transaction(old=>command(old,type,payload,actor));result=this.lastResult;this.notify();}
    return result;
  }
  async replace(data,reset=false) {
    if(this.mode==='server'){const r=await this.request(reset?'reset':'import',reset?{confirm:true}:{state:validateBackup(data)});this.accept(r);}
    else{this.state=await this.transaction(old=>{const s=reset?seed():validateBackup(data);s.revision=(old?.revision||0)+1;s.updatedAt=Date.now();return {state:s,result:{}};});this.notify();}
  }
}
