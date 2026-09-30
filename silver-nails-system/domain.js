// All monetary amounts are integer cents. This module runs unchanged in browser and Node.
export const SCHEMA = 1;
export const TZ = 'America/New_York';
export const uid = (prefix = 'id') => `${prefix}-${globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
export const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
export const day = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
export const minuteNow = (date = new Date()) => { const p = new Intl.DateTimeFormat('en-US', {timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date); return Number(p.find(x=>x.type==='hour').value)*60+Number(p.find(x=>x.type==='minute').value); };
export const addDays = (date, n) => new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export const time = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
export const fromTime = str => { if(!/^\d{2}:\d{2}$/.test(String(str))) return NaN; const [h,m]=str.split(':').map(Number); return h<24&&m<60?h*60+m:NaN; };
export const serviceTotal = items => items.reduce((v,s)=>v+s.price,0);
export const duration = items => items.reduce((v,s)=>v+s.duration,0);
export const active = a => ['booked','waiting','in_service','ready'].includes(a.status);
export function allocateAmount(total,weights) {
  if(!weights.length)return [];
  const sum=weights.reduce((a,b)=>a+b,0);if(!sum)return weights.map((_,i)=>i===0?total:0);
  const values=weights.map(w=>Math.floor(total*w/sum)),remain=total-values.reduce((a,b)=>a+b,0);
  const order=weights.map((w,i)=>({i,r:(total*w)%sum})).sort((a,b)=>b.r-a.r||a.i-b.i);
  for(let i=0;i<remain;i++)values[order[i].i]++;
  return values;
}
const ensure = (condition, message) => { if(!condition) throw new Error(message); };
const text = (s,max=160) => String(s??'').trim().slice(0,max);
const integer = (v,min,max,label='Giá trị') => { v=Number(v); ensure(Number.isSafeInteger(v)&&v>=min&&v<=max,`${label} không hợp lệ.`); return v; };
const byId = (list,id,label='Dữ liệu') => { const x=list.find(i=>i.id===id); ensure(x,`${label} không còn tồn tại. Hãy tải lại.`); return x; };
const phoneKey = v => text(v).replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
const validDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
export function hours(s,date) { const dow=new Date(date+'T12:00:00Z').getUTCDay(); return dow===0?[600,1020]:dow===6?[540,1080]:[s.settings.open,s.settings.close]; }
export function available(s,techId,date,start,len,exclude='') {
  const tech=s.staff.find(t=>t.id===techId); if(!tech?.active) return false;
  return !s.appointments.some(a=>a.id!==exclude&&a.techId===techId&&a.date===date&&active(a)&&start<a.start+a.duration&&start+len>a.start)
    && !s.blocks.some(b=>b.techId===techId&&b.date===date&&start<b.end&&start+len>b.start);
}
export function slots(s,date,items,techId='',exclude='',clock=new Date()) {
  if(!validDate(date)||date<day(clock)||date>addDays(day(clock),60)) return [];
  const len=duration(items),[open,close]=hours(s,date),out=[];
  for(let m=open;m+len<=close;m+=15) {
    if(date===day(clock)&&m<minuteNow(clock)) continue;
    if(s.staff.some(t=>(!techId||t.id===techId)&&available(s,t.id,date,m,len,exclude))) out.push(m);
  } return out;
}
export function turns(s,date=day()) {
  return s.staff.filter(t=>t.active).map(t=>{
    const work=s.appointments.filter(a=>a.techId===t.id&&a.date===date);
    const used=work.filter(a=>a.turnCounted).length;
    const revenue=s.invoices.filter(i=>i.date===date&&!i.refunded).reduce((sum,i)=>{const shares=allocateAmount(i.net,i.items.map(x=>x.price));return sum+i.items.reduce((v,x,n)=>v+(x.techId===t.id?shares[n]:0),0);},0);
    return {...t,used,revenue,busy:work.find(a=>a.status==='in_service')||null};
  }).sort((a,b)=>a.used-b.used||a.lastTurn-b.lastTurn||a.order-b.order);
}
export function nextTech(s,date,start,len,exclude='') { return turns(s,date).find(t=>!t.paused&&!t.busy&&available(s,t.id,date,start,len,exclude)); }
function customer(s,p) {
  const name=text(p.name,80),phone=phoneKey(p.phone),email=text(p.email,150);
  ensure(name.length>=2,'Nhập tên khách (ít nhất 2 ký tự).');
  ensure(phone.length===10,'Nhập số điện thoại Mỹ 10 chữ số.');
  ensure(!email||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Email không hợp lệ.');
  let c=s.customers.find(x=>phoneKey(x.phone)===phone);
  if(!c) {c={id:uid('CUS'),name,phone,email,notes:'',created:Date.now(),consent:false};s.customers.push(c);}
  else {c.name=name;if(email)c.email=email;}
  if(p.consent!==undefined)c.consent=!!p.consent;
  return c;
}
function serviceItems(s,ids,techId) {
  ensure(Array.isArray(ids)&&ids.length>0&&ids.length<=12,'Chọn ít nhất một dịch vụ.');
  ensure(new Set(ids).size===ids.length,'Không chọn dịch vụ trùng lặp.');
  return ids.map(id=>{const x=byId(s.services,id,'Dịch vụ');ensure(x.active,'Dịch vụ đã ngừng nhận.');return {serviceId:x.id,name:x.name,price:x.price,duration:x.duration,techId};});
}
function message(s,c,template,body,channel='SMS') {
  if(!c.consent||!(channel==='SMS'?c.phone:c.email)) return;
  if(!s.settings[template]) return;
  s.messages.unshift({id:uid('MSG'),customerId:c.id,name:c.name,channel,to:channel==='SMS'?c.phone:c.email,body,status:'queued',created:Date.now(),template});
}
function audit(s,action,detail,actor) {s.audit.unshift({id:uid('EVT'),at:Date.now(),action,detail,actor:text(actor||'Quản lý demo',80)});s.audit=s.audit.slice(0,1000);}
export function quote(s,p) {
  const ap=byId(s.appointments,p.appointmentId,'Phiếu dịch vụ');
  const items=ap.items.map(i=>({...i,techId:p.allocations?.[i.serviceId]||i.techId||ap.techId}));
  items.forEach(i=>byId(s.staff,i.techId,'Thợ'));
  const subtotal=serviceTotal(items);
  const discount=integer(p.discount??0,0,subtotal,'Giảm giá'),tip=integer(p.tip??0,0,100000,'Tip');
  const net=subtotal-discount,tax=Math.round(net*s.settings.taxBasisPoints/10000),total=net+tax+tip;
  const code=text(p.giftCode,40).toUpperCase();
  const gift=code?s.giftCards.find(g=>g.code===code):null;
  if(code)ensure(gift&&!gift.voided,'Gift card không tồn tại hoặc đã khóa.');
  const giftUsed=gift?Math.min(gift.balance,total):0;
  ensure(!gift||giftUsed>0,'Gift card đã hết số dư.');
  const method=p.method||'cash';ensure(['cash','card'].includes(method),'Phương thức không hợp lệ.');
  const due=total-giftUsed,paid=method==='cash'?integer(p.cashReceived??due,0,10000000,'Tiền khách đưa'):due;
  ensure(paid>=due,'Tiền khách đưa chưa đủ.');
  return {items,subtotal,discount,net,tax,tip,total,giftUsed,giftCode:gift?.code||'',method,due,cashReceived:paid,change:paid-due};
}
export function stats(s,from=day(),to=from) {
  const invoices=s.invoices.filter(i=>i.date>=from&&i.date<=to&&!i.refunded);
  return {count:invoices.length,net:invoices.reduce((a,i)=>a+i.net,0),tips:invoices.reduce((a,i)=>a+i.tip,0),tax:invoices.reduce((a,i)=>a+i.tax,0),total:invoices.reduce((a,i)=>a+i.total,0),cash:invoices.filter(i=>i.method==='cash').reduce((a,i)=>a+i.due,0),card:invoices.filter(i=>i.method==='card').reduce((a,i)=>a+i.due,0),gift:invoices.reduce((a,i)=>a+i.giftUsed,0),giftSales:s.giftCards.flatMap(g=>g.ledger).filter(l=>l.date>=from&&l.date<=to&&l.kind==='sale').reduce((a,l)=>a+l.amount,0)};
}
export function command(current,type,p={},actor='Quản lý demo',clock=new Date()) {
  const s=structuredClone(current),today=day(clock);let result={};
  ensure(s.schema===SCHEMA,'Phiên bản dữ liệu không tương thích.');
  switch(type) {
    case 'book': case 'walkin': {
      const c=customer(s,p),date=type==='walkin'?today:p.date;
      ensure(validDate(date)&&date>=today&&date<=addDays(today,60),'Chọn ngày trong 60 ngày tới.');
      const start=type==='walkin'?Math.ceil(minuteNow(clock)/5)*5:integer(p.start,0,1439,'Giờ hẹn');
      const items=serviceItems(s,p.serviceIds,p.techId||''),len=duration(items),[open,close]=hours(s,date);
      if(type==='book')ensure(start>=open&&start+len<=close&&(date!==today||start>=minuteNow(clock)),'Giờ hẹn nằm ngoài giờ mở cửa hoặc đã qua.');
      let techId=p.techId||'';
      if(type==='book') {
        if(techId)ensure(available(s,techId,date,start,len),'Thợ đã có lịch trong khoảng giờ này.');
        else {techId=s.staff.find(t=>available(s,t.id,date,start,len))?.id;ensure(techId,'Không còn thợ trống. Chọn giờ khác.');}
      } else if(techId)ensure(s.staff.some(t=>t.id===techId&&t.active),'Thợ không còn hoạt động.');
      items.forEach(i=>i.techId=techId);
      const a={id:uid('APT'),customerId:c.id,date,start,duration:len,items,techId,requested:!!p.techId,status:type==='walkin'?'waiting':'booked',notes:text(p.notes,500),created:Date.now(),checkedAt:type==='walkin'?Date.now():null,turnCounted:false};
      s.appointments.push(a);result={id:a.id};
      message(s,c,'bookingMessages',`Hi ${c.name}, demo appointment ${a.id} at Silver Nails: ${date} ${time(start)}. Services: ${items.map(i=>i.name).join(', ')}. Demo only.`);
      audit(s,type==='walkin'?'Check-in walk-in':'Tạo lịch hẹn',`${c.name} · ${date} ${time(start)}`,actor);break;
    }
    case 'reschedule': {
      const a=byId(s.appointments,p.id);ensure(a.status==='booked','Chỉ đổi lịch chưa check-in.');
      ensure(validDate(p.date)&&p.date>=today&&p.date<=addDays(today,60),'Ngày hẹn không hợp lệ.');
      const start=integer(p.start,0,1439),[open,close]=hours(s,p.date),techId=p.techId||a.techId;
      ensure(start>=open&&start+a.duration<=close&&(p.date!==today||start>=minuteNow(clock)),'Giờ hẹn không hợp lệ.');
      ensure(available(s,techId,p.date,start,a.duration,a.id),'Thợ đã có lịch trong khoảng giờ này.');
      Object.assign(a,{date:p.date,start,techId});a.items.forEach(i=>i.techId=techId);
      audit(s,'Đổi lịch',a.id,actor);break;
    }
    case 'checkin': {
      const a=byId(s.appointments,p.id);ensure(a.status==='booked','Lịch này không thể check-in.');ensure(a.date===today,'Chỉ check-in lịch hôm nay.');
      a.status='waiting';a.checkedAt=Date.now();audit(s,'Check-in lịch hẹn',a.id,actor);break;
    }
    case 'start': {
      const a=byId(s.appointments,p.id);ensure(a.status==='waiting','Khách không ở hàng chờ.');ensure(a.date===today,'Phiếu không thuộc hôm nay.');
      const start=minuteNow(clock),techId=p.techId||a.techId||nextTech(s,today,start,a.duration,a.id)?.id;
      ensure(techId,'Chưa có thợ trống phù hợp.');
      const t=byId(s.staff,techId,'Thợ');ensure(t.active&&!t.paused,'Thợ đang nghỉ hoặc không hoạt động.');
      ensure(!s.appointments.some(x=>x.id!==a.id&&x.techId===techId&&x.status==='in_service'),'Thợ đang phục vụ khách khác.');
      ensure(available(s,techId,today,start,a.duration,a.id),'Dịch vụ này trùng lịch của thợ. Hãy chọn thợ khác.');
      Object.assign(a,{techId,start,status:'in_service',startedAt:Date.now(),turnCounted:!a.requested||s.settings.countRequestedTurns});
      a.items.forEach(i=>i.techId=techId);t.lastTurn=Date.now();
      audit(s,'Bắt đầu dịch vụ',`${a.id} → ${t.name}`,actor);break;
    }
    case 'finish': {
      const a=byId(s.appointments,p.id);ensure(a.status==='in_service','Phiếu chưa bắt đầu.');a.status='ready';a.finishedAt=Date.now();audit(s,'Chờ thanh toán',a.id,actor);break;
    }
    case 'cancel': case 'noshow': {
      const a=byId(s.appointments,p.id);ensure(['booked','waiting'].includes(a.status),'Chỉ hủy lịch chưa bắt đầu.');
      a.status=type==='cancel'?'cancelled':'no_show';audit(s,type==='cancel'?'Hủy lịch':'Khách không đến',a.id,actor);break;
    }
    case 'checkout': {
      const a=byId(s.appointments,p.appointmentId);ensure(a.status==='ready','Phiếu chưa sẵn sàng hoặc đã thanh toán.');
      const q=quote(s,p),c=byId(s.customers,a.customerId);
      const invoice={id:uid('INV'),appointmentId:a.id,customerId:c.id,customerName:c.name,date:today,created:Date.now(),...q,refunded:false,commissionRate:s.settings.commissionRate};
      if(q.giftUsed){const g=s.giftCards.find(g=>g.code===q.giftCode);g.balance-=q.giftUsed;g.ledger.push({kind:'redeem',amount:-q.giftUsed,date:today,at:Date.now(),invoiceId:invoice.id});}
      s.invoices.unshift(invoice);a.status='completed';a.invoiceId=invoice.id;a.items=q.items;result={id:invoice.id};
      if(q.method==='cash'&&q.due>0)s.devices.unshift({id:uid('DEV'),at:Date.now(),kind:'drawer',detail:`Mô phỏng mở két · ${invoice.id}`});
      message(s,c,'receiptMessages',`Silver Nails DEMO receipt ${invoice.id}: ${money(q.total)}. Thank you, ${c.name}!`,'Email');
      message(s,c,'followupMessages',`Hi ${c.name}, thank you for visiting Silver Nails. How was your visit? This is a demo preview.`);
      audit(s,'Thanh toán mô phỏng',`${invoice.id} · ${money(q.total)}`,actor);break;
    }
    case 'refund': {
      const i=byId(s.invoices,p.id);ensure(!i.refunded,'Hóa đơn đã hoàn tiền.');ensure(text(p.reason).length>=3,'Nhập lý do hoàn tiền.');
      i.refunded=true;i.refundAt=Date.now();i.refundReason=text(p.reason);i.refundDate=today;
      if(i.giftUsed){const g=s.giftCards.find(g=>g.code===i.giftCode);ensure(g,'Không tìm được gift card gốc.');g.balance+=i.giftUsed;g.ledger.push({kind:'refund',amount:i.giftUsed,date:today,at:Date.now(),invoiceId:i.id});}
      audit(s,'Hoàn toàn bộ hóa đơn (demo)',`${i.id} · ${text(p.reason)}`,actor);break;
    }
    case 'giftSell': {
      const amount=integer(p.amount,500,200000,'Mệnh giá');const recipient=text(p.recipient,80);ensure(recipient.length>=2,'Nhập tên người nhận.');
      let code;do {code='SN-'+uid('').slice(1,5)+'-'+uid('').slice(1,5);} while(s.giftCards.some(g=>g.code===code));
      const g={id:uid('GC'),code,recipient,balance:amount,initial:amount,created:Date.now(),voided:false,ledger:[{kind:'sale',amount,date:today,at:Date.now(),method:['card','cash'].includes(p.method)?p.method:'cash'}]};
      s.giftCards.unshift(g);result={id:g.id,code};audit(s,'Bán gift card (demo)',`${code} · ${money(amount)}`,actor);break;
    }
    case 'giftToggle': {const g=byId(s.giftCards,p.id);g.voided=!g.voided;audit(s,g.voided?'Khóa gift card':'Mở gift card',g.code,actor);break;}
    case 'staffPause': {const t=byId(s.staff,p.id);ensure(!s.appointments.some(a=>a.techId===t.id&&a.status==='in_service'),'Hoàn tất khách hiện tại trước khi nghỉ.');t.paused=!t.paused;audit(s,t.paused?'Thợ nghỉ':'Thợ sẵn sàng',t.name,actor);break;}
    case 'staffSave': {const name=text(p.name,50);ensure(name.length>=2,'Nhập tên thợ.');if(p.id)byId(s.staff,p.id).name=name;else s.staff.push({id:uid('TECH'),name,initials:name.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase(),color:['purple','mint','peach','blue'][s.staff.length%4],active:true,paused:false,lastTurn:0,order:s.staff.length});audit(s,'Cập nhật thợ',name,actor);break;}
    case 'block': {
      const t=byId(s.staff,p.techId);ensure(validDate(p.date),'Ngày không hợp lệ.');const start=integer(p.start,0,1439),end=integer(p.end,1,1440);ensure(end>start,'Giờ kết thúc phải sau giờ bắt đầu.');
      ensure(available(s,t.id,p.date,start,end-start),'Khoảng giờ đã có lịch hoặc đang bị chặn.');
      s.blocks.push({id:uid('BLK'),techId:t.id,date:p.date,start,end,reason:text(p.reason)||'Nghỉ / bận'});audit(s,'Chặn giờ thợ',`${t.name} · ${p.date}`,actor);break;
    }
    case 'unblock': {byId(s.blocks,p.id);s.blocks=s.blocks.filter(b=>b.id!==p.id);audit(s,'Mở lại giờ',p.id,actor);break;}
    case 'customerSave': {const c=p.id?byId(s.customers,p.id):customer(s,p);if(p.id){const updated=customer(s,{...p,phone:c.phone});ensure(updated.id===c.id,'Số điện thoại bị trùng.');}c.notes=text(p.notes,1000);c.consent=!!p.consent;audit(s,'Cập nhật hồ sơ khách',c.name,actor);break;}
    case 'serviceSave': {
      const name=text(p.name,80);ensure(name.length>=2,'Nhập tên dịch vụ.');const fields={name,price:integer(p.price,0,200000),duration:integer(p.duration,5,480),category:['Hands','Feet','Enhancements','Extras'].includes(p.category)?p.category:'Extras',active:p.active!==false};
      if(p.id)Object.assign(byId(s.services,p.id),fields);else s.services.push({id:uid('SVC'),...fields});audit(s,'Cập nhật menu',name,actor);break;
    }
    case 'inventoryAdjust': {const x=byId(s.inventory,p.id);const delta=integer(p.delta,-10000,10000);ensure(x.stock+delta>=0,'Tồn kho không thể âm.');ensure(text(p.reason).length>=2,'Nhập lý do điều chỉnh.');x.stock+=delta;s.stockLog.unshift({id:uid('STK'),itemId:x.id,delta,reason:text(p.reason),at:Date.now()});audit(s,'Điều chỉnh tồn kho',`${x.name} ${delta>0?'+':''}${delta}`,actor);break;}
    case 'messageSimulate': {let n=0;s.messages.forEach(m=>{if(m.status==='queued'){m.status='simulated';m.processedAt=Date.now();n++;}});audit(s,'Mô phỏng gửi tin',`${n} tin · không gửi ra ngoài`,actor);break;}
    case 'reminders': {
      let n=0;s.appointments.filter(a=>a.status==='booked'&&a.date===addDays(today,1)).forEach(a=>{const key=`remind-${a.id}-${a.date}-${a.start}`;if(s.reminderKeys.includes(key))return;const c=byId(s.customers,a.customerId);if(c.consent&&s.settings.reminderMessages){message(s,c,'reminderMessages',`Hi ${c.name}, a demo reminder: your Silver Nails visit is tomorrow at ${time(a.start)}.`);s.reminderKeys.push(key);n++;}});result={count:n};audit(s,'Tạo nhắc hẹn demo',`${n} tin`,actor);break;
    }
    case 'settings': {
      const taxBasisPoints=integer(p.taxBasisPoints,0,2500,'Thuế mẫu'),commissionRate=integer(p.commissionRate,0,100,'Hoa hồng'),open=integer(p.open,0,1439),close=integer(p.close,1,1440);ensure(close>open,'Giờ đóng phải sau giờ mở.');
      Object.assign(s.settings,{taxBasisPoints,commissionRate,open,close,countRequestedTurns:!!p.countRequestedTurns,bookingMessages:!!p.bookingMessages,receiptMessages:!!p.receiptMessages,followupMessages:!!p.followupMessages,reminderMessages:!!p.reminderMessages});audit(s,'Cập nhật cài đặt','Quy tắc vận hành demo',actor);break;
    }
    case 'device': {ensure(['printer','drawer','scanner'].includes(p.kind),'Thiết bị không hợp lệ.');s.devices.unshift({id:uid('DEV'),at:Date.now(),kind:p.kind,detail:text(p.detail)||'Kiểm tra thiết bị mô phỏng'});audit(s,'Kiểm tra thiết bị',`${p.kind} · mô phỏng`,actor);break;}
    default: throw new Error('Thao tác không được hỗ trợ.');
  }
  s.revision++;s.updatedAt=Date.now();return {state:s,result};
}
export function validateBackup(s) {
  ensure(s&&s.schema===SCHEMA&&Number.isSafeInteger(s.revision),'File không phải backup Silver Nails v1.');
  for(const key of ['staff','services','customers','appointments','invoices','giftCards','inventory','stockLog','messages','blocks','devices','audit','reminderKeys'])ensure(Array.isArray(s[key])&&s[key].length<=50000,`Backup thiếu hoặc sai ${key}.`);
  ensure(s.settings&&typeof s.settings==='object','Backup thiếu cài đặt.');
  integer(s.settings.taxBasisPoints,0,2500);integer(s.settings.commissionRate,0,100);integer(s.settings.open,0,1439);integer(s.settings.close,1,1440);
  const unique=(items)=>{const ids=items.map(x=>x?.id);ensure(ids.every(x=>typeof x==='string'&&/^[A-Za-z0-9-]{1,80}$/.test(x))&&new Set(ids).size===ids.length,'ID bị trùng hoặc không hợp lệ.');};
  ['staff','services','customers','appointments','invoices','giftCards','inventory','messages','blocks'].forEach(k=>unique(s[k]));
  s.staff.forEach(t=>{ensure(typeof t.name==='string'&&typeof t.active==='boolean'&&typeof t.paused==='boolean'&&['purple','mint','peach','blue'].includes(t.color),'Thợ không hợp lệ.');integer(t.order,0,10000);integer(t.lastTurn,0,8640000000000000);});
  s.services.forEach(x=>{ensure(typeof x.name==='string','Dịch vụ sai.');integer(x.price,0,200000);integer(x.duration,5,480);});
  s.customers.forEach(c=>ensure(typeof c.name==='string'&&typeof c.phone==='string','Khách không hợp lệ.'));
  s.appointments.forEach(a=>{byId(s.customers,a.customerId);ensure(validDate(a.date)&&['booked','waiting','in_service','ready','completed','cancelled','no_show'].includes(a.status),'Lịch hẹn sai.');integer(a.start,0,1440);integer(a.duration,5,5760);ensure(Array.isArray(a.items)&&a.items.length>0,'Phiếu thiếu dịch vụ.');a.items.forEach(i=>{integer(i.price,0,200000);integer(i.duration,5,480);ensure(typeof i.name==='string','Dịch vụ sai.');});if(a.techId)byId(s.staff,a.techId);});
  s.invoices.forEach(i=>{byId(s.appointments,i.appointmentId);byId(s.customers,i.customerId);ensure(validDate(i.date)&&Array.isArray(i.items)&&i.items.length>0&&['cash','card'].includes(i.method)&&typeof i.customerName==='string'&&typeof i.refunded==='boolean','Hóa đơn sai.');for(const k of ['subtotal','discount','net','tax','tip','total','giftUsed','due','cashReceived','change'])integer(i[k],0,10000000);integer(i.created,0,8640000000000000);integer(i.commissionRate,0,100);i.items.forEach(x=>{byId(s.staff,x.techId);integer(x.price,0,200000);ensure(typeof x.name==='string','Dịch vụ sai.');});ensure(i.total===i.net+i.tax+i.tip&&i.total===i.giftUsed+i.due&&i.net===i.subtotal-i.discount&&serviceTotal(i.items)===i.subtotal,'Tổng hóa đơn không khớp.');});
  const codes=s.giftCards.map(g=>g.code);ensure(new Set(codes).size===codes.length,'Mã gift card trùng.');s.giftCards.forEach(g=>{ensure(/^SN-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(g.code)&&Array.isArray(g.ledger),'Gift card sai.');integer(g.balance,0,10000000);ensure(g.ledger.reduce((a,l)=>a+integer(l.amount,-10000000,10000000),0)===g.balance,'Số dư gift card không khớp nhật ký.');});
  s.inventory.forEach(x=>{integer(x.stock,0,10000000);integer(x.min,0,10000000);ensure(typeof x.name==='string'&&typeof x.unit==='string','Vật tư sai.');});
  s.blocks.forEach(b=>{byId(s.staff,b.techId);ensure(validDate(b.date),'Ngày chặn sai.');integer(b.start,0,1439);integer(b.end,b.start+1,1440);});
  s.messages.forEach(m=>{integer(m.created,0,8640000000000000);ensure(['queued','simulated'].includes(m.status)&&['SMS','Email'].includes(m.channel)&&typeof m.body==='string','Tin nhắn sai.');});
  s.audit.forEach(x=>integer(x.at,0,8640000000000000));s.devices.forEach(x=>integer(x.at,0,8640000000000000));s.stockLog.forEach(x=>{byId(s.inventory,x.itemId);integer(x.at,0,8640000000000000);integer(x.delta,-10000,10000);});
  return structuredClone(s);
}
export function seed(clock=new Date()) {
  const today=day(clock),now=minuteNow(clock);
  const s={schema:SCHEMA,revision:0,updatedAt:Date.now(),settings:{taxBasisPoints:0,commissionRate:60,open:540,close:1140,countRequestedTurns:false,bookingMessages:true,receiptMessages:true,followupMessages:false,reminderMessages:true},staff:[],services:[],customers:[],appointments:[],invoices:[],giftCards:[],inventory:[],stockLog:[],messages:[],blocks:[],devices:[],audit:[],reminderKeys:[]};
  s.staff=[['Linh','LN','purple'],['Emma','EM','mint'],['Alex','AL','peach'],['Mia','MI','blue']].map(([name,initials,color],order)=>({id:`T${order+1}`,name,initials,color,order,active:true,paused:order===3,lastTurn:0}));
  s.services=[['S1','Classic Manicure','Hands',2500,30],['S2','Gel Manicure','Hands',4000,45],['S3','Signature Pedicure','Feet',4500,45],['S4','Deluxe Spa Pedicure','Feet',6500,60],['S5','Acrylic Full Set','Enhancements',6000,75],['S6','Acrylic Fill','Enhancements',4500,60],['S7','Nail Art','Extras',1500,15],['S8','Gel Removal','Extras',1000,15]].map(([id,name,category,price,duration])=>({id,name,category,price,duration,active:true}));
  s.customers=['Olivia Parker','Charlotte Lee','Amelia Davis','Sophia Wilson','Isabella Reed','Ava Brooks','Emily Carter','Chloe Nguyen'].map((name,i)=>({id:`C${i+1}`,name,phone:`33055501${String(i+10).padStart(2,'0')}`,email:`guest${i+1}@example.com`,notes:i===1?'Thích dáng almond, màu nude. Dữ liệu mẫu.':'',consent:i<6,created:Date.now()-i*86400000}));
  const makeAp=(id,ci,techId,status,start,date,ids)=>({id,customerId:`C${ci}`,techId,status,start,date,items:serviceItems(s,ids,techId),duration:duration(serviceItems(s,ids,techId)),notes:'Dữ liệu mẫu để trải nghiệm.',requested:false,created:Date.now(),checkedAt:Date.now()-600000,turnCounted:['ready','in_service','completed'].includes(status)});
  s.appointments.push(makeAp('APT-DEMO-01',1,'','waiting',now,today,['S2','S3']),makeAp('APT-DEMO-02',2,'','waiting',now,today,['S5']),makeAp('APT-DEMO-03',3,'T2','in_service',Math.max(0,now-15),today,['S4']),makeAp('APT-DEMO-04',4,'T3','ready',Math.max(0,now-60),today,['S2','S7']));
  for(let i=0;i<4;i++)s.appointments.push(makeAp(`APT-NEXT-0${i+1}`,i+5,`T${i+1}`,'booked',600+i*60,addDays(today,1),[['S1'],['S2','S3'],['S5'],['S4']][i]));
  for(let d=6;d>=0;d--)for(let j=0;j<3;j++){
    const date=addDays(today,-d),a=makeAp(`APT-HIST-${d}-${j}`,j+1,`T${j+1}`,'completed',540+j*75,date,[['S2'],['S3'],['S5']][(d+j)%3]);s.appointments.push(a);
    const subtotal=serviceTotal(a.items),tip=(j+1)*500,id=`INV-DEMO-${d}-${j}`;a.invoiceId=id;
    s.invoices.push({id,appointmentId:a.id,customerId:a.customerId,customerName:s.customers.find(c=>c.id===a.customerId).name,date,created:Date.parse(date+'T15:00:00Z'),items:a.items,subtotal,discount:0,net:subtotal,tax:0,tip,total:subtotal+tip,giftUsed:0,giftCode:'',method:j===0?'cash':'card',due:subtotal+tip,cashReceived:subtotal+tip,change:0,refunded:false,commissionRate:60});
  }
  s.giftCards=[{id:'GC-DEMO',code:'SN-DEMO-0100',recipient:'Taylor · mẫu',balance:10000,initial:10000,created:Date.now(),voided:false,ledger:[{kind:'sale',amount:10000,date:today,at:Date.now(),method:'card'}]}];
  s.inventory=[['I1','OPI Gel · Bubble Bath','chai',12,5],['I2','Acetone','bình',3,4],['I3','Nail file 180/240','chiếc',42,20],['I4','Disposable liners','hộp',2,5],['I5','Top coat','chai',8,4]].map(([id,name,unit,stock,min])=>({id,name,unit,stock,min}));
  s.messages=[{id:'MSG-DEMO',customerId:'C5',name:'Isabella Reed',channel:'SMS',to:'3305550114',body:'Hi Isabella, your demo appointment at Silver Nails is tomorrow at 10:00. We look forward to seeing you!',status:'queued',created:Date.now(),template:'reminderMessages'}];
  audit(s,'Khởi tạo demo','Tên khách, thợ, dịch vụ, giá và doanh thu đều là dữ liệu mẫu.','Hệ thống');return s;
}
