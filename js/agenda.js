(async function(){
 const shop=await bootLayout('Agenda','Marque horários, conclua atendimentos e lance no caixa.'); if(!shop)return;
 const form=document.getElementById('form'); const tbody=document.getElementById('rows'); const filterDate=document.getElementById('filterDate'); filterDate.value=todayISO();
 let state={barbers:[],services:[],customers:[]};
 async function initOptions(){
   state=await getShopData(shop.id);
   customer_id.innerHTML='<option value="">Cliente avulso</option>'+state.customers.map(c=>`<option value="${c.id}">${c.name} — ${c.phone||''}</option>`).join('');
   barber_id.innerHTML='<option value="">Selecione</option>'+state.barbers.map(b=>`<option value="${b.id}">${b.name}</option>`).join('');
   service_id.innerHTML='<option value="">Selecione</option>'+state.services.map(s=>`<option value="${s.id}">${s.name} — ${money(s.price)}</option>`).join('');
 }
 customer_id.onchange=()=>{ const c=state.customers.find(x=>x.id===customer_id.value); if(c){ customer_name.value=c.name; customer_phone.value=c.phone||''; } };
 service_id.onchange=()=>{ const s=state.services.find(x=>x.id===service_id.value); if(s){ price.value=s.price; calcEnd(); } };
 start_time.onchange=calcEnd;
 function calcEnd(){ const s=state.services.find(x=>x.id===service_id.value); if(!s||!start_time.value)return; const [h,m]=start_time.value.split(':').map(Number); const d=new Date(); d.setHours(h,m+Number(s.duration_minutes||30),0,0); end_time.value=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
 async function load(){
   const date=filterDate.value || todayISO();
   const {data,error}=await db.from('appointments').select('*').eq('barbershop_id',shop.id).eq('appointment_date',date).order('start_time');
   if(error){toast(error.message,'err');return}
   tbody.innerHTML=(data||[]).map(a=>`<tr><td>${a.start_time?.slice(0,5)} - ${a.end_time?.slice(0,5)||''}</td><td>${a.customer_name||'-'}<br><small style="color:var(--muted)">${a.customer_phone||''}</small></td><td>${a.barber_name||'-'}</td><td>${a.service_name||'-'}</td><td>${statusBadge(a.status)}</td><td>${money(a.price)}</td><td class="actions">${a.status!=='concluido'?`<button class="btn success" data-done="${a.id}">Concluir</button>`:''}<button class="btn" data-cancel="${a.id}">Cancelar</button><button class="btn danger" data-del="${a.id}">Excluir</button></td></tr>`).join('')||`<tr><td colspan="7" class="empty">Nenhum horário nesta data.</td></tr>`;
   document.querySelectorAll('[data-done]').forEach(btn=>btn.onclick=()=>complete(btn.dataset.done));
   document.querySelectorAll('[data-cancel]').forEach(btn=>btn.onclick=async()=>{await db.from('appointments').update({status:'cancelado'}).eq('id',btn.dataset.cancel); load();});
   document.querySelectorAll('[data-del]').forEach(btn=>btn.onclick=async()=>{if(confirm('Excluir horário?')){await db.from('appointments').delete().eq('id',btn.dataset.del); load();}});
 }
 async function complete(id){
   const method=prompt('Forma de pagamento: dinheiro, pix, cartão ou outro','pix'); if(!method)return;
   const {data:a,error:e1}=await db.from('appointments').select('*').eq('id',id).single(); if(e1)return toast(e1.message,'err');
   const {error:e2}=await db.from('appointments').update({status:'concluido',payment_method:method}).eq('id',id); if(e2)return toast(e2.message,'err');
   const {error:e3}=await db.from('cash_entries').insert({barbershop_id:shop.id,appointment_id:id,type:'entrada',description:`Atendimento - ${a.service_name||'Serviço'}`,amount:a.price,payment_method:method,entry_date:a.appointment_date});
   if(e3)return toast(e3.message,'err'); toast('Atendimento concluído e lançado no caixa.'); load();
 }
 form.onsubmit=async e=>{
   e.preventDefault();
   const barber=state.barbers.find(x=>x.id===barber_id.value); const service=state.services.find(x=>x.id===service_id.value); const cust=state.customers.find(x=>x.id===customer_id.value);
   if(!barber||!service)return toast('Selecione barbeiro e serviço.','err');
   const {data:conflicts}=await db.from('appointments').select('id').eq('barber_id',barber.id).eq('appointment_date',appointment_date.value).eq('start_time',start_time.value).not('status','in','("cancelado")');
   if(conflicts&&conflicts.length)return toast('Esse barbeiro já tem horário nesse início.','err');
   const item={barbershop_id:shop.id,customer_id:cust?.id||null,barber_id:barber.id,service_id:service.id,customer_name:customer_name.value.trim()||cust?.name,customer_phone:customer_phone.value.trim()||cust?.phone,service_name:service.name,barber_name:barber.name,appointment_date:appointment_date.value,start_time:start_time.value,end_time:end_time.value,price:Number(price.value||service.price),status:status.value,notes:notes.value.trim()};
   const {error}=await db.from('appointments').insert(item); if(error)return toast(error.message,'err'); form.reset(); appointment_date.value=todayISO(); status.value='marcado'; toast('Horário marcado.'); load();
 };
 filterDate.onchange=load; appointment_date.value=todayISO(); await initOptions(); await load();
})();
