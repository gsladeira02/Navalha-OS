(async function(){
 const shop=await bootLayout('Clientes','Cadastre clientes e acompanhe histórico básico.'); if(!shop)return;
 const form=document.getElementById('form'); const tbody=document.getElementById('rows');
 async function load(){
  const {data,error}=await db.from('customers').select('*').eq('barbershop_id',shop.id).order('name');
  if(error){toast(error.message,'err');return}
  tbody.innerHTML=(data||[]).map(c=>`<tr><td>${c.name}</td><td>${c.phone||'-'}</td><td>${c.birthday||'-'}</td><td>${c.notes||'-'}</td><td class="actions"><button class="btn danger" data-del="${c.id}">Excluir</button></td></tr>`).join('')||`<tr><td colspan="5" class="empty">Nenhum cliente cadastrado.</td></tr>`;
  document.querySelectorAll('[data-del]').forEach(btn=>btn.onclick=async()=>{if(confirm('Excluir cliente?')){await db.from('customers').delete().eq('id',btn.dataset.del);load();}});
 }
 form.onsubmit=async e=>{e.preventDefault(); const item={barbershop_id:shop.id,name:name.value.trim(),phone:phone.value.trim(),birthday:birthday.value||null,notes:notes.value.trim()}; const {error}=await db.from('customers').insert(item); if(error)return toast(error.message,'err'); form.reset(); toast('Cliente cadastrado.'); load();};
 load();
})();
