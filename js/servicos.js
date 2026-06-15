(async function(){
 const shop=await bootLayout('Serviços','Cadastre preços, duração e comissão por serviço.'); if(!shop)return;
 const form=document.getElementById('form'); const tbody=document.getElementById('rows');
 async function load(){ const {data,error}=await db.from('services').select('*').eq('barbershop_id',shop.id).order('name'); if(error){toast(error.message,'err');return} tbody.innerHTML=(data||[]).map(s=>`<tr><td>${s.name}</td><td>${money(s.price)}</td><td>${s.duration_minutes} min</td><td>${s.commission_percent??'-'}%</td><td>${s.active?'Ativo':'Inativo'}</td><td class="actions"><button class="btn danger" data-del="${s.id}">Excluir</button></td></tr>`).join('')||`<tr><td colspan="6" class="empty">Nenhum serviço cadastrado.</td></tr>`; document.querySelectorAll('[data-del]').forEach(btn=>btn.onclick=async()=>{ if(confirm('Excluir serviço?')){ await db.from('services').delete().eq('id',btn.dataset.del); load(); }}); }
 form.onsubmit=async e=>{ e.preventDefault(); const item={barbershop_id:shop.id,name:name.value.trim(),price:Number(price.value||0),duration_minutes:Number(duration.value||30),commission_percent:commission.value?Number(commission.value):null,active:true}; const {error}=await db.from('services').insert(item); if(error)return toast(error.message,'err'); form.reset(); duration.value=30; toast('Serviço cadastrado.'); load(); };
 load();
})();
