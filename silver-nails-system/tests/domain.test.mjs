import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,command,day,addDays,minuteNow,available,slots,turns,quote,stats,validateBackup,allocateAmount} from '../domain.js';
const clock=new Date('2026-09-30T15:00:00Z');
const run=(s,type,p={})=>command(s,type,p,'Test',clock);
const booking={name:'Test Guest',phone:'3305550188',email:'test@example.com',consent:true,date:'2026-10-02',start:600,techId:'T1',serviceIds:['S2','S3']};

test('seed is valid and salon dates respect Eastern time / DST',()=>{
  assert.equal(day(new Date('2026-10-01T01:00:00Z')),'2026-09-30');
  assert.equal(minuteNow(new Date('2026-07-01T15:00:00Z')),660);
  assert.equal(minuteNow(new Date('2026-12-01T15:00:00Z')),600);
  assert.equal(validateBackup(seed(clock)).schema,1);
});
test('booking snapshots service prices, creates one customer and queued consented confirmation',()=>{
  const s=seed(clock),{state,result}=run(s,'book',booking),a=state.appointments.find(x=>x.id===result.id);
  assert.equal(s.appointments.length+1,state.appointments.length);assert.equal(a.duration,90);
  assert.equal(a.items.reduce((v,x)=>v+x.price,0),8500);assert.equal(a.status,'booked');
  assert.equal(state.messages[0].to,booking.phone);assert.equal(state.messages[0].status,'queued');
  const changed=run(state,'serviceSave',{id:'S2',name:'New gel',price:5000,duration:60,category:'Hands',active:true}).state;
  assert.equal(changed.appointments.find(x=>x.id===result.id).items[0].price,4000);
});
test('overlapping appointments rejected, exact ending boundary allowed, other staff allowed',()=>{
  const s=run(seed(clock),'book',booking).state;
  assert.throws(()=>run(s,'book',{...booking,start:630}),/đã có lịch/);
  assert.throws(()=>run(s,'book',{...booking,start:570}),/đã có lịch/);
  assert.doesNotThrow(()=>run(s,'book',{...booking,start:690}));
  assert.doesNotThrow(()=>run(s,'book',{...booking,start:600,techId:'T2'}));
});
test('invalid booking dates, hours, phone, no services and duplicate services rejected',()=>{
  for(const patch of [{date:'2026-09-29'},{date:'2026-02-31'},{date:'2027-01-01'},{start:520},{start:1100},{phone:'123'},{serviceIds:[]},{serviceIds:['S1','S1']}])assert.throws(()=>run(seed(clock),'book',{...booking,...patch}));
});
test('concurrent consumers reread the updated state and cannot book same slot',()=>{
  let current=seed(clock),accepted=0;for(let n=0;n<2;n++){try{current=run(current,'book',booking).state;accepted++;}catch{}}
  assert.equal(accepted,1);
});
test('reschedule excludes its own old reservation, frees old slot and retains ID',()=>{
  const {state,result}=run(seed(clock),'book',booking);const updated=run(state,'reschedule',{id:result.id,date:booking.date,start:630,techId:'T1'}).state;
  assert.equal(updated.appointments.find(x=>x.id===result.id).start,630);
  assert.equal(available(updated,'T1',booking.date,600,30),true);
});
test('cancel frees slot; future appointments cannot check in',()=>{
  const {state,result}=run(seed(clock),'book',booking);
  assert.throws(()=>run(state,'checkin',{id:result.id}),/hôm nay/);
  const cancelled=run(state,'cancel',{id:result.id}).state;assert.equal(available(cancelled,'T1',booking.date,600,90),true);
});
test('blocked time prevents booking and supports removal',()=>{
  const s=run(seed(clock),'block',{techId:'T1',date:booking.date,start:600,end:660,reason:'Break'}).state;
  assert.throws(()=>run(s,'book',booking),/đã có lịch/);assert(!slots(s,booking.date,[s.services[0]],'T1', '',clock).includes(630));
  assert.doesNotThrow(()=>run(run(s,'unblock',{id:s.blocks[0].id}).state,'book',booking));
});
test('walkin → automatic turn → finish → checkout → completed',()=>{
  let {state:s,result:r}=run(seed(clock),'walkin',{...booking,techId:'',serviceIds:['S1']});
  s=run(s,'start',{id:r.id}).state;let a=s.appointments.find(x=>x.id===r.id);assert.equal(a.status,'in_service');assert.equal(a.techId,'T1');assert.equal(a.turnCounted,true);
  assert.throws(()=>run(s,'staffPause',{id:'T1'}),/Hoàn tất/);
  s=run(s,'finish',{id:r.id}).state;s=run(s,'checkout',{appointmentId:r.id,method:'cash',cashReceived:3000,tip:500}).state;
  assert.equal(s.appointments.find(x=>x.id===r.id).status,'completed');assert.equal(s.invoices[0].total,3000);assert.equal(s.devices[0].kind,'drawer');
});
test('requested customer does not count turn by default; cannot start with busy or paused staff',()=>{
  const {state:s,result:r}=run(seed(clock),'walkin',{...booking,techId:'T1',serviceIds:['S1']});
  const next=run(s,'start',{id:r.id}).state;assert.equal(next.appointments.find(x=>x.id===r.id).turnCounted,false);
  assert.throws(()=>run(s,'start',{id:r.id,techId:'T2'}),/phục vụ/);
  assert.throws(()=>run(s,'start',{id:r.id,techId:'T4'}),/đang nghỉ/);
});
test('cannot finish twice, check out before ready or cancel after service starts',()=>{
  const s=seed(clock);assert.throws(()=>run(s,'checkout',{appointmentId:'APT-DEMO-03'}),/chưa sẵn sàng/);
  assert.throws(()=>run(s,'cancel',{id:'APT-DEMO-03'}),/chưa bắt đầu/);
  assert.throws(()=>run(run(s,'finish',{id:'APT-DEMO-03'}).state,'finish',{id:'APT-DEMO-03'}),/chưa bắt đầu/);
});
test('money is rounded in cents; insufficient cash and excessive discounts rejected',()=>{
  const s=seed(clock);s.settings.taxBasisPoints=725;const p={appointmentId:'APT-DEMO-04',discount:501,tip:1001,method:'cash',cashReceived:10000};const q=quote(s,p);
  assert.equal(q.subtotal,5500);assert.equal(q.net,4999);assert.equal(q.tax,362);assert.equal(q.total,6362);assert.equal(q.change,3638);
  assert.throws(()=>quote(s,{...p,cashReceived:1}),/chưa đủ/);assert.throws(()=>quote(s,{...p,discount:5501}));assert.throws(()=>quote(s,{...p,tip:NaN}));
});
test('gift card partial balance + cash split, ledger and duplicate checkout prevention',()=>{
  let s=seed(clock);s.giftCards[0].balance=3000;s.giftCards[0].initial=3000;s.giftCards[0].ledger[0].amount=3000;
  const {state,result}=run(s,'checkout',{appointmentId:'APT-DEMO-04',giftCode:'SN-DEMO-0100',tip:500,method:'cash',cashReceived:4000});
  const i=state.invoices[0];assert.equal(i.giftUsed,3000);assert.equal(i.due,3000);assert.equal(i.change,1000);assert.equal(state.giftCards[0].balance,0);
  assert.throws(()=>run(state,'checkout',{appointmentId:'APT-DEMO-04'}),/đã thanh toán/);assert.equal(state.invoices[0].id,result.id);assert.doesNotThrow(()=>validateBackup(state));
});
test('failed checkout leaves original state and gift balance unchanged',()=>{
  const s=seed(clock),before=JSON.stringify(s);assert.throws(()=>run(s,'checkout',{appointmentId:'APT-DEMO-04',giftCode:'SN-MISS-0000'}));assert.equal(JSON.stringify(s),before);
});
test('refund restores gift balance only once and removes invoice from service totals',()=>{
  const initial=seed(clock),base=stats(initial,day(clock));const {state:s,result}=run(initial,'checkout',{appointmentId:'APT-DEMO-04',giftCode:'SN-DEMO-0100',tip:500});
  assert.equal(s.giftCards[0].balance,4000);const refunded=run(s,'refund',{id:result.id,reason:'Test refund'}).state;
  assert.equal(refunded.giftCards[0].balance,10000);assert.equal(stats(refunded,day(clock)).net,base.net);
  assert.throws(()=>run(refunded,'refund',{id:result.id,reason:'Again'}),/đã hoàn/);assert.doesNotThrow(()=>validateBackup(refunded));
});
test('new gift card unique QR code and sale total separate from services; locking prevents redemption',()=>{
  const initial=seed(clock),net=stats(initial,day(clock)).net,{state,result}=run(initial,'giftSell',{recipient:'Test Recipient',amount:12345,method:'cash'});
  assert.match(result.code,/^SN-[A-Z0-9]{4}-[A-Z0-9]{4}$/);assert.equal(stats(state,day(clock)).net,net);assert.equal(stats(state,day(clock)).giftSales,22345);
  const locked=run(state,'giftToggle',{id:result.id}).state;assert.throws(()=>quote(locked,{appointmentId:'APT-DEMO-04',giftCode:result.code}),/đã khóa/);
});
test('opted-out customer does not get queued messages; reminders deduplicated',()=>{
  const s=seed(clock),no=run(s,'book',{...booking,consent:false}).state;assert.equal(no.messages.length,s.messages.length);
  const once=run(no,'reminders').state,twice=run(once,'reminders').state;assert.equal(twice.messages.length,once.messages.length);
  const processed=run(once,'messageSimulate').state;assert(processed.messages.every(m=>m.status==='simulated'));
});
test('inventory cannot go negative and adjustments are recorded',()=>{
  const s=seed(clock);assert.throws(()=>run(s,'inventoryAdjust',{id:'I2',delta:-4,reason:'Use'}),/âm/);
  const next=run(s,'inventoryAdjust',{id:'I2',delta:5,reason:'Restock'}).state;assert.equal(next.inventory[1].stock,8);assert.equal(next.stockLog[0].delta,5);
});
test('backup validation rejects invalid IDs, unsafe styles, ledger mismatch and totals corruption',()=>{
  const original=seed(clock);assert.doesNotThrow(()=>validateBackup(original));
  for(const mutate of [s=>s.staff[0].color='" onload="alert(1)',s=>s.staff[0].id='bad"id',s=>s.giftCards[0].balance++,s=>s.invoices[0].total++,s=>s.appointments[0].customerId='missing',s=>s.devices.push({at:'no'})]){const s=structuredClone(original);mutate(s);assert.throws(()=>validateBackup(s));}
});
test('allocate all cents exactly with deterministic largest remainder',()=>{
  assert.deepEqual(allocateAmount(100,[1,1,1]),[34,33,33]);assert.deepEqual(allocateAmount(7,[0,0]),[7,0]);
  for(let total=0;total<200;total++)assert.equal(allocateAmount(total,[4000,1500,2500]).reduce((a,b)=>a+b,0),total);
});
