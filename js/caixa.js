(async function(){
 const shop=await bootLayout('Caixa','Controle entradas, despesas e fechamento diário.'); if(!shop)return;
 const form=document.getElementById('form'); const tbody=document.getElementById('rows'); const filterDate=document.getElementById('filterDate'); filterDate.value=todayISO(); entry_date.value=todayISO();
 async function load(){
  const date=filterDate.value||todayISO(); const {data,error}=await db.from('cash_entries').select('*').eq('barbershop_id',shop.id).eq('entry_date',date).order('created_at',{ascending:false});
  if(error)return toast(error.message,'err');
  const entradas=(data||[]).filter(x=>x.type==='entrada').reduce((s,x)=>s+Number(x.amount||0),0); const saidas=(data||[]).filter(x=>x.type==='saida').reduce((s,x)=>s+Number(x.amount||0),0);
  totalIn.textContent=money(entradas); totalOut.textContent=money(saidas); totalNet.textContent=money(entradas-saidas);
  tbody.innerHTML=(data||[]).map(c=>`<tr><td>${c.entry_date}</td><td>${c.type}</td><td>${c.description}</td><td>${c.payment_method||'-'}</td><td>${money(c.amount)}</td><td><button class="btn danger" data-del="${c.id}">Excluir</button></td></tr>`).join('')||`<tr><td colspan="6" class="empty">Nenhum lançamento nesta data.</td></tr>`;
  document.querySelectorAll('[data-del]').forEach(btn=>btn.onclick=async()=>{if(confirm('Excluir lançamento?')){await db.from('cash_entries').delete().eq('id',btn.dataset.del);load();}});
 }
 form.onsubmit=async e=>{e.preventDefault(); const item={barbershop_id:shop.id,type:type.value,description:description.value.trim(),amount:Number(amount.value||0),payment_method:payment_method.value,entry_date:entry_date.value}; const {error}=await db.from('cash_entries').insert(item); if(error)return toast(error.message,'err'); form.reset(); entry_date.value=todayISO(); type.value='entrada'; toast('Lançamento salvo.'); load();};
 filterDate.onchange=load; load();
})();
