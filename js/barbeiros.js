(async function(){
 const shop=await bootLayout('Barbeiros','Cadastre profissionais e percentuais de comissão.'); if(!shop)return;
 const form=document.getElementById('form'); const tbody=document.getElementById('rows');
 async function load(){ const {data,error}=await db.from('barbers').select('*').eq('barbershop_id',shop.id).order('name'); if(error){toast(error.message,'err');return} tbody.innerHTML=(data||[]).map(b=>`<tr><td>${b.name}</td><td>${b.phone||'-'}</td><td>${Number(b.commission_percent||0)}%</td><td>${b.active?'Ativo':'Inativo'}</td><td class="actions"><button class="btn danger" data-del="${b.id}">Excluir</button></td></tr>`).join('')||`<tr><td colspan="5" class="empty">Nenhum barbeiro cadastrado.</td></tr>`; document.querySelectorAll('[data-del]').forEach(btn=>btn.onclick=async()=>{ if(confirm('Excluir barbeiro?')){ await db.from('barbers').delete().eq('id',btn.dataset.del); load(); }}); }
 form.onsubmit=async e=>{ e.preventDefault(); const item={barbershop_id:shop.id,name:name.value.trim(),phone:phone.value.trim(),commission_percent:Number(commission.value||0),active:true}; const {error}=await db.from('barbers').insert(item); if(error) return toast(error.message,'err'); form.reset(); commission.value=50; toast('Barbeiro cadastrado.'); load(); };
 load();
})();
