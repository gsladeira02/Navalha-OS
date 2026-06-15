(async function(){
 const shop=await bootLayout('Comissões','Veja quanto cada barbeiro tem a receber.'); if(!shop)return;
 const start=document.getElementById('start'); const end=document.getElementById('end'); const tbody=document.getElementById('rows');
 const now=todayISO(); start.value=now.slice(0,8)+'01'; end.value=now;
 async function load(){
  const [{data:barbers,error:e1},{data:appts,error:e2},{data:services,error:e3}]=await Promise.all([
   db.from('barbers').select('*').eq('barbershop_id',shop.id).order('name'),
   db.from('appointments').select('*').eq('barbershop_id',shop.id).eq('status','concluido').gte('appointment_date',start.value).lte('appointment_date',end.value),
   db.from('services').select('*').eq('barbershop_id',shop.id)
  ]);
  if(e1||e2||e3)return toast((e1||e2||e3).message,'err');
  const rows=(barbers||[]).map(b=>{ const mine=(appts||[]).filter(a=>a.barber_id===b.id); const total=mine.reduce((s,a)=>s+Number(a.price||0),0); const commission=mine.reduce((s,a)=>{ const svc=(services||[]).find(x=>x.id===a.service_id); const pct=Number((svc&&svc.commission_percent!=null?svc.commission_percent:b.commission_percent)||0); return s+(Number(a.price||0)*pct/100); },0); return {b,mine,total,commission}; });
  grandTotal.textContent=money(rows.reduce((s,r)=>s+r.total,0)); grandCommission.textContent=money(rows.reduce((s,r)=>s+r.commission,0));
  tbody.innerHTML=rows.map(r=>`<tr><td>${r.b.name}</td><td>${r.mine.length}</td><td>${money(r.total)}</td><td>${Number(r.b.commission_percent||0)}%</td><td>${money(r.commission)}</td></tr>`).join('')||`<tr><td colspan="5" class="empty">Nenhum dado no período.</td></tr>`;
 }
 document.getElementById('filterBtn').onclick=load; load();
})();
